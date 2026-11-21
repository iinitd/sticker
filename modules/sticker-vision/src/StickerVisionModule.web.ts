import { NativeModule, registerWebModule } from "expo";

class StickerVisionModule extends NativeModule<{}> {
  async makeStickerAsync(_uri: string, _outputSize: number): Promise<string> {
    throw new Error("图片转贴纸目前只支持 iOS 真机。");
  }
}

export default registerWebModule(StickerVisionModule, "StickerVision");
