// @author: frontend-ai | phase: 2 | component: Select
import React from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: SelectOption[];
}

/** 渲染统一选择器。 */
export const Select: React.FC<SelectProps> = ({ options, className = '', ...props }) => (
  <select
    {...props}
    className={`h-9 rounded-sm border border-border-light bg-bg-secondary px-3 text-sm text-text-primary transition hover:bg-bg-hover focus:border-accent focus:outline-none ${className}`}
  >
    {options?.length ? options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>) : null}
  </select>
);
