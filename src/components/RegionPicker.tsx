import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { base64ToBytes, bytesToBase64 } from "@/lib/base64";
import {
  buildBasePng,
  buildMaskPng,
  buildOverlayPng,
  decodeImage,
  downsampleImage,
  segmentRegions,
  type RegionStage,
} from "@/lib/regions";
import { THEME } from "@/theme";

type RegionPickerProps = {
  visible: boolean;
  imageBase64: string | null;
  onClose: () => void;
};

type StageState = {
  stage: RegionStage;
  baseUri: string;
  overlayUri: string;
};

function pngDataUri(bytes: Uint8Array): string {
  return `data:image/png;base64,${bytesToBase64(bytes)}`;
}

export function RegionPicker({
  visible,
  imageBase64,
  onClose,
}: RegionPickerProps) {
  const [stageState, setStageState] = useState<StageState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [maskUri, setMaskUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stageWidth, setStageWidth] = useState(0);
  const [stageHeight, setStageHeight] = useState(0);

  useEffect(() => {
    if (!visible || !imageBase64) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setStageState(null);
    setSelectedIds(new Set());
    setMaskUri(null);

    (async () => {
      try {
        const decoded = decodeImage(base64ToBytes(imageBase64));
        const small = downsampleImage(decoded, 480);
        const stage = segmentRegions(small);
        const baseUri = pngDataUri(buildBasePng(small));
        const overlayUri = pngDataUri(buildOverlayPng(stage, new Set()));

        if (!cancelled) {
          setStageState({ stage, baseUri, overlayUri });
        }
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "色块计算失败，换一张 JPEG/PNG 试试。",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, imageBase64]);

  const onTap = async (locationX: number, locationY: number) => {
    if (
      !stageState ||
      stageWidth <= 0 ||
      stageHeight <= 0 ||
      loading
    ) {
      return;
    }

    const { stage } = stageState;
    const x = Math.floor((locationX / stageWidth) * stage.width);
    const y = Math.floor((locationY / stageHeight) * stage.height);

    if (x < 0 || y < 0 || x >= stage.width || y >= stage.height) {
      return;
    }

    const id = stage.labels[y * stage.width + x];
    const next = new Set(selectedIds);

    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }

    setSelectedIds(next);

    const overlayUri = pngDataUri(buildOverlayPng(stage, next));
    const nextMaskUri =
      next.size > 0 ? pngDataUri(buildMaskPng(stage, next)) : null;

    setStageState({ ...stageState, overlayUri });
    setMaskUri(nextMaskUri);
  };

  const selectedArea = stageState
    ? [...selectedIds].reduce(
        (total, id) => total + (stageState.stage.regions[id]?.area ?? 0),
        0,
      )
    : 0;

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
            <Text style={styles.title}>色块选区</Text>
            <Text style={styles.subtitle}>点色块加入或取消</Text>
          </View>
          <Pressable hitSlop={10} onPress={onClose}>
            <Text style={styles.close}>关闭</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color={THEME.colors.accent} />
              <Text style={styles.hint}>正在算色块，可能需要几秒…</Text>
            </View>
          ) : error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : !imageBase64 ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                没有拿到图片数据，重新选一张照片试试。
              </Text>
            </View>
          ) : stageState ? (
            <>
              <View
                style={[
                  styles.stage,
                  {
                    aspectRatio:
                      stageState.stage.width / stageState.stage.height,
                  },
                ]}
                onLayout={(event) => {
                  setStageWidth(event.nativeEvent.layout.width);
                  setStageHeight(event.nativeEvent.layout.height);
                }}
              >
                <Image
                  source={{ uri: stageState.baseUri }}
                  style={styles.stageImage}
                  resizeMode="stretch"
                />
                <Image
                  source={{ uri: stageState.overlayUri }}
                  style={styles.stageImage}
                  resizeMode="stretch"
                />
                <Pressable
                  onPress={(event) =>
                    onTap(
                      event.nativeEvent.locationX,
                      event.nativeEvent.locationY,
                    )
                  }
                  style={styles.stageTouch}
                />
              </View>

              <View style={styles.summary}>
                <Text style={styles.summaryText}>
                  {selectedIds.size > 0
                    ? `已选 ${selectedIds.size} 块 · ${selectedArea} px`
                    : "还没选区域"}
                </Text>
                {selectedIds.size > 0 ? (
                  <Pressable
                    hitSlop={8}
                    onPress={() => {
                      if (!stageState) {
                        return;
                      }
                      const empty = new Set<number>();
                      setSelectedIds(empty);
                      setMaskUri(null);
                      setStageState({
                        ...stageState,
                        overlayUri: pngDataUri(
                          buildOverlayPng(stageState.stage, empty),
                        ),
                      });
                    }}
                  >
                    <Text style={styles.clear}>清空</Text>
                  </Pressable>
                ) : null}
              </View>

              {maskUri ? (
                <View style={styles.maskRow}>
                  <View style={styles.maskBox}>
                    <Image
                      source={{ uri: maskUri }}
                      style={styles.maskImage}
                      resizeMode="contain"
                    />
                  </View>
                  <View style={styles.maskCopy}>
                    <Text style={styles.maskTitle}>选中区域</Text>
                    <Text style={styles.hint}>
                      白色部分是这次选中的色块。先看手有没有被单独分出来。
                    </Text>
                  </View>
                </View>
              ) : null}

              <Text style={styles.note}>
                色块按颜色相似度 + 连通区域计算。手和背景颜色接近时，它们可能落在同一块里。
                这只是验证，还没把选区合成到贴纸。
              </Text>
            </>
          ) : null}
        </ScrollView>
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
    padding: THEME.spacing.xl,
    gap: THEME.spacing.lg,
  },
  centerBox: {
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
    gap: THEME.spacing.md,
  },
  hint: {
    fontFamily: THEME.fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: THEME.colors.textSecondary,
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
  stageTouch: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryText: {
    fontFamily: THEME.fonts.sans,
    fontSize: 13,
    color: THEME.colors.textSecondary,
  },
  clear: {
    fontFamily: THEME.fonts.sans,
    fontSize: 13,
    color: THEME.colors.accent,
  },
  maskRow: {
    flexDirection: "row",
    gap: THEME.spacing.lg,
    alignItems: "center",
  },
  maskBox: {
    width: 132,
    height: 132,
    borderRadius: THEME.radii.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
    overflow: "hidden",
  },
  maskImage: {
    width: "100%",
    height: "100%",
  },
  maskCopy: {
    flex: 1,
    gap: THEME.spacing.xs,
  },
  maskTitle: {
    fontFamily: THEME.fonts.sans,
    fontSize: 14,
    fontWeight: "600",
    color: THEME.colors.primary,
  },
  note: {
    fontFamily: THEME.fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: THEME.colors.textMuted,
  },
});
