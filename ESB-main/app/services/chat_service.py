"""
RAG-Powered Chat Service using Direct VectorStore Access

This module provides a chat service that uses a multi-stage CAG→RAG pipeline
adapted from the teaching agent for high-quality, detailed answers.
"""

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from app.services.vector_store import VectorStore
from app.models import Document, Course
from app import db
import os
import re
from typing import List, Dict, Optional, Tuple


# ---------------------------------------------------------------------------
# Helper: Normalize chat history to consistent dict format
# ---------------------------------------------------------------------------

def _normalize_chat_history(chat_history: Optional[List]) -> List[Dict]:
    """
    Normalize chat history to consistent dict format.

    Accepts both:
    - List[Dict] with 'role' and 'content' keys (from API routes)
    - List[ChatMessage] objects with is_user and content attributes (from traditional routes)

    Returns: List[Dict] with standardized 'role' and 'content' keys
    """
    if not chat_history:
        return []

    normalized = []
    for msg in chat_history:
        # Handle dict format (from API routes)
        if isinstance(msg, dict):
            # Already in dict format, validate keys
            if 'role' in msg and 'content' in msg:
                normalized.append({
                    'role': msg['role'],
                    'content': msg['content']
                })
            else:
                print(f"[CHAT] Warning: Skipping malformed dict message: {msg}")
        # Handle ChatMessage object format (from traditional routes)
        elif hasattr(msg, 'is_user') and hasattr(msg, 'content'):
            role = 'user' if msg.is_user else 'assistant'
            normalized.append({
                'role': role,
                'content': msg.content
            })
        else:
            print(f"[CHAT] Warning: Skipping unknown message type: {type(msg)}")

    return normalized


# ---------------------------------------------------------------------------
# Helper: Classify question as "text" or "image"
# ---------------------------------------------------------------------------

def _classify_question(user_message: str, llm: ChatGoogleGenerativeAI) -> str:
    """Use the LLM to decide whether the question targets visual or text content."""
    classification_prompt = (
        f'Classify this question about a document:\n\n'
        f'Question: "{user_message}"\n\n'
        'Is this question asking about:\n'
        'A) Visual content (images, figures, charts, diagrams, tables, graphs, illustrations, plots, or any visual elements)\n'
        'B) Text content only\n\n'
        'Important: Questions like "figure 1", "the first chart", "table 2", '
        '"what does the diagram show" should be classified as A (visual content).\n\n'
        "Respond with ONLY the letter 'A' or 'B' on the first line."
    )
    try:
        result = llm.invoke([HumanMessage(content=classification_prompt)])
        result_clean = result.content.strip().upper()
        if result_clean.startswith('A'):
            return "image"
        return "text"
    except Exception:
        # Keyword fallback
        image_keywords = [
            "image", "figure", "diagram", "chart", "graph", "visual",
            "picture", "illustration", "table", "plot",
        ]
        if any(kw in user_message.lower() for kw in image_keywords):
            return "image"
        return "text"


# ---------------------------------------------------------------------------
# Helper: CAG stage – search summaries & identify target sections
# ---------------------------------------------------------------------------

def _cag_search_summaries(
    vs: VectorStore, query: str
) -> Tuple[List[Dict], List[str]]:
    """Return (summaries, target_section_numbers) from a summary search."""
    summaries = vs.search_summaries(query, n_results=8)
    print(f"[CAG] Found {len(summaries)} summaries for query: {query[:60]}")
    for i, s in enumerate(summaries[:5]):
        meta = s.get("metadata", {})
        print(f"  [{i}] sec={meta.get('section_number')} title={meta.get('section_title','')[:40]} dist={s.get('distance', '?')}")
    target_sections: List[str] = []
    for s in summaries[:3]:
        sec_num = s.get("metadata", {}).get("section_number")
        if sec_num and sec_num not in target_sections:
            target_sections.append(sec_num)
    print(f"[CAG] Target sections: {target_sections}")
    return summaries, target_sections


# ---------------------------------------------------------------------------
# Helper: RAG stage – section-targeted text retrieval
# ---------------------------------------------------------------------------

