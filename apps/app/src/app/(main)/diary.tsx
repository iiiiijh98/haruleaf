import { formatMonthLabel, shiftMonth, type DiaryEntry } from '@haruleaf/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchDiaries } from '@/api/diary';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/FormMessage';
import { Screen } from '@/components/Screen';
import { useRemoteData } from '@/hooks/useRemoteData';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

function firstLine(body: string): string {
  const line = body.split('\n')[0] ?? '';
  return line.length > 40 ? `${line.slice(0, 40)}…` : line;
}

function dayLabel(date: string): string {
  return `${Number(date.slice(8, 10))}일`;
}

export default function DiaryListScreen() {
  // null = 서버 기준 이번 달
  const [month, setMonth] = useState<string | null>(null);
  // 탭은 마운트된 채 남으므로, 포커스를 잃을 때(cleanup) 이번 달로 되돌린다.
  useFocusEffect(useCallback(() => () => setMonth(null), []));
  const load = useCallback(() => fetchDiaries(month ?? undefined), [month]);
  const { state, reload } = useRemoteData(load);

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        일기
      </Text>
      {state.status === 'loading' && <Text style={styles.muted}>불러오는 중…</Text>}
      {state.status === 'error' && (
        <>
          <FormMessage tone="error" message={state.message} />
          <Button title="다시 시도" variant="secondary" onPress={reload} />
        </>
      )}
      {state.status === 'ready' && (
        <>
          <View style={styles.monthRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="이전 달"
              onPress={() => setMonth(shiftMonth(state.data.month, -1))}
              style={styles.monthButton}>
              <Text style={styles.monthArrow}>◀</Text>
            </Pressable>
            <Text style={styles.monthLabel}>{formatMonthLabel(state.data.month)}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="다음 달"
              accessibilityState={{ disabled: state.data.editable }}
              disabled={state.data.editable}
              onPress={() => setMonth(shiftMonth(state.data.month, 1))}
              style={[styles.monthButton, state.data.editable && styles.monthButtonDisabled]}>
              <Text style={styles.monthArrow}>▶</Text>
            </Pressable>
          </View>
          {!state.data.editable && <Text style={styles.badge}>읽기 전용</Text>}
          {state.data.editable && !state.data.diaries.some((diary) => diary.date === state.data.today) && (
            <Button title="오늘 일기 쓰기" onPress={() => router.push('/entry/write')} />
          )}
          {state.data.diaries.length === 0 ? (
            <Text style={styles.muted}>이 달에 쓴 일기가 없어요.</Text>
          ) : (
            state.data.diaries.map((diary: DiaryEntry) => (
              <Pressable
                key={diary.date}
                accessibilityRole="button"
                accessibilityLabel={`${dayLabel(diary.date)} 일기`}
                onPress={() => router.push(`/entry/${diary.date}`)}
                style={styles.item}>
                <Text style={styles.itemDate}>{dayLabel(diary.date)}</Text>
                <Text style={styles.itemPreview}>{firstLine(diary.body)}</Text>
              </Pressable>
            ))
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  muted: { fontSize: fontSize.body, color: colors.textMuted },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: { padding: spacing.md },
  monthButtonDisabled: { opacity: 0.3 },
  monthArrow: { fontSize: fontSize.heading, color: colors.primary },
  monthLabel: { fontSize: fontSize.heading, fontWeight: '700', color: colors.text },
  badge: {
    alignSelf: 'flex-start',
    fontSize: fontSize.caption,
    color: colors.textMuted,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  item: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  itemDate: { fontSize: fontSize.caption, fontWeight: '700', color: colors.primary },
  itemPreview: { fontSize: fontSize.body, color: colors.text },
});
