// @author: frontend-ai | phase: 2 | component: Input
import React from 'react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

/** 渲染带可选前后缀的统一输入框。 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ prefix, suffix, className = '', ...props }, ref) => (
  <label className={`flex h-9 items-center gap-2 rounded-sm border border-border-light bg-bg-secondary px-3 text-sm transition focus-within:border-accent ${className}`}>
    {prefix ? <span className="shrink-0 text-text-muted">{prefix}</span> : null}
    <input
      {...props}
      ref={ref}
      className="min-w-0 flex-1 bg-transparent font-ui text-text-primary placeholder:text-text-muted focus:outline-none"
    />
    {suffix ? <span className="shrink-0 text-text-muted">{suffix}</span> : null}
  </label>
));

Input.displayName = 'Input';
