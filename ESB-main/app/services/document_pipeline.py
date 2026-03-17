"""
Document Processing Pipeline
Unified pipeline for processing uploaded PDF documents.
Coordinates PDFProcessor, VectorStore, Summarizer, and DocumentManager.
"""

import logging
from typing import Dict, Optional, Tuple
from pathlib import Path

from app.services.document_processor import PDFProcessor
from app.services.vector_store import VectorStore
from app.services.summarizer import DocumentSummarizer
from app.services import document_manager

logger = logging.getLogger(__name__)


def process_pdf_document(
    pdf_path: str,
    document_id: int,
    document_name: str,
    extract_images: bool = True,
    generate_summaries: bool = True
) -> Tuple[bool, Dict]:
    """
    Complete document processing pipeline.
    
    1. Extract text and sections from PDF
    2. Extract images (optional, for module attachments)
    3. Generate section summaries (CAG)
    4. Index everything in ChromaDB
    5. Register in document manager
    
    Args:
        pdf_path: Absolute path to the PDF file
        document_id: SQLAlchemy Document.id for cross-reference
        document_name: Original filename for display
        extract_images: Whether to extract and describe images
        generate_summaries: Whether to generate section summaries
        
    Returns:
        Tuple of (success: bool, stats: Dict)
    """
    try:
        logger.info(f"Starting document processing pipeline for: {document_name}")
        
        # Step 1: Process PDF
        processor = PDFProcessor(pdf_path, document_id=str(document_id))
        stats = processor.process_document(extract_images=extract_images)
        
        logger.info(f"PDF processing complete: {stats}")
        
        # Step 2: Initialize vector store
        vs = VectorStore(document_id=str(document_id))
        
        # Step 3: Index text chunks
        text_chunks = processor.chunk_text_for_embeddings()
        if text_chunks:
            vs.add_text_chunks(text_chunks)
            logger.info(f"Indexed {len(text_chunks)} text chunks")
        
        # Step 4: Generate and index section summaries (CAG)
        if generate_summaries and processor.sections:
            try:
                summarizer = DocumentSummarizer()
                summaries = summarizer.create_section_summaries(processor.sections)
                if summaries:
                    vs.add_section_summaries(summaries)
                    logger.info(f"Indexed {len(summaries)} section summaries")
                
                # Create and store document overview
                overview = summarizer.create_document_overview_from_summaries(summaries)
                if overview:
                    vs.store_document_overview(overview)
                    logger.info("Stored document overview")
                    
            except Exception as e:
                logger.warning(f"Summary generation failed (non-critical): {e}")
        
        # Step 5: Process images (for module attachments)
        if extract_images and processor.images:
            try:
                summarizer = DocumentSummarizer()
                descriptions = []
                
                for img in processor.images:
                    desc = summarizer.generate_image_description(img.image_path, img.title)
                    descriptions.append(desc)
                    img.description = desc
                
                vs.add_image_descriptions(processor.images, descriptions)
                logger.info(f"Indexed {len(processor.images)} image descriptions")
                
            except Exception as e:
                logger.warning(f"Image description failed (non-critical): {e}")
        
        # Step 6: Register in document manager
        document_manager.add_document(
            filename=document_name,
            pdf_path=pdf_path,
            stats=stats,
            db_document_id=document_id
        )
        
        logger.info(f"Document processing complete for: {document_name}")
        
        return True, stats
        
    except Exception as e:
        logger.error(f"Document processing failed for {document_name}: {e}")
        return False, {'error': str(e)}


def is_document_indexed(document_id: int) -> bool:
    """Check if a document has been processed and indexed"""
    try:
        vs = VectorStore(document_id=str(document_id))
        return vs.collection_exists()
    except Exception:
        return False


def get_document_context(document_id: int, query: str, max_chars: int = 8000) -> str:
    """Get context from an indexed document for a query"""
    try:
        vs = VectorStore(document_id=str(document_id))
        if vs.collection_exists():
            return vs.get_context_for_query(query, max_chars=max_chars)
        return ""
    except Exception as e:
        logger.error(f"Error getting document context: {e}")
        return ""


def reprocess_document(document_id: int, pdf_path: str, document_name: str) -> Tuple[bool, Dict]:
    """Re-process a document (clear existing and reindex)"""
    try:
        # Clear existing vector store
        vs = VectorStore(document_id=str(document_id))
        vs.clear_collection()
        
        # Delete from document manager
        document_manager.delete_document_by_db_id(document_id)
        
        # Re-process
        return process_pdf_document(pdf_path, document_id, document_name)
        
    except Exception as e:
        logger.error(f"Error reprocessing document: {e}")
        return False, {'error': str(e)}


def delete_document_index(document_id: int) -> bool:
    """Delete all indexed data for a document"""
    try:
        # Delete from vector store
        vs = VectorStore(document_id=str(document_id))
        vs.delete_collection()
        
        # Delete from document manager
        document_manager.delete_document_by_db_id(document_id)
        
        logger.info(f"Deleted index for document {document_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error deleting document index: {e}")
        return False
