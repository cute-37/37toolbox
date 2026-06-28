// @author: frontend-ai | phase: 2 | component: Button
import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
}

const variantClass: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'border-accent bg-accent text-white hover:bg-accent-hover hover:border-accent-hover',
  secondary: 'border-border bg-bg-secondary text-text-primary hover:bg-bg-hover',
  ghost: 'border-transparent bg-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary',
};

const sizeClass: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-7 px-2 text-xs',
  md: 'h-9 px-3 text-sm',
};

/** 渲染项目统一按钮。 */
export const Button: React.FC<ButtonProps> = ({ variant = 'secondary', size = 'md', className = '', type = 'button', ...props }) => (
  <button
    {...props}
    type={type}
    className={`inline-flex items-center justify-center gap-2 rounded-sm border font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${variantClass[variant]} ${sizeClass[size]} ${className}`}
  />
);
