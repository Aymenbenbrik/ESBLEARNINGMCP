'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface DocumentSummaryProps {
  summary: string | null;
  documentId: number;
}

export default function DocumentSummary({ summary, documentId }: DocumentSummaryProps) {
  const storageKey = `doc-summary-${documentId}-expanded`;

  // Initialize from localStorage or default to expanded
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(storageKey);
      return stored !== null ? stored === 'true' : true;
    }
    return true;
  });

  // Save to localStorage whenever state changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, String(isExpanded));
    }
  }, [isExpanded, storageKey]);

  const toggleExpanded = () => {
    setIsExpanded(prev => !prev);
  };

  return (
    <Card
      className="document-summary-card transition-all duration-300"
      style={{
        backgroundColor: isExpanded ? '#fffbf0' : 'white',
        borderLeft: isExpanded ? '4px solid #ffc107' : 'none',
      }}
    >
      {/* Header - Always visible */}
      <div
        className="summary-header flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={toggleExpanded}
      >
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-yellow-600" />
          <h3 className="text-lg font-semibold">Document Summary</h3>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpanded();
          }}
        >
          {isExpanded ? (
            <ChevronUp className="h-5 w-5" />
          ) : (
            <ChevronDown className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* Content - Collapsible */}
      {isExpanded && (
        <div
          className="summary-content px-4 pb-4 animate-in slide-in-from-top-2 duration-300"
        >
          {summary ? (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                components={{
                  // Customize markdown rendering if needed
                  h1: ({ node, ...props }) => (
                    <h1 className="text-xl font-bold mb-2" {...props} />
                  ),
                  h2: ({ node, ...props }) => (
                    <h2 className="text-lg font-semibold mb-2" {...props} />
                  ),
                  h3: ({ node, ...props }) => (
                    <h3 className="text-base font-semibold mb-1" {...props} />
                  ),
                  p: ({ node, ...props }) => (
                    <p className="mb-2 text-gray-700" {...props} />
                  ),
                  ul: ({ node, ...props }) => (
                    <ul className="list-disc list-inside mb-2 space-y-1" {...props} />
                  ),
                  ol: ({ node, ...props }) => (
                    <ol className="list-decimal list-inside mb-2 space-y-1" {...props} />
                  ),
                  li: ({ node, ...props }) => (
                    <li className="text-gray-700" {...props} />
                  ),
                  strong: ({ node, ...props }) => (
                    <strong className="font-semibold text-gray-900" {...props} />
                  ),
                  em: ({ node, ...props }) => (
                    <em className="italic text-gray-800" {...props} />
                  ),
                  code: ({ node, className, children, ...props }: any) => {
                    const isInline = !className?.includes('language-');
                    return isInline ? (
                      <code
                        className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono"
                        {...props}
                      >
                        {children}
                      </code>
                    ) : (
                      <code
                        className="block bg-gray-100 p-2 rounded text-sm font-mono overflow-x-auto"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {summary}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-gray-500 italic">No summary available yet.</p>
          )}
        </div>
      )}
    </Card>
  );
}
