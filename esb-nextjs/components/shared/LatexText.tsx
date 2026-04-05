'use client';

import React from 'react';
import { InlineMath, BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';

interface Props {
  text: string;
  block?: boolean; // if true, wraps in a div; otherwise inline span
  className?: string;
}

/**
 * Renders text that may contain LaTeX math expressions.
 * Supports:
 *   - $$...$$ for block/display math
 *   - $...$  for inline math
 *   - \[...\] for block math
 *   - \(...\) for inline math
 */
export function LatexText({ text, block = false, className }: Props) {
  if (!text) return null;

  const parts = parseLatex(text);
  const Wrapper = block ? 'div' : 'span';

  return (
    <Wrapper className={className}>
      {parts.map((part, i) => {
        if (part.type === 'block') {
          return (
            <div key={i} className="my-2 overflow-x-auto">
              <BlockMath math={part.content} renderError={(err) => <span className="text-red-500 text-xs">{err.message}</span>} />
            </div>
          );
        }
        if (part.type === 'inline') {
          return (
            <InlineMath key={i} math={part.content} renderError={(err) => <span className="text-red-500 text-xs">{err.message}</span>} />
          );
        }
        return <React.Fragment key={i}>{part.content}</React.Fragment>;
      })}
    </Wrapper>
  );
}

type Part =
  | { type: 'text'; content: string }
  | { type: 'inline'; content: string }
  | { type: 'block'; content: string };

function parseLatex(text: string): Part[] {
  const parts: Part[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Check for \[...\] (block)
    const blockBracket = remaining.indexOf('\\[');
    // Check for \(...\) (inline)
    const inlineParen = remaining.indexOf('\\(');
    // Check for $$...$$ (block)
    const blockDollar = remaining.indexOf('$$');
    // Check for single $...$ (inline) — careful not to match $$
    const singleDollar = findSingleDollar(remaining);

    // Find the earliest match
    const candidates: { idx: number; type: string }[] = [];
    if (blockBracket !== -1) candidates.push({ idx: blockBracket, type: '\\[' });
    if (inlineParen !== -1) candidates.push({ idx: inlineParen, type: '\\(' });
    if (blockDollar !== -1) candidates.push({ idx: blockDollar, type: '$$' });
    if (singleDollar !== -1) candidates.push({ idx: singleDollar, type: '$' });

    if (candidates.length === 0) {
      parts.push({ type: 'text', content: remaining });
      break;
    }

    candidates.sort((a, b) => a.idx - b.idx);
    const best = candidates[0];

    // Push text before this match
    if (best.idx > 0) {
      parts.push({ type: 'text', content: remaining.slice(0, best.idx) });
    }

    remaining = remaining.slice(best.idx);

    if (best.type === '$$') {
      const end = remaining.indexOf('$$', 2);
      if (end === -1) {
        parts.push({ type: 'text', content: remaining });
        remaining = '';
      } else {
        const math = remaining.slice(2, end);
        parts.push({ type: 'block', content: math });
        remaining = remaining.slice(end + 2);
      }
    } else if (best.type === '$') {
      const end = remaining.indexOf('$', 1);
      if (end === -1) {
        parts.push({ type: 'text', content: remaining });
        remaining = '';
      } else {
        const math = remaining.slice(1, end);
        parts.push({ type: 'inline', content: math });
        remaining = remaining.slice(end + 1);
      }
    } else if (best.type === '\\[') {
      const end = remaining.indexOf('\\]', 2);
      if (end === -1) {
        parts.push({ type: 'text', content: remaining });
        remaining = '';
      } else {
        const math = remaining.slice(2, end);
        parts.push({ type: 'block', content: math });
        remaining = remaining.slice(end + 2);
      }
    } else if (best.type === '\\(') {
      const end = remaining.indexOf('\\)', 2);
      if (end === -1) {
        parts.push({ type: 'text', content: remaining });
        remaining = '';
      } else {
        const math = remaining.slice(2, end);
        parts.push({ type: 'inline', content: math });
        remaining = remaining.slice(end + 2);
      }
    }
  }

  return parts;
}

/** Find position of a single $ that is not part of $$ */
function findSingleDollar(text: string): number {
  let i = 0;
  while (i < text.length) {
    if (text[i] === '$') {
      if (text[i + 1] === '$') {
        i += 2; // skip $$
        continue;
      }
      return i;
    }
    i++;
  }
  return -1;
}
