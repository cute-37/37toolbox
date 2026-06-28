// @author: frontend-ai | phase: 2 | component: SearchBox
import React, { useEffect, useRef } from 'react';

import { useAppStore } from '../../stores/appStore';
import ToolIcon from '../icons/ToolIcon';
import { Input } from '../shared';

export interface SearchBoxProps {
  compact?: boolean;
  className?: string;
}

/** 渲染全局工具搜索框，并支持 Ctrl+P 聚焦。 */
export const SearchBox: React.FC<SearchBoxProps> = ({ compact = false, className = '' }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const query = useAppStore((state) => state.searchQuery);
  const setSearchQuery = useAppStore((state) => state.setSearchQuery);

  useEffect((): (() => void) => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return (): void => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Input
      ref={inputRef}
      aria-label="搜索工具"
      value={query}
      onChange={(event): void => setSearchQuery(event.target.value)}
      placeholder="搜索工具..."
      prefix={<ToolIcon name="search" size={15} />}
      className={`${compact ? 'h-8' : 'w-80'} ${className}`}
    />
  );
};
