import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { THEME } from "@/theme";

export default function Index() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>Sticker</Text>
        <Text style={styles.caption}>从 src/app/index.tsx 开始</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: THEME.spacing.sm,
  },
  title: {
    fontFamily: THEME.fonts.sans,
    fontSize: 32,
    fontWeight: "600",
    color: THEME.colors.primary,
  },
  caption: {
    fontFamily: THEME.fonts.sans,
    fontSize: 14,
    color: THEME.colors.textSecondary,
  },
});
