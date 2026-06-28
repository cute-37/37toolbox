// @author: codex | phase: v0.4 | electron: market-ipc-handlers
import { Buffer } from 'node:buffer';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import AdmZip from 'adm-zip';
import { app, ipcMain } from 'electron';

import { generatePermissionWrapper, validateFileList, validatePacket } from '../../src/core/packetValidator';
import type { InstalledPackage, PacketManifest } from '../../src/core/types';

interface MarketInspectPayload {
  path: string;
}

interface MarketInstallPayload {
  sourcePath: string;
  expectedId: string;
}

interface MarketDownloadPayload {
  url: string;
}

interface MarketUninstallPayload {
  id: string;
}

type MarketInspectResult =
  | { ok: true; packet: PacketManifest }
  | { ok: false; error: string };

type MarketInstallResult =
  | { ok: true; installed: InstalledPackage; packet: PacketManifest }
  | { ok: false; error: string };

type MarketDownloadResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

/** 注册工具市场安装、下载与卸载 IPC。 */
export function registerMarketHandlers(): void {
  ipcMain.handle('market:inspectPackage', async (_event, payload: MarketInspectPayload): Promise<MarketInspectResult> => {
    try {
      const { packet } = readAndValidatePacket(payload.path);
      return { ok: true, packet };
    } catch (error) {
      return { ok: false, error: toErrorMessage(error) };
    }
  });

  ipcMain.handle('market:installPackage', async (_event, payload: MarketInstallPayload): Promise<MarketInstallResult> => {
    try {
      const parsed = readAndValidatePacket(payload.sourcePath);
      const toolId = parsed.packet.tool.id;
      if (toolId !== payload.expectedId) {
        return { ok: false, error: '安装包 ID 在安装前后不一致，已取消安装' };
      }

      const pluginsRoot = await getUserPluginsRoot();
      const targetDir = resolve(pluginsRoot, toolId);
      ensureInside(pluginsRoot, targetDir);
      if (existsSync(targetDir)) {
        return { ok: false, error: `插件目录已存在: ${toolId}` };
      }

      await mkdir(targetDir, { recursive: true });
      try {
        await extractPackage(parsed.zip, parsed.packet, targetDir);
      } catch (error) {
        await rm(targetDir, { recursive: true, force: true });
        throw error;
      }

      const installed: InstalledPackage = {
        id: toolId,
        installPath: targetDir,
        installDate: new Date().toISOString(),
        version: parsed.packet.tool.version,
        source: payload.sourcePath,
      };
      return { ok: true, installed, packet: parsed.packet };
    } catch (error) {
      return { ok: false, error: toErrorMessage(error) };
    }
  });

  ipcMain.handle('market:downloadPackage', async (_event, payload: MarketDownloadPayload): Promise<MarketDownloadResult> => {
    try {
      const url = new URL(payload.url);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return { ok: false, error: '只支持 http/https 地址' };
      }

      const response = await fetch(url);
      if (!response.ok) {
        return { ok: false, error: `下载失败: HTTP ${response.status}` };
      }
      const body = Buffer.from(await response.arrayBuffer());
      if (body.byteLength > 20 * 1024 * 1024) {
        return { ok: false, error: '安装包超过 20MB 限制' };
      }

      const tempDir = join(app.getPath('temp'), '37toolbox-market');
      await mkdir(tempDir, { recursive: true });
      const filePath = join(tempDir, `${Date.now()}-${Math.random().toString(16).slice(2)}.37tool`);
      await writeFile(filePath, body);
      return { ok: true, path: filePath };
    } catch (error) {
      return { ok: false, error: toErrorMessage(error) };
    }
  });

  ipcMain.handle('market:uninstallPackage', async (_event, payload: MarketUninstallPayload): Promise<boolean> => {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(payload.id)) {
      return false;
    }
    try {
      const pluginsRoot = await getUserPluginsRoot();
      const targetDir = resolve(pluginsRoot, payload.id);
      ensureInside(pluginsRoot, targetDir);
      await rm(targetDir, { recursive: true, force: true });
      return true;
    } catch (error) {
      console.error('[market:uninstallPackage]', payload.id, error);
      return false;
    }
  });
}

function readAndValidatePacket(sourcePath: string): { zip: AdmZip; packet: PacketManifest } {
  const zip = new AdmZip(sourcePath);
  const files = zip.getEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => ({ path: normalizeZipPath(entry.entryName), size: entry.header.size }));

  const fileCheck = validateFileList(files);
  if (!fileCheck.ok) {
    throw new Error(fileCheck.errors.map((error) => error.message).join('; '));
  }

  const manifestEntry = zip.getEntries().find((entry) => normalizeZipPath(entry.entryName) === 'manifest.json');
  if (!manifestEntry) {
    throw new Error('安装包缺少 manifest.json');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(manifestEntry.getData().toString('utf-8'));
  } catch {
    throw new Error('manifest.json 不是合法 JSON');
  }

  const packetCheck = validatePacket(raw);
  if (!packetCheck.ok) {
    throw new Error(packetCheck.errors.map((error) => `${error.field}: ${error.message}`).join('; '));
  }

  const entryPath = normalizeZipPath(packetCheck.data.entry);
  if (!files.some((file) => file.path === entryPath)) {
    throw new Error(`安装包缺少入口文件: ${packetCheck.data.entry}`);
  }

  return { zip, packet: { ...packetCheck.data, entry: entryPath } };
}

async function extractPackage(zip: AdmZip, packet: PacketManifest, targetDir: string): Promise<void> {
  const entryPath = normalizeZipPath(packet.entry);
  const entryExt = entryPath.endsWith('.mjs') ? 'mjs' : 'js';
  const originalEntryPath = entryPath === `index.${entryExt}` ? `__37tool_original.${entryExt}` : entryPath;

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) {
      continue;
    }
    const relPath = normalizeZipPath(entry.entryName);
    if (relPath === 'manifest.json') {
      continue;
    }
    const writeRelPath = relPath === entryPath ? originalEntryPath : relPath;
    const targetPath = resolve(targetDir, writeRelPath);
    ensureInside(targetDir, targetPath);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, entry.getData());
  }

  const bootstrapPath = resolve(targetDir, 'index.js');
  ensureInside(targetDir, bootstrapPath);
  await writeFile(bootstrapPath, createBootstrap(packet, originalEntryPath), 'utf-8');
}

function createBootstrap(packet: PacketManifest, entryPath: string): string {
  const wrapper = generatePermissionWrapper(packet.permissions);
  const manifest = {
    ...packet.tool,
    external: packet.tool.external ?? false,
  };
  return `${wrapper}

export const manifest = ${JSON.stringify(manifest, null, 2)};
const module = await import(${JSON.stringify(`./${entryPath}`)});
const component = module.default ?? (() => null);
export default component;
`;
}

async function getUserPluginsRoot(): Promise<string> {
  const dirPath = join(app.getPath('home'), '37工具箱', 'plugins');
  await mkdir(dirPath, { recursive: true });
  return resolve(dirPath);
}

function normalizeZipPath(input: string): string {
  return input.replace(/\\/g, '/').replace(/^\/+/, '');
}

function ensureInside(root: string, target: string): void {
  const rel = relative(resolve(root), resolve(target));
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('安装包包含越界路径，已拒绝');
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
