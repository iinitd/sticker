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
};

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
    setRegions([]);
    setError(null);
  }, [imageUri]);

  const addRegion = async (locationX: number, locationY: number) => {
    if (!imageUri || stageWidth <= 0 || stageHeight <= 0 || loading) {
      return;
    }

    const point = {
      x: locationX / stageWidth,
      y: locationY / stageHeight,
    };

    setLoading(true);
    setDownloadProgress(null);
    setError(null);

    try {
      const result = await StickerVision.segmentAtPointAsync(
        imageUri,
        point.x,
        point.y,
      );

      setRegions((previous) => [
        ...previous,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          x: point.x,
          y: point.y,
          maskUri: result.uri,
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
    if (loading || applying) {
      return;
    }

    setRegions((previous) => previous.filter((region) => region.id !== id));
  };

  const applyRegions = async () => {
    if (!imageUri || regions.length === 0 || applying) {
      return;
    }

    setApplying(true);
    setError(null);

    try {
      const points = regions.map((region) => ({
        x: region.x,
        y: region.y,
        include: true,
      }));

      if (
        regions.length > 1 &&
        typeof StickerVision.applyPointsAsync !== "function"
      ) {
        throw new Error("多点应用需要安装最新开发包。");
      }

      const result =
        typeof StickerVision.applyPointsAsync === "function"
          ? await StickerVision.applyPointsAsync(imageUri, points, options)
          : await StickerVision.applyPointAsync(
              imageUri,
              points[0].x,
              points[0].y,
              options,
            );

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
            <Text style={styles.subtitle}>点位置添加区域，点圆点移除</Text>
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
                disabled={loading || applying}
                onPress={(event) =>
                  addRegion(
                    event.nativeEvent.locationX,
                    event.nativeEvent.locationY,
                  )
                }
                style={styles.stageTouch}
              />

              {regions.map((region, index) => (
                <Pressable
                  key={`dot-${region.id}`}
                  disabled={loading || applying}
                  onPress={() => removeRegion(region.id)}
                  style={[
                    styles.seedDot,
                    {
                      left: Math.min(
                        stageWidth - 30,
                        Math.max(0, region.x * stageWidth - 14),
                      ),
                      top: Math.min(
                        stageHeight - 30,
                        Math.max(0, region.y * stageHeight - 14),
                      ),
                    },
                  ]}
                >
                  <Text style={styles.seedText}>{index + 1}</Text>
                </Pressable>
              ))}

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
            </View>
          ) : (
            <Text style={styles.hint}>先选一张照片。</Text>
          )}

          {regions.length > 0 ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>
                已选 {regions.length} 个区域 · 点图上的编号圆点移除
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
            点一下添加一个区域，可以连续点多个；点区域上的编号移除。第一次使用需要联网下载系统模型，之后离线。
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
  seedDot: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.colors.accent,
    borderWidth: 2,
    borderColor: THEME.colors.background,
  },
  seedText: {
    fontFamily: THEME.fonts.sans,
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
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
