// @author: codex | phase: 3 | hook: keyboard-shortcuts
import { useEffect } from 'react';

interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  handler: (event: KeyboardEvent) => void;
}

/** 注册组件级键盘快捷键。 */
export function useKeyboard(shortcuts: KeyboardShortcut[]): void {
  useEffect((): (() => void) => {
    const onKeyDown = (event: KeyboardEvent): void => {
      shortcuts.forEach((shortcut): void => {
        const matched =
          event.key.toLowerCase() === shortcut.key.toLowerCase() &&
          Boolean(shortcut.ctrl) === event.ctrlKey &&
          Boolean(shortcut.shift) === event.shiftKey &&
          Boolean(shortcut.alt) === event.altKey &&
          Boolean(shortcut.meta) === event.metaKey;

        if (matched) {
          shortcut.handler(event);
        }
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return (): void => window.removeEventListener('keydown', onKeyDown);
  }, [shortcuts]);
}
