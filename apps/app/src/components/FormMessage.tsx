import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

export function FormMessage({ tone, message }: { tone: 'error' | 'success'; message: string }) {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.box, tone === 'error' ? styles.error : styles.success]}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  error: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  success: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  text: { fontSize: fontSize.body, color: colors.text },
});
