import { NativeModule, requireNativeModule } from "expo";

import type { StickerRenderOptions } from "@/sticker/options";

declare class StickerVisionModule extends NativeModule<{}> {
  makeStickerAsync(uri: string, options: StickerRenderOptions): Promise<string>;
}

export default requireNativeModule<StickerVisionModule>("StickerVision");
