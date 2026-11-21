import { NativeModule, registerWebModule } from "expo";

import type { StickerRenderOptions } from "@/sticker/options";

class StickerVisionModule extends NativeModule<{}> {
  async makeStickerAsync(
    _uri: string,
    _options: StickerRenderOptions,
  ): Promise<string> {
    throw new Error("图片转贴纸目前只支持 iOS 真机。");
  }
}

export default registerWebModule(StickerVisionModule, "StickerVision");
