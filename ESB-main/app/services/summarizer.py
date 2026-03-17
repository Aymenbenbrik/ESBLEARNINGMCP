"""
Document Summarizer Service
Creates section summaries and document overviews using Gemini.
Adapted from src/core/summarizer.py for ESB-main Flask app.
"""

from typing import List, Dict, Optional
import re
import logging

from app.services.document_processor import DocumentSection

logger = logging.getLogger(__name__)


class DocumentSummarizer:
    """
    Create summaries for document sections using Gemini LLM.
    Summaries are used for CAG (Cached Augmented Generation) for faster retrieval.
    """
    
    def __init__(self):
        """Initialize summarizer with Gemini client"""
        # Lazy import to avoid circular imports
        pass
    
    def _get_gemini_client(self):
        """Get Gemini client for text generation"""
        from langchain_google_genai import ChatGoogleGenerativeAI
        import os
        
        return ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            google_api_key=os.getenv("GOOGLE_API_KEY"),
            temperature=0.3
        )
    
    def create_section_summaries(self, sections: List[DocumentSection]) -> List[Dict]:
        """
        Create concise summaries for each section (CAG approach).
        
        Args:
            sections: List of DocumentSection objects
            
        Returns:
            List of summary dictionaries
        """
        summaries = []
        
        logger.info(f"Creating summaries for {len(sections)} sections...")
        llm = self._get_gemini_client()
        
        for i, section in enumerate(sections):
            try:
                logger.info(f"Processing section {i+1}/{len(sections)}: {section.section_number}")
                
                # Generate summary
                summary_text = self._generate_section_summary(llm, section)
                
                # Extract keywords
                keywords = self._extract_keywords(section.content)
                
                summary_dict = {
                    'section_number': section.section_number,
                    'title': section.title,
                    'summary': summary_text,
                    'page_number': section.page_number,
                    'content_length': len(section.content),
                    'keywords': keywords
                }
                
                summaries.append(summary_dict)
                
            except Exception as e:
                logger.error(f"Error creating summary for section {section.section_number}: {e}")
                # Fallback summary
                summaries.append(self._create_fallback_summary(section))
        
        logger.info(f"Created {len(summaries)} section summaries")
        return summaries
    
    def _generate_section_summary(self, llm, section: DocumentSection) -> str:
        """Generate a detailed summary for a section"""
        # Limit content to 4000 characters
        content = section.content[:4000] if section.content else ""
        
        if not content.strip():
            return f"Section covering {section.title.lower()}"
        
        prompt = f"""Section: {section.section_number} - {section.title}

Content:
{content}

Task: Create a comprehensive summary that:
1. Captures the main points and key information
2. Explains what the section covers and why it's important
3. Includes specific details, methods, or findings mentioned

Write a detailed summary (3-5 sentences) that someone could use to understand this section without reading the full text.

Summary:"""

        try:
            response = llm.invoke(prompt)
            summary = response.content if hasattr(response, 'content') else str(response)
            return self._clean_summary(summary)
            
        except Exception as e:
            logger.error(f"Error generating summary: {e}")
            return self._simple_summary(content)
    
    def _clean_summary(self, summary: str) -> str:
        """Clean and format the generated summary"""
        prefixes_to_remove = [
            "This section",
            "The section",
            "In this section",
            "Section",
            "Summary:",
            "The summary is:",
        ]
        
        summary = summary.strip()
        
        for prefix in prefixes_to_remove:
            if summary.lower().startswith(prefix.lower()):
                summary = summary[len(prefix):].strip()
                break
        
        # Ensure it starts with a capital letter
        if summary and not summary[0].isupper():
            summary = summary[0].upper() + summary[1:]
        
        # Ensure it ends with a period
        if summary and not summary.endswith('.'):
            summary += '.'
        
        return summary
    
    def _simple_summary(self, content: str) -> str:
        """Create a simple summary from first few sentences"""
        sentences = content.split('. ')
        first_sentences = '. '.join(sentences[:2])
        
        if len(first_sentences) > 200:
            first_sentences = first_sentences[:200] + "..."
        
        return first_sentences
    
    def _create_fallback_summary(self, section: DocumentSection) -> Dict:
        """Create a fallback summary when processing fails"""
        return {
            'section_number': section.section_number,
            'title': section.title,
            'summary': f"Section covering {section.title.lower()}",
            'page_number': section.page_number,
            'content_length': len(section.content),
            'keywords': []
        }
    
    def _extract_keywords(self, text: str, max_keywords: int = 5) -> List[str]:
        """Extract key terms from section content"""
        words = re.findall(r'\b[a-zA-Z]{4,}\b', text.lower())
        
        stop_words = {
            'this', 'that', 'with', 'have', 'they', 'were', 'been', 'their',
            'said', 'each', 'which', 'them', 'than', 'many', 'some', 'time',
            'very', 'when', 'much', 'such', 'only', 'these', 'also', 'after',
            'first', 'well', 'work', 'life', 'year', 'years', 'will', 'way',
            'even', 'back', 'good', 'through', 'more', 'where', 'most', 'know',
            'just', 'being', 'over', 'think', 'your', 'would', 'there',
            'pour', 'dans', 'avec', 'sont', 'cette', 'plus', 'nous', 'vous',
            'leur', 'sous', 'entre', 'comme', 'mais', 'elle', 'elles'
        }
        
        word_freq = {}
        for word in words:
            if word not in stop_words and len(word) > 3:
                word_freq[word] = word_freq.get(word, 0) + 1
        
        keywords = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
        return [word for word, freq in keywords[:max_keywords]]
    
    def create_document_overview(self, sections: List[DocumentSection]) -> str:
        """Create a comprehensive document overview"""
        if not sections:
            return "No sections available for overview."
        
        llm = self._get_gemini_client()
        
        # Collect section information with content previews
        section_info = []
        for section in sections[:15]:
            content_preview = section.content[:500] if section.content else ""
            section_info.append(f"Section {section.section_number} - {section.title}:\n{content_preview}")
        
        combined_sections = "\n\n".join(section_info)
        
        prompt = f"""Document sections with content previews:

{combined_sections}

Task: Create a comprehensive overview of this document. Describe:
1. The main topics and themes covered
2. The purpose and scope of the document
3. Key areas of focus
4. The overall structure and organization

Provide a detailed overview (4-6 paragraphs) that gives readers a clear understanding of what this document contains.

Overview:"""

        try:
            response = llm.invoke(prompt)
            overview = response.content if hasattr(response, 'content') else str(response)
            return self._clean_summary(overview)
        except Exception as e:
            logger.error(f"Error creating document overview: {e}")
            return f"This document contains {len(sections)} sections covering various topics."
    
    def create_document_overview_from_summaries(self, summaries: List[Dict]) -> str:
        """Create document overview from pre-generated section summaries"""
        if not summaries:
            return "No summaries available to create document overview."
        
        llm = self._get_gemini_client()
        
        logger.info(f"Creating document overview from {len(summaries)} section summaries...")
        
        summary_info = []
        for summary in summaries:
            section_text = f"Section {summary['section_number']} - {summary['title']}:\n{summary['summary']}"
            summary_info.append(section_text)
        
        combined_summaries = "\n\n".join(summary_info)
        
        prompt = f"""Document section summaries:

{combined_summaries}

Task: Create a comprehensive overview of this document based on these section summaries. Describe:
1. The main topics and themes covered
2. The purpose and scope of the document
3. Key areas of focus and their relationships
4. The overall structure and organization

Provide a detailed overview (3-5 paragraphs) that gives readers a clear understanding of what this document contains.

Overview:"""

        try:
            response = llm.invoke(prompt)
            overview = response.content if hasattr(response, 'content') else str(response)
            return self._clean_summary(overview)
        except Exception as e:
            logger.error(f"Error creating document overview from summaries: {e}")
            return f"This document contains {len(summaries)} sections covering various topics."
    
    def generate_image_description(self, image_path: str, image_title: str = "") -> str:
        """
        Generate description for an image using Gemini multimodal.
        
        Args:
            image_path: Path to the image file
            image_title: Caption/title extracted from PDF
            
        Returns:
            Description string
        """
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            from langchain_core.messages import HumanMessage
            import base64
            import os
            
            # Read and encode image
            with open(image_path, "rb") as f:
                image_data = base64.standard_b64encode(f.read()).decode("utf-8")
            
            llm = ChatGoogleGenerativeAI(
                model="gemini-2.0-flash",
                google_api_key=os.getenv("GOOGLE_API_KEY"),
                temperature=0.3
            )
            
            title_context = image_title if image_title else "Image from document"
            
            prompt = f"""You are analyzing an image from a document.

Image Context: "{title_context}"

Instructions:
- If it's a diagram/chart/schema/workflow/figure:
  → Read ALL text in the image carefully
  → Describe the structure, flow, and relationships shown
  → Explain what the diagram teaches or illustrates

- If it's a photo/sample/manuscript:
  → Describe what you see visually
  → Focus on visual characteristics and patterns

Provide a detailed description (2-4 sentences) that will help answer questions about this image.

Description:"""

            message = HumanMessage(
                content=[
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_data}"}}
                ]
            )
            
            response = llm.invoke([message])
            return response.content if hasattr(response, 'content') else str(response)
            
        except Exception as e:
            logger.error(f"Error generating image description: {e}")
            return f"Image: {image_title}" if image_title else "Image from document"
