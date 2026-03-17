"""
Smart Extraction Service - Enhanced Version
Extracts meaningful, concept-rich content for intelligent quiz generation
"""
import re
from typing import List, Dict, Tuple
from flask import current_app


def smart_extract_from_attachments(attachments_texts: List[str], 
                                   attachments_metadata: List[Dict],
                                   clos: List[Dict],
                                   objectives: List[str],
                                   max_chars_per_file: int = 8000) -> Tuple[List[str], List[Dict]]:
    """
    Apply intelligent extraction to multiple files, focusing on:
    - Key concepts and definitions
    - Examples and case studies
    - Process explanations
    - Learning outcomes alignment
    """
    extracted_texts = []
    updated_metadata = []
    
    # Build CLO and objective keywords
    clo_keywords = build_clo_keywords(clos)
    objective_keywords = build_objective_keywords(objectives)
    
    for full_text, metadata in zip(attachments_texts, attachments_metadata):
        try:
            # Intelligent extraction
            relevant_content = extract_meaningful_content(
                full_text,
                clo_keywords,
                objective_keywords,
                max_chars_per_file
            )
            
            extracted_texts.append(relevant_content)
            
            # Update metadata
            metadata_copy = metadata.copy()
            metadata_copy['extracted_length'] = len(relevant_content)
            metadata_copy['original_length'] = len(full_text)
            metadata_copy['extraction_ratio'] = len(relevant_content) / len(full_text) if len(full_text) > 0 else 0
            
            updated_metadata.append(metadata_copy)
            
            current_app.logger.info(
                f"Extracted {len(relevant_content)} chars from {metadata['filename']} "
                f"({metadata_copy['extraction_ratio']:.1%} of original, "
                f"focused on key concepts)"
            )
            
        except Exception as e:
            current_app.logger.error(f"Extraction failed for {metadata.get('filename')}: {e}")
            extracted_texts.append(full_text[:max_chars_per_file])
            updated_metadata.append(metadata)
    
    return extracted_texts, updated_metadata


def build_clo_keywords(clos: List[Dict]) -> List[str]:
    """Build searchable keywords from CLO descriptions."""
    keywords = []
    
    for clo in clos:
        clo_num = str(clo.get('CLO#', ''))
        description = str(clo.get('Description', ''))
        
        keywords.append(clo_num.lower())
        
        # Extract key terms from description (nouns, verbs)
        key_terms = extract_meaningful_terms(description)
        keywords.extend(key_terms)
    
    return list(set([k for k in keywords if len(k) >= 3]))


def build_objective_keywords(objectives: List[str]) -> List[str]:
    """Build keywords from learning objectives."""
    keywords = []
    
    for obj in objectives:
        terms = extract_meaningful_terms(obj)
        keywords.extend(terms)
    
    return list(set(keywords))


def extract_meaningful_terms(text: str) -> List[str]:
    """Extract meaningful terms: nouns, verbs, key concepts."""
    stopwords = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'is', 'are', 'was', 'be', 'been', 'being'
    }
    
    # Extract words and phrases
    words = re.findall(r'\b[a-zA-Z][\w\-]*\b', text.lower())
    terms = [w for w in words if w not in stopwords and len(w) >= 4]
    
    # Also extract capitalized terms (often important concepts)
    caps_terms = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', text)
    terms.extend([t.lower() for t in caps_terms])
    
    return list(set(terms))


def extract_meaningful_content(full_text: str, 
                               clo_keywords: List[str],
                               objective_keywords: List[str],
                               max_chars: int = 8000) -> str:
    """
    Extract sections most relevant to CLOs and objectives.
    Prioritizes:
    1. Definitions and concepts
    2. Explanations and examples
    3. Key formulas/algorithms
    4. Case studies and applications
    """
    sections = parse_document_structure(full_text)
    
    scored_sections = []
    for section in sections:
        score, relevance_type = score_section(section, clo_keywords, objective_keywords)
        
        if score > 0:
            scored_sections.append({
                'text': section,
                'score': score,
                'type': relevance_type,
                'length': len(section)
            })
    
    # Sort by relevance
    scored_sections.sort(key=lambda x: x['score'], reverse=True)
    
    # Build result, prioritizing higher-value content
    result_parts = []
    current_length = 0
    
    # First pass: high-value content (definitions, key concepts)
    for section in scored_sections:
        if current_length >= max_chars:
            break
        if section['type'] in ['definition', 'concept', 'key_formula']:
            result_parts.append(section['text'])
            current_length += section['length']
    
    # Second pass: examples and applications
    for section in scored_sections:
        if current_length >= max_chars:
            break
        if section['type'] in ['example', 'application']:
            result_parts.append(section['text'])
            current_length += section['length']
    
    # Third pass: remaining relevant sections
    for section in scored_sections:
        if current_length >= max_chars:
            break
        if section not in result_parts:
            result_parts.append(section['text'])
            current_length += section['length']
    
    return '\n\n'.join(result_parts)


