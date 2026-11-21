import { useCallback, useState } from "react";
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
import { STICKER_RENDER_OPTIONS } from "@/sticker/options";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setOriginalUri(asset.uri);
    setStickerUri(null);
    setShowOriginal(false);
    setBusy(true);

    try {
      const uri = await StickerVision.makeStickerAsync(asset.uri, {
        ...STICKER_RENDER_OPTIONS,
      });
      setStickerUri(uri);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "处理失败，换一张照片试试。",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const visibleUri = showOriginal ? originalUri : stickerUri;
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

        <View style={styles.preview}>
          <Checkerboard />

          {visibleUri ? (
            <Image
              source={{ uri: visibleUri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.placeholder}>
              <View style={styles.placeholderShape} />
              <Text style={styles.placeholderText}>选一张照片开始</Text>
            </View>
          )}

          {busy ? (
            <View style={styles.busyOverlay}>
              <ActivityIndicator color={THEME.colors.accent} />
              <Text style={styles.busyText}>正在抠图…</Text>
            </View>
          ) : null}
        </View>

        {hasResult ? (
          <View style={styles.segmented}>
            <Pressable
              onPress={() => setShowOriginal(false)}
              style={[
                styles.segment,
                !showOriginal ? styles.segmentActive : null,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  !showOriginal ? styles.segmentTextActive : null,
                ]}
              >
                贴纸
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowOriginal(true)}
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
