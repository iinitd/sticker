import { NativeModule, requireNativeModule } from "expo";

declare class StickerVisionModule extends NativeModule<{}> {
  makeStickerAsync(uri: string, outputSize: number): Promise<string>;
}

export default requireNativeModule<StickerVisionModule>("StickerVision");
