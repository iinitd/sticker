import ExpoModulesCore
import UIKit
import Vision
import CoreImage
import ImageIO

public class StickerVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("StickerVision")

    AsyncFunction("makeStickerAsync") { (uri: String, outputSize: Int) throws -> String in
      guard let url = URL(string: uri), url.isFileURL else {
        throw Exception(name: "InvalidImageURI", description: "图片地址无效。")
      }

      let data: Data
      do {
        data = try Data(contentsOf: url)
      } catch {
        throw Exception(name: "ImageReadFailed", description: "读取图片失败。")
      }

      guard #available(iOS 17.0, *) else {
        throw Exception(name: "UnsupportedOS", description: "主体抠图需要 iOS 17 或更新版本。")
      }

      guard let source = Self.downsample(data: data, maxDimension: 1600) else {
        throw Exception(name: "InvalidImage", description: "无法解析这张图片。")
      }

      guard let cutout = try Self.makeSticker(from: source) else {
        throw Exception(name: "NoSubject", description: "没有识别到可以抠出的主体，换一张试试。")
      }

      let side = CGFloat(max(240, min(outputSize, 2048)))
      let square = Self.fitIntoSquare(cutout, side: side)

      guard let png = square.pngData() else {
        throw Exception(name: "EncodingFailed", description: "生成 PNG 失败。")
      }

      let outputURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("sticker-\(UUID().uuidString).png")

      do {
        try png.write(to: outputURL)
      } catch {
        throw Exception(name: "WriteFailed", description: "保存结果失败。")
      }

      return outputURL.absoluteString
    }
  }

  @available(iOS 17.0, *)
  private static func makeSticker(from image: UIImage) throws -> UIImage? {
    guard let cgImage = image.cgImage else {
      throw Exception(name: "InvalidImage", description: "无法读取图片像素。")
    }

    let request = VNGenerateForegroundInstanceMaskRequest()
    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
    try handler.perform([request])

    guard let result = request.results?.first else {
      return nil
    }

    let maskBuffer = try result.generateScaledMaskForImage(
      forInstances: result.allInstances,
      from: handler
    )

    let extent = CGRect(x: 0, y: 0, width: cgImage.width, height: cgImage.height)
    let foreground = CIImage(cgImage: cgImage)
    let rawMask = CIImage(cvPixelBuffer: maskBuffer)

    let minSide = min(extent.width, extent.height)
    let closeRadius = max(2, minSide * 0.0025)
    let erodeRadius = max(1, minSide * 0.0007)
    let borderRadius = max(12, minSide * 0.018)

    // Close small holes left by the segmentation model, then pull the edge in
    // slightly so background-coloured fringe pixels fall outside the subject.
    let cleanedMask = rawMask
      .clampedToExtent()
      .applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: closeRadius])
      .applyingFilter("CIMorphologyMinimum", parameters: [kCIInputRadiusKey: closeRadius])
      .applyingFilter("CIMorphologyMinimum", parameters: [kCIInputRadiusKey: erodeRadius])
      .cropped(to: extent)

    let dilatedMask = cleanedMask
      .clampedToExtent()
      .applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: borderRadius])
      .cropped(to: extent)

    guard let cutout = Self.blend(foreground, mask: cleanedMask) else {
      throw Exception(name: "MaskFailed", description: "生成透明背景失败。")
    }

    let white = CIImage(color: CIColor.white).cropped(to: extent)
    guard let border = Self.blend(white, mask: dilatedMask) else {
      throw Exception(name: "BorderFailed", description: "生成白边失败。")
    }

    let output = cutout.composited(over: border)
    let context = CIContext(options: [.useSoftwareRenderer: false])

    guard let resultImage = context.createCGImage(output, from: extent) else {
      return nil
    }

    return UIImage(cgImage: resultImage, scale: 1, orientation: .up)
  }

  private static func blend(_ image: CIImage, mask: CIImage) -> CIImage? {
    guard let filter = CIFilter(name: "CIBlendWithMask") else {
      return nil
    }

    filter.setValue(image, forKey: kCIInputImageKey)
    filter.setValue(CIImage.empty(), forKey: kCIInputBackgroundImageKey)
    filter.setValue(mask, forKey: kCIInputMaskImageKey)
    return filter.outputImage
  }

  private static func downsample(data: Data, maxDimension: CGFloat) -> UIImage? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil) else {
      return nil
    }

    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: maxDimension
    ]

    guard let cgImage = CGImageSourceCreateThumbnailAtIndex(
      source,
      0,
      options as CFDictionary
    ) else {
      return nil
    }

    return UIImage(cgImage: cgImage, scale: 1, orientation: .up)
  }

  private static func fitIntoSquare(_ image: UIImage, side: CGFloat) -> UIImage {
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    format.opaque = false

    return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { _ in
      let inset = side * 0.03
      let available = side - inset * 2
      let ratio = min(available / image.size.width, available / image.size.height)
      let size = CGSize(width: image.size.width * ratio, height: image.size.height * ratio)
      let origin = CGPoint(
        x: (side - size.width) / 2,
        y: (side - size.height) / 2
      )
      image.draw(in: CGRect(origin: origin, size: size))
    }
  }
}
