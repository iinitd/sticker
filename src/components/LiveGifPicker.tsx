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
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView } from "react-native-safe-area-context";

import StickerVision, {
  type GifResult,
} from "@modules/sticker-vision";
import type { StickerRenderOptions } from "@/sticker/options";
import { THEME } from "@/theme";

type LiveGifPickerProps = {
  visible: boolean;
  options: StickerRenderOptions;
  onClose: () => void;
};

export function LiveGifPicker({
  visible,
  options,
  onClose,
}: LiveGifPickerProps) {
  const [gif, setGif] = useState<GifResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const pickLivePhoto = async () => {
    if (processing) {
      return;
    }

    setError(null);

    if (
      typeof StickerVision.videoFramesAsync !== "function" ||
      typeof StickerVision.encodeGifAsync !== "function"
    ) {
      setError("Live 动图需要安装最新的开发包。");
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["livePhotos"],
      allowsEditing: false,
      quality: 1,
      selectionLimit: 1,
    });

    if (picked.canceled || !picked.assets[0]) {
      return;
    }

    const pairedVideo = picked.assets[0].pairedVideoAsset;

    if (!pairedVideo) {
      setError("这张不是 Live 图，或者系统没有返回配对视频。");
      return;
    }

    setGif(null);
    setProcessing(true);
    setProgress(null);

    try {
      const frames = await StickerVision.videoFramesAsync(
        pairedVideo.uri,
        8,
        20,
      );

      if (frames.frames.length === 0) {
        throw new Error("没有从 Live 图里取到视频帧。");
      }

      const stickerUris: string[] = [];

      for (let index = 0; index < frames.frames.length; index += 1) {
        setProgress({ current: index + 1, total: frames.frames.length });

        try {
          const raw = await StickerVision.makeStickerAsync(
            frames.frames[index],
            options,
          );
          const uri = typeof raw === "string" ? raw : raw.uri;

          if (uri) {
            stickerUris.push(uri);
          }
        } catch {
          // Skip a frame that has no subject; keep the remaining animation.
        }
      }

      if (stickerUris.length < 2) {
        throw new Error("扣出来的有效帧太少，换一张 Live 图试试。");
      }

      let result = await StickerVision.encodeGifAsync(stickerUris, 8, 240);

      if (result.bytes > 500 * 1024 && stickerUris.length > 10) {
        const reduced = stickerUris.filter((_, index) => index % 2 === 0);
        const smaller = await StickerVision.encodeGifAsync(reduced, 4, 240);

        if (smaller.bytes < result.bytes) {
          result = smaller;
        }
      }

      setGif(result);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Live 动图生成失败。",
      );
    } finally {
      setProcessing(false);
      setProgress(null);
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
            <Text style={styles.title}>Live 动图</Text>
            <Text style={styles.subtitle}>取 Live 图的前 2.5 秒，逐帧抠图</Text>
          </View>
          <Pressable hitSlop={10} onPress={onClose}>
            <Text style={styles.close}>关闭</Text>
          </Pressable>
        </View>

        <View style={styles.content}>
          {gif ? (
            <View style={styles.previewBox}>
              <Image
                source={{ uri: gif.uri }}
                style={styles.preview}
                resizeMode="contain"
              />
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>还没有动图</Text>
              <Text style={styles.hint}>
                从相册选一张 Live 图，系统会取配对视频的前 2.5 秒，逐帧自动抠图，再合成 240×240 GIF。
              </Text>
            </View>
          )}

          {processing ? (
            <View style={styles.processingRow}>
              <ActivityIndicator color={THEME.colors.accent} />
              <Text style={styles.processingText}>
                {progress
                  ? `正在处理 ${progress.current}/${progress.total} 帧…`
                  : "正在读取 Live 图…"}
              </Text>
            </View>
          ) : null}

          {gif ? (
            <View style={styles.resultRow}>
              <Text style={styles.resultText}>
                {gif.width}×{gif.height} · {gif.frames} 帧 ·{" "}
                {(gif.bytes / 1024).toFixed(0)}KB
              </Text>
              {gif.bytes > 500 * 1024 ? (
                <Text style={styles.warning}>超过 500KB，平台会压缩</Text>
              ) : null}
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            disabled={processing}
            onPress={pickLivePhoto}
            style={[
              styles.button,
              processing ? styles.buttonDisabled : null,
            ]}
          >
            <Text style={styles.buttonText}>
              {processing
                ? "处理中…"
                : gif
                  ? "换一张 Live 图"
                  : "选择 Live 图"}
            </Text>
          </Pressable>

          <Text style={styles.hint}>
            当前是逐帧自动分割，没有时序跟踪；主体移动快时边缘会跳。GIF 只影响预览，保存和分享后续再接。
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
  previewBox: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: THEME.radii.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
    overflow: "hidden",
  },
  preview: {
    width: "100%",
    height: "100%",
  },
  emptyBox: {
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
    gap: THEME.spacing.md,
    padding: THEME.spacing.xl,
    borderRadius: THEME.radii.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: THEME.colors.border,
  },
  emptyTitle: {
    fontFamily: THEME.fonts.sans,
    fontSize: 16,
    fontWeight: "600",
    color: THEME.colors.primary,
  },
  processingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: THEME.spacing.sm,
  },
  processingText: {
    fontFamily: THEME.fonts.sans,
    fontSize: 13,
    color: THEME.colors.textSecondary,
  },
  resultRow: {
    gap: THEME.spacing.xs,
  },
  resultText: {
    fontFamily: THEME.fonts.mono,
    fontSize: 12,
    color: THEME.colors.textMuted,
  },
  warning: {
    fontFamily: THEME.fonts.sans,
    fontSize: 12,
    color: THEME.colors.warning,
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
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontFamily: THEME.fonts.sans,
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  hint: {
    fontFamily: THEME.fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: THEME.colors.textSecondary,
  },
});
