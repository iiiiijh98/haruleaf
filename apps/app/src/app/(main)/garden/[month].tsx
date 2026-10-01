import { formatGrowthPercent, formatMonthLabel, type DiaryEntry } from '@haruleaf/shared';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchDiaries } from '@/api/diary';
import { fetchGardenMonth } from '@/api/garden';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/FormMessage';
import { PlantImage } from '@/components/PlantImage';
import { Screen } from '@/components/Screen';
import { useRemoteData } from '@/hooks/useRemoteData';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

function firstLine(body: string): string {
  const line = body.split('\n')[0] ?? '';
  return line.length > 40 ? `${line.slice(0, 40)}…` : line;
}

// 탭 화면은 이동 후에도 마운트된 채 남으므로, 포커스가 없을 땐 내용을 비워 지난 달 파라미터가 남지 않게 한다.
export default function GardenMonthScreen() {
  const isFocused = useIsFocused();
  return isFocused ? <GardenMonthContent /> : null;
}

function GardenMonthContent() {
  const { month } = useLocalSearchParams<{ month: string }>();
  const loadCard = useCallback(() => fetchGardenMonth(month), [month]);
  const loadDiaries = useCallback(() => fetchDiaries(month), [month]);
  const card = useRemoteData(loadCard);
  const list = useRemoteData(loadDiaries);

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        {formatMonthLabel(month)}
      </Text>
      {card.state.status === 'loading' && <Text style={styles.muted}>불러오는 중…</Text>}
      {card.state.status === 'error' && (
        <>
          <FormMessage tone="error" message={card.state.message} />
          <Button title="다시 시도" variant="secondary" onPress={card.reload} />
        </>
      )}
      {card.state.status === 'ready' && (
        <View style={styles.card}>
          {card.state.data.month.status !== 'CURRENT' && <Text style={styles.badge}>읽기 전용</Text>}
          {card.state.data.month.plant ? (
            <>
              <PlantImage
                plantId={card.state.data.month.plant.id}
                stage={card.state.data.month.growthStage}
                size={200}
                accessibilityLabel={`${card.state.data.month.plant.name}, 성장 ${card.state.data.month.growthStage}단계`}
              />
              <Text style={styles.plantName}>{card.state.data.month.plant.name}</Text>
              <Text style={styles.progress}>
                {formatGrowthPercent(card.state.data.month.growthPercent)}% · {card.state.data.month.writtenDays}/
                {card.state.data.month.totalDays}일
              </Text>
              {card.state.data.month.fullyGrown && <Text style={styles.grown}>완전히 자랐어요!</Text>}
            </>
          ) : (
            <Text style={styles.muted}>이 달에는 식물을 고르지 않았어요.</Text>
          )}
          {card.state.data.month.unlockedPlant && (
            <Text style={styles.unlock}>이 달 기록으로 {card.state.data.month.unlockedPlant.name}을(를) 정원 식구로 맞았어요.</Text>
          )}
        </View>
      )}
      <Text style={styles.section}>이 달의 일기</Text>
      {list.state.status === 'error' && <FormMessage tone="error" message={list.state.message} />}
      {list.state.status === 'ready' &&
        (list.state.data.diaries.length === 0 ? (
          <Text style={styles.muted}>이 달에 쓴 일기가 없어요.</Text>
        ) : (
          list.state.data.diaries.map((diary: DiaryEntry) => (
            <Pressable
              key={diary.date}
              accessibilityRole="button"
              accessibilityLabel={`${Number(diary.date.slice(8, 10))}일 일기`}
              onPress={() => router.push(`/entry/${diary.date}`)}
              style={styles.item}>
              <Text style={styles.itemDate}>{Number(diary.date.slice(8, 10))}일</Text>
              <Text style={styles.itemPreview}>{firstLine(diary.body)}</Text>
            </Pressable>
          ))
        ))}
      <Button title="정원으로" variant="secondary" onPress={() => router.navigate('/garden')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  muted: { fontSize: fontSize.body, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  badge: {
    alignSelf: 'flex-start',
    fontSize: fontSize.caption,
    color: colors.textMuted,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  plantName: { fontSize: fontSize.heading, fontWeight: '700', color: colors.text, textAlign: 'center' },
  progress: { fontSize: fontSize.body, color: colors.text, textAlign: 'center' },
  grown: { fontSize: fontSize.body, fontWeight: '700', color: colors.primary, textAlign: 'center' },
  unlock: { fontSize: fontSize.body, color: colors.primary, textAlign: 'center' },
  section: { fontSize: fontSize.heading, fontWeight: '700', color: colors.text },
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
