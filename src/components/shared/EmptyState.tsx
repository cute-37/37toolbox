// @author: frontend-ai | phase: 2 | component: EmptyState
import React from 'react';

import ToolIcon from '../icons/ToolIcon';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/** 渲染居中空状态。 */
export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
  <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center text-text-secondary">
    <div className="text-text-muted">{icon ?? <ToolIcon name="wrench" size={42} />}</div>
    <div>
      <h2 className="text-lg font-bold text-text-primary">{title}</h2>
      {description ? <p className="mt-1 text-xs">{description}</p> : null}
    </div>
    {action ? <div className="mt-1">{action}</div> : null}
  </div>
);
