import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { File } from "expo-file-system";
import { decode as decodePng } from "fast-png";

import StickerVision, {
  type StickerRenderResult,
} from "@modules/sticker-vision";
import type { StickerRenderOptions } from "@/sticker/options";
import { THEME } from "@/theme";

type PointSegmentPickerProps = {
  visible: boolean;
  imageUri: string | null;
  width: number;
  height: number;
  options: StickerRenderOptions;
  onApplied: (result: StickerRenderResult) => void;
  onClose: () => void;
};

type SelectedRegion = {
  id: string;
  x: number;
  y: number;
  maskUri: string;
  hitMap: Uint8Array;
  isBase?: boolean;
};

const HIT_SIZE = 128;

async function buildHitMap(maskUri: string): Promise<Uint8Array> {
  const bytes = await new File(maskUri).bytes();
  const decoded = decodePng(bytes);
  const width = decoded.width;
  const height = decoded.height;
  const channels = decoded.channels;
  const data = decoded.data as Uint8Array;
  const map = new Uint8Array(HIT_SIZE * HIT_SIZE);

  for (let y = 0; y < HIT_SIZE; y += 1) {
    const sy = Math.min(height - 1, Math.floor(((y + 0.5) / HIT_SIZE) * height));

    for (let x = 0; x < HIT_SIZE; x += 1) {
      const sx = Math.min(width - 1, Math.floor(((x + 0.5) / HIT_SIZE) * width));
      const index = (sy * width + sx) * channels;
      const alpha =
        channels >= 4
          ? data[index + 3]
          : channels === 1
            ? data[index]
            : data[index];

      if (alpha > 16) {
        map[y * HIT_SIZE + x] = 1;
      }
    }
  }

  return map;
}

function isHit(region: SelectedRegion, x: number, y: number): boolean {
  if (region.hitMap.length === 0) {
    return false;
  }

  const px = Math.min(HIT_SIZE - 1, Math.max(0, Math.floor(x * HIT_SIZE)));
  const py = Math.min(HIT_SIZE - 1, Math.max(0, Math.floor(y * HIT_SIZE)));
  return region.hitMap[py * HIT_SIZE + px] === 1;
}

