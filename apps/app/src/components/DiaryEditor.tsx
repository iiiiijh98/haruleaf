import { DIARY_BODY_MAX, diaryInputSchema } from '@haruleaf/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { ApiError } from '@/api/client';
import { createDiaryRequest, updateDiaryRequest } from '@/api/diary';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/FormMessage';
import { Screen } from '@/components/Screen';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

export type Mode = { kind: 'create' } | { kind: 'edit'; date: string };

export function DiaryEditor({ initialBody, mode }: { initialBody: string; mode: Mode }) {
  const [body, setBody] = useState(initialBody);
  const [message, setMessage] = useState<string | null>(null);
  const [needsPlant, setNeedsPlant] = useState(false);
  const [saving, setSaving] = useState(false);
  const length = Array.from(body).length;

  async function save() {
    if (saving) return;
    const parsed = diaryInputSchema.safeParse({ body });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const { diary } =
        mode.kind === 'create' ? await createDiaryRequest(parsed.data) : await updateDiaryRequest(mode.date, parsed.data);
      router.replace(`/entry/${diary.date}`);
    } catch (error) {
      setNeedsPlant(error instanceof ApiError && error.code === 'PLANT_NOT_SELECTED');
      setMessage(error instanceof ApiError ? error.message : '저장하지 못했어요.');
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        {mode.kind === 'create' ? '오늘 일기 쓰기' : '일기 고치기'}
      </Text>
      {message && <FormMessage tone="error" message={message} />}
      {needsPlant && <Button title="식물 고르러 가기" variant="secondary" onPress={() => router.push('/plants')} />}
      <TextInput
        style={styles.input}
        value={body}
        onChangeText={(value) => {
          setBody(value);
          setMessage(null);
        }}
        multiline
        textAlignVertical="top"
        placeholder="오늘 하루는 어땠나요?"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="일기 본문"
        autoFocus={mode.kind === 'create'}
      />
      <Text style={[styles.count, length > DIARY_BODY_MAX && styles.countOver]}>
        {length.toLocaleString('ko-KR')}/{DIARY_BODY_MAX.toLocaleString('ko-KR')}
      </Text>
      <Button title="저장" onPress={() => void save()} loading={saving} />
      <Button title="취소" variant="secondary" onPress={() => router.back()} disabled={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  input: {
    minHeight: 240,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    fontSize: fontSize.body,
    lineHeight: 24,
    color: colors.text,
  },
  count: { fontSize: fontSize.caption, color: colors.textMuted, textAlign: 'right' },
  countOver: { color: colors.danger },
});
