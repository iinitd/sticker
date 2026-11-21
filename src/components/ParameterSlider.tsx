import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";

import { THEME } from "@/theme";

type ParameterSliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatValue: (value: number) => string;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
  disabled?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function ParameterSlider({
  label,
  value,
  min,
  max,
  step,
  formatValue,
  onChange,
  onCommit,
  disabled = false,
}: ParameterSliderProps) {
  const latestValue = useRef(value);
  const widthRef = useRef(0);

  useEffect(() => {
    latestValue.current = value;
  }, [value]);

  const setFromX = (x: number) => {
    if (widthRef.current <= 0 || disabled) {
      return;
    }

    const ratio = clamp(x / widthRef.current, 0, 1);
    const raw = min + ratio * (max - min);
    const next = clamp(Math.round(raw / step) * step, min, max);

    latestValue.current = next;
    onChange(next);
  };

  const position = clamp((value - min) / (max - min), 0, 1) * 100;

  return (
    <View style={[styles.container, disabled ? styles.disabled : null]}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{formatValue(value)}</Text>
      </View>

      <View
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: formatValue(value) }}
        onLayout={(event) => {
          widthRef.current = event.nativeEvent.layout.width;
        }}
        onStartShouldSetResponder={() => !disabled}
        onMoveShouldSetResponder={() => !disabled}
        onResponderGrant={(event) => setFromX(event.nativeEvent.locationX)}
        onResponderMove={(event) => setFromX(event.nativeEvent.locationX)}
        onResponderRelease={() => onCommit(latestValue.current)}
        onResponderTerminate={() => onCommit(latestValue.current)}
        onResponderTerminationRequest={() => false}
        style={styles.trackTouch}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${position}%` }]} />
        </View>
        <View style={[styles.thumb, { left: `${position}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: THEME.spacing.xs,
  },
  disabled: {
    opacity: 0.45,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontFamily: THEME.fonts.sans,
    fontSize: 13,
    color: THEME.colors.textSecondary,
  },
  value: {
    fontFamily: THEME.fonts.mono,
    fontSize: 12,
    color: THEME.colors.textMuted,
  },
  trackTouch: {
    height: 32,
    justifyContent: "center",
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: THEME.colors.surface,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: THEME.colors.accent,
  },
  thumb: {
    position: "absolute",
    width: 18,
    height: 18,
    marginLeft: -9,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: THEME.colors.background,
    backgroundColor: THEME.colors.accent,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
});
