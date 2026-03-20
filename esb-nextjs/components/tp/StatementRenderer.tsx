'use client';

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';

interface Props {
  content: string;
  className?: string;
}

export function StatementRenderer({ content, className = '' }: Props) {
  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{
          code({ node, className, children, ...props }: any) {
            const isBlock = className?.startsWith('language-');
            if (isBlock) {
              return (
                <code
                  className={`${className} block rounded-lg overflow-x-auto`}
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className="bg-gray-100 text-rose-700 rounded px-1 py-0.5 text-[0.85em] font-mono"
                {...props}
              >
                {children}
              </code>
            );
          },
          h1: ({ children }) => <h1 className="text-xl font-bold text-gray-900 mt-4 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-semibold text-gray-800 mt-3 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-semibold text-gray-700 mt-2 mb-1">{children}</h3>,
          ul: ({ children }) => <ul className="list-disc list-inside space-y-1 text-gray-700">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 text-gray-700">{children}</ol>,
          li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,
          p: ({ children }) => <p className="text-sm text-gray-700 leading-relaxed mb-2">{children}</p>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-rose-200 pl-4 py-1 my-2 bg-rose-50/50 rounded-r-lg text-sm text-gray-600 italic">
              {children}
            </blockquote>
          ),
          strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
          em: ({ children }) => <em className="text-gray-600 italic">{children}</em>,
          table: ({ children }) => (
            <div className="overflow-x-auto my-3">
              <table className="min-w-full border border-gray-200 rounded-lg text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="bg-gray-50 px-3 py-2 text-left font-semibold text-gray-700 border-b border-gray-200">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 text-gray-600 border-b border-gray-100">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
