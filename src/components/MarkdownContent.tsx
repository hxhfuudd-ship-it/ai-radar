'use client';

import { Streamdown } from 'streamdown';
import { cjk } from '@streamdown/cjk';

interface MarkdownContentProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
}

export function MarkdownContent({ content, className, isStreaming }: MarkdownContentProps) {
  return (
    <Streamdown
      className={className}
      plugins={{ cjk }}
      mode={isStreaming ? 'streaming' : 'static'}
      caret={isStreaming ? 'block' : undefined}
      isAnimating={isStreaming}
      controls={false}
      linkSafety={{ enabled: false }}
    >
      {content}
    </Streamdown>
  );
}
