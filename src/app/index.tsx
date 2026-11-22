import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView } from "react-native-safe-area-context";

import StickerVision, {
  type StickerRenderResult,
} from "@modules/sticker-vision";
import { LiveGifPicker } from "@/components/LiveGifPicker";
import { ParameterSlider } from "@/components/ParameterSlider";
import { PointSelectLayer } from "@/components/PointSelectLayer";
import {
  STICKER_RENDER_OPTIONS,
  type StickerRenderOptions,
} from "@/sticker/options";
import {
  usePointSelection,
  type PointSelection,
} from "@/sticker/usePointSelection";
import { THEME } from "@/theme";

const CHECKER_CELLS = Array.from({ length: 100 }, (_, index) => index);

function Checkerboard() {
  return (
    <View style={styles.checkerboard} pointerEvents="none">
      {CHECKER_CELLS.map((cell) => {
        const isDark = (Math.floor(cell / 10) + cell) % 2 === 1;
        return (
          <View
            key={cell}
            style={[
              styles.checkerCell,
              isDark ? styles.checkerCellDark : styles.checkerCellLight,
            ]}
          />
        );
      })}
    </View>
  );
}

export default function Index() {
  const [originalUri, setOriginalUri] = useState<string | null>(null);
  const [stickerUri, setStickerUri] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [pointMode, setPointMode] = useState(false);
  const [sourceSize, setSourceSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  const [liveGifVisible, setLiveGifVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<
    "person" | "general" | "general-fallback" | "point" | null
  >(null);
  const [options, setOptions] = useState<StickerRenderOptions>({
    ...STICKER_RENDER_OPTIONS,
  });
  const optionsRef = useRef(options);
  const requestID = useRef(0);
  const appliedSelection = useRef<PointSelection | null>(null);

  const renderSticker = useCallback(
    async (uri: string, nextOptions: StickerRenderOptions) => {
      const id = requestID.current + 1;
      requestID.current = id;

      setBusy(true);
      setError(null);

      try {
        const selection = appliedSelection.current;
        const raw = selection
          ? await StickerVision.applyPointsAsync(uri, selection.points, {
              ...nextOptions,
              includeBase: selection.includeBase,
            })
          : await StickerVision.makeStickerAsync(uri, nextOptions);
        const resultUri = typeof raw === "string" ? raw : raw.uri;
        const resultMode = typeof raw === "string" ? null : raw.mode;

        if (!resultUri) {
          throw new Error("抠图结果为空，请重新选择照片。");
        }

        if (id === requestID.current) {
          setStickerUri(resultUri);
          setRenderMode(resultMode);
          setShowOriginal(false);
        }
      } catch (cause) {
        if (id === requestID.current) {
          setError(
            cause instanceof Error
              ? cause.message
              : "处理失败，换一张照片试试。",
          );
        }
      } finally {
        if (id === requestID.current) {
          setBusy(false);
        }
      }
    },
    [],
  );

  const handlePointApplied = useCallback(
    (result: StickerRenderResult, selection: PointSelection) => {
      appliedSelection.current = selection;
      setStickerUri(result.uri);
      setRenderMode(result.mode);
      setPointMode(false);
      setShowOriginal(false);
      setError(null);
    },
    [],
  );

  const point = usePointSelection({
    imageUri: originalUri,
    enabled: pointMode,
    options,
    onApplied: handlePointApplied,
  });

  const pickImage = useCallback(async () => {
    setError(null);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
      selectionLimit: 1,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];
    appliedSelection.current = null;
    setOriginalUri(asset.uri);
    setStickerUri(null);
    setRenderMode(null);
    setShowOriginal(false);
    setPointMode(false);

    if (asset.width && asset.height) {
      setSourceSize({ width: asset.width, height: asset.height });
    } else {
      setSourceSize(null);
      Image.getSize(
        asset.uri,
        (width, height) => setSourceSize({ width, height }),
        () => setSourceSize(null),
      );
    }

    await renderSticker(asset.uri, optionsRef.current);

    // Land straight in the point editor with the automatic mask selected, so
    // fixing gaps never needs an extra tap on "点选".
    setPointMode(true);
  }, [renderSticker]);

  const updateOption = useCallback(
    (key: keyof StickerRenderOptions, value: number) => {
      const next = { ...optionsRef.current, [key]: value };
      optionsRef.current = next;
      setOptions(next);
    },
    [],
  );

  const commitOptions = useCallback(() => {
    if (originalUri) {
      void renderSticker(originalUri, optionsRef.current);
    }
  }, [originalUri, renderSticker]);

  const resetOptions = useCallback(() => {
    const defaults = { ...STICKER_RENDER_OPTIONS };
    optionsRef.current = defaults;
    setOptions(defaults);

    if (originalUri) {
      void renderSticker(originalUri, defaults);
    }
  }, [originalUri, renderSticker]);

  const stageWidth = Math.max(0, previewWidth - 2);
  const inset = stageWidth * (options.insetRatio ?? 0.03);
  const imageArea = Math.max(0, stageWidth - inset * 2);
  const fitScale = sourceSize
    ? Math.min(imageArea / sourceSize.width, imageArea / sourceSize.height)
    : 1;
  const fittedWidth = sourceSize ? sourceSize.width * fitScale : imageArea;
  const fittedHeight = sourceSize ? sourceSize.height * fitScale : imageArea;
  const fittedLeft = inset + (imageArea - fittedWidth) / 2;
  const fittedTop = inset + (imageArea - fittedHeight) / 2;
  const hasGeometry = previewWidth > 0 && sourceSize !== null;

  const stickerVisible = !showOriginal && !pointMode && stickerUri !== null;
  const hasResult = stickerUri !== null;
  const stageBusy = busy || point.busy;
  const stageLabel = point.applying
    ? "正在应用到贴纸…"
    : point.segmenting
      ? point.downloadProgress !== null
        ? "首次使用，正在下载系统分割模型"
        : "正在分割…"
      : point.baseLoading
        ? "正在读取自动抠图…"
        : "正在抠图…";
  const message = error ?? point.error;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>STICKER LAB</Text>
          <Text style={styles.title}>图片转贴纸</Text>
          <Text style={styles.subtitle}>
            在设备上用 Vision 抠出主体，再加一圈白边。
          </Text>
        </View>

        <View
          style={styles.preview}
          onLayout={(event) => setPreviewWidth(event.nativeEvent.layout.width)}
        >
          <Checkerboard />

          {!originalUri ? (
            <View style={styles.placeholder}>
              <View style={styles.placeholderShape} />
              <Text style={styles.placeholderText}>选一张照片开始</Text>
            </View>
          ) : pointMode ? (
            <>
              {hasGeometry ? (
                <Image
                  source={{ uri: originalUri }}
                  style={{
                    position: "absolute",
                    left: fittedLeft,
                    top: fittedTop,
                    width: fittedWidth,
                    height: fittedHeight,
                  }}
                  resizeMode="stretch"
                />
              ) : (
                <Image
                  source={{ uri: originalUri }}
                  style={styles.previewImage}
                  resizeMode="contain"
                />
              )}

              {hasGeometry ? (
                <PointSelectLayer
                  left={fittedLeft}
                  top={fittedTop}
                  width={fittedWidth}
                  height={fittedHeight}
                  regions={point.regions}
                  disabled={stageBusy}
                  onTap={point.toggleAt}
                />
              ) : null}
            </>
          ) : stickerVisible && stickerUri ? (
            <Image
              source={{ uri: stickerUri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          ) : hasGeometry ? (
            <Image
              source={{ uri: originalUri }}
              style={{
                position: "absolute",
                left: fittedLeft,
                top: fittedTop,
                width: fittedWidth,
                height: fittedHeight,
              }}
              resizeMode="stretch"
            />
          ) : (
            <Image
              source={{ uri: originalUri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}

          {stageBusy ? (
            <View style={styles.busyOverlay}>
              <ActivityIndicator color={THEME.colors.accent} />
              <Text style={styles.busyText}>{stageLabel}</Text>
              {point.segmenting && point.downloadProgress !== null ? (
                <>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.round(
                            Math.min(1, Math.max(0, point.downloadProgress)) *
                              100,
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>
                    {Math.round(
                      Math.min(1, Math.max(0, point.downloadProgress)) * 100,
                    )}
                    %
                  </Text>
                </>
              ) : null}
            </View>
          ) : null}
        </View>

        {pointMode ? (
          <>
            <View style={styles.pointBar}>
              <Text style={styles.pointInfo}>
                {point.regions.length > 0
                  ? `已选 ${point.regions.length} 个区域${
                      point.hasBase ? "（含自动底图）" : ""
                    }`
                  : "点主体补选区域，点已选区域取消"}
              </Text>
              {point.regions.length > 0 ? (
                <Pressable
                  disabled={point.busy}
                  hitSlop={8}
                  onPress={point.clear}
                >
                  <Text
                    style={[
                      styles.pointClear,
                      point.busy ? styles.pointClearDisabled : null,
                    ]}
                  >
                    清空
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <Pressable
              disabled={stageBusy || point.regions.length === 0}
              onPress={() => void point.apply()}
              style={({ pressed }) => [
                styles.applyButton,
                pressed ? styles.buttonPressed : null,
                stageBusy || point.regions.length === 0
                  ? styles.buttonDisabled
                  : null,
              ]}
            >
              <Text style={styles.applyButtonText}>
                {point.applying ? "正在应用到贴纸…" : "应用到贴纸"}
              </Text>
            </Pressable>
          </>
        ) : null}

        {hasResult ? (
          <View style={styles.segmented}>
            <Pressable
              onPress={() => {
                setShowOriginal(false);
                setPointMode(false);
              }}
              style={[
                styles.segment,
                !showOriginal && !pointMode ? styles.segmentActive : null,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  !showOriginal && !pointMode
                    ? styles.segmentTextActive
                    : null,
                ]}
              >
                贴纸
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowOriginal(true);
                setPointMode(false);
              }}
              style={[
                styles.segment,
                showOriginal && !pointMode ? styles.segmentActive : null,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  showOriginal ? styles.segmentTextActive : null,
                ]}
              >
                原图
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowOriginal(false);
                setPointMode(true);
              }}
              style={[
                styles.segment,
                pointMode ? styles.segmentActive : null,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  pointMode ? styles.segmentTextActive : null,
                ]}
              >
                点选
              </Text>
            </Pressable>
          </View>
        ) : null}

        {hasResult && !pointMode ? (
          <View style={styles.adjustPanel}>
            <View style={styles.adjustHeader}>
              <Text style={styles.adjustTitle}>微调</Text>
              <Pressable
                disabled={busy}
                hitSlop={8}
                onPress={resetOptions}
              >
                <Text
                  style={[
                    styles.reset,
                    busy ? styles.resetDisabled : null,
                  ]}
                >
                  重置
                </Text>
              </Pressable>
            </View>

            {renderMode ? (
              <Text style={styles.renderMode}>
                {renderMode === "point" ? "本次：点选补图" : "本次：自动抠图"}
              </Text>
            ) : null}

            <ParameterSlider
              label="边缘收放"
              value={options.edgeGrowRatio ?? 0}
              min={-0.006}
              max={0.006}
              step={0.0001}
              formatValue={(value) =>
                `${value >= 0 ? "+" : ""}${(value * 1000).toFixed(1)}px`
              }
              onChange={(value) => updateOption("edgeGrowRatio", value)}
              onCommit={commitOptions}
              disabled={busy}
            />

            <ParameterSlider
              label="白边粗细"
              value={options.borderWidthRatio ?? 0}
              min={0}
              max={0.04}
              step={0.001}
              formatValue={(value) => `${(value * 1000).toFixed(0)}px`}
              onChange={(value) => updateOption("borderWidthRatio", value)}
              onCommit={commitOptions}
              disabled={busy}
            />

            <ParameterSlider
              label="补洞"
              value={options.closeHoleRatio ?? 0}
              min={0}
              max={0.008}
              step={0.0005}
              formatValue={(value) => `${(value * 1000).toFixed(1)}px`}
              onChange={(value) => updateOption("closeHoleRatio", value)}
              onCommit={commitOptions}
              disabled={busy}
            />

            <Text style={styles.adjustHint}>
              松手后重新生成，约 1
              秒；数值按 1000px 参考边长。
            </Text>
          </View>
        ) : null}

        {message ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{message}</Text>
          </View>
        ) : null}

        <Pressable
          disabled={busy}
          onPress={pickImage}
          style={({ pressed }) => [
            styles.button,
            pressed ? styles.buttonPressed : null,
            busy ? styles.buttonDisabled : null,
          ]}
        >
          <Text style={styles.buttonText}>
            {busy ? "处理中…" : hasResult ? "换一张照片" : "选择照片"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setLiveGifVisible(true)}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed ? styles.buttonPressed : null,
          ]}
        >
          <Text style={styles.secondaryButtonText}>Live 动图</Text>
        </Pressable>

        <Text style={styles.footnote}>
          图片只在设备上处理，不会上传。结果输出 1024×1024 透明 PNG，之后按
          240×240 导出。
        </Text>
      </ScrollView>

      <LiveGifPicker
        visible={liveGifVisible}
        options={optionsRef.current}
        onClose={() => setLiveGifVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  content: {
    paddingHorizontal: THEME.spacing.xl,
    paddingTop: THEME.spacing.lg,
    paddingBottom: THEME.spacing.xxl,
    gap: THEME.spacing.lg,
  },
  header: {
    gap: THEME.spacing.xs,
  },
  eyebrow: {
    fontFamily: THEME.fonts.sans,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.4,
    color: THEME.colors.accent,
  },
  title: {
    fontFamily: THEME.fonts.sans,
    fontSize: 34,
    fontWeight: "700",
    color: THEME.colors.primary,
  },
  subtitle: {
    fontFamily: THEME.fonts.sans,
    fontSize: 15,
    lineHeight: 21,
    color: THEME.colors.textSecondary,
  },
  preview: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: THEME.radii.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.backgroundSecondary,
  },
  checkerboard: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  checkerCell: {
    width: "10%",
    height: "10%",
  },
  checkerCellLight: {
    backgroundColor: "#fbfbfc",
  },
  checkerCellDark: {
    backgroundColor: "#f0f0f2",
  },
  previewImage: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  pointBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.xs,
  },
  pointInfo: {
    flex: 1,
    fontFamily: THEME.fonts.sans,
    fontSize: 12,
    color: THEME.colors.textSecondary,
  },
  pointClear: {
    fontFamily: THEME.fonts.sans,
    fontSize: 12,
    color: THEME.colors.accent,
  },
  pointClearDisabled: {
    opacity: 0.4,
  },
  applyButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: THEME.spacing.md + 2,
    borderRadius: THEME.radii.lg,
    backgroundColor: THEME.colors.primary,
  },
  applyButtonText: {
    fontFamily: THEME.fonts.sans,
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  placeholder: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: THEME.spacing.md,
  },
  placeholderShape: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: THEME.colors.textMuted,
  },
  placeholderText: {
    fontFamily: THEME.fonts.sans,
    fontSize: 14,
    color: THEME.colors.textMuted,
  },
  busyOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: THEME.spacing.sm,
    padding: THEME.spacing.lg,
    backgroundColor: "rgba(255,255,255,0.78)",
  },
  busyText: {
    fontFamily: THEME.fonts.sans,
    fontSize: 13,
    textAlign: "center",
    color: THEME.colors.textSecondary,
  },
  progressTrack: {
    width: "70%",
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.colors.surface,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: THEME.colors.accent,
  },
  progressText: {
    fontFamily: THEME.fonts.mono,
    fontSize: 12,
    color: THEME.colors.textMuted,
  },
  segmented: {
    flexDirection: "row",
    alignSelf: "center",
    padding: 3,
    borderRadius: THEME.radii.full,
    backgroundColor: THEME.colors.surface,
    gap: 2,
  },
  segment: {
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.xs + 2,
    borderRadius: THEME.radii.full,
  },
  segmentActive: {
    backgroundColor: THEME.colors.background,
  },
  segmentText: {
    fontFamily: THEME.fonts.sans,
    fontSize: 13,
    fontWeight: "500",
    color: THEME.colors.textSecondary,
  },
  segmentTextActive: {
    color: THEME.colors.primary,
    fontWeight: "600",
  },
  adjustPanel: {
    padding: THEME.spacing.lg,
    borderRadius: THEME.radii.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.backgroundSecondary,
    gap: THEME.spacing.md,
  },
  adjustHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  adjustTitle: {
    fontFamily: THEME.fonts.sans,
    fontSize: 13,
    fontWeight: "600",
    color: THEME.colors.primary,
  },
  reset: {
    fontFamily: THEME.fonts.sans,
    fontSize: 13,
    color: THEME.colors.accent,
  },
  resetDisabled: {
    opacity: 0.4,
  },
  adjustHint: {
    fontFamily: THEME.fonts.sans,
    fontSize: 11,
    lineHeight: 16,
    color: THEME.colors.textMuted,
  },
  renderMode: {
    fontFamily: THEME.fonts.mono,
    fontSize: 11,
    color: THEME.colors.textMuted,
  },
  errorBox: {
    padding: THEME.spacing.md,
    borderRadius: THEME.radii.md,
    backgroundColor: "#fef2f2",
  },
  errorText: {
    fontFamily: THEME.fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: THEME.colors.error,
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: THEME.spacing.md + 2,
    borderRadius: THEME.radii.lg,
    backgroundColor: THEME.colors.accent,
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontFamily: THEME.fonts.sans,
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: THEME.spacing.md,
    borderRadius: THEME.radii.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.background,
  },
  secondaryButtonText: {
    fontFamily: THEME.fonts.sans,
    fontSize: 15,
    fontWeight: "600",
    color: THEME.colors.primary,
  },
  footnote: {
    fontFamily: THEME.fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    color: THEME.colors.textMuted,
  },
});
