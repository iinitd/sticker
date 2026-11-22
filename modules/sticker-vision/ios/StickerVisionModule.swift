import ExpoModulesCore
import UIKit
import Vision
import CoreImage
import ImageIO
import AVFoundation
import Photos
import UniformTypeIdentifiers

struct StickerResult: Record {
  @Field var uri: String = ""
  @Field var mode: String = "general"
}

struct PointInput: Record, @unchecked Sendable {
  @Field var x: Double = 0
  @Field var y: Double = 0
  @Field var include: Bool = true
}

struct FileResult: Record {
  @Field var uri: String = ""
  @Field var bytes: Int = 0
}

struct GifResult: Record {
  @Field var uri: String = ""
  @Field var bytes: Int = 0
  @Field var width: Int = 0
  @Field var height: Int = 0
  @Field var frames: Int = 0
}

struct VideoFramesResult: Record {
  @Field var frames: [String] = []
}

struct PointMaskResult: Record {
  @Field var uri: String = ""
  @Field var width: Double = 0
  @Field var height: Double = 0
}

struct StickerOptions: Record, @unchecked Sendable {
  @Field var outputSize: Int = 1024
  @Field var maxDimension: Int = 1600
  @Field var borderWidthRatio: Double = 0
  @Field var edgeGrowRatio: Double = 0
  @Field var closeHoleRatio: Double = 0
  @Field var insetRatio: Double = 0
  @Field var usePersonMatte: Bool = false
  @Field var includeBase: Bool = true
}

