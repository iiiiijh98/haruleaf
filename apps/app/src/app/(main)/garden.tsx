import { formatGrowthPercent, type GardenMonth } from '@haruleaf/shared';
import { router, useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { fetchGarden } from '@/api/garden';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/FormMessage';
import { PlantImage } from '@/components/PlantImage';
import { Screen } from '@/components/Screen';
import { useRemoteData } from '@/hooks/useRemoteData';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

type TabNavigation = { addListener(event: 'tabPress', callback: () => void): () => void };

const WIDE_BREAKPOINT = 768;

function statusText(card: GardenMonth): string | null {
  if (card.status === 'CURRENT') return '진행 중';
  if (card.status === 'NO_PLANT') return '식물 없음';
  if (card.status === 'FINALIZED' && card.fullyGrown) return '완전 성장';
  return null;
}

export default function GardenScreen() {
  // null = 서버 기준 올해
  const [year, setYear] = useState<number | null>(null);
  const navigation = useNavigation<TabNavigation>();
  // 탭은 마운트된 채 남으므로, 정원 탭을 직접 누를 때만 올해로 되돌린다.
  useEffect(() => navigation.addListener('tabPress', () => setYear(null)), [navigation]);
  const load = useCallback(() => fetchGarden(year ?? undefined), [year]);
  const { state, reload } = useRemoteData(load);
  const { width } = useWindowDimensions();
  const cardWidth = width >= WIDE_BREAKPOINT ? '23%' : '31%';

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        나의 정원
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
          <View style={styles.yearRow}>
            <YearArrow
              label="이전 해"
              symbol="◀"
              disabled={state.data.year <= state.data.minYear}
              onPress={() => setYear(state.data.year - 1)}
            />
            <Text style={styles.yearLabel}>{state.data.year}년</Text>
            <YearArrow
              label="다음 해"
              symbol="▶"
              disabled={state.data.year >= state.data.maxYear}
              onPress={() => setYear(state.data.year + 1)}
            />
          </View>
          <View style={styles.grid}>
            {state.data.months.map((card) => (
              <MonthCard key={card.month} card={card} width={cardWidth} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

function YearArrow({ label, symbol, disabled, onPress }: { label: string; symbol: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.yearButton, disabled && styles.yearButtonDisabled]}>
      <Text style={styles.yearArrow}>{symbol}</Text>
    </Pressable>
  );
}

function MonthCard({ card, width }: { card: GardenMonth; width: '23%' | '31%' }) {
  const monthNumber = Number(card.month.slice(5, 7));
  const empty = card.status === 'EMPTY';
  const status = statusText(card);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${monthNumber}월${card.plant ? `, ${card.plant.name} ${formatGrowthPercent(card.growthPercent)}%` : ''}`}
      accessibilityState={{ disabled: empty }}
      disabled={empty}
      onPress={() => router.push(`/garden/${card.month}`)}
      style={[styles.card, { width }, empty && styles.cardEmpty, card.status === 'CURRENT' && styles.cardCurrent]}>
      <Text style={styles.cardMonth}>{monthNumber}월</Text>
      {card.plant ? (
        <PlantImage plantId={card.plant.id} stage={card.growthStage} size={64} accessibilityLabel={card.plant.name} />
      ) : (
        <View style={styles.imagePlaceholder} />
      )}
      {card.plant && <Text style={styles.cardPercent}>{formatGrowthPercent(card.growthPercent)}%</Text>}
      {status && <Text style={styles.cardStatus}>{status}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  muted: { fontSize: fontSize.body, color: colors.textMuted },
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  yearButton: { padding: spacing.md },
  yearButtonDisabled: { opacity: 0.3 },
  yearArrow: { fontSize: fontSize.heading, color: colors.primary },
  yearLabel: { fontSize: fontSize.heading, fontWeight: '700', color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardEmpty: { opacity: 0.4 },
  cardCurrent: { borderColor: colors.primary },
  cardMonth: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  imagePlaceholder: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  cardPercent: { fontSize: fontSize.caption, color: colors.text },
  cardStatus: { fontSize: fontSize.caption, fontWeight: '600', color: colors.primary },
});
