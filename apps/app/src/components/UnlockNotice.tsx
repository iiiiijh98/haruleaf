import { formatMonthLabel, type UnlockNotice as Notice } from '@haruleaf/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '@/api/client';
import { ackUnlocksRequest } from '@/api/garden';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';
import { Button } from './Button';
import { FormMessage } from './FormMessage';

type Props = { unlocks: Notice[]; onDone: () => void };

/** 월 마감으로 해금된 식물 안내(확인 전까지 홈에 표시). 확인 여부는 서버에 저장한다. */
export function UnlockNotice({ unlocks, onDone }: Props) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 탭은 마운트된 채 남으므로 화면을 떠나면 이전 오류 문구를 지운다.
  useFocusEffect(useCallback(() => () => setMessage(null), []));

  async function acknowledge() {
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      await ackUnlocksRequest({ months: unlocks.map((unlock) => unlock.month) });
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '확인하지 못했어요.');
    } finally {
      setPending(false);
      onDone();
    }
  }

  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.title}>새 식물이 정원에 왔어요</Text>
      {unlocks.map((unlock) => (
        <Text key={unlock.month} style={styles.line}>
          {formatMonthLabel(unlock.month)} 기록으로 {unlock.plant.name}을(를) 정원 식구로 맞았어요.
        </Text>
      ))}
      {message && <FormMessage tone="error" message={message} />}
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button title="확인" onPress={() => void acknowledge()} loading={pending} />
        </View>
        <View style={styles.action}>
          <Button title="식물 고르기" variant="secondary" onPress={() => router.push('/plants')} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { fontSize: fontSize.heading, fontWeight: '700', color: colors.text },
  line: { fontSize: fontSize.body, color: colors.text },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
});
