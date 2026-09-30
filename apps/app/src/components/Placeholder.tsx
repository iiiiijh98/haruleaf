import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors, fontSize } from '@/theme/tokens';
import { Screen } from './Screen';

/** 기능 구현 전 자리표시 화면 */
export function Placeholder({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.description}>{description}</Text>
      {children}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  description: { fontSize: fontSize.body, color: colors.textMuted, lineHeight: 24 },
});
