import { StyleSheet, Text } from 'react-native';
import { useCurrentUser } from '@/auth/AuthProvider';
import { Screen } from '@/components/Screen';
import { colors, fontSize } from '@/theme/tokens';

export default function HomeScreen() {
  const user = useCurrentUser();
  if (!user) return null;
  return (
    <Screen>
      <Text style={styles.greeting} accessibilityRole="header">
        {user.nickname}님 오늘도 한 잎을 남겨볼까요?
      </Text>
      <Text style={styles.note}>이번 달 식물과 성장률은 4단계에서 이곳에 표시됩니다.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: { fontSize: fontSize.title, fontWeight: '700', color: colors.text, lineHeight: 36 },
  note: { fontSize: fontSize.body, color: colors.textMuted },
});
