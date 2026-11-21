import { NativeModule, requireNativeModule } from "expo";

import type { StickerRenderOptions } from "@/sticker/options";

export type StickerRenderResult = {
  uri: string;
  mode: "person" | "general" | "general-fallback" | "point";
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

  applyPointAsync(
    uri: string,
    x: number,
    y: number,
    options: StickerRenderOptions,
  ): Promise<StickerRenderResult>;
}

export default requireNativeModule<StickerVisionModule>("StickerVision");