def _rag_targeted_retrieval(
    vs: VectorStore, query: str, target_sections: List[str]
) -> List[Dict]:
    """Retrieve text chunks from identified sections + a general sweep, dedup & rank."""
    all_results: List[Dict] = []

    # Per-section retrieval
    for sec_num in target_sections:
        section_results = vs.search_text_chunks(query, n_results=10, section_filter=sec_num)
        print(f"[RAG] Section {sec_num}: {len(section_results)} chunks")
        all_results.extend(section_results)

    # General (no section filter)
    general_results = vs.search_text_chunks(query, n_results=10, section_filter=None)
    print(f"[RAG] General search: {len(general_results)} chunks")

    # Deduplicate by first 80 chars of content
    seen: set = set()
    combined: List[Dict] = []
    for r in all_results + general_results:
        key = r.get("content", "")[:80]
        if key not in seen:
            seen.add(key)
            combined.append(r)

    # Sort by distance (lower = more relevant), keep top 20
    combined.sort(key=lambda x: x.get("distance", 1.0))
    print(f"[RAG] Final: {len(combined[:20])} chunks after dedup")
    if combined:
        print(f"[RAG] Top chunk preview: {combined[0].get('content', '')[:100]}")
    return combined[:20]


# ---------------------------------------------------------------------------
# Helper: Image-question retrieval
# ---------------------------------------------------------------------------

def _retrieve_image_context(
    vs: VectorStore, query: str
) -> Tuple[List[Dict], List[Dict]]:
    """Return (image_results, text_chunks) for an image-type question."""
    image_results = vs.search_images(query, n_results=5)
    text_chunks = vs.search_text_chunks(query, n_results=10, section_filter=None)
    return image_results, text_chunks


# ---------------------------------------------------------------------------
# Helper: Build structured context string
# ---------------------------------------------------------------------------

def _build_structured_context(
    text_chunks: List[Dict],
    summaries: List[Dict],
    image_results: List[Dict],
    question_type: str,
) -> str:
    """Format retrieval results into a structured context block."""
    parts: List[str] = []

    # Primary: full text chunks
    if text_chunks:
        parts.append("## Retrieved Document Content:")
        for chunk in text_chunks[:15]:
            meta = chunk.get("metadata", {})
            sec_num = meta.get("section_number", "?")
            sec_title = meta.get("section_title", "N/A")
            page = meta.get("page_number", "")
            label = f"[Section {sec_num}: {sec_title}"
            if page:
                label += f", Page {page}"
            label += "]"
            parts.append(f"{label}\n{chunk.get('content', '')}")

    # Secondary: section overviews
    if summaries:
        parts.append("\n## Section Overviews (for context):")
        for s in summaries[:3]:
            meta = s.get("metadata", {})
            sec_num = meta.get("section_number", "?")
            sec_title = meta.get("section_title", "N/A")
            content_preview = s.get("content", "")[:300]
            parts.append(f"Section {sec_num}: {sec_title} - {content_preview}...")

    # Image descriptions (only for image questions)
    if question_type == "image" and image_results:
        parts.append("\n## Image Descriptions from Document:")
        for img in image_results:
            meta = img.get("metadata", {})
            page = meta.get("page_number", "?")
            sec_num = meta.get("section_number", "?")
            parts.append(
                f"[Image from Section {sec_num}, Page {page}]\n{img.get('content', '')}"
            )

    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Helper: Select best document from multiple candidates
# ---------------------------------------------------------------------------

