---
slug: lab-sticker-app
status: active
created: 2026-11-17
updated:
  - 2026-11-17
  - 2026-11-21
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
- 仓库是本地 git 仓库，已推送到 `git@github.com:iinitd/sticker.git`（public）；EAS project id 已写入，`lol.milio.sticker.dev` 的签名凭据已配置，dev client 构建已在 Actions 跑通。
- 证书可复用 Clacko 那张（同一开发者团队 `CH854588A4`），但每个 bundle id 需要单独的 provisioning profile。
- 本机 Xcode 16.4 编不了 SDK 58，本地原生构建走不通；构建交给 GitHub Actions 的 `eas build --local`。
- 产品形态（做什么、叫什么）待定。当前名称 `Sticker`、slug `sticker`、scheme `sticker` 都是占位，图标沿用 Expo 模板图；名字定下来后要一起改 `app.json`、`app.config.js` 和商店页文案。
- 已有"图片转贴纸"最小 MVP：相册选图 → Vision 前景蒙版抠主体 → 加白边 → 输出 1024×1024 透明 PNG。抠图在本地 `modules/sticker-vision`（Swift），要求 iOS 17+，Expo Go 跑不了，需要 development build。
- 贴纸渲染参数集中在 `src/sticker/options.ts`，由 JS 传给原生模块；Swift 只负责分割、合成和输出。
- MVP 还没做 240×240 导出、GIF、保存到相册和编辑；这些等看效果后再定。

## 记录

- 2026-11-17 建 project；定下 bundle id `lol.milio.sticker`，其余待填。
- 2026-11-17 参考 `lab-kel-writer` 初始化 Expo 脚手架：SDK 58、expo-router（`src/app/`）、`@/*` 路径别名、开发版独立 bundle id `lol.milio.sticker.dev`、EAS profile、README 与本地开发约定。
- 2026-11-17 记下表情包输出规范：动态 GIF、静态 JPG/PNG/GIF，统一 240×240，超过 500KB 会被平台压缩。
- 2026-11-17 接上 GitHub 远端 `iinitd/sticker`，补 dev client 的 Actions 工作流（`macos-26` + `eas build --local` + gh-pages 安装页）和发布脚本。
- 2026-11-17 dev client 构建跑通（tag `dev-3`，run 43912965623）：IPA 已上传 artifact，安装页已推到 `gh-pages`。仓库 Pages 还没打开，安装页暂时 404。
- 2026-11-21 做"图片转贴纸"最小 MVP：新增本地 Expo 模块 `modules/sticker-vision`，用 `VNGenerateForegroundInstanceMaskRequest` 抠主体，Core Image 合成透明背景，绘制白边后输出 1024 PNG；首页接入 `expo-image-picker` 和结果预览。`tsc` 与 `expo-doctor` 通过，dev-4 构建通过（1.0.0 build 3），待在真机上确认抠图效果。
- 2026-11-21 把贴纸渲染参数收敛到 `src/sticker/options.ts`（outputSize、maxDimension、borderWidthRatio、edgeGrowRatio、closeHoleRatio、insetRatio），Swift 只保留分割、合成和输出内核；以后调白边和边缘只改 JS。dev-6 构建通过（1.0.0 build 5）。
