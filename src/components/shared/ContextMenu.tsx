// @author: frontend-ai | phase: v0.2 | component: ContextMenu
import React, { useEffect, useMemo } from 'react';

import type { ContextMenuProps } from '../../core/types';
import ToolIcon from '../icons/ToolIcon';

/** 渲染全局右键菜单浮层。 */
export const ContextMenu: React.FC<ContextMenuProps> = ({ items, position, onClose }) => {
  const style = useMemo((): React.CSSProperties => {
    const width = 220;
    const itemHeight = 34;
    const height = Math.max(44, items.length * itemHeight);
    const left = Math.min(position.x, window.innerWidth - width - 8);
    const top = Math.min(position.y, window.innerHeight - height - 8);
    return { left: Math.max(8, left), top: Math.max(8, top), minWidth: width };
  }, [items.length, position.x, position.y]);

  useEffect((): (() => void) => {
    const handlePointerDown = (): void => onClose();
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return (): void => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      role="menu"
      className="fixed z-50 max-w-[280px] animate-[contextMenuIn_80ms_ease] rounded-md border border-border bg-bg-secondary p-1 shadow-lg"
      style={style}
      onPointerDown={(event): void => event.stopPropagation()}
    >
      {items.map((item) => item.separator ? (
        <div key={item.id} className="my-1 border-t border-border" />
      ) : (
        <button
          key={item.id}
          type="button"
          disabled={item.disabled}
          onClick={(): void => {
            item.onClick();
            onClose();
          }}
          className={`flex h-8 w-full items-center gap-2 rounded-sm px-3 text-left text-sm transition hover:bg-bg-hover disabled:pointer-events-none disabled:opacity-40 ${item.danger ? 'text-status-error' : 'text-text-primary'}`}
        >
          {item.icon ? <ToolIcon name={item.icon} size={14} /> : <span className="w-3.5" />}
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.shortcut ? <span className="font-mono text-2xs text-text-muted">{item.shortcut}</span> : null}
        </button>
      ))}
    </div>
  );
};
