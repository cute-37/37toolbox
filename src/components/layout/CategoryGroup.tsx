// @author: frontend-ai | phase: v0.2 | component: CategoryGroup
import React, { useState } from 'react';

import type { CategoryDef, ContextMenuItem, PluginRegistryEntry } from '../../core/types';
import { useAppStore } from '../../stores/appStore';
import ToolIcon from '../icons/ToolIcon';
import { ContextMenu } from '../shared';
import { SidebarItem } from './SidebarItem';

export interface CategoryGroupProps {
  category: CategoryDef;
  entries: PluginRegistryEntry[];
}

/** 渲染可折叠的工具分类。 */
export const CategoryGroup: React.FC<CategoryGroupProps> = ({ category, entries }) => {
  const collapsed = useAppStore((state) => state.collapsedCategories.includes(category.id));
  const toggleCategory = useAppStore((state) => state.toggleCategory);
  const updateCategory = useAppStore((state) => state.updateCategory);
  const removeCategory = useAppStore((state) => state.removeCategory);
  const categories = useAppStore((state) => state.categories);
  const reorderCategory = useAppStore((state) => state.reorderCategory);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);

  if (entries.length === 0) {
    return null;
  }

  const getDropPosition = (event: React.DragEvent<HTMLElement>): 'before' | 'after' => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  };

  const openContextMenu = (event: React.MouseEvent): void => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          id: 'rename',
          label: '重命名分类',
          icon: 'settings',
          disabled: category.builtin,
          onClick: (): void => {
            const label = window.prompt('分类名称', category.label);
            if (label) updateCategory(category.id, label);
          },
        },
        {
          id: 'delete',
          label: '删除分类',
          icon: 'trash-2',
          danger: true,
          disabled: category.builtin,
          onClick: (): void => {
            if (window.confirm(`删除「${category.label}」？该分类下工具将移到「我的工具」。`)) removeCategory(category.id);
          },
        },
      ],
    });
  };

  return (
    <section>
      <div className="relative">
        {dropPosition === 'before' ? <div className="pointer-events-none absolute -top-1 left-2 right-2 z-10 h-0.5 rounded-full bg-accent shadow-[0_0_0_2px_rgba(184,140,66,0.18)]" /> : null}
        {dropPosition === 'after' ? <div className="pointer-events-none absolute -bottom-1 left-2 right-2 z-10 h-0.5 rounded-full bg-accent shadow-[0_0_0_2px_rgba(184,140,66,0.18)]" /> : null}
        <button
          type="button"
          draggable
          onDragStart={(event): void => {
            event.dataTransfer.setData('application/x-37-category', category.id);
            event.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={(): void => setDropPosition(null)}
          onDragOver={(event): void => {
            if (event.dataTransfer.types.includes('application/x-37-category')) {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDropPosition(getDropPosition(event));
            }
          }}
          onDragLeave={(): void => setDropPosition(null)}
          onDrop={(event): void => {
            event.preventDefault();
            const draggedId = event.dataTransfer.getData('application/x-37-category');
            const position = getDropPosition(event);
            setDropPosition(null);
            if (!draggedId || draggedId === category.id) return;
            const sorted = [...categories].sort((a, b) => a.order - b.order);
            const targetIndex = sorted.findIndex((item) => item.id === category.id);
            if (targetIndex >= 0) reorderCategory(draggedId, position === 'after' ? targetIndex + 0.5 : targetIndex - 0.5);
          }}
          onClick={(): void => toggleCategory(category.id)}
          onContextMenu={openContextMenu}
          title="展开/折叠分类；按住分类标题可拖动排序"
          className="flex h-8 w-full cursor-grab items-center gap-2 rounded-sm px-2 text-xs font-medium text-text-muted transition hover:bg-bg-hover hover:text-text-secondary active:cursor-grabbing"
        style={{ background: 'rgba(128,128,140,0.08)' }}
        >
          <ToolIcon name="chevron-right" size={14} className={`transition ${collapsed ? '' : 'rotate-90'}`} />
          <span className="flex-1 text-left">{category.label}</span>
          <span className="rounded-sm bg-bg-active px-1.5 py-0.5 font-mono text-2xs">{entries.length}</span>
        </button>
      </div>
      {!collapsed ? (
        <div className="mt-1 space-y-1">
          {entries.map((entry) => <SidebarItem key={entry.manifest.id} entry={entry} />)}
        </div>
      ) : null}
      {contextMenu ? <ContextMenu items={contextMenu.items} position={{ x: contextMenu.x, y: contextMenu.y }} onClose={(): void => setContextMenu(null)} /> : null}
    </section>
  );
};
