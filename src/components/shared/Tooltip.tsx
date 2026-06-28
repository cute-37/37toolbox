// @author: frontend-ai | phase: 2 | component: Tooltip
import React from 'react';

export interface TooltipProps {
  content: string;
  side?: 'top' | 'bottom';
  rich?: boolean;
  children: React.ReactNode;
}

/** 渲染延迟出现的轻量提示。 */
export const Tooltip: React.FC<TooltipProps> = ({ content, side = 'top', rich = false, children }) => (
  <span className="group relative inline-flex">
    {children}
    {rich ? (
      <span
        className={`pointer-events-none absolute left-1/2 z-20 min-w-48 -translate-x-1/2 rounded-sm bg-bg-active px-2 py-1 text-2xs text-text-primary opacity-0 shadow-md transition delay-300 group-hover:opacity-100 ${
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
        }`}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    ) : (
      <span
        className={`pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-sm bg-bg-active px-2 py-1 text-2xs text-text-primary opacity-0 shadow-md transition delay-300 group-hover:opacity-100 ${
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
        }`}
      >
        {content}
      </span>
    )}
  </span>
);
