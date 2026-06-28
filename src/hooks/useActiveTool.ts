// @author: codex | phase: 3 | hook: active-tool
import { useAppStore } from '../stores/appStore';

import type { PluginRegistryEntry } from '../core/types';

/** 获取当前激活工具注册项。 */
export function useActiveTool(): PluginRegistryEntry | null {
  return useAppStore((state) => state.getActivePlugin());
}
