// @author: codex | phase: v0.4 | electron: market-ipc-handlers
import { Buffer } from 'node:buffer';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import AdmZip from 'adm-zip';
import { app, ipcMain } from 'electron';

import { generatePermissionWrapper, validateFileList, validatePacket } from '../../src/core/packetValidator';
import type { InstalledPackage, PacketManifest, RemoteMarketIndex } from '../../src/core/types';
import { MARKET_INDEX_VERSION } from '../../src/core/types';

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

interface MarketFetchIndexPayload {
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
  ipcMain.handle('market:fetchIndex', async (_event, payload: MarketFetchIndexPayload): Promise<{ ok: true; index: RemoteMarketIndex } | { ok: false; error: string }> => {
    try {
      const url = new URL(payload.url);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return { ok: false, error: '只支持 http/https 地址' };
      }

      const response = await fetch(payload.url, {
        headers: { 'Accept': 'application/json', 'Cache-Control': 'max-age=300' },
      });
      if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };

      const raw: unknown = await response.json();
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ok: false, error: 'index.json 不是 JSON 对象' };
      }

      const obj = raw as Record<string, unknown>;
      if (typeof obj.version !== 'number' || obj.version !== MARKET_INDEX_VERSION) {
        return { ok: false, error: `index 版本不兼容 (期望 ${MARKET_INDEX_VERSION}, 实际 ${obj.version})` };
      }
      if (!Array.isArray(obj.tools)) {
        return { ok: false, error: '缺少 tools 数组' };
      }
      if (typeof obj.marketplace_url !== 'string') {
        return { ok: false, error: '缺少 marketplace_url' };
      }

      return { ok: true, index: obj as unknown as RemoteMarketIndex };
    } catch (error) {
      return { ok: false, error: toErrorMessage(error) };
    }
  });

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

      const body = await downloadPackageBody(url);
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
  const allEntries = zip.getEntries();
  console.log('[market] ZIP 文件:', sourcePath, '条目数:', allEntries.length);
  console.log('[market] ZIP 条目:', allEntries.map((e) => `${e.isDirectory ? 'DIR' : 'FILE'} ${e.entryName}`).join(', '));

  const files = allEntries
    .filter((entry) => !entry.isDirectory)
    .map((entry) => ({ path: normalizeZipPath(entry.entryName), size: entry.header.size }));

  console.log('[market] 规范化文件:', files.map((f) => f.path).join(', '));

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
  console.log('[market] 寻找入口文件:', entryPath);
  console.log('[market] 文件列表:', files.map((f) => f.path));

  if (!files.some((file) => file.path === entryPath)) {
    throw new Error(`安装包缺少入口文件: ${packetCheck.data.entry}（包内文件: ${files.map((f) => f.path).join(', ')}）`);
  }

  return { zip, packet: { ...packetCheck.data, entry: entryPath } };
}

async function extractPackage(zip: AdmZip, packet: PacketManifest, targetDir: string): Promise<void> {
  const entryPath = normalizeZipPath(packet.entry);
  const entryExt = entryPath.endsWith('.mjs') ? 'mjs' : 'js';
  const originalEntryPath = entryPath === `index.${entryExt}` ? `__37tool_original.${entryExt}` : entryPath;
  let originalSource = '';

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) {
      continue;
    }
    const relPath = normalizeZipPath(entry.entryName);
    if (relPath === 'manifest.json') {
      continue;
    }
    const writeRelPath = relPath === entryPath ? originalEntryPath : relPath;
    if (relPath === entryPath) {
      originalSource = entry.getData().toString('utf-8');
    }
    const targetPath = resolve(targetDir, writeRelPath);
    ensureInside(targetDir, targetPath);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, entry.getData());
  }

  if (!originalSource) {
    throw new Error(`入口文件为空或无法读取: ${entryPath}`);
  }

  const bootstrapPath = resolve(targetDir, 'index.js');
  ensureInside(targetDir, bootstrapPath);
  await writeFile(bootstrapPath, createBootstrap(packet, originalSource), 'utf-8');
}

function createBootstrap(packet: PacketManifest, source: string): string {
  const wrapper = generatePermissionWrapper(packet.permissions);
  return `${wrapper}

var React = window.__37toolbox_react || window.React;
if (!React) {
  throw new Error('React runtime is not available for external plugin');
}
window.__37toolbox_react = window.__37toolbox_react || React;
window.React = window.React || React;

${source}
`;
}

async function downloadPackageBody(url: URL): Promise<Buffer> {
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/octet-stream, application/zip, */*',
        'User-Agent': '37toolbox-market/1.0',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.warn('[market:downloadPackage] fetch failed, retrying with node http client:', toErrorMessage(error));
    return downloadWithNodeHttp(url);
  }
}

function downloadWithNodeHttp(url: URL, redirectCount = 0): Promise<Buffer> {
  if (redirectCount > 5) {
    return Promise.reject(new Error('下载失败: 重定向次数过多'));
  }

  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolvePromise, reject) => {
    const request = client.get(url, {
      headers: {
        'Accept': 'application/octet-stream, application/zip, */*',
        'User-Agent': '37toolbox-market/1.0',
      },
    }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(status) && location) {
        response.resume();
        resolvePromise(downloadWithNodeHttp(new URL(location, url), redirectCount + 1));
        return;
      }

      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`下载失败: HTTP ${status}`));
        return;
      }

      const chunks: Buffer[] = [];
      let total = 0;
      response.on('data', (chunk: Buffer) => {
        total += chunk.byteLength;
        if (total > 20 * 1024 * 1024) {
          request.destroy(new Error('安装包超过 20MB 限制'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolvePromise(Buffer.concat(chunks)));
    });
    request.setTimeout(30000, () => request.destroy(new Error('下载安装包超时')));
    request.on('error', reject);
  });
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
