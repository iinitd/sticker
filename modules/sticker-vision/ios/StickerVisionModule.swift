import ExpoModulesCore
import UIKit
import Vision
import CoreImage
import ImageIO

struct StickerResult: Record {
  @Field var uri: String = ""
  @Field var mode: String = "general"
}

struct PointMaskResult: Record {
  @Field var uri: String = ""
  @Field var width: Double = 0
  @Field var height: Double = 0
}

struct StickerOptions: Record {
  @Field var outputSize: Int = 1024
  @Field var maxDimension: Int = 1600
  @Field var borderWidthRatio: Double = 0
  @Field var edgeGrowRatio: Double = 0
  @Field var closeHoleRatio: Double = 0
  @Field var insetRatio: Double = 0
  @Field var usePersonMatte: Bool = false
}

public class StickerVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("StickerVision")

    AsyncFunction("makeStickerAsync") { (uri: String, options: StickerOptions) throws -> StickerResult in
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

      let maxDimension = CGFloat(max(512, min(options.maxDimension, 4096)))
      guard let source = Self.downsample(data: data, maxDimension: maxDimension) else {
        throw Exception(name: "InvalidImage", description: "无法解析这张图片。")
      }

      guard let rendered = try Self.makeSticker(from: source, options: options) else {
        throw Exception(name: "NoSubject", description: "没有识别到可以抠出的主体，换一张试试。")
      }

      let side = CGFloat(max(240, min(options.outputSize, 2048)))
      let square = Self.fitIntoSquare(rendered.image, side: side, insetRatio: options.insetRatio)

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

      let mode = rendered.usedPerson
        ? "person"
        : (options.usePersonMatte ? "general-fallback" : "general")

      return StickerResult(uri: outputURL.absoluteString, mode: mode)
    }

    AsyncFunction("segmentAtPointAsync") { (uri: String, x: Double, y: Double, promise: Promise) in
      Task {
        do {
          guard #available(iOS 27.0, *) else {
            throw Exception(name: "UnsupportedOS", description: "点选分割需要 iOS 27。")
          }

          let result = try await Self.segmentAtPoint(uri: uri, x: x, y: y)
          promise.resolve(result)
        } catch {
          promise.reject("POINT_SEGMENT_FAILED", error.localizedDescription)
        }
      }
    }
  }

  @available(iOS 17.0, *)
  private static func makeSticker(
    from image: UIImage,
    options: StickerOptions
  ) throws -> (image: UIImage, usedPerson: Bool)? {
    guard let cgImage = image.cgImage else {
      throw Exception(name: "InvalidImage", description: "无法读取图片像素。")
    }

    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
    let extent = CGRect(x: 0, y: 0, width: cgImage.width, height: cgImage.height)
    let foreground = CIImage(cgImage: cgImage)
    let baseMask: CIImage
    var usedPerson = false

    if options.usePersonMatte, let personMask = Self.mainPersonMask(handler: handler, extent: extent) {
      baseMask = personMask
      usedPerson = true
    } else {
      let request = VNGenerateForegroundInstanceMaskRequest()
      try handler.perform([request])

      guard let result = request.results?.first else {
        return nil
      }

      let maskBuffer = try result.generateScaledMaskForImage(
        forInstances: result.allInstances,
        from: handler
      )
      baseMask = CIImage(cvPixelBuffer: maskBuffer)
    }

    let minSide = min(extent.width, extent.height)
    let closeRadius = max(0, minSide * options.closeHoleRatio)
    let edgeGrow = minSide * options.edgeGrowRatio
    let borderWidth = max(0, minSide * options.borderWidthRatio)

    var mask = baseMask

    // Fill small holes left by the segmentation model.
    if closeRadius > 0.01 {
      mask = mask
        .clampedToExtent()
        .applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: closeRadius])
        .applyingFilter("CIMorphologyMinimum", parameters: [kCIInputRadiusKey: closeRadius])
    }

    // Grow or shrink the subject edge. A negative value removes the fringe of
    // background-coloured pixels that the soft mask leaves behind.
    if abs(edgeGrow) > 0.01 {
      let filter = edgeGrow > 0 ? "CIMorphologyMaximum" : "CIMorphologyMinimum"
      mask = mask
        .clampedToExtent()
        .applyingFilter(filter, parameters: [kCIInputRadiusKey: abs(edgeGrow)])
    }

    let cleanedMask = mask.cropped(to: extent)

    guard let cutout = Self.blend(foreground, mask: cleanedMask) else {
      throw Exception(name: "MaskFailed", description: "生成透明背景失败。")
    }

    let context = CIContext(options: [.useSoftwareRenderer: false])
    let output: CIImage

    if borderWidth > 0.01 {
      let dilatedMask = cleanedMask
        .clampedToExtent()
        .applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: borderWidth])
        .cropped(to: extent)

      let white = CIImage(color: CIColor.white).cropped(to: extent)
      guard let border = Self.blend(white, mask: dilatedMask) else {
        throw Exception(name: "BorderFailed", description: "生成白边失败。")
      }
      output = cutout.composited(over: border)
    } else {
      output = cutout
    }

    guard let resultImage = context.createCGImage(output, from: extent) else {
      return nil
    }

    return (UIImage(cgImage: resultImage, scale: 1, orientation: .up), usedPerson)
  }

  @available(iOS 27.0, *)
  private static func segmentAtPoint(uri: String, x: Double, y: Double) async throws -> PointMaskResult {
    guard let url = URL(string: uri), url.isFileURL else {
      throw Exception(name: "InvalidImageURI", description: "图片地址无效。")
    }

    let data: Data
    do {
      data = try Data(contentsOf: url)
    } catch {
      throw Exception(name: "ImageReadFailed", description: "读取图片失败。")
    }

    guard let source = Self.downsample(data: data, maxDimension: 1600),
          let cgImage = source.cgImage else {
      throw Exception(name: "InvalidImage", description: "无法解析这张图片。")
    }

    let handler = ImageRequestHandler(cgImage, orientation: .up)
    let point = NormalizedPoint(
      x: CGFloat(min(max(x, 0), 1)),
      y: CGFloat(1 - min(max(y, 0), 1))
    )
    let request = GenerateIterativeSegmentationRequest(seedPoint: point)

    switch await request.assetStatus {
    case .ready:
      break
    case .notReady:
      try await request.downloadAssets()
    case .downloading, .error:
      throw Exception(name: "ModelNotReady", description: "分割模型还没准备好，稍后再试。")
    @unknown default:
      throw Exception(name: "ModelNotReady", description: "分割模型状态未知。")
    }

    guard let observation = try await handler.perform(request) else {
      throw Exception(name: "NoMask", description: "这个位置没有分割出区域，换一个点试试。")
    }

    let extent = CGRect(x: 0, y: 0, width: cgImage.width, height: cgImage.height)
    let rawMask = CIImage(cgImage: observation.cgImage)
    let scaledMask = rawMask.transformed(
      by: CGAffineTransform(
        scaleX: extent.width / rawMask.extent.width,
        y: extent.height / rawMask.extent.height
      )
    )
    let white = CIImage(color: CIColor.white).cropped(to: extent)

    guard let filter = CIFilter(name: "CIBlendWithMask") else {
      throw Exception(name: "FilterUnavailable", description: "系统抠图滤镜不可用。")
    }

    filter.setValue(white, forKey: kCIInputImageKey)
    filter.setValue(CIImage.empty(), forKey: kCIInputBackgroundImageKey)
    filter.setValue(scaledMask, forKey: kCIInputMaskImageKey)

    guard let output = filter.outputImage else {
      throw Exception(name: "MaskFailed", description: "生成选区失败。")
    }

    let context = CIContext(options: [.useSoftwareRenderer: false])
    guard let rendered = context.createCGImage(output, from: extent) else {
      throw Exception(name: "MaskFailed", description: "生成选区失败。")
    }

    guard let png = UIImage(cgImage: rendered).pngData() else {
      throw Exception(name: "EncodingFailed", description: "生成选区图片失败。")
    }

    let outputURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("point-mask-\(UUID().uuidString).png")
    try png.write(to: outputURL)

    return PointMaskResult(
      uri: outputURL.absoluteString,
      width: Double(cgImage.width),
      height: Double(cgImage.height)
    )
  }

  private static func mainPersonMask(handler: VNImageRequestHandler, extent: CGRect) -> CIImage? {
    let humanRequest = VNDetectHumanRectanglesRequest()
    humanRequest.upperBodyOnly = false
    let humans = (try? handler.perform([humanRequest])) != nil ? humanRequest.results : nil

    var crop: CGRect?
    if let humans, !humans.isEmpty {
      let main = humans.max { lhs, rhs in
        let left = lhs.boundingBox.width * lhs.boundingBox.height
        let right = rhs.boundingBox.width * rhs.boundingBox.height
        return left < right
      }!
      let box = main.boundingBox
      crop = CGRect(
        x: box.minX * extent.width,
        y: box.minY * extent.height,
        width: box.width * extent.width,
        height: box.height * extent.height
      )
      .insetBy(dx: -box.width * extent.width * 0.6, dy: -box.height * extent.height * 0.6)
      .intersection(extent)
    }

    let personRequest = VNGeneratePersonSegmentationRequest()
    personRequest.qualityLevel = .accurate
    personRequest.outputPixelFormat = kCVPixelFormatType_OneComponent8

    do {
      try handler.perform([personRequest])
    } catch {
      return nil
    }

    guard let observation = personRequest.results?.first else {
      return nil
    }

    let raw = CIImage(cvPixelBuffer: observation.pixelBuffer)
    guard raw.extent.width > 0, raw.extent.height > 0 else {
      return nil
    }

    let scaled = raw.transformed(
      by: CGAffineTransform(
        scaleX: extent.width / raw.extent.width,
        y: extent.height / raw.extent.height
      )
    )
    let cropped = crop.map { scaled.cropped(to: $0) } ?? scaled
    let black = CIImage(color: CIColor.black).cropped(to: extent)
    return cropped.composited(over: black)
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

  private static func fitIntoSquare(_ image: UIImage, side: CGFloat, insetRatio: Double) -> UIImage {
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    format.opaque = false

    let inset = side * CGFloat(max(0, min(insetRatio, 0.45)))

    return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { _ in
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
