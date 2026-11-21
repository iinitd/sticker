import { useState } from "react";
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

import StickerVision from "@modules/sticker-vision";
import { THEME } from "@/theme";

type PointSegmentPickerProps = {
  visible: boolean;
  imageUri: string | null;
  width: number;
  height: number;
  onClose: () => void;
};

export function PointSegmentPicker({
  visible,
  imageUri,
  width,
  height,
  onClose,
}: PointSegmentPickerProps) {
  const [maskUri, setMaskUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stageWidth, setStageWidth] = useState(0);
  const [stageHeight, setStageHeight] = useState(0);

  const onTap = async (locationX: number, locationY: number) => {
    if (!imageUri || stageWidth <= 0 || stageHeight <= 0 || loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setMaskUri(null);

    try {
      const result = await StickerVision.segmentAtPointAsync(
        imageUri,
        locationX / stageWidth,
        locationY / stageHeight,
      );
      setMaskUri(result.uri);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "这个位置没有分割出区域，换一个点试试。",
      );
    } finally {
      setLoading(false);
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
            <Text style={styles.subtitle}>点一下要补回的位置</Text>
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
              {maskUri ? (
                <Image
                  source={{ uri: maskUri }}
                  style={styles.maskImage}
                  resizeMode="stretch"
                />
              ) : null}
              <Pressable
                disabled={loading}
                onPress={(event) =>
                  onTap(
                    event.nativeEvent.locationX,
                    event.nativeEvent.locationY,
                  )
                }
                style={styles.stageTouch}
              />
              {loading ? (
                <View style={styles.busyOverlay}>
                  <ActivityIndicator color={THEME.colors.accent} />
                  <Text style={styles.busyText}>
                    正在分割，第一次会下载系统模型…
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={styles.hint}>先选一张照片。</Text>
          )}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.hint}>
            这是 Apple Vision 的点击分割，按对象的边缘出蒙版。第一次使用需要联网下载系统模型，之后离线。
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
    opacity: 0.55,
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
});
