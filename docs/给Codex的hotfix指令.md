# Codex 紧急修复：.37tool 外部插件安装流程

> Claude 无法跑终端测试，以下问题需要你实战修复。**每修一个就 `npm run dev` 确认一次。**

---

## 背景

追番日程表（anime-tracker）和 Pixiv 下载器要改成独立 .37tool 外置插件而不是内置工具。anime-tracker.37tool 已成功打包上传到 GitHub Releases，内含 `manifest.json` + `index.js` 两个文件，SHA256 已验证。

但安装时始终报错："工具安装后无法注册，已回滚"。

## 你拿到手的文件

| 文件 | 状态 |
|------|------|
| `packages/anime-tracker/manifest.json` | ✅ 正确 |
| `packages/anime-tracker/index.js` | ✅ 纯 JS（React.createElement 模式，无 JSX） |
| `electron/ipc/marketHandlers.ts` | Claude 已加日志 + React 注入 |
| `electron/ipc/pythonHandlers.ts` | Claude 已改 bridge 路径为多候选 |
| `src/core/PluginManager.ts` | 已有 installFromPath/installFromUrl/uninstall |
| `src/core/pluginRegistry.ts` | 只含 13 个内置，Pixiv/anime 已剔除 |
| `scripts/release.py` | 打包+上传脚本，已验证 ZIP 包含正确文件 |

## 第一步：本地测试安装流程（最重要）

```bash
npm run dev
```

打开工具箱 → 设置 → 工具市场。**点击"继续安装"（或"手动安装"，选 `packages/anime-tracker` 目录）。** 观察：

1. 控制台输出 `[market]` 开头的日志
2. 安装成功 → 侧边栏出现"追番日程表"
3. 点击能正常打开

如果报错，看控制台完整错误信息，那是修复的关键线索。

## 第二步：根据报错修复

### 如果报 "React is not defined"
`createBootstrap` 已添加 `import React from 'react'`，但可能 import 路径不对。external 插件放在 `~/37工具箱/plugins/{id}/`，React 的路径需要指向 Electron 的 node_modules。确认 `createBootstrap` 函数中的 import 路径正确。

### 如果报 "无法注册"
说明 `marketHandlers.installPackage` 返回成功但 `PluginManager.registerExternalPlugin` 失败。检查：
- `registerExternalPlugin` 中的 `import(moduleUrl)` 路径是否正确
- `file://` URL 是否被 Electron 的 CSP 阻止
- 插件目录 `~/37工具箱/plugins/anime-tracker/` 是否真的创建了

### 如果报 "缺少入口文件"
说明 ZIP 内路径不匹配。`readAndValidatePacket` 已打印每个文件，检查日志输出。

### 如果报 fetch/net 错误
`PluginManager.installFromUrl` 调用了 `marketApi.downloadPackage(url)` 下载。检查：
- URL 是否可达（curl https://github.com/cute-37/37toolbox/releases/download/v0.5.0/anime-tracker.37tool）
- `downloadPackage` 里的 `fetch` 在主进程是否可以访问 GitHub（可能需要代理或无 Referer）

### 如果根本看不到"远程市场"
检查 `market-index.json` 是否已推送到 main 分支：
```
curl https://raw.githubusercontent.com/cute-37/37toolbox/main/docs/market-index.json
```

## 第三步：查看诊断日志

工具箱设置 → 诊断 → 点"刷新"。查看日志文件 `%APPDATA%/37工具箱/error-logs/` 中今天的日志。

## 第四步：确认并提交

每修好一个问题就 `npm run build` 和 `npm run dev` 验证。全部通过后：

```bash
git add .
git commit -m "fix: .37tool external plugin install pipeline"
git push origin main
```

然后把做了什么写到 `docs/待办-v0.4.md` 末尾。

---

> Claude 备注：我在沙箱里跑不了 npm/终端，看到的都是静态代码。上述所有修改都是基于静态分析做的，需要你实际跑起来验证口径对得上。尤其 bootstrap 里 React 的 import 路径在 file:/// 下是否生效，这是最大的未知数。
