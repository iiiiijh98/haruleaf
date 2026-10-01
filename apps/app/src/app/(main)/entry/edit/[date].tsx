import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text } from 'react-native';
import { fetchDiary } from '@/api/diary';
import { Button } from '@/components/Button';
import { DiaryEditor } from '@/components/DiaryEditor';
import { FormMessage } from '@/components/FormMessage';
import { Screen } from '@/components/Screen';
import { useRemoteData } from '@/hooks/useRemoteData';
import { colors, fontSize } from '@/theme/tokens';

// 탭 화면은 이동 후에도 마운트된 채 남으므로, 포커스가 없을 땐 내용을 비워 매 방문을 새로 시작한다.
export default function DiaryEditScreen() {
  const isFocused = useIsFocused();
  return isFocused ? <DiaryEditContent /> : null;
}

function DiaryEditContent() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const load = useCallback(() => fetchDiary(date), [date]);
  const { state } = useRemoteData(load);
  if (state.status === 'loading') {
    return (
      <Screen>
        <Text style={styles.muted}>불러오는 중…</Text>
      </Screen>
    );
  }
  if (state.status === 'error') {
    return (
      <Screen>
        <FormMessage tone="error" message={state.message} />
        <Button title="돌아가기" variant="secondary" onPress={() => router.replace('/diary')} />
      </Screen>
    );
  }
  return <DiaryEditor key={date} initialBody={state.data.diary.body} mode={{ kind: 'edit', date }} />;
}

const styles = StyleSheet.create({
  muted: { fontSize: fontSize.body, color: colors.textMuted },
});
