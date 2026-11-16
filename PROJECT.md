---
slug: lab-sticker-app
status: active
created: 2026-11-17
updated:
  - 2026-11-17
archived:
---

# 从零做一个新的 iOS app（bundle id `lol.milio.sticker`）

## 目标

把一个还没定型的 new app 推到"能装、能上架"：项目脚手架、签名凭据、CI 构建、TestFlight 交付四条链路跑通。

## 对象与范围

- 涉及：本目录的 `PROJECT.md` 与产物；仓库 `lab-sticker-app` 的 `app.json`、`eas.json`、`.github/workflows/`、图标与商店页材料。
- 已定：bundle id `lol.milio.sticker`；dev 变体用 `lol.milio.sticker.dev`。
- 不涉及：`lab-kel-writer`（Clacko）的任何代码与配置。
- 不做：未经确认不跑 Actions 构建、不提交审核。

## 表情包输出规范

导出表情时按平台要求生成：

| 类型 | 格式 | 尺寸 | 体积 |
|------|------|------|------|
| 动态表情 | GIF | 240×240 | 超过 500KB 会被压缩 |
| 静态表情 | JPG、PNG 或 GIF | 240×240 | 超过 500KB 会被压缩 |

- 动态表情只能输出 GIF。
- 静态表情三种格式都可，导出时按内容选择。
- 尺寸统一 240×240，不输出其他尺寸。

## 现状

- 脚手架已落在仓库根目录：Expo SDK 58 + RN 0.88 + Expo Router + TypeScript strict，依赖已装，`tsc --noEmit` 与 `expo-doctor` 通过。
- 仓库是本地 git 仓库，还没有远端；EAS project id、签名凭据、GitHub Actions 未接。
- 证书可复用 Clacko 那张（同一开发者团队 `CH854588A4`），但每个 bundle id 需要单独的 provisioning profile。
- 本机 Xcode 16.4 编不了 SDK 58，本地原生构建走不通；构建交给 GitHub Actions 的 `eas build --local`。
- 产品形态（做什么、叫什么）待定。当前名称 `Sticker`、slug `sticker`、scheme `sticker` 都是占位，图标沿用 Expo 模板图；名字定下来后要一起改 `app.json`、`app.config.js` 和商店页文案。

## 记录

- 2026-11-17 建 project；定下 bundle id `lol.milio.sticker`，其余待填。
- 2026-11-17 参考 `lab-kel-writer` 初始化 Expo 脚手架：SDK 58、expo-router（`src/app/`）、`@/*` 路径别名、开发版独立 bundle id `lol.milio.sticker.dev`、EAS profile、README 与本地开发约定。
- 2026-11-17 记下表情包输出规范：动态 GIF、静态 JPG/PNG/GIF，统一 240×240，超过 500KB 会被平台压缩。
