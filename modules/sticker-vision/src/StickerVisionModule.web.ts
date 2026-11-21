import { NativeModule, registerWebModule } from "expo";

import type { StickerRenderOptions } from "@/sticker/options";

class StickerVisionModule extends NativeModule<{}> {
  async makeStickerAsync(
    _uri: string,
    _options: StickerRenderOptions,
  ): Promise<{
    uri: string;
    mode: "person" | "general" | "general-fallback" | "point";
  }> {
    throw new Error("图片转贴纸目前只支持 iOS 真机。");
  }

  async segmentAtPointAsync(
    _uri: string,
    _x: number,
    _y: number,
  ): Promise<{ uri: string; width: number; height: number }> {
    throw new Error("点选分割需要 iOS 27 真机。");
  }

  async baseMaskAsync(
    _uri: string,
    _options: StickerRenderOptions,
  ): Promise<{ uri: string; width: number; height: number }> {
    throw new Error("自动蒙版需要 iOS 真机。");
  }

  async applyPointAsync(
    _uri: string,
    _x: number,
    _y: number,
    _options: StickerRenderOptions,
  ): Promise<{
    uri: string;
    mode: "person" | "general" | "general-fallback" | "point";
  }> {
    throw new Error("点选分割需要 iOS 27 真机。");
  }
}

export default registerWebModule(StickerVisionModule, "StickerVision");
