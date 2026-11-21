import { NativeModule, requireNativeModule } from "expo";

import type { StickerRenderOptions } from "@/sticker/options";

export type StickerRenderResult = {
  uri: string;
  mode: "person" | "general" | "general-fallback";
};

declare class StickerVisionModule extends NativeModule<{}> {
  makeStickerAsync(
    uri: string,
    options: StickerRenderOptions,
  ): Promise<StickerRenderResult | string>;
}

export default requireNativeModule<StickerVisionModule>("StickerVision");