public class StickerVisionModule: Module, @unchecked Sendable {
  public func definition() -> ModuleDefinition {
    Name("StickerVision")

    Events("onPointModelDownloadProgress")

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

          let onProgress: @Sendable (Double) -> Void = { [weak self] value in
            self?.sendEvent("onPointModelDownloadProgress", ["progress": value])
          }
          let result = try await Self.segmentAtPoint(
            uri: uri,
            x: x,
            y: y,
            onProgress: onProgress
          )
          promise.resolve(result)
        } catch {
          promise.reject("POINT_SEGMENT_FAILED", error.localizedDescription)
        }
      }
    }

    AsyncFunction("applyPointAsync") { (uri: String, x: Double, y: Double, options: StickerOptions, promise: Promise) in
      Task {
        do {
          guard #available(iOS 27.0, *) else {
            throw Exception(name: "UnsupportedOS", description: "点选分割需要 iOS 27。")
          }

          let onProgress: @Sendable (Double) -> Void = { [weak self] value in
            self?.sendEvent("onPointModelDownloadProgress", ["progress": value])
          }
          let result = try await Self.applyPoint(
            uri: uri,
            x: x,
            y: y,
            options: options,
            onProgress: onProgress
          )
          promise.resolve(result)
        } catch {
          promise.reject("POINT_APPLY_FAILED", error.localizedDescription)
        }
      }
    }

    AsyncFunction("applyPointsAsync") { (uri: String, points: [PointInput], options: StickerOptions, promise: Promise) in
      Task {
        do {
          guard #available(iOS 27.0, *) else {
            throw Exception(name: "UnsupportedOS", description: "点选分割需要 iOS 27。")
          }

          let onProgress: @Sendable (Double) -> Void = { [weak self] value in
            self?.sendEvent("onPointModelDownloadProgress", ["progress": value])
          }
          let result = try await Self.applyPoints(
            uri: uri,
            points: points,
            options: options,
            onProgress: onProgress
          )
          promise.resolve(result)
        } catch {
          promise.reject("POINT_APPLY_FAILED", error.localizedDescription)
        }
      }
    }

    AsyncFunction("baseMaskAsync") { (uri: String, options: StickerOptions, promise: Promise) in
      Task {
        do {
          guard #available(iOS 17.0, *) else {
            throw Exception(name: "UnsupportedOS", description: "自动抠图需要 iOS 17。")
          }
          let result = try Self.baseMaskPreview(uri: uri, options: options)
          promise.resolve(result)
        } catch {
          promise.reject("BASE_MASK_FAILED", error.localizedDescription)
        }
      }
    }

    AsyncFunction("pairedVideoAsync") { (assetId: String, promise: Promise) in
      Task {
        do {
          guard #available(iOS 16.0, *) else {
            throw Exception(name: "UnsupportedOS", description: "读取 Live 图需要 iOS 16。")
          }
          let result = try await Self.pairedVideo(assetId: assetId)
          promise.resolve(result)
        } catch {
          promise.reject("LIVE_PHOTO_FAILED", error.localizedDescription)
        }
      }
    }

    AsyncFunction("exportStickerAsync") { (uri: String, size: Int, format: String, promise: Promise) in
      do {
        promise.resolve(try Self.exportSticker(uri: uri, size: size, format: format))
      } catch {
        promise.reject("EXPORT_FAILED", error.localizedDescription)
      }
    }

    AsyncFunction("videoFramesAsync") { (uri: String, fps: Double, maxFrames: Int, promise: Promise) in
      Task {
        do {
          guard #available(iOS 16.0, *) else {
            throw Exception(name: "UnsupportedOS", description: "视频取帧需要 iOS 16。")
          }
          let result = try await Self.videoFrames(uri: uri, fps: fps, maxFrames: maxFrames)
          promise.resolve(result)
        } catch {
          promise.reject("VIDEO_FRAMES_FAILED", error.localizedDescription)
        }
      }
    }

    AsyncFunction("encodeGifAsync") { (frameUris: [String], fps: Double, size: Int, promise: Promise) in
      do {
        promise.resolve(try Self.encodeGif(frameUris: frameUris, fps: fps, size: size))
      } catch {
        promise.reject("GIF_FAILED", error.localizedDescription)
      }
    }
  }

  @available(iOS 17.0, *)
  private static func baseMask(
    handler: VNImageRequestHandler,
    extent: CGRect,
    options: StickerOptions
  ) throws -> (mask: CIImage, usedPerson: Bool)? {
    if options.usePersonMatte, let personMask = Self.mainPersonMask(handler: handler, extent: extent) {
      return (personMask, true)
    }

    let request = VNGenerateForegroundInstanceMaskRequest()
    try handler.perform([request])

    guard let result = request.results?.first else {
      return nil
    }

    let maskBuffer = try result.generateScaledMaskForImage(
      forInstances: result.allInstances,
      from: handler
    )

    return (CIImage(cvPixelBuffer: maskBuffer), false)
  }

  @available(iOS 17.0, *)
  private static func renderMaskedImage(
    _ image: UIImage,
    baseMask: CIImage,
    options: StickerOptions
  ) throws -> UIImage? {
    guard let cgImage = image.cgImage else {
      throw Exception(name: "InvalidImage", description: "无法读取图片像素。")
    }

    let extent = CGRect(x: 0, y: 0, width: cgImage.width, height: cgImage.height)
    let foreground = CIImage(cgImage: cgImage)
    let minSide = min(extent.width, extent.height)
    let closeRadius = max(0, minSide * options.closeHoleRatio)
    let edgeGrow = minSide * options.edgeGrowRatio
    let borderWidth = max(0, minSide * options.borderWidthRatio)

    var mask = baseMask

    if closeRadius > 0.01 {
      mask = mask
        .clampedToExtent()
        .applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: closeRadius])
        .applyingFilter("CIMorphologyMinimum", parameters: [kCIInputRadiusKey: closeRadius])
    }

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

    return UIImage(cgImage: resultImage, scale: 1, orientation: .up)
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

    guard let base = try Self.baseMask(handler: handler, extent: extent, options: options) else {
      return nil
    }

    guard let rendered = try Self.renderMaskedImage(image, baseMask: base.mask, options: options) else {
      return nil
    }

    return (rendered, base.usedPerson)
  }

  @available(iOS 18.0, *)
  private static func normalizedPoint(_ point: PointInput) -> NormalizedPoint {
    NormalizedPoint(
      x: CGFloat(min(max(point.x, 0), 1)),
      y: CGFloat(1 - min(max(point.y, 0), 1))
    )
  }

  @available(iOS 27.0, *)
  private static func iterativeMask(
    from image: UIImage,
    points: [PointInput],
    onProgress: (@Sendable (Double) -> Void)? = nil
  ) async throws -> CIImage {
    guard let cgImage = image.cgImage else {
      throw Exception(name: "InvalidImage", description: "无法读取图片像素。")
    }

    let handler = ImageRequestHandler(cgImage, orientation: .up)
    guard let seedIndex = points.firstIndex(where: { $0.include }) else {
      throw Exception(name: "InvalidPoints", description: "至少需要一个包含点。")
    }
    let request = GenerateIterativeSegmentationRequest(
      seedPoint: Self.normalizedPoint(points[seedIndex])
    )

    for (index, point) in points.enumerated() where index != seedIndex {
      let normalized = Self.normalizedPoint(point)
      if point.include {
        try request.addIncludedPoint(normalized)
      } else {
        try request.addExcludedPoint(normalized)
      }
    }

    switch await request.assetStatus {
    case .ready:
      break
    case .notReady:
      if let onProgress {
        let manager = ProgressManager(totalCount: 100)
        let monitor = Task {
          while !Task.isCancelled {
            onProgress(manager.fractionCompleted)
            try? await Task.sleep(for: .milliseconds(200))
          }
        }

        do {
          try await request.downloadAssets(progress: manager.subprogress(assigningCount: 100))
          monitor.cancel()
          onProgress(1.0)
        } catch {
          monitor.cancel()
          throw error
        }
      } else {
        try await request.downloadAssets()
      }
    case .downloading, .error:
      throw Exception(name: "ModelNotReady", description: "分割模型还没准备好，稍后再试。")
    @unknown default:
      throw Exception(name: "ModelNotReady", description: "分割模型状态未知。")
    }

    guard let observation = try await handler.perform(request) else {
      throw Exception(name: "NoMask", description: "这个位置没有分割出区域，换一个点试试。")
    }

    let extent = CGRect(x: 0, y: 0, width: cgImage.width, height: cgImage.height)
    let rawMask = CIImage(cgImage: try observation.cgImage)
    return rawMask.transformed(
      by: CGAffineTransform(
        scaleX: extent.width / rawMask.extent.width,
        y: extent.height / rawMask.extent.height
      )
    )
  }

  @available(iOS 27.0, *)
  private static func segmentAtPoint(
    uri: String,
    x: Double,
    y: Double,
    onProgress: (@Sendable (Double) -> Void)? = nil
  ) async throws -> PointMaskResult {
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

    let mask = try await Self.iterativeMask(
      from: source,
      points: [PointInput(x: x, y: y, include: true)],
      onProgress: onProgress
    )
    let extent = CGRect(x: 0, y: 0, width: cgImage.width, height: cgImage.height)
    let white = CIImage(color: CIColor.white).cropped(to: extent)

    guard let filter = CIFilter(name: "CIBlendWithMask") else {
      throw Exception(name: "FilterUnavailable", description: "系统抠图滤镜不可用。")
    }

    filter.setValue(white, forKey: kCIInputImageKey)
    filter.setValue(CIImage.empty(), forKey: kCIInputBackgroundImageKey)
    filter.setValue(mask, forKey: kCIInputMaskImageKey)

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

  @available(iOS 27.0, *)
  private static func applyPoint(
    uri: String,
    x: Double,
    y: Double,
    options: StickerOptions,
    onProgress: (@Sendable (Double) -> Void)? = nil
  ) async throws -> StickerResult {
    try await Self.applyPoints(
      uri: uri,
      points: [PointInput(x: x, y: y, include: true)],
      options: options,
      onProgress: onProgress
    )
  }

  @available(iOS 27.0, *)
  private static func applyPoints(
    uri: String,
    points: [PointInput],
    options: StickerOptions,
    onProgress: (@Sendable (Double) -> Void)? = nil
  ) async throws -> StickerResult {
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

    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
    let extent = CGRect(x: 0, y: 0, width: cgImage.width, height: cgImage.height)

    let base: (mask: CIImage, usedPerson: Bool)? =
      options.includeBase
        ? try Self.baseMask(handler: handler, extent: extent, options: options)
        : nil

    if options.includeBase && base == nil {
      throw Exception(name: "NoSubject", description: "没有识别到主体，换一张照片试试。")
    }
    if !options.includeBase && points.isEmpty {
      throw Exception(name: "NoSelection", description: "至少选中一个区域。")
    }

    let pointMask: CIImage? = points.isEmpty
      ? nil
      : try await Self.iterativeMask(
          from: source,
          points: points,
          onProgress: onProgress
        )

    let combined: CIImage
    if let base, let pointMask {
      guard let union = CIFilter(name: "CIMaximumCompositing") else {
        throw Exception(name: "MaskFailed", description: "合并选区失败。")
      }
      union.setValue(base.mask, forKey: kCIInputImageKey)
      union.setValue(pointMask, forKey: kCIInputBackgroundImageKey)
      combined = (union.outputImage ?? base.mask).cropped(to: extent)
    } else if let base {
      combined = base.mask
    } else if let pointMask {
      combined = pointMask
    } else {
      throw Exception(name: "NoSelection", description: "至少选中一个区域。")
    }

    guard let rendered = try Self.renderMaskedImage(source, baseMask: combined, options: options) else {
      throw Exception(name: "RenderFailed", description: "生成贴纸失败。")
    }

    let side = CGFloat(max(240, min(options.outputSize, 2048)))
    let square = Self.fitIntoSquare(rendered, side: side, insetRatio: options.insetRatio)

    guard let png = square.pngData() else {
      throw Exception(name: "EncodingFailed", description: "生成 PNG 失败。")
    }

    let outputURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("sticker-\(UUID().uuidString).png")
    try png.write(to: outputURL)

    return StickerResult(uri: outputURL.absoluteString, mode: "point")
  }

  @available(iOS 17.0, *)
  private static func baseMaskPreview(uri: String, options: StickerOptions) throws -> PointMaskResult {
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

    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
    let extent = CGRect(x: 0, y: 0, width: cgImage.width, height: cgImage.height)

    guard let base = try Self.baseMask(handler: handler, extent: extent, options: options) else {
      throw Exception(name: "NoSubject", description: "没有识别到自动抠图区域。")
    }

    let white = CIImage(color: CIColor.white).cropped(to: extent)
    guard let filter = CIFilter(name: "CIBlendWithMask") else {
      throw Exception(name: "FilterUnavailable", description: "系统抠图滤镜不可用。")
    }

    filter.setValue(white, forKey: kCIInputImageKey)
    filter.setValue(CIImage.empty(), forKey: kCIInputBackgroundImageKey)
    filter.setValue(base.mask, forKey: kCIInputMaskImageKey)

    guard let output = filter.outputImage else {
      throw Exception(name: "MaskFailed", description: "生成自动蒙版失败。")
    }

    let context = CIContext(options: [.useSoftwareRenderer: false])
    guard let rendered = context.createCGImage(output, from: extent),
          let png = UIImage(cgImage: rendered).pngData() else {
      throw Exception(name: "EncodingFailed", description: "生成自动蒙版图片失败。")
    }

    let outputURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("base-mask-\(UUID().uuidString).png")
    try png.write(to: outputURL)

    return PointMaskResult(
      uri: outputURL.absoluteString,
      width: Double(cgImage.width),
      height: Double(cgImage.height)
    )
  }

  @available(iOS 16.0, *)
  private static func pairedVideo(assetId: String) async throws -> FileResult {
    let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)

    if status == .notDetermined {
      let granted: PHAuthorizationStatus = await withCheckedContinuation {
        (continuation: CheckedContinuation<PHAuthorizationStatus, Never>) in
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { result in
          continuation.resume(returning: result)
        }
      }

      guard granted == .authorized || granted == .limited else {
        throw Exception(name: "PhotoPermissionDenied", description: "需要相册权限才能读取 Live 图的配对视频。")
      }
    } else if status != .authorized && status != .limited {
      throw Exception(name: "PhotoPermissionDenied", description: "需要相册权限才能读取 Live 图的配对视频。")
    }

    let assets = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil)
    guard let asset = assets.firstObject else {
      throw Exception(name: "LivePhotoNotFound", description: "系统里找不到这张 Live 图。")
    }
    guard asset.mediaSubtypes.contains(.photoLive) else {
      throw Exception(name: "NotLivePhoto", description: "这张图不是 Live Photo。")
    }
    guard let resource = PHAssetResource.assetResources(for: asset)
      .first(where: { $0.type == .pairedVideo }) else {
      throw Exception(name: "NoPairedVideo", description: "这张 Live 图没有配对视频。")
    }

    let ext = (resource.originalFilename as NSString).pathExtension
    let outputURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("live-paired-\(UUID().uuidString).\(ext.isEmpty ? "mov" : ext)")

    try await withCheckedThrowingContinuation {
      (continuation: CheckedContinuation<Void, Error>) in
      PHAssetResourceManager.default().writeData(
        for: resource,
        toFile: outputURL,
        options: nil
      ) { error in
        if let error {
          continuation.resume(throwing: error)
        } else {
          continuation.resume(returning: ())
        }
      }
    }

    let attributes = try FileManager.default.attributesOfItem(atPath: outputURL.path)
    let bytes = (attributes[.size] as? NSNumber)?.intValue ?? 0
    return FileResult(uri: outputURL.absoluteString, bytes: bytes)
  }

  private static func resizedCGImage(_ image: CGImage, side: Int, opaque: Bool) -> CGImage? {
    let target = CGFloat(max(24, min(side, 2048)))
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    format.opaque = opaque

    return UIGraphicsImageRenderer(
      size: CGSize(width: target, height: target),
      format: format
    ).image { context in
      if opaque {
        UIColor.white.setFill()
        context.cgContext.fill(CGRect(x: 0, y: 0, width: target, height: target))
      }

      let imageSize = CGSize(width: image.width, height: image.height)
      let ratio = min(target / imageSize.width, target / imageSize.height)
      let drawSize = CGSize(
        width: imageSize.width * ratio,
        height: imageSize.height * ratio
      )
      let origin = CGPoint(
        x: (target - drawSize.width) / 2,
        y: (target - drawSize.height) / 2
      )
      UIImage(cgImage: image).draw(in: CGRect(origin: origin, size: drawSize))
    }.cgImage
  }

  private static func exportSticker(uri: String, size: Int, format: String) throws -> FileResult {
    guard let url = URL(string: uri), url.isFileURL,
          let image = UIImage(contentsOfFile: url.path),
          let cgImage = image.cgImage else {
      throw Exception(name: "InvalidImage", description: "无法读取贴纸图片。")
    }

    let isJpeg = format.lowercased() == "jpg" || format.lowercased() == "jpeg"
    guard let resized = Self.resizedCGImage(cgImage, side: size, opaque: isJpeg) else {
      throw Exception(name: "ResizeFailed", description: "缩放贴纸失败。")
    }

    let outputImage = UIImage(cgImage: resized)
    let data: Data?
    let ext: String
    if isJpeg {
      data = outputImage.jpegData(compressionQuality: 0.9)
      ext = "jpg"
    } else {
      data = outputImage.pngData()
      ext = "png"
    }

    guard let data else {
      throw Exception(name: "EncodingFailed", description: "导出图片失败。")
    }

    let outputURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("sticker-export-\(UUID().uuidString).\(ext)")
    try data.write(to: outputURL)

    return FileResult(uri: outputURL.absoluteString, bytes: data.count)
  }

  @available(iOS 16.0, *)
  private static func videoFrames(
    uri: String,
    fps: Double,
    maxFrames: Int
  ) async throws -> VideoFramesResult {
    guard let url = URL(string: uri), url.isFileURL else {
      throw Exception(name: "InvalidVideoURI", description: "视频地址无效。")
    }

    let asset = AVURLAsset(url: url)
    let duration = try await asset.load(.duration)
    let seconds = CMTimeGetSeconds(duration)
    guard seconds.isFinite, seconds > 0 else {
      throw Exception(name: "InvalidVideo", description: "视频时长无效。")
    }

    let frameRate = min(max(fps, 1), 30)
    let limit = min(max(maxFrames, 1), 120)
    let count = min(limit, max(1, Int(seconds * frameRate)))
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.requestedTimeToleranceBefore = .zero
    generator.requestedTimeToleranceAfter = .zero

    var frames: [String] = []
    for index in 0..<count {
      let time = CMTime(
        seconds: min(seconds - 0.01, Double(index) / frameRate),
        preferredTimescale: 600
      )
      let result = try await generator.image(at: time)
      guard let png = UIImage(cgImage: result.image).pngData() else {
        continue
      }
      let outputURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("frame-\(UUID().uuidString)-\(index).png")
      try png.write(to: outputURL)
      frames.append(outputURL.absoluteString)
    }

    return VideoFramesResult(frames: frames)
  }

  private static func encodeGif(
    frameUris: [String],
    fps: Double,
    size: Int
  ) throws -> GifResult {
    guard !frameUris.isEmpty else {
      throw Exception(name: "NoFrames", description: "没有可编码的帧。")
    }

    let frameRate = min(max(fps, 1), 20)
    let side = max(24, min(size, 1024))
    let outputURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("sticker-\(UUID().uuidString).gif")

    guard let destination = CGImageDestinationCreateWithURL(
      outputURL as CFURL,
      UTType.gif.identifier as CFString,
      frameUris.count,
      nil
    ) else {
      throw Exception(name: "GifCreateFailed", description: "创建 GIF 失败。")
    }

    let fileProperties = [
      kCGImagePropertyGIFDictionary: [
        kCGImagePropertyGIFLoopCount: 0
      ]
    ] as CFDictionary
    CGImageDestinationSetProperties(destination, fileProperties)

    let frameProperties = [
      kCGImagePropertyGIFDictionary: [
        kCGImagePropertyGIFDelayTime: 1.0 / frameRate
      ]
    ] as CFDictionary

    var count = 0
    for uri in frameUris {
      guard let url = URL(string: uri), url.isFileURL,
            let image = UIImage(contentsOfFile: url.path),
            let cgImage = image.cgImage,
            let resized = Self.resizedCGImage(cgImage, side: side, opaque: false) else {
        continue
      }
      CGImageDestinationAddImage(destination, resized, frameProperties)
      count += 1
    }

    guard count > 0, CGImageDestinationFinalize(destination) else {
      throw Exception(name: "GifWriteFailed", description: "写入 GIF 失败。")
    }

    let attributes = try FileManager.default.attributesOfItem(atPath: outputURL.path)
    let bytes = (attributes[.size] as? NSNumber)?.intValue ?? 0

    return GifResult(
      uri: outputURL.absoluteString,
      bytes: bytes,
      width: side,
      height: side,
      frames: count
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