def parse_document_structure(text: str) -> List[str]:
    """
    Parse document into logical sections.
    Recognizes: headers, paragraphs, lists, code blocks, etc.
    """
    sections = []
    
    # Split by major headers first
    header_pattern = r'\n(?:#{1,6}|(?:[A-Z][^:\n]*(?::|—)))\s+([^\n]+)'
    parts = re.split(header_pattern, text)
    
    if len(parts) > 1:
        # We have headers - process them
        for i in range(1, len(parts), 2):
            header = parts[i] if i < len(parts) else ""
            content = parts[i + 1] if i + 1 < len(parts) else ""
            
            if header and content:
                # Add header + content as a section
                section = f"{header}\n{content}"
                # Split large sections further
                for subsection in split_large_section(section, max_size=2000):
                    sections.append(subsection.strip())
    else:
        # No clear headers, split by paragraphs
        paragraphs = text.split('\n\n')
        
        current_group = ""
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            
            current_group += para + "\n\n"
            
            if len(current_group) >= 1000:
                sections.append(current_group.strip())
                current_group = ""
        
        if current_group.strip():
            sections.append(current_group.strip())
    
    return [s for s in sections if len(s) >= 100]


def split_large_section(text: str, max_size: int = 2000) -> List[str]:
    """Split overly long sections while maintaining coherence."""
    if len(text) <= max_size:
        return [text]
    
    sections = []
    current = ""
    
    for para in text.split('\n\n'):
        if len(current) + len(para) > max_size and current:
            sections.append(current.strip())
            current = para
        else:
            current += para + "\n\n"
    
    if current.strip():
        sections.append(current.strip())
    
    return sections


def score_section(section: str, 
                  clo_keywords: List[str],
                  objective_keywords: List[str]) -> Tuple[float, str]:
    """
    Score section relevance and identify its type.
    Returns (score, section_type)
    """
    section_lower = section.lower()
    
    # Identify section type
    section_type = identify_section_type(section)
    
    # Base score by type (definitions are most valuable for quiz generation)
    type_scores = {
        'definition': 2.0,
        'concept': 1.8,
        'key_formula': 1.7,
        'application': 1.5,
        'example': 1.4,
        'explanation': 1.3,
        'general': 0.5
    }
    base_score = type_scores.get(section_type, 0.5)
    
    # Count keyword matches
    keyword_matches = 0
    for keyword in clo_keywords + objective_keywords:
        keyword_lower = keyword.lower()
        matches = len(re.findall(r'\b' + re.escape(keyword_lower) + r'\b', section_lower))
        keyword_matches += matches * len(keyword) / 10.0
    
    # Normalize keyword score
    keyword_score = min(keyword_matches / max(len(clo_keywords + objective_keywords), 1), 3.0)
    
    final_score = base_score + keyword_score
    
    return final_score, section_type


def identify_section_type(text: str) -> str:
    """Identify the type of content in a section."""
    text_lower = text.lower()
    
    # Definition indicators
    if any(indicator in text_lower for indicator in ['is defined as', 'is referred to as', 'means', 'definition of']):
        return 'definition'
    
    # Formula/algorithm indicators
    if any(indicator in text_lower for indicator in ['formula', 'algorithm', 'equation', 'process:']):
        return 'key_formula'
    
    # Example indicators
    if any(indicator in text_lower for indicator in ['for example', 'example:', 'such as', 'case study', 'instance']):
        return 'example'
    
    # Application indicators
    if any(indicator in text_lower for indicator in ['application', 'applied to', 'used to', 'implementation', 'practice']):
        return 'application'
    
    # Explanation indicators
    if any(indicator in text_lower for indicator in ['explain', 'reason', 'because', 'due to', 'as a result']):
        return 'explanation'
    
    # Concept/summary indicators
    if any(indicator in text_lower for indicator in ['concept', 'principle', 'theory', 'overview', 'summary']):
        return 'concept'
    
    return 'general'