export function PointSegmentPicker({
  visible,
  imageUri,
  width,
  height,
  options,
  onApplied,
  onClose,
}: PointSegmentPickerProps) {
  const [regions, setRegions] = useState<SelectedRegion[]>([]);
  const [loading, setLoading] = useState(false);
  const [baseLoading, setBaseLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stageWidth, setStageWidth] = useState(0);
  const [stageHeight, setStageHeight] = useState(0);

  useEffect(() => {
    const subscription = StickerVision.addListener(
      "onPointModelDownloadProgress",
      ({ progress }) => {
        setDownloadProgress(progress);
      },
    );

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRegions([]);
    setError(null);

    if (!imageUri) {
      setBaseLoading(false);
      return;
    }

    setBaseLoading(true);

    (async () => {
      try {
        const result = await StickerVision.baseMaskAsync(imageUri, options);
        let hitMap: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
        try {
          hitMap = await buildHitMap(result.uri);
        } catch {
          // The base mask can still be shown; it just cannot be toggled off.
        }

        if (!cancelled) {
          setRegions([
            {
              id: "base",
              x: 0,
              y: 0,
              maskUri: result.uri,
              hitMap,
              isBase: true,
            },
          ]);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "自动抠图蒙版读取失败，可以直接点选。",
          );
        }
      } finally {
        if (!cancelled) {
          setBaseLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [imageUri]);

  const addRegion = async (locationX: number, locationY: number) => {
    if (
      !imageUri ||
      stageWidth <= 0 ||
      stageHeight <= 0 ||
      loading ||
      baseLoading
    ) {
      return;
    }

    const point = {
      x: locationX / stageWidth,
      y: locationY / stageHeight,
    };

    const hit = [...regions]
      .reverse()
      .find((region) => isHit(region, point.x, point.y));

    if (hit) {
      setRegions((previous) =>
        previous.filter((region) => region.id !== hit.id),
      );
      return;
    }

    setLoading(true);
    setDownloadProgress(null);
    setError(null);

    try {
      const result = await StickerVision.segmentAtPointAsync(
        imageUri,
        point.x,
        point.y,
      );

      let hitMap: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
      try {
        hitMap = await buildHitMap(result.uri);
      } catch {
        // The mask is still usable for display and application; without a
        // hit map it just cannot be toggled off from the photo.
      }

      setRegions((previous) => [
        ...previous,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          x: point.x,
          y: point.y,
          maskUri: result.uri,
          hitMap,
        },
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "这个位置没有分割出区域，换一个点试试。",
      );
    } finally {
      setLoading(false);
      setDownloadProgress(null);
    }
  };

  const removeRegion = (id: string) => {
    if (loading || applying || baseLoading) {
      return;
    }

    setRegions((previous) => previous.filter((region) => region.id !== id));
  };

  const applyRegions = async () => {
    if (!imageUri || regions.length === 0 || applying || baseLoading) {
      return;
    }

    setApplying(true);
    setError(null);

    try {
      const pointRegions = regions.filter((region) => !region.isBase);
      const includeBase = regions.some((region) => region.isBase);
      const points = pointRegions.map((region) => ({
        x: region.x,
        y: region.y,
        include: true,
      }));

      if (!includeBase && points.length === 0) {
        throw new Error("至少选中一个区域。");
      }

      if (typeof StickerVision.applyPointsAsync !== "function") {
        throw new Error("点选应用需要安装最新开发包。");
      }

      const result = await StickerVision.applyPointsAsync(imageUri, points, {
        ...options,
        includeBase,
      });

      onApplied(result);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "应用选区失败，再试一次。",
      );
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>点选分割</Text>
            <Text style={styles.subtitle}>点空白处选中，点已选区域取消</Text>
          </View>
          <Pressable hitSlop={10} onPress={onClose}>
            <Text style={styles.close}>关闭</Text>
          </Pressable>
        </View>

        <View style={styles.content}>
          {imageUri ? (
            <View
              style={[
                styles.stage,
                {
                  aspectRatio:
                    width > 0 && height > 0 ? width / height : 1,
                },
              ]}
              onLayout={(event) => {
                setStageWidth(event.nativeEvent.layout.width);
                setStageHeight(event.nativeEvent.layout.height);
              }}
            >
              <Image
                source={{ uri: imageUri }}
                style={styles.stageImage}
                resizeMode="stretch"
              />

              {regions.map((region) => (
                <Image
                  key={region.id}
                  source={{ uri: region.maskUri }}
                  style={styles.maskImage}
                  resizeMode="stretch"
                />
              ))}

              <Pressable
                disabled={loading || applying || baseLoading}
                onPress={(event) =>
                  addRegion(
                    event.nativeEvent.locationX,
                    event.nativeEvent.locationY,
                  )
                }
                style={styles.stageTouch}
              />

              {loading ? (
                <View style={styles.busyOverlay}>
                  {downloadProgress !== null ? (
                    <>
                      <Text style={styles.busyText}>
                        首次使用，正在下载系统分割模型
                      </Text>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${Math.round(
                                Math.min(1, Math.max(0, downloadProgress)) *
                                  100,
                              )}%`,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.progressText}>
                        {Math.round(
                          Math.min(1, Math.max(0, downloadProgress)) * 100,
                        )}
                        %
                      </Text>
                    </>
                  ) : (
                    <>
                      <ActivityIndicator color={THEME.colors.accent} />
                      <Text style={styles.busyText}>正在分割…</Text>
                    </>
                  )}
                </View>
              ) : null}

              {baseLoading ? (
                <View style={styles.busyOverlay}>
                  <ActivityIndicator color={THEME.colors.accent} />
                  <Text style={styles.busyText}>正在读取自动抠图…</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={styles.hint}>先选一张照片。</Text>
          )}

          {regions.length > 0 ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>
                已选 {regions.length} 个区域
                {regions.some((region) => region.isBase)
                  ? "（含自动底图）"
                  : ""}
              </Text>
              <Pressable
                hitSlop={8}
                onPress={() => setRegions([])}
                disabled={loading || applying}
              >
                <Text style={styles.clearText}>清空</Text>
              </Pressable>
            </View>
          ) : null}

          {regions.length > 0 ? (
            <Pressable
              disabled={applying || loading}
              onPress={applyRegions}
              style={[
                styles.applyButton,
                applying ? styles.applyButtonDisabled : null,
              ]}
            >
              <Text style={styles.applyText}>
                {applying ? "正在应用到贴纸…" : "应用到贴纸"}
              </Text>
            </Pressable>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.hint}>
            打开时自动抠图已经选中；点它取消，点空白处新增，再点已选区域取消。第一次使用需要联网下载系统模型，之后离线。
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: THEME.spacing.xl,
    paddingTop: THEME.spacing.md,
    paddingBottom: THEME.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: THEME.colors.border,
  },
  title: {
    fontFamily: THEME.fonts.sans,
    fontSize: 22,
    fontWeight: "700",
    color: THEME.colors.primary,
  },
  subtitle: {
    marginTop: 2,
    fontFamily: THEME.fonts.sans,
    fontSize: 13,
    color: THEME.colors.textSecondary,
  },
  close: {
    fontFamily: THEME.fonts.sans,
    fontSize: 15,
    color: THEME.colors.accent,
  },
  content: {
    flex: 1,
    padding: THEME.spacing.xl,
    gap: THEME.spacing.lg,
  },
  stage: {
    width: "100%",
    borderRadius: THEME.radii.lg,
    overflow: "hidden",
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  stageImage: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  maskImage: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.5,
  },
  stageTouch: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
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
    backgroundColor: "rgba(255,255,255,0.78)",
    padding: THEME.spacing.lg,
  },
  busyText: {
    fontFamily: THEME.fonts.sans,
    fontSize: 13,
    textAlign: "center",
    color: THEME.colors.textSecondary,
  },
  progressTrack: {
    width: "80%",
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
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: THEME.spacing.md,
  },
  summaryText: {
    flex: 1,
    fontFamily: THEME.fonts.sans,
    fontSize: 12,
    color: THEME.colors.textSecondary,
  },
  clearText: {
    fontFamily: THEME.fonts.sans,
    fontSize: 12,
    color: THEME.colors.accent,
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
  hint: {
    fontFamily: THEME.fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: THEME.colors.textSecondary,
  },
  applyButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: THEME.spacing.md + 2,
    borderRadius: THEME.radii.lg,
    backgroundColor: THEME.colors.accent,
  },
  applyButtonDisabled: {
    opacity: 0.5,
  },
  applyText: {
    fontFamily: THEME.fonts.sans,
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
});
