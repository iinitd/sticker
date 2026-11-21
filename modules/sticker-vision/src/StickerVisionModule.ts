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

export type StickerVisionEvents = {
  onPointModelDownloadProgress: (event: { progress: number }) => void;
};

declare class StickerVisionModule extends NativeModule<StickerVisionEvents> {
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
