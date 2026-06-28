// @author: codex | phase: 3 | core: builtin-plugin-registry
import type { PluginRegistryEntry } from './types';

import { manifest as animeTrackerManifest } from '../plugins/anime-tracker/manifest';
import { manifest as base64Manifest } from '../plugins/base64/engine';
import { manifest as calculatorManifest } from '../plugins/calculator/engine';
import { manifest as colorPickerManifest } from '../plugins/color-picker/engine';
import { manifest as downloaderManifest } from '../plugins/downloader/engine';
import { manifest as imageCompressManifest } from '../plugins/image-compress/engine';
import { manifest as jsonFormatterManifest } from '../plugins/json-formatter/engine';
import { manifest as markdownPreviewManifest } from '../plugins/markdown-preview/engine';
import { manifest as passwordGenManifest } from '../plugins/password-gen/engine';
import { manifest as pixivDownloaderManifest } from '../plugins/pixiv-downloader/manifest';
import { manifest as qrcodeManifest } from '../plugins/qrcode/engine';
import { manifest as regexTestManifest } from '../plugins/regex-test/engine';
import { manifest as textDiffManifest } from '../plugins/text-diff/engine';
import { manifest as timestampConvertManifest } from '../plugins/timestamp-convert/engine';
import { manifest as unitConvertManifest } from '../plugins/unit-convert/engine';

export const builtinPluginRegistry: PluginRegistryEntry[] = [
  { manifest: timestampConvertManifest, loader: () => import('../plugins/timestamp-convert/Tool'), builtin: true },
  { manifest: passwordGenManifest, loader: () => import('../plugins/password-gen/Tool'), builtin: true },
  { manifest: unitConvertManifest, loader: () => import('../plugins/unit-convert/Tool'), builtin: true },
  { manifest: calculatorManifest, loader: () => import('../plugins/calculator/Tool'), builtin: true },
  { manifest: imageCompressManifest, loader: () => import('../plugins/image-compress/Tool'), builtin: true },
  { manifest: qrcodeManifest, loader: () => import('../plugins/qrcode/Tool'), builtin: true },
  { manifest: colorPickerManifest, loader: () => import('../plugins/color-picker/Tool'), builtin: true },
  { manifest: textDiffManifest, loader: () => import('../plugins/text-diff/Tool'), builtin: true },
  { manifest: markdownPreviewManifest, loader: () => import('../plugins/markdown-preview/Tool'), builtin: true },
  { manifest: jsonFormatterManifest, loader: () => import('../plugins/json-formatter/Tool'), builtin: true },
  { manifest: base64Manifest, loader: () => import('../plugins/base64/Tool'), builtin: true },
  { manifest: regexTestManifest, loader: () => import('../plugins/regex-test/Tool'), builtin: true },
  { manifest: downloaderManifest, loader: () => import('../plugins/downloader/Tool'), builtin: true },
  { manifest: pixivDownloaderManifest, loader: () => import('../plugins/pixiv-downloader/Tool'), builtin: true },
  { manifest: animeTrackerManifest, loader: () => import('../plugins/anime-tracker/Tool'), builtin: true },
];
