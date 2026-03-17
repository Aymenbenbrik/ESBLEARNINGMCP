"""
Document Processor Service
PDF processing with text extraction, section parsing, image extraction, and chunking.
Adapted from src/services/document_processor.py for ESB-main Flask app.
"""

import os
import re
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from pathlib import Path

import fitz  # PyMuPDF
try:
    from langchain_community.document_loaders import PyPDFLoader
except Exception:
    PyPDFLoader = None
from langchain_text_splitters import RecursiveCharacterTextSplitter
from PIL import Image
import io
from flask import current_app
import logging

logger = logging.getLogger(__name__)


@dataclass
class DocumentSection:
    """Represents a parsed section from a document"""
    section_number: str
    title: str
    content: str
    page_number: int
    start_char: int
    end_char: int


@dataclass
class ExtractedImage:
    """Represents an extracted image from a PDF"""
    image_path: str
    page_number: int
    image_index: int
    bbox: Tuple[float, float, float, float]  # x0, y0, x1, y1
    title: str = ""  # Image title/caption extracted from surrounding text
    description: Optional[str] = None


class PDFProcessor:
    """
    Process PDF documents: extract text, parse sections, extract images.
    """
    
    def __init__(self, pdf_path: str, document_id: str = None):
        """
        Initialize PDF processor.
        
        Args:
            pdf_path: Path to the PDF file
            document_id: Unique identifier for the document (for isolated storage)
        """
        self.pdf_path = pdf_path
        self.document_id = document_id or self._generate_document_id()
        
        # Get output directories from Flask config or use defaults
        try:
            base_dir = Path(current_app.config.get('UPLOAD_FOLDER', 'instance/uploads')).parent
        except RuntimeError:
            # Outside Flask context
            base_dir = Path('instance')
        
        self.output_dir = base_dir / "extracted_content"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Create document-specific images directory
        self.images_dir = self.output_dir / "images" / self.document_id
        self.images_dir.mkdir(parents=True, exist_ok=True)
        
        # Processing results
        self.sections: List[DocumentSection] = []
        self.images: List[ExtractedImage] = []
        self.full_text = ""
        self.total_pages = 0
    
    def _generate_document_id(self) -> str:
        """Generate a document ID from the filename"""
        name = Path(self.pdf_path).stem
        # Replace spaces and special chars with underscores
        return ''.join(c if c.isalnum() or c == '_' else '_' for c in name).lower()
    
    def extract_text_with_langchain(self) -> List[str]:
        """Extract text using LangChain PDFLoader when available, then fall back to PyMuPDF."""
        if PyPDFLoader is not None:
            try:
                loader = PyPDFLoader(self.pdf_path)
                pages = loader.load()

                page_texts = [page.page_content for page in pages]
                page_texts = [page.strip() for page in page_texts if page and page.strip()]
                self.full_text = "\n\n".join(page_texts)
                self.total_pages = len(page_texts)

                logger.info(f"Extracted {self.total_pages} pages from {self.pdf_path} with LangChain")
                if self.full_text.strip():
                    return page_texts
            except Exception as e:
                logger.warning(f"LangChain extraction failed, falling back to PyMuPDF: {e}")
        else:
            logger.warning("PyPDFLoader unavailable, falling back to PyMuPDF extraction")

        return self.extract_text_with_pymupdf()

    def extract_text_with_pymupdf(self) -> List[str]:
        """Extract text directly with PyMuPDF as a robust fallback."""
        try:
            doc = fitz.open(self.pdf_path)
            page_texts: List[str] = []

            for page in doc:
                page_text = page.get_text("text") or ""
                page_text = page_text.strip()
                page_texts.append(page_text)

            doc.close()

            self.total_pages = len(page_texts)
            self.full_text = "\n\n".join([page for page in page_texts if page])

            logger.info(f"Extracted {self.total_pages} pages from {self.pdf_path} with PyMuPDF")
            return page_texts
        except Exception as e:
            logger.error(f"Error extracting text with PyMuPDF: {e}")
            self.full_text = ""
            self.total_pages = 0
            return []
    
    def extract_image_title(self, page, image_bbox, page_num: int, image_index: int) -> str:
        """Extract image title/caption from surrounding text"""
        try:
            # Get text blocks on the same page
            text_blocks = page.get_text("blocks")
            
            # Find text near the image
            image_y = image_bbox[1]  # Top of image
            
            candidates = []
            for block in text_blocks:
                block_y = block[1]
                text = block[4].strip()
                
                # Look for caption patterns
                patterns = [
                    r'Figure\s*\d+',
                    r'Fig\.?\s*\d+',
                    r'Table\s*\d+',
                    r'Image\s*\d+',
                    r'Diagram\s*\d+',
                    r'Chart\s*\d+',
                    r'Plate\s*\d+',
                    r'Exhibit\s*\d+'
                ]
                
                for pattern in patterns:
                    if re.search(pattern, text, re.IGNORECASE):
                        distance = abs(block_y - image_y)
                        candidates.append((distance, text))
                        break
            
            # Return closest caption to image
            if candidates:
                candidates.sort(key=lambda x: x[0])
                caption = candidates[0][1]
                return caption[:200] if len(caption) > 200 else caption
            
            return f"Image {image_index + 1} on page {page_num + 1}"
            
        except Exception as e:
            logger.error(f"Error extracting image title: {e}")
            return f"Image {image_index + 1} on page {page_num + 1}"
    
    def extract_images_with_pymupdf(self) -> List[ExtractedImage]:
        """Extract images using PyMuPDF"""
        try:
            doc = fitz.open(self.pdf_path)
            extracted_images = []
            
            for page_num in range(doc.page_count):
                page = doc[page_num]
                image_list = page.get_images()
                
                for img_index, img in enumerate(image_list):
                    try:
                        # Get image data
                        xref = img[0]
                        pix = fitz.Pixmap(doc, xref)
                        
                        # Skip if image is too small (likely icon or artifact)
                        if pix.width < 50 or pix.height < 50:
                            pix = None
                            continue
                        
                        # Convert to PNG
                        if pix.n - pix.alpha < 4:  # GRAY or RGB
                            img_data = pix.tobytes("png")
                        else:  # CMYK: convert to RGB first
                            pix1 = fitz.Pixmap(fitz.csRGB, pix)
                            img_data = pix1.tobytes("png")
                            pix1 = None
                        
                        # Save image
                        image_filename = f"page_{page_num+1}_img_{img_index+1}.png"
                        image_path = self.images_dir / image_filename
                        
                        with open(image_path, "wb") as f:
                            f.write(img_data)
                        
                        # Get image bbox
                        img_rects = page.get_image_rects(xref)
                        bbox = img_rects[0] if img_rects else (0, 0, pix.width, pix.height)
                        
                        # Extract image title/caption
                        title = self.extract_image_title(page, bbox, page_num, img_index)
                        
                        extracted_image = ExtractedImage(
                            image_path=str(image_path),
                            page_number=page_num + 1,
                            image_index=img_index + 1,
                            bbox=bbox,
                            title=title
                        )
                        extracted_images.append(extracted_image)
                        
                        pix = None
                        
                    except Exception as e:
                        logger.error(f"Error extracting image {img_index} from page {page_num+1}: {e}")
                        continue
            
            doc.close()
            self.images = extracted_images
            logger.info(f"Extracted {len(extracted_images)} images from {self.pdf_path}")
            return extracted_images
            
        except Exception as e:
            logger.error(f"Error extracting images with PyMuPDF: {e}")
            return []
    
    def parse_sections(self, text: str = None) -> List[DocumentSection]:
        """Parse document sections based on numbering patterns"""
        if text is None:
            text = self.full_text
            
        sections = []
        
        # Pattern for section headers (1., 1.1, 2., 2.1, etc.)
        section_pattern = r'^(\d+(?:\.\d+)*)\.?\s+(.+?)$'
        
        lines = text.split('\n')
        current_section = None
        current_content = []
        char_position = 0
        
        for line_num, line in enumerate(lines):
            line = line.strip()
            char_position += len(line) + 1
            
            # Check if line matches section pattern
            match = re.match(section_pattern, line, re.MULTILINE)
            
            if match:
                # Save previous section if exists
                if current_section:
                    current_section.content = '\n'.join(current_content).strip()
                    current_section.end_char = char_position - len(line) - 1
                    sections.append(current_section)
                
                # Start new section
                section_number = match.group(1)
                title = match.group(2).strip()
                
                current_section = DocumentSection(
                    section_number=section_number,
                    title=title,
                    content="",
                    page_number=self._estimate_page_number(char_position, len(text)),
                    start_char=char_position - len(line),
                    end_char=0
                )
                current_content = []
            else:
                if line:
                    current_content.append(line)
        
        # Don't forget the last section
        if current_section:
            current_section.content = '\n'.join(current_content).strip()
            current_section.end_char = char_position
            sections.append(current_section)
        
        self.sections = sections
        logger.info(f"Parsed {len(sections)} sections from document")
        return sections
    
    def _estimate_page_number(self, char_position: int, total_chars: int) -> int:
        """Estimate page number based on character position"""
        if total_chars == 0 or self.total_pages == 0:
            return 1
        return max(1, int((char_position / total_chars) * self.total_pages))
    
    def chunk_text_for_embeddings(self, chunk_size: int = 2000, chunk_overlap: int = 400) -> List[Dict]:
        """Split text into chunks suitable for embeddings"""
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
        )
        
        chunks = []
        
        # If we have sections, chunk each separately to maintain context
        if self.sections:
            for section in self.sections:
                section_chunks = text_splitter.split_text(section.content)
                
                for i, chunk in enumerate(section_chunks):
                    chunks.append({
                        'content': chunk,
                        'section_number': section.section_number,
                        'section_title': section.title,
                        'page_number': section.page_number,
                        'chunk_index': i,
                        'metadata': {
                            'source': self.pdf_path,
                            'section': f"{section.section_number} - {section.title}",
                            'type': 'text'
                        }
                    })
        else:
            # No sections parsed, chunk the full text
            full_chunks = text_splitter.split_text(self.full_text)
            for i, chunk in enumerate(full_chunks):
                chunks.append({
                    'content': chunk,
                    'section_number': 'full',
                    'section_title': 'Document',
                    'page_number': 1,
                    'chunk_index': i,
                    'metadata': {
                        'source': self.pdf_path,
                        'section': 'Full Document',
                        'type': 'text'
                    }
                })
        
        logger.info(f"Created {len(chunks)} text chunks")
        return chunks
    
    def process_document(self, extract_images: bool = True) -> Dict:
        """
        Complete document processing pipeline.
        
        Args:
            extract_images: Whether to extract images (default True for module attachments)
            
        Returns:
            Dictionary with processing results
        """
        logger.info(f"Processing document: {self.pdf_path}")
        
        # Extract text
        logger.info("Extracting text...")
        page_texts = self.extract_text_with_langchain()
        
        if not self.full_text.strip():
            logger.warning(f"No extractable text found in document: {self.pdf_path}")

        # Parse sections
        logger.info("Parsing sections...")
        sections = self.parse_sections()
        
        # Extract images (optional)
        images = []
        if extract_images:
            logger.info("Extracting images...")
            images = self.extract_images_with_pymupdf()
        
        # Create text chunks
        logger.info("Creating text chunks...")
        text_chunks = self.chunk_text_for_embeddings()
        
        results = {
            'document_id': self.document_id,
            'pdf_path': self.pdf_path,
            'total_pages': self.total_pages,
            'sections_count': len(sections),
            'images_count': len(images),
            'text_chunks_count': len(text_chunks),
            'full_text_length': len(self.full_text),
            'output_directory': str(self.output_dir),
            'images_directory': str(self.images_dir)
        }
        
        logger.info(f"Processing complete: {results}")
        return results
    
    def get_section_by_number(self, section_number: str) -> Optional[DocumentSection]:
        """Get a specific section by its number"""
        for section in self.sections:
            if section.section_number == section_number:
                return section
        return None
    
    def get_images_for_page(self, page_number: int) -> List[ExtractedImage]:
        """Get all images from a specific page"""
        return [img for img in self.images if img.page_number == page_number]
