import { StyleSheet, Text } from 'react-native';
import { colors, fontSize } from '@/theme/tokens';
import { Button } from './Button';
import { Screen } from './Screen';

export function ServerUnreachable({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        서버에 연결할 수 없어요
      </Text>
      <Text style={styles.description}>{message}</Text>
      <Button title="다시 시도" onPress={onRetry} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  description: { fontSize: fontSize.body, color: colors.textMuted, lineHeight: 24 },
});