def _select_best_document(
    document_ids: List[int], query: str
) -> Tuple[int, VectorStore, str, Optional[str]]:
    """
    Given multiple document IDs, run a summary search on each and return
    the document whose top summary has the lowest distance (best match).

    Returns (document_id, VectorStore, doc_name, course_name).
    """
    best_id: Optional[int] = None
    best_dist: float = float("inf")
    best_vs: Optional[VectorStore] = None

    for doc_id in document_ids:
        try:
            vs = VectorStore(document_id=str(doc_id))
            if not vs.collection_exists():
                continue
            summaries, _ = _cag_search_summaries(vs, query)
            if summaries:
                top_dist = summaries[0].get("distance", float("inf"))
                print(f"[CHAT] Doc {doc_id}: top summary distance={top_dist:.4f}")
                if top_dist < best_dist:
                    best_dist = top_dist
                    best_id = doc_id
                    best_vs = vs
        except Exception as e:
            print(f"[CHAT] Error checking doc {doc_id}: {e}")
            continue

    # Fallback to first doc if none matched
    if best_id is None:
        best_id = document_ids[0]
        best_vs = VectorStore(document_id=str(best_id))

    print(f"[CHAT] Best doc: {best_id} (distance={best_dist}) from {len(document_ids)} docs")

    document = Document.query.get(best_id)
    doc_name = document.title if document else f"Document {best_id}"
    course_name = document.course.title if document and document.course else None

    return best_id, best_vs, doc_name, course_name


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def get_chat_response(
    user_message: str,
    document_id: Optional[int] = None,
    document_ids: Optional[List[int]] = None,
    course_id: Optional[int] = None,
    chat_history: Optional[List] = None,
) -> Dict:
    """
    Get chat response using a multi-stage CAG→RAG pipeline.

    Args:
        user_message: The user's question/message
        document_id: Document ID for single-document chat (or fallback for session tracking)
        document_ids: List of all processed document IDs for multi-document best-doc selection
        course_id: Course ID for multi-document chat (future enhancement)
        chat_history: Previous conversation messages (list of ChatMessage objects)

    Returns:
        Dictionary with response, citations, and sources_used
    """
    try:
        # --- API key ---
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            return {
                "response": "Error: Google API key not configured.",
                "citations": [],
                "sources_used": [],
            }

        # --- Normalize chat history to consistent format ---
        normalized_history = _normalize_chat_history(chat_history)

        # --- Validate document / course ---
        if not document_id and not course_id:
            return {
                "response": "Error: No document or course specified.",
                "citations": [],
                "sources_used": [],
            }

        # --- Multi-document best-doc selection ---
        if document_ids and len(document_ids) > 1:
            document_id, vs, doc_name, course_name = _select_best_document(
                document_ids, user_message
            )
            document = Document.query.get(document_id)
        elif document_id:
            vs = VectorStore(document_id=str(document_id))
            document = Document.query.get(document_id)
            doc_name = document.title if document else f"Document {document_id}"
            course_name = (
                document.course.title if document and document.course else None
            )
        else:
            return {
                "response": "Course-wide chat is not yet implemented. Please use document-specific chat.",
                "citations": [],
                "sources_used": [],
            }

        # --- Collection check + summary fallback ---
        collection_exists = vs.collection_exists()

        if not collection_exists:
            if document and document.summary:
                # No vector store – fall back to plain summary context
                context = document.summary[:8000]
                print(
                    f"⚠️ No VectorStore for '{doc_name}', using document summary as fallback"
                )
            else:
                return {
                    "response": (
                        f"The document '{doc_name}' has not been processed yet. "
                        "Please wait for processing to complete or re-upload the document."
                    ),
                    "citations": [],
                    "sources_used": [],
                }
            # With only a summary we skip the multi-stage pipeline
            llm = ChatGoogleGenerativeAI(
                model="gemini-2.0-flash",
                google_api_key=api_key,
                temperature=0.7,
                max_tokens=3000,
            )
            system_prompt = _build_system_prompt(doc_name, course_name)
            user_prompt = _build_user_prompt(context, user_message, normalized_history)
            response = llm.invoke([
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt),
            ])
            return {
                "response": response.content.strip(),
                "citations": extract_citations_from_text(response.content.strip()),
                "sources_used": [doc_name],
            }

        # --- Initialize LLM early (needed for classification) ---
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            google_api_key=api_key,
            temperature=0.7,
            max_tokens=3000,
        )

        # --- Stage 1: classify question ---
        question_type = _classify_question(user_message, llm)
        print(f"[CHAT] Question type: {question_type} | doc_id={document_id} | collection={vs.collection_name}")
        print(f"[CHAT] Vector count: {vs.get_vector_count()}")

        # --- Stage 2: CAG – summary search ---
        summaries, target_sections = _cag_search_summaries(vs, user_message)

        # --- Stage 3: retrieval branch ---
        if question_type == "image":
            image_results, text_chunks = _retrieve_image_context(vs, user_message)
        else:
            text_chunks = _rag_targeted_retrieval(vs, user_message, target_sections)
            image_results: List[Dict] = []

        # --- Stage 4: build structured context ---
        context = _build_structured_context(
            text_chunks, summaries, image_results, question_type
        )

        print(f"[CHAT] Context length: {len(context)} chars")
        if not context:
            print("[CHAT] WARNING: Empty context from retrieval, using fallback")
            if document and document.summary:
                context = document.summary[:8000]
            else:
                context = "No relevant content found in the document for your question."

        # --- Stage 5: prompts ---
        system_prompt = _build_system_prompt(doc_name, course_name)
        user_prompt = _build_user_prompt(context, user_message, normalized_history)

        # --- Stage 6: invoke LLM ---
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ]
        response = llm.invoke(messages)
        response_text = response.content.strip()

        # --- Stage 7: citations & return ---
        citations = extract_citations_from_text(response_text)

        return {
            "response": response_text,
            "citations": citations,
            "sources_used": [doc_name],
        }

    except Exception as e:
        print(f"Error in get_chat_response: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "response": f"I apologize, but I encountered an error: {str(e)}",
            "citations": [],
            "sources_used": [],
        }


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------

