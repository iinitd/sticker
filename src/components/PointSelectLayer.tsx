import { Image, Pressable, StyleSheet, View } from "react-native";

import type { SelectedRegion } from "@/sticker/pointMask";

type PointSelectLayerProps = {
  left: number;
  top: number;
  width: number;
  height: number;
  regions: SelectedRegion[];
  disabled?: boolean;
  onTap: (x: number, y: number) => void;
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

/**
 * Sits on top of the photo inside the preview card. Masks are drawn in the
 * fitted image rect, and taps are reported as normalized image coordinates.
 */
export function PointSelectLayer({
  left,
  top,
  width,
  height,
  regions,
  disabled,
  onTap,
}: PointSelectLayerProps) {
  if (width <= 0 || height <= 0) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left, top, width, height }}
    >
      {regions.map((region) => (
        <Image
          key={region.id}
          source={{ uri: region.maskUri }}
          style={styles.mask}
          resizeMode="stretch"
        />
      ))}

      <Pressable
        disabled={disabled}
        onPress={(event) => {
          const { locationX, locationY } = event.nativeEvent;
          onTap(clamp01(locationX / width), clamp01(locationY / height));
        }}
        style={styles.touch}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mask: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.45,
  },
  touch: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
});
