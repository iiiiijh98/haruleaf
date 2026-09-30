import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', loading = false, disabled = false }: Props) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.base, styles[variant], inactive && styles.inactive, pressed && !inactive && styles.pressed]}>
      <Text style={[styles.text, variant === 'secondary' ? styles.textSecondary : styles.textOnColor]}>
        {loading ? '처리 중…' : title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.border },
  danger: { backgroundColor: colors.danger },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  text: { fontSize: fontSize.body, fontWeight: '600' },
  textOnColor: { color: colors.surface },
  textSecondary: { color: colors.text },
});
