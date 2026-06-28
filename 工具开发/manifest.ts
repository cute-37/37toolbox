// @author: claude | phase: pixiv-tool | manifest
import type { ToolManifest } from '../src/core/types';

export const manifest: ToolManifest = {
  id: 'pixiv-downloader',
  name: 'Pixiv下载',
  description: 'Pixiv 画师作品下载与同步',
  category: 'download',
  version: '2.0.0',
  icon: 'download',
  tags: ['pixiv', 'download', 'illust', 'ugoira', 'novel', 'sync'],
  hasSettings: true,
  defaultSettings: {
    pythonPath: 'python',
    localSavePath: '',
    storageMode: 'local',
    nasIp: '',
    nasUser: '',
    nasShare: '',
    nasBasePath: 'PIXIV',
    nasRemoteName: '',
    downloadThreads: 4,
    mainAccountSyncThreads: 1,
    backupAccountSyncThreads: 2,
    mainAccountDownloadThreads: 1,
    backupAccountDownloadThreads: 2,
    metadataRefreshLimit: 20,
    ugoiraOutput: 'gif',
    rateLimitEnabled: true,
    autoThrottleEnabled: true,
    failureRateThreshold: 0.5,
  },
};
