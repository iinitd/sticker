# Sticker

新 iOS app（工作名 Sticker，正式名字待定）。Expo SDK 58 + React Native 0.88 + Expo Router，Web 与 Android 保留可用。

当前 MVP：从相册选一张照片，用 iOS Vision 在设备上抠出主体，加一圈白边，生成 1024×1024 透明 PNG。图片不上传。

- Bundle id：`lol.milio.sticker`；开发版 `lol.milio.sticker.dev`
- 开发者团队：`CH854588A4`
- URL scheme：`sticker`；开发版 `sticker-dev`
- 主体抠图要求 iOS 17+。

## 环境要求

- Node.js 22 或更新的 LTS
- npm 10+
- iOS 真机构建需要 Xcode 26.4+。本机 Xcode 16.4 编不了 SDK 58，构建交给 GitHub Actions 的 `eas build --local`。

## 安装与启动

```bash
npm install
npm start
```

`npm start` 启动 dev server。相册和抠图依赖原生模块，Expo Go 跑不了，要先装 development build。

其他命令：

```bash
npm run web         # 浏览器（原生抠图不可用）
npm run ios         # iOS 模拟器
npm run android     # Android 模拟器
npm run typecheck   # tsc --noEmit
```

## 目录

```
src/
  app/                  Expo Router 路由；每个文件是一个页面
    _layout.tsx         根布局：SafeArea + Gesture Handler + Stack
    index.tsx           图片转贴纸 MVP
  sticker/
    options.ts          贴纸渲染参数（白边、边缘收放、尺寸）
  theme.ts              颜色、间距、圆角、字体 token
modules/
  sticker-vision/       本地 Expo 模块
    ios/                Vision 前景蒙版 + 合成 + PNG 输出
app.json                应用配置（bundle id、图标、插件）
app.config.js           开发版覆盖 bundle id、名称与 scheme
eas.json                EAS 构建 profile
```

业务组件、hooks、工具放在 `src/` 下，不要放进 `src/app/`。本地原生模块改完要重新构建，Fast Refresh 不会加载新的 Swift 代码。

## 贴纸渲染参数

可调参数都在 `src/sticker/options.ts`，由 JS 传给原生模块。Swift 只负责分割、合成和输出，不再保存白边或边缘的产品参数。

| 参数 | 作用 | 当前值 |
|------|------|--------|
| `outputSize` | 输出正方形边长（px） | 1024 |
| `maxDimension` | 送入 Vision 的最长边 | 1600 |
| `borderWidthRatio` | 白边粗细，相对短边 | 0.018 |
| `edgeGrowRatio` | 主体边缘扩张/收缩，负值向内收 | -0.0007 |
| `closeHoleRatio` | 闭运算半径，补小洞 | 0.0025 |
| `insetRatio` | 正方形内留白比例 | 0.03 |
| `usePersonMatte` | 改用人物蒙版，优先保留完整人体 | false |

改这些值只需要 JS 热更新，不用重新打包；只有改 Swift 方法签名或处理流程才需要重新构建。

首页的「微调」面板直接改 `edgeGrowRatio`、`borderWidthRatio`、`closeHoleRatio` 三项，松手后重新调用原生模块。

「抠图」在通用和人物之间切换：人物模式走 `VNGeneratePersonSegmentationRequest`，优先保留完整人体和手，适合人像；手里拿的东西可能被排除。

「点选」走 iOS 27 的 `GenerateIterativeSegmentationRequest`：在照片上点一下目标，系统按对象边缘返回蒙版。第一次使用需要联网下载系统分割模型，之后离线。构建需要 Xcode 27。

原生批次还预置了这些能力，交互后续再定：多点/加减点合并（`applyPointsAsync`）、240 导出（`exportStickerAsync`）、视频取帧（`videoFramesAsync`）、GIF 编码（`encodeGifAsync`）。相机、保存到相册、分享分别用 `expo-camera`、`expo-media-library`、`expo-sharing`，图片处理全在本地。

## 配置说明

- **开发版与 TestFlight 版共存**：EAS 的 `development` profile 设置 `APP_VARIANT=dev`，`app.config.js` 据此改用 `lol.milio.sticker.dev` 和 `Sticker Dev`。
- **EAS**：`eas.json` 已复制 Clacko 的 profile 结构（development / preview / production / simulator）。EAS project id 已写入 `app.json`；签名凭据按需在 `eas credentials` 里配置。
- **图标与启动图**：目前是 Expo 模板占位图，产品名与视觉定下来后替换 `assets/`。
- **CI**：`.github/workflows/ios-dev-client.yml` 在 `macos-26` 上跑 `eas build --local`，产物传到 Actions artifact，同时发布到 gh-pages 的 `dev/` 安装页。推 `dev-*` tag 或在 Actions 页面手动运行即可。需要仓库 secret `EXPO_TOKEN`；Pages 的 Source 要设为 `gh-pages` 分支根目录，安装页才能访问。
- **TestFlight**：发布流程尚未接入，等 App Store Connect 记录和提交凭据就绪。

## 参考

脚手架结构参考 `lab-kel-writer`（Clacko）：同样是 Expo Router + TypeScript strict + `@/*` 路径别名 + 开发版独立 bundle id 的配置方式。
