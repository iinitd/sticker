# Sticker

新 iOS app 的脚手架（工作名 Sticker，正式名字待定）。Expo SDK 58 + React Native 0.88 + Expo Router，Web 与 Android 保留可用。

- Bundle id：`lol.milio.sticker`；开发版 `lol.milio.sticker.dev`
- 开发者团队：`CH854588A4`
- URL scheme：`sticker`；开发版 `sticker-dev`

## 环境要求

- Node.js 22 或更新的 LTS
- npm 10+
- iOS 真机构建需要 Xcode 26.4+。本机 Xcode 16.4 编不了 SDK 58，构建交给 GitHub Actions 的 `eas build --local`。

## 安装与启动

```bash
npm install
npm start
```

其他命令：

```bash
npm run web         # 浏览器
npm run ios         # iOS 模拟器
npm run android     # Android 模拟器
npm run typecheck   # tsc --noEmit
```

## 目录

```
src/
  app/              Expo Router 路由；每个文件是一个页面
    _layout.tsx     根布局：SafeArea + Gesture Handler + Stack
    index.tsx       首页占位
  theme.ts          颜色、间距、圆角、字体 token
app.json            应用配置（bundle id、图标、插件）
app.config.js       开发版覆盖 bundle id、名称与 scheme
eas.json            EAS 构建 profile
```

业务组件、hooks、工具放在 `src/` 下，不要放进 `src/app/`。

## 配置说明

- **开发版与 TestFlight 版共存**：EAS 的 `development` profile 设置 `APP_VARIANT=dev`，`app.config.js` 据此改用 `lol.milio.sticker.dev` 和 `Sticker Dev`。
- **EAS**：`eas.json` 已复制 Clacko 的 profile 结构（development / preview / production / simulator）。`extra.eas.projectId` 尚未写入，首次执行 `eas init` 时补上。
- **图标与启动图**：目前是 Expo 模板占位图，产品名与视觉定下来后替换 `assets/`。
- **CI**：GitHub Actions 构建与 TestFlight 发布尚未接入，等签名凭据和 EAS project id 就绪。

## 参考

脚手架结构参考 `lab-kel-writer`（Clacko）：同样是 Expo Router + TypeScript strict + `@/*` 路径别名 + 开发版独立 bundle id 的配置方式。