def _build_system_prompt(doc_name: str, course_name: Optional[str]) -> str:
    course_ctx = f" from the course '{course_name}'" if course_name else ""
    return (
        f'You are an adaptive learning tutor analyzing the document: "{doc_name}"{course_ctx}.\n\n'
        "Role and teaching style:\n"
        "- Act as a supportive tutor, not just a search engine.\n"
        "- Maintain the conversation context and build on previous exchanges.\n"
        "- Adapt the explanation to the student's level and probable confusion.\n"
        "- When useful, explain step by step, ask a short follow-up question, or propose a mini-checkpoint.\n\n"
        "Instructions for your response:\n"
        "1. Give a clear direct answer first.\n"
        "2. Then teach the idea with a structured explanation.\n"
        "3. Use examples, simple reformulations, and guided reasoning when appropriate.\n"
        "4. If the learner seems confused, break the concept into smaller steps.\n"
        "5. Reference specific sections and page numbers when possible.\n"
        "6. Only use information from the provided context. Do not invent external facts.\n"
        "7. Always answer in the same language as the user's question.\n"
        "8. For mathematical content, use LaTeX wrapped in $...$ or $$...$$.\n"
        "9. End with one short interactive tutoring move when relevant: a quick question, a next step, or a practice suggestion.\n"
    )


def _build_user_prompt(
    context: str,
    user_message: str,
    chat_history: Optional[List[Dict]] = None,
) -> str:
    """
    Build the user prompt with context and chat history.

    Args:
        context: Retrieved document content
        user_message: Current user question
        chat_history: Previous messages as List[Dict] with 'role' and 'content' keys

    Returns:
        Formatted prompt string
    """
    parts: List[str] = []

    parts.append(f"## Course Materials\n\n{context}")

    if chat_history:
        history_lines: List[str] = []
        for msg in chat_history[-10:]:
            # Now expecting dict format with 'role' key
            role = "Student" if msg['role'] == 'user' else "Assistant"
            history_lines.append(f"{role}: {msg['content']}")
        if history_lines:
            parts.append("## Conversation History\n\n" + "\n\n".join(history_lines))

    parts.append(
        f"## Current Question\n\n{user_message}\n\n"
        "Answer as an adaptive tutor. Keep continuity with the conversation, explain clearly, and include section/page citations when available."
    )

    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Citation extractor (unchanged)
# ---------------------------------------------------------------------------

def extract_citations_from_text(text: str) -> List[Dict]:
    """
    Extract citations from response text.

    Looks for patterns like:
    - "Section X.Y (page Z)"
    - "Section X.Y, p.Z"
    - "[Section X.Y - Title, p.Z]"
    - "According to [Title], page Z"
    """
    citations = []

    # Pattern 1: [Section X.Y - Title, p.Z]
    pattern1 = r'\[Section\s+([\d.]+)\s*-\s*([^,\]]+),?\s*p\.(\d+)\]'
    for match in re.finditer(pattern1, text, re.IGNORECASE):
        citations.append({
            'section': match.group(1),
            'title': match.group(2).strip(),
            'page': int(match.group(3))
        })

    # Pattern 2: Section X.Y (page Z)
    pattern2 = r'Section\s+([\d.]+)\s*\(page\s+(\d+)\)'
    for match in re.finditer(pattern2, text, re.IGNORECASE):
        citations.append({
            'section': match.group(1),
            'page': int(match.group(2))
        })

    # Pattern 3: Section X.Y, p.Z or Section X.Y, page Z
    pattern3 = r'Section\s+([\d.]+),\s*(?:p\.|page)\s*(\d+)'
    for match in re.finditer(pattern3, text, re.IGNORECASE):
        citations.append({
            'section': match.group(1),
            'page': int(match.group(2))
        })

    # Pattern 4: page Z (when section not mentioned)
    pattern4 = r'(?:on\s+)?page\s+(\d+)'
    for match in re.finditer(pattern4, text, re.IGNORECASE):
        citations.append({
            'page': int(match.group(1))
        })

    # Deduplicate citations
    seen = set()
    unique_citations = []
    for citation in citations:
        key = (citation.get('section'), citation.get('page'))
        if key not in seen:
            seen.add(key)
            unique_citations.append(citation)

    return unique_citations
