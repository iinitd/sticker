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

      guard let cutout = try Self.makeCutout(from: source) else {
        throw Exception(name: "NoSubject", description: "没有识别到可以抠出的主体，换一张试试。")
      }

      let border = max(12, min(source.size.width, source.size.height) * 0.018)
      let bordered = Self.addWhiteBorder(to: cutout, width: border)
      let side = CGFloat(max(240, min(outputSize, 2048)))
      let square = Self.fitIntoSquare(bordered, side: side)

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
  private static func makeCutout(from image: UIImage) throws -> UIImage? {
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

    guard let filter = CIFilter(name: "CIBlendWithMask") else {
      throw Exception(name: "FilterUnavailable", description: "系统抠图滤镜不可用。")
    }

    let foreground = CIImage(cgImage: cgImage)
    let mask = CIImage(cvPixelBuffer: maskBuffer)

    filter.setValue(foreground, forKey: kCIInputImageKey)
    filter.setValue(CIImage.empty(), forKey: kCIInputBackgroundImageKey)
    filter.setValue(mask, forKey: kCIInputMaskImageKey)

    guard let output = filter.outputImage else {
      return nil
    }

    let context = CIContext(options: [.useSoftwareRenderer: false])
    guard let cutout = context.createCGImage(output, from: foreground.extent) else {
      return nil
    }

    return UIImage(cgImage: cutout, scale: 1, orientation: .up)
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

  private static func addWhiteBorder(to image: UIImage, width: CGFloat) -> UIImage {
    let canvas = CGSize(
      width: image.size.width + width * 2,
      height: image.size.height + width * 2
    )
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    format.opaque = false

    let white = image.tinted(.white)

    return UIGraphicsImageRenderer(size: canvas, format: format).image { _ in
      let rect = CGRect(
        x: width,
        y: width,
        width: image.size.width,
        height: image.size.height
      )
      let steps = 24

      for index in 0..<steps {
        let angle = CGFloat(index) / CGFloat(steps) * 2 * .pi
        white.draw(in: rect.offsetBy(dx: cos(angle) * width, dy: sin(angle) * width))
      }

      image.draw(in: rect)
    }
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

private extension UIImage {
  func tinted(_ color: UIColor) -> UIImage {
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = scale
    format.opaque = false

    return UIGraphicsImageRenderer(size: size, format: format).image { _ in
      color.setFill()
      UIRectFill(CGRect(origin: .zero, size: size))
      draw(in: CGRect(origin: .zero, size: size), blendMode: .destinationIn, alpha: 1)
    }
  }
}
