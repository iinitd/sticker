import { NativeModule, requireNativeModule } from "expo";

import type { StickerRenderOptions } from "@/sticker/options";

export type StickerRenderResult = {
  uri: string;
  mode: "person" | "general" | "general-fallback";
};

export type PointMaskResult = {
  uri: string;
  width: number;
  height: number;
};

declare class StickerVisionModule extends NativeModule<{}> {
  makeStickerAsync(
    uri: string,
    options: StickerRenderOptions,
  ): Promise<StickerRenderResult | string>;

  segmentAtPointAsync(
    uri: string,
    x: number,
    y: number,
  ): Promise<PointMaskResult>;
}

export default requireNativeModule<StickerVisionModule>("StickerVision");
