"""
Document Manager Service
JSON-based document registry for tracking processed documents.
Adapted from src/core/document_manager.py for ESB-main Flask app.
"""

import json
import os
from datetime import datetime
from typing import Dict, List, Optional
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# Default paths
DEFAULT_DOCUMENTS_FILE = Path("instance") / "documents.json"
CURRENT_VERSION = 2


def _get_documents_file() -> Path:
    """Get path to documents.json file"""
    return DEFAULT_DOCUMENTS_FILE


def sanitize_filename(filename: str) -> str:
    """Convert filename to valid document ID"""
    name = Path(filename).stem
    return ''.join(c if c.isalnum() or c == '_' else '_' for c in name).lower()


def load_documents() -> Dict:
    """Load documents from JSON file"""
    documents_file = _get_documents_file()
    
    if not documents_file.exists():
        # Ensure parent directory exists
        documents_file.parent.mkdir(parents=True, exist_ok=True)
        return {"documents": {}}
    
    try:
        with open(documents_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading documents.json: {e}")
        return {"documents": {}}


def save_documents(data: Dict) -> None:
    """Save documents to JSON file"""
    documents_file = _get_documents_file()
    documents_file.parent.mkdir(parents=True, exist_ok=True)
    
    try:
        with open(documents_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Error saving documents.json: {e}")


def add_document(filename: str, pdf_path: str, stats: Dict, db_document_id: int = None) -> str:
    """
    Add new document to registry.
    
    Args:
        filename: Original filename
        pdf_path: Path to the PDF file
        stats: Processing statistics from PDFProcessor
        db_document_id: Optional SQLAlchemy Document.id for cross-reference
        
    Returns:
        Document ID string
    """
    base_id = sanitize_filename(filename)
    data = load_documents()
    
    # Convert to absolute path
    abs_path = Path(pdf_path).resolve()
    
    # Handle collision by adding timestamp
    doc_id = base_id
    if doc_id in data["documents"]:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        doc_id = f"{base_id}_{timestamp}"
    
    data["documents"][doc_id] = {
        "id": doc_id,
        "name": filename,
        "original_filename": filename,
        "upload_date": datetime.now().isoformat(),
        "pdf_path": str(abs_path),
        "stats": stats,
        "version": CURRENT_VERSION,
        "last_accessed": datetime.now().isoformat(),
        "db_document_id": db_document_id  # Link to SQLAlchemy Document
    }
    
    save_documents(data)
    logger.info(f"Added document to registry: {doc_id}")
    return doc_id


def get_document(doc_id: str) -> Optional[Dict]:
    """Get document by ID"""
    data = load_documents()
    return data["documents"].get(doc_id)


def get_document_by_db_id(db_document_id: int) -> Optional[Dict]:
    """Get document by SQLAlchemy Document.id"""
    data = load_documents()
    for doc in data["documents"].values():
        if doc.get("db_document_id") == db_document_id:
            return doc
    return None


def get_all_documents() -> List[Dict]:
    """Get all documents, sorted by last accessed (newest first)"""
    data = load_documents()
    docs = list(data["documents"].values())
    docs.sort(key=lambda x: x.get("last_accessed", ""), reverse=True)
    return docs


def update_last_accessed(doc_id: str) -> None:
    """Update last accessed timestamp"""
    data = load_documents()
    if doc_id in data["documents"]:
        data["documents"][doc_id]["last_accessed"] = datetime.now().isoformat()
        save_documents(data)


def delete_document(doc_id: str) -> bool:
    """Remove document from registry"""
    data = load_documents()
    if doc_id in data["documents"]:
        del data["documents"][doc_id]
        save_documents(data)
        logger.info(f"Deleted document from registry: {doc_id}")
        return True
    return False


def delete_document_by_db_id(db_document_id: int) -> bool:
    """Remove document by SQLAlchemy Document.id"""
    data = load_documents()
    doc_id_to_delete = None
    
    for doc_id, doc in data["documents"].items():
        if doc.get("db_document_id") == db_document_id:
            doc_id_to_delete = doc_id
            break
    
    if doc_id_to_delete:
        del data["documents"][doc_id_to_delete]
        save_documents(data)
        logger.info(f"Deleted document by db_id {db_document_id}: {doc_id_to_delete}")
        return True
    return False


def is_document_processed(doc_id: str) -> bool:
    """Check if document has been processed (exists in registry)"""
    doc = get_document(doc_id)
    return doc is not None


def is_document_processed_by_db_id(db_document_id: int) -> bool:
    """Check if document has been processed by SQLAlchemy ID"""
    doc = get_document_by_db_id(db_document_id)
    return doc is not None


def update_document_stats(doc_id: str, stats: Dict) -> None:
    """Update document processing statistics"""
    data = load_documents()
    if doc_id in data["documents"]:
        data["documents"][doc_id]["stats"] = stats
        data["documents"][doc_id]["last_accessed"] = datetime.now().isoformat()
        save_documents(data)


def validate_document_path(doc_id: str) -> bool:
    """Check if document's PDF file exists"""
    doc = get_document(doc_id)
    if not doc:
        return False
    return Path(doc["pdf_path"]).exists()


def get_document_stats_summary() -> Dict:
    """Get summary statistics of all processed documents"""
    docs = get_all_documents()
    
    total_pages = 0
    total_sections = 0
    total_images = 0
    total_chunks = 0
    
    for doc in docs:
        stats = doc.get("stats", {})
        total_pages += stats.get("total_pages", 0)
        total_sections += stats.get("sections_count", 0)
        total_images += stats.get("images_count", 0)
        total_chunks += stats.get("text_chunks_count", 0)
    
    return {
        "total_documents": len(docs),
        "total_pages": total_pages,
        "total_sections": total_sections,
        "total_images": total_images,
        "total_chunks": total_chunks
    }
