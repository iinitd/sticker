# lab-sticker-app

本 project 属于 Kel 工作台。**先读工作台总章程 [../../AGENTS.md](../../AGENTS.md)**，再按它路由到 `../../.agents/skills/kel/` 的能力。工作方法、文风、纪律、回流规则都以总章程和 skill 为准，本文件不重复。

本地独有：从零做一个新的 iOS app，bundle id `lol.milio.sticker`；代码仓库是 `lab-sticker-app`，产物和记录都留在这里，代码落在仓库根目录。

## 本地开发

- 栈：Expo SDK 58 + React Native 0.88 + Expo Router + TypeScript strict。路由在 `src/app/`，其他代码放 `src/`。
- 加依赖用 `npx expo install`，不要直接 `npm install`，否则版本可能和 SDK 不匹配。
- 类型检查 `npm run typecheck`；配置诊断 `npx expo-doctor`。
- 写 Expo API 之前先查对应版本文档 <https://docs.expo.dev/versions/v58.0.0/>，不要凭记忆写。
- 本机 Xcode 16.4 编不了 SDK 58，不要跑本地原生构建；真机构建走 GitHub Actions 的 `eas build --local`。
- bundle id、图标、插件改 `app.json`；开发版覆盖在 `app.config.js`；构建 profile 在 `eas.json`。
