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

import StickerVision from "@modules/sticker-vision";
import { ParameterSlider } from "@/components/ParameterSlider";
import { RegionPicker } from "@/components/RegionPicker";
import {
  STICKER_RENDER_OPTIONS,
  type StickerRenderOptions,
} from "@/sticker/options";
import { THEME } from "@/theme";

const CHECKER_CELLS = Array.from({ length: 100 }, (_, index) => index);
const GRID_COLS = 6;
const GRID_ROWS = 6;

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
  const [originalBase64, setOriginalBase64] = useState<string | null>(null);
  const [stickerUri, setStickerUri] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedCells, setSelectedCells] = useState<Set<number>>(
    () => new Set(),
  );
  const [sourceSize, setSourceSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  const [regionPickerVisible, setRegionPickerVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<
    "person" | "general" | "general-fallback" | null
  >(null);
  const [options, setOptions] = useState<StickerRenderOptions>({
    ...STICKER_RENDER_OPTIONS,
  });
  const optionsRef = useRef(options);
  const requestID = useRef(0);

  const renderSticker = useCallback(
    async (uri: string, nextOptions: StickerRenderOptions) => {
      const id = requestID.current + 1;
      requestID.current = id;

      setBusy(true);
      setError(null);

      try {
        const raw = await StickerVision.makeStickerAsync(uri, nextOptions);
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

  const pickImage = useCallback(async () => {
    setError(null);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      base64: true,
      quality: 1,
      selectionLimit: 1,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];
    setOriginalUri(asset.uri);
    setOriginalBase64(asset.base64 ?? null);
    setStickerUri(null);
    setRenderMode(null);
    setShowOriginal(false);
    setSelecting(false);
    setSelectedCells(new Set());

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

  const setPersonMode = useCallback(
    (enabled: boolean) => {
      const next = { ...optionsRef.current, usePersonMatte: enabled };
      optionsRef.current = next;
      setOptions(next);

      if (originalUri) {
        void renderSticker(originalUri, next);
      }
    },
    [originalUri, renderSticker],
  );

  const toggleCell = useCallback((index: number) => {
    setSelectedCells((previous) => {
      const next = new Set(previous);

      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }

      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedCells(new Set());
  }, []);

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
  const cellWidth = fittedWidth / GRID_COLS;
  const cellHeight = fittedHeight / GRID_ROWS;
  const hasGeometry = previewWidth > 0 && sourceSize !== null;

  const stickerVisible = !showOriginal && !selecting && stickerUri !== null;
  const sourceVisible = (showOriginal || selecting) && originalUri !== null;
  const hasResult = stickerUri !== null;

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

          {stickerVisible && stickerUri ? (
            <>
              {hasGeometry && originalUri
                ? [...selectedCells].map((index) => {
                    const column = index % GRID_COLS;
                    const row = Math.floor(index / GRID_COLS);

                    return (
                      <View
                        key={`region-${index}`}
                        style={[
                          styles.regionPatch,
                          {
                            left: fittedLeft + column * cellWidth,
                            top: fittedTop + row * cellHeight,
                            width: cellWidth,
                            height: cellHeight,
                          },
                        ]}
                      >
                        <Image
                          source={{ uri: originalUri }}
                          style={{
                            position: "absolute",
                            left: -column * cellWidth,
                            top: -row * cellHeight,
                            width: fittedWidth,
                            height: fittedHeight,
                          }}
                          resizeMode="stretch"
                        />
                      </View>
                    );
                  })
                : null}

              <Image
                source={{ uri: stickerUri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            </>
          ) : sourceVisible && originalUri ? (
            hasGeometry ? (
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
            )
          ) : (
            <View style={styles.placeholder}>
              <View style={styles.placeholderShape} />
              <Text style={styles.placeholderText}>选一张照片开始</Text>
            </View>
          )}

          {selecting && hasGeometry ? (
            <View
              style={[
                styles.grid,
                {
                  left: fittedLeft,
                  top: fittedTop,
                  width: fittedWidth,
                  height: fittedHeight,
                },
              ]}
            >
              {Array.from({ length: GRID_COLS * GRID_ROWS }, (_, index) => (
                <Pressable
                  key={index}
                  disabled={busy}
                  onPress={() => toggleCell(index)}
                  style={[
                    styles.gridCell,
                    { width: cellWidth, height: cellHeight },
                    selectedCells.has(index)
                      ? styles.gridCellSelected
                      : null,
                  ]}
                />
              ))}
            </View>
          ) : null}

          {busy ? (
            <View style={styles.busyOverlay}>
              <ActivityIndicator color={THEME.colors.accent} />
              <Text style={styles.busyText}>正在抠图…</Text>
            </View>
          ) : null}
        </View>

        {hasResult && (selecting || selectedCells.size > 0) ? (
          <View style={styles.selectBar}>
            <View style={styles.selectInfo}>
              <Text style={styles.selectText}>
                {selecting
                  ? `点格子补回缺失区域 · 已选 ${selectedCells.size} 块`
                  : `已选 ${selectedCells.size} 块区域`}
              </Text>
              <Text style={styles.selectNote}>
                选区目前只影响预览，导出还没接。
              </Text>
            </View>
            <Pressable hitSlop={8} onPress={clearSelection}>
              <Text style={styles.selectClear}>清空</Text>
            </Pressable>
          </View>
        ) : null}

        {hasResult ? (
          <View style={styles.segmented}>
            <Pressable
              onPress={() => {
                setShowOriginal(false);
                setSelecting(false);
              }}
              style={[
                styles.segment,
                !showOriginal && !selecting ? styles.segmentActive : null,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  !showOriginal && !selecting
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
                setSelecting(false);
              }}
              style={[
                styles.segment,
                showOriginal ? styles.segmentActive : null,
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
              onPress={() => setRegionPickerVisible(true)}
              style={styles.segment}
            >
              <Text style={styles.segmentText}>色块</Text>
            </Pressable>
          </View>
        ) : null}

        {hasResult ? (
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

            <View style={styles.modeRow}>
              <Text style={styles.modeLabel}>抠图</Text>
              <View style={styles.modeOptions}>
                <Pressable
                  disabled={busy}
                  onPress={() => setPersonMode(false)}
                  style={[
                    styles.modeOption,
                    !options.usePersonMatte ? styles.modeOptionActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.modeText,
                      !options.usePersonMatte ? styles.modeTextActive : null,
                    ]}
                  >
                    通用
                  </Text>
                </Pressable>
                <Pressable
                  disabled={busy}
                  onPress={() => setPersonMode(true)}
                  style={[
                    styles.modeOption,
                    options.usePersonMatte ? styles.modeOptionActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.modeText,
                      options.usePersonMatte ? styles.modeTextActive : null,
                    ]}
                  >
                    人物
                  </Text>
                </Pressable>
              </View>
            </View>

            {renderMode ? (
              <Text style={styles.renderMode}>
                {renderMode === "person"
                  ? "本次：人物模式"
                  : renderMode === "general-fallback"
                    ? "人物模式未识别人体，已回退通用"
                    : "本次：通用模式"}
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
              秒；数值按 1000px 参考边长。人物模式优先保留完整人体，手里物体可能被排除。
            </Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
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

        <Text style={styles.footnote}>
          图片只在设备上处理，不会上传。结果输出 1024×1024 透明 PNG，之后按
          240×240 导出。
        </Text>
      </ScrollView>

      <RegionPicker
        visible={regionPickerVisible}
        imageBase64={originalBase64}
        onClose={() => setRegionPickerVisible(false)}
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
  regionPatch: {
    position: "absolute",
    overflow: "hidden",
  },
  grid: {
    position: "absolute",
    flexDirection: "row",
    flexWrap: "wrap",
  },
  gridCell: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(24, 24, 27, 0.28)",
  },
  gridCellSelected: {
    backgroundColor: "rgba(91, 91, 214, 0.28)",
  },
  selectBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: THEME.spacing.xs,
  },
  selectText: {
    fontFamily: THEME.fonts.sans,
    fontSize: 12,
    color: THEME.colors.textSecondary,
  },
  selectNote: {
    marginTop: 2,
    fontFamily: THEME.fonts.sans,
    fontSize: 11,
    color: THEME.colors.textMuted,
  },
  selectInfo: {
    flex: 1,
    gap: 2,
  },
  selectClear: {
    fontFamily: THEME.fonts.sans,
    fontSize: 12,
    color: THEME.colors.accent,
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
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  busyText: {
    fontFamily: THEME.fonts.sans,
    fontSize: 14,
    color: THEME.colors.textSecondary,
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
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modeLabel: {
    fontFamily: THEME.fonts.sans,
    fontSize: 13,
    color: THEME.colors.textSecondary,
  },
  modeOptions: {
    flexDirection: "row",
    padding: 2,
    borderRadius: THEME.radii.full,
    backgroundColor: THEME.colors.surface,
    gap: 2,
  },
  modeOption: {
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.radii.full,
  },
  modeOptionActive: {
    backgroundColor: THEME.colors.background,
  },
  modeText: {
    fontFamily: THEME.fonts.sans,
    fontSize: 12,
    color: THEME.colors.textSecondary,
  },
  modeTextActive: {
    color: THEME.colors.primary,
    fontWeight: "600",
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
  footnote: {
    fontFamily: THEME.fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    color: THEME.colors.textMuted,
  },
});
