import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '@/api/client';
import { deleteDiaryRequest, fetchDiary } from '@/api/diary';
import { Button } from '@/components/Button';
import { ConfirmModal } from '@/components/ConfirmModal';
import { FormMessage } from '@/components/FormMessage';
import { Screen } from '@/components/Screen';
import { useRemoteData } from '@/hooks/useRemoteData';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

function dateLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

// 탭 화면은 이동 후에도 마운트된 채 남으므로, 포커스가 없을 땐 내용을 비워 매 방문을 새로 시작한다.
export default function DiaryDetailScreen() {
  const isFocused = useIsFocused();
  return isFocused ? <DiaryDetailContent /> : null;
}

function DiaryDetailContent() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const load = useCallback(() => fetchDiary(date), [date]);
  const { state, reload } = useRemoteData(load);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteDiaryRequest(date);
      setConfirmOpen(false);
      router.replace('/diary');
    } catch (error) {
      setDeleteError(error instanceof ApiError ? error.message : '삭제하지 못했어요.');
      setDeleting(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        {dateLabel(date)}
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
          {!state.data.editable && <Text style={styles.badge}>지난달 기록은 읽기 전용이에요.</Text>}
          <View style={styles.bodyCard}>
            <Text style={styles.body}>{state.data.diary.body}</Text>
          </View>
          {state.data.editable && (
            <>
              <Button title="고치기" onPress={() => router.push(`/entry/write?date=${date}`)} />
              <Button title="삭제" variant="danger" onPress={() => setConfirmOpen(true)} />
            </>
          )}
        </>
      )}
      <Button title="목록으로" variant="secondary" onPress={() => router.replace('/diary')} />
      <ConfirmModal
        visible={confirmOpen}
        title="이 일기를 지울까요?"
        description="지우면 이번 달 작성일수와 성장률이 줄어요. 식물은 그대로 유지돼요."
        confirmLabel="삭제"
        confirmVariant="danger"
        onConfirm={() => void remove()}
        onCancel={() => {
          if (!deleting) {
            setConfirmOpen(false);
            setDeleteError(null);
          }
        }}
        loading={deleting}>
        {deleteError && <FormMessage tone="error" message={deleteError} />}
      </ConfirmModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  muted: { fontSize: fontSize.body, color: colors.textMuted },
  badge: {
    alignSelf: 'flex-start',
    fontSize: fontSize.caption,
    color: colors.textMuted,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  bodyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  body: { fontSize: fontSize.body, lineHeight: 26, color: colors.text },
});
