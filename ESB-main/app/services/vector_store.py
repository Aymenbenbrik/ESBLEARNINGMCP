"""
Vector Store Service
ChromaDB-based vector storage with SentenceTransformer embeddings.
Adapted from src/services/vector_store.py for ESB-main Flask app.
"""

import os
from typing import List, Dict, Optional
import chromadb
from chromadb.config import Settings as ChromaSettings
from chromadb.utils import embedding_functions
from sentence_transformers import SentenceTransformer
from pathlib import Path
import uuid
import logging

from app.services.document_processor import DocumentSection, ExtractedImage

logger = logging.getLogger(__name__)


class VectorStore:
    """
    ChromaDB-based vector store for document retrieval.
    Each document gets its own collection for isolation.
    """
    
    def __init__(self, document_id: str = "default", persist_directory: str = None):
        """
        Initialize vector store.
        
        Args:
            document_id: Unique identifier for the document
            persist_directory: Path to ChromaDB storage (defaults to instance/chroma_db)
        """
        # Use instance/chroma_db if no path provided
        if persist_directory is None:
            persist_directory = str(Path("instance") / "chroma_db")
        
        self.document_id = document_id
        self.collection_name = f"doc_{document_id}"
        self.persist_directory = Path(persist_directory)
        self.persist_directory.mkdir(parents=True, exist_ok=True)
        
        # Initialize embedding model
        logger.info("Loading embedding model: all-MiniLM-L6-v2")
        self.embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
        
        # Initialize ChromaDB
        self.client = chromadb.PersistentClient(
            path=str(self.persist_directory),
            settings=ChromaSettings(anonymized_telemetry=False)
        )
        
        # Get or create document-specific collection
        try:
            self.collection = self.client.get_collection(
                name=self.collection_name,
                embedding_function=self._get_embedding_function()
            )
            logger.info(f"Loaded existing collection: {self.collection_name}")
        except:
            self.collection = self.client.create_collection(
                name=self.collection_name,
                embedding_function=self._get_embedding_function()
            )
            logger.info(f"Created new collection: {self.collection_name}")
    
    def _get_embedding_function(self):
        """Get embedding function for ChromaDB"""
        class CustomEmbeddingFunction(embedding_functions.EmbeddingFunction):
            def __init__(self, model):
                self.model = model
            
            def __call__(self, input):
                if isinstance(input, str):
                    input = [input]
                embeddings = self.model.encode(input, convert_to_tensor=False)
                return embeddings.tolist()
        
        return CustomEmbeddingFunction(self.embedding_model)
    
    def add_text_chunks(self, text_chunks: List[Dict]) -> None:
        """Add text chunks to the vector store"""
        if not text_chunks:
            return
        
        logger.info(f"Adding {len(text_chunks)} text chunks to vector store...")
        
        documents = []
        metadatas = []
        ids = []
        
        for chunk in text_chunks:
            chunk_id = f"text_{uuid.uuid4().hex[:8]}"
            
            documents.append(chunk['content'])
            
            metadata = {
                'type': 'text',
                'section_number': str(chunk.get('section_number', '')),
                'section_title': str(chunk.get('section_title', '')),
                'page_number': int(chunk.get('page_number', 1)),
                'chunk_index': int(chunk.get('chunk_index', 0)),
                'source': str(chunk.get('metadata', {}).get('source', ''))
            }
            
            metadatas.append(metadata)
            ids.append(chunk_id)
        
        # Add to collection in batches
        batch_size = 100
        for i in range(0, len(documents), batch_size):
            batch_docs = documents[i:i+batch_size]
            batch_metas = metadatas[i:i+batch_size]
            batch_ids = ids[i:i+batch_size]
            
            self.collection.add(
                documents=batch_docs,
                metadatas=batch_metas,
                ids=batch_ids
            )
        
        logger.info(f"Added {len(text_chunks)} text chunks successfully")
    
    def add_section_summaries(self, summaries: List[Dict]) -> None:
        """Add section summaries for CAG (Cached Augmented Generation)"""
        if not summaries:
            return
        
        logger.info(f"Adding {len(summaries)} section summaries to vector store...")
        
        documents = []
        metadatas = []
        ids = []
        
        for i, summary in enumerate(summaries):
            summary_id = f"summary_{i}_{summary.get('section_number', 'x').replace('.', '_')}"
            
            content = f"{summary.get('title', '')}: {summary.get('summary', '')}"
            documents.append(content)
            
            metadata = {
                'type': 'summary',
                'section_number': str(summary.get('section_number', '')),
                'section_title': str(summary.get('title', '')),
                'page_number': int(summary.get('page_number', 1)),
                'summary': str(summary.get('summary', ''))
            }
            
            metadatas.append(metadata)
            ids.append(summary_id)
        
        self.collection.add(
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )
        
        logger.info(f"Added {len(summaries)} section summaries successfully")
    
    def add_image_descriptions(self, images: List[ExtractedImage], descriptions: List[str] = None) -> None:
        """Add image descriptions to vector store"""
        if not images:
            return
        
        logger.info(f"Adding {len(images)} image descriptions to vector store...")
        
        documents = []
        metadatas = []
        ids = []
        
        for i, img in enumerate(images):
            img_id = f"image_{i}_p{img.page_number}_i{img.image_index}"
            
            # Use provided description or title
            description = descriptions[i] if descriptions and i < len(descriptions) else img.title
            content = f"Image on page {img.page_number}: {description}"
            documents.append(content)
            
            metadata = {
                'type': 'image',
                'page_number': img.page_number,
                'image_index': img.image_index,
                'image_path': img.image_path,
                'title': img.title,
                'description': description
            }
            
            metadatas.append(metadata)
            ids.append(img_id)
        
        if documents:
            self.collection.add(
                documents=documents,
                metadatas=metadatas,
                ids=ids
            )
            logger.info(f"Added {len(documents)} image descriptions successfully")
    
    def store_document_overview(self, overview: str) -> None:
        """Store document overview in vector store"""
        try:
            overview_id = "document_overview"
            
            # Try to delete existing overview
            try:
                existing = self.collection.get(ids=[overview_id])
                if existing['ids']:
                    self.collection.delete(ids=[overview_id])
            except:
                pass
            
            self.collection.add(
                documents=[overview],
                metadatas=[{'type': 'overview', 'content': overview}],
                ids=[overview_id]
            )
            logger.info("Document overview cached successfully")
        except Exception as e:
            logger.error(f"Error storing document overview: {e}")
    
    def get_document_overview(self) -> Optional[str]:
        """Retrieve cached document overview"""
        try:
            result = self.collection.get(ids=["document_overview"])
            if result['ids'] and len(result['ids']) > 0:
                return result['metadatas'][0].get('content')
            return None
        except Exception as e:
            logger.error(f"Error retrieving document overview: {e}")
            return None
    
    def search_summaries(self, query: str, n_results: int = 5) -> List[Dict]:
        """Search section summaries (CAG - fast retrieval)"""
        try:
            results = self.collection.query(
                query_texts=[query],
                n_results=n_results,
                where={"type": "summary"}
            )
            
            formatted_results = []
            if results['documents'] and results['documents'][0]:
                for i, doc in enumerate(results['documents'][0]):
                    formatted_results.append({
                        'content': doc,
                        'metadata': results['metadatas'][0][i],
                        'distance': results['distances'][0][i] if 'distances' in results else 0.0
                    })
            
            return formatted_results
        except Exception as e:
            logger.error(f"Error searching summaries: {e}")
            return []
    
    def search_text_chunks(self, query: str, n_results: int = 10, section_filter: Optional[str] = None) -> List[Dict]:
        """Search detailed text chunks"""
        try:
            if section_filter:
                where_clause = {"$and": [{"type": "text"}, {"section_number": section_filter}]}
            else:
                where_clause = {"type": "text"}
            
            results = self.collection.query(
                query_texts=[query],
                n_results=n_results,
                where=where_clause
            )
            
            formatted_results = []
            if results['documents'] and results['documents'][0]:
                for i, doc in enumerate(results['documents'][0]):
                    formatted_results.append({
                        'content': doc,
                        'metadata': results['metadatas'][0][i],
                        'distance': results['distances'][0][i] if 'distances' in results else 0.0
                    })
            
            return formatted_results
        except Exception as e:
            logger.error(f"Error searching text chunks: {e}")
            return []
    
    def search_images(self, query: str, n_results: int = 5) -> List[Dict]:
        """Search image descriptions"""
        try:
            results = self.collection.query(
                query_texts=[query],
                n_results=n_results,
                where={"type": "image"}
            )
            
            formatted_results = []
            if results['documents'] and results['documents'][0]:
                for i, doc in enumerate(results['documents'][0]):
                    formatted_results.append({
                        'content': doc,
                        'metadata': results['metadatas'][0][i],
                        'distance': results['distances'][0][i] if 'distances' in results else 0.0
                    })
            
            return formatted_results
        except Exception as e:
            logger.error(f"Error searching images: {e}")
            return []
    
    def search_all(self, query: str, n_results: int = 15) -> Dict[str, List[Dict]]:
        """Search all content types and return combined results"""
        return {
            'summaries': self.search_summaries(query, n_results // 3),
            'text_chunks': self.search_text_chunks(query, n_results // 2),
            'images': self.search_images(query, n_results // 3)
        }
    
    def get_context_for_query(self, query: str, max_chars: int = 8000) -> str:
        """
        Get formatted context string for a query.
        Combines summaries and text chunks into a single context.
        """
        results = self.search_all(query)
        
        context_parts = []
        char_count = 0
        
        # Add summaries first (CAG - faster overview)
        for result in results['summaries']:
            section = result['metadata'].get('section_title', 'Section')
            content = f"[{section}] {result['content']}"
            if char_count + len(content) < max_chars:
                context_parts.append(content)
                char_count += len(content)
        
        # Add detailed text chunks
        for result in results['text_chunks']:
            section = result['metadata'].get('section_title', 'Section')
            content = f"[{section}] {result['content']}"
            if char_count + len(content) < max_chars:
                context_parts.append(content)
                char_count += len(content)
        
        # Add image descriptions
        for result in results['images']:
            content = result['content']
            if char_count + len(content) < max_chars:
                context_parts.append(content)
                char_count += len(content)
        
        return "\n\n".join(context_parts)
    
    def get_vector_count(self) -> int:
        """Get count of vectors in this collection"""
        try:
            return self.collection.count()
        except Exception as e:
            logger.error(f"Error getting vector count: {e}")
            return 0
    
    def collection_exists(self) -> bool:
        """Check if this collection has any vectors"""
        return self.get_vector_count() > 0
    
    def delete_collection(self) -> None:
        """Delete the entire collection for this document"""
        try:
            logger.info(f"Deleting collection: {self.collection_name}")
            self.client.delete_collection(self.collection_name)
            logger.info(f"Deleted collection: {self.collection_name}")
        except Exception as e:
            logger.error(f"Error deleting collection: {e}")
    
    def clear_collection(self) -> None:
        """Clear all documents from the collection"""
        try:
            self.client.delete_collection(self.collection_name)
            self.collection = self.client.create_collection(
                name=self.collection_name,
                embedding_function=self._get_embedding_function()
            )
            logger.info(f"Cleared collection: {self.collection_name}")
        except Exception as e:
            logger.error(f"Error clearing collection: {e}")
    
    def get_collection_stats(self) -> Dict:
        """Get statistics about the collection"""
        try:
            count = self.collection.count()
            
            sample_results = self.collection.peek(limit=min(100, count))
            
            types_count = {}
            for metadata in sample_results.get('metadatas', []):
                content_type = metadata.get('type', 'unknown')
                types_count[content_type] = types_count.get(content_type, 0) + 1
            
            return {
                'total_documents': count,
                'content_types': types_count,
                'collection_name': self.collection_name
            }
        except Exception as e:
            logger.error(f"Error getting collection stats: {e}")
            return {'error': str(e)}
