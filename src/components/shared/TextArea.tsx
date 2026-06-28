// @author: frontend-ai | phase: 2 | component: TextArea
import React from 'react';

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  showLineNumbers?: boolean;
}

/** 渲染统一多行文本框，可显示行号。 */
export const TextArea: React.FC<TextAreaProps> = ({ showLineNumbers = false, value, className = '', rows = 8, ...props }) => {
  const text = typeof value === 'string' ? value : '';
  const lines = Math.max(rows, text.split(/\r?\n/).length);

  return (
    <div className={`flex overflow-hidden rounded-sm border border-border-light bg-bg-secondary transition focus-within:border-accent ${className}`}>
      {showLineNumbers ? (
        <div className="select-none border-r border-border bg-bg-sidebar px-2 py-2 text-right font-mono text-2xs leading-5 text-text-muted">
          {Array.from({ length: lines }, (_, index) => <div key={index}>{index + 1}</div>)}
        </div>
      ) : null}
      <textarea
        {...props}
        value={value}
        rows={rows}
        className="min-h-0 flex-1 resize-none bg-transparent p-2 font-mono text-sm leading-5 text-text-primary placeholder:text-text-muted focus:outline-none"
      />
    </div>
  );
};
