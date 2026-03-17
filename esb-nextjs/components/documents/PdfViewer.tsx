'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from '@/components/ui/button';
import { Loader2, ZoomIn, ZoomOut, Maximize, Minimize, RotateCcw } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure worker - use unpkg CDN to match react-pdf's bundled pdfjs-dist version
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  documentId: number;
  fileUrl: string;
  initialZoom?: number;
}

export default function PdfViewer({ documentId, fileUrl, initialZoom = 1.0 }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(initialZoom);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch PDF with authentication on mount
  useEffect(() => {
    const fetchPdf = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch PDF with authentication (axios sends cookies)
        const response = await apiClient.get(`/api/v1/documents/${documentId}/file`, {
          responseType: 'blob', // Important: get binary data
        });

        // Create blob URL for react-pdf
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        setPdfBlob(blobUrl);
      } catch (err) {
        console.error('Error fetching PDF:', err);
        setError('Failed to load PDF document. Please try again.');
        setIsLoading(false);
      }
    };

    fetchPdf();

    // Cleanup: revoke blob URL on unmount
    return () => {
      if (pdfBlob) {
        URL.revokeObjectURL(pdfBlob);
      }
    };
  }, [documentId]); // Re-fetch if documentId changes

  // PDF load success handler
  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setIsLoading(false);
    setError(null);
  }

  // PDF load error handler
  function onDocumentLoadError(error: Error) {
    console.error('Error loading PDF:', error);
    setError('Failed to load PDF document. Please try again.');
    setIsLoading(false);
  }

  // Zoom controls
  const zoomIn = () => {
    setScale(prev => Math.min(prev + 0.25, 3.0)); // Max 300%
  };

  const zoomOut = () => {
    setScale(prev => Math.max(prev - 0.25, 0.5)); // Min 50%
  };

  const resetZoom = () => {
    setScale(1.0);
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.error('Error attempting to enable fullscreen:', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  };

  // Handle ESC key to exit fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Handle mouse wheel zoom with Ctrl key
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setScale(prev => Math.max(0.5, Math.min(3.0, prev + delta)));
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`pdf-viewer-container ${isFullscreen ? 'fullscreen' : ''}`}
      style={{
        backgroundColor: '#525659',
        borderRadius: isFullscreen ? '0' : '0.5rem',
        overflow: 'hidden',
        position: 'relative',
        transition: 'all 0.3s ease',
      }}
    >
      {/* Toolbar */}
      <div
        className="pdf-toolbar"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          borderBottom: '1px solid #dee2e6',
          padding: '0.75rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          position: isFullscreen ? 'fixed' : 'relative',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
        }}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={zoomOut}
          disabled={scale <= 0.5}
          title="Zoom Out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={resetZoom}
          title="Reset Zoom"
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          {Math.round(scale * 100)}%
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={zoomIn}
          disabled={scale >= 3.0}
          title="Zoom In"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>

        <div className="flex-1" />

        {numPages > 0 && (
          <span className="text-sm text-gray-600">
            {numPages} {numPages === 1 ? 'page' : 'pages'}
          </span>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        >
          {isFullscreen ? (
            <Minimize className="h-4 w-4" />
          ) : (
            <Maximize className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* PDF Content */}
      <div
        className="pdf-content"
        style={{
          overflowY: 'auto',
          height: isFullscreen ? 'calc(100vh - 60px)' : '600px',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        {error ? (
          <div className="text-center py-8">
            <p className="text-red-500 mb-2">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        ) : (
          <Document
            file={pdfBlob}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2 text-white">Loading PDF...</span>
              </div>
            }
          >
            {Array.from(new Array(numPages), (el, index) => (
              <div
                key={`page_${index + 1}`}
                style={{
                  backgroundColor: 'white',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  marginBottom: index < numPages - 1 ? '20px' : '0',
                }}
              >
                <Page
                  pageNumber={index + 1}
                  scale={scale}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                />
              </div>
            ))}
          </Document>
        )}
      </div>
    </div>
  );
}
