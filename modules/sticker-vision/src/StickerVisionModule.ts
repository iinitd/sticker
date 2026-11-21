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

export type PointInput = {
  x: number;
  y: number;
  include?: boolean;
};

export type FileResult = {
  uri: string;
  bytes: number;
};

export type GifResult = {
  uri: string;
  bytes: number;
  width: number;
  height: number;
  frames: number;
};

export type VideoFramesResult = {
  frames: string[];
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

  applyPointsAsync(
    uri: string,
    points: PointInput[],
    options: StickerRenderOptions,
  ): Promise<StickerRenderResult>;

  exportStickerAsync(
    uri: string,
    size: number,
    format: "png" | "jpg" | "jpeg",
  ): Promise<FileResult>;

  videoFramesAsync(
    uri: string,
    fps: number,
    maxFrames: number,
  ): Promise<VideoFramesResult>;

  encodeGifAsync(
    frameUris: string[],
    fps: number,
    size: number,
  ): Promise<GifResult>;
}

export default requireNativeModule<StickerVisionModule>("StickerVision");
