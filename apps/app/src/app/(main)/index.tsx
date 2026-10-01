import { formatGrowthPercent, formatMonthLabel, type HomeResponse } from '@haruleaf/shared';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { fetchHome } from '@/api/diary';
import { useCurrentUser } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/FormMessage';
import { PlantImage } from '@/components/PlantImage';
import { ProgressBar } from '@/components/ProgressBar';
import { Screen } from '@/components/Screen';
import { useRemoteData } from '@/hooks/useRemoteData';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

export default function HomeScreen() {
  const user = useCurrentUser();
  const { state, reload } = useRemoteData(fetchHome);
  if (!user) return null;
  return (
    <Screen>
      <Text style={styles.greeting} accessibilityRole="header">
        {user.nickname}님 오늘도 한 잎을 남겨볼까요?
      </Text>
      {state.status === 'loading' && <Text style={styles.muted}>불러오는 중…</Text>}
      {state.status === 'error' && (
        <>
          <FormMessage tone="error" message={state.message} />
          <Button title="다시 시도" variant="secondary" onPress={reload} />
        </>
      )}
      {state.status === 'ready' && <HomeBody home={state.data} />}
    </Screen>
  );
}

function HomeBody({ home }: { home: HomeResponse }) {
  if (!home.plant) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>이번 달 키울 식물을 골라주세요</Text>
        <Text style={styles.muted}>{formatMonthLabel(home.month)} 한 달 동안 일기를 쓴 만큼 자라요.</Text>
        <Button title="식물 고르기" onPress={() => router.push('/plants')} />
      </View>
    );
  }
  const percent = formatGrowthPercent(home.growthPercent);
  return (
    <View style={styles.card}>
      <Text style={styles.muted}>{formatMonthLabel(home.month)}의 식물</Text>
      <PlantImage
        plantId={home.plant.id}
        stage={home.growthStage}
        size={220}
        accessibilityLabel={`${home.plant.name}, 성장 ${home.growthStage}단계`}
      />
      <Text style={styles.plantName}>{home.plant.name}</Text>
      <ProgressBar percent={home.growthPercent} />
      <Text style={styles.progressText}>
        {percent}% · {home.writtenDays}/{home.totalDays}일
      </Text>
      {home.fullyGrown && <Text style={styles.grown}>완전히 자랐어요!</Text>}
      {home.todayDiary ? (
        <Button title="오늘 일기 보기" onPress={() => router.push(`/entry/${home.today}`)} />
      ) : (
        <Button title="오늘 일기 쓰기" onPress={() => router.push('/entry/write')} />
      )}
      {!home.selectionLocked && <Button title="식물 바꾸기" variant="secondary" onPress={() => router.push('/plants')} />}
    </View>
  );
}

const styles = StyleSheet.create({
  greeting: { fontSize: fontSize.title, fontWeight: '700', color: colors.text, lineHeight: 36 },
  muted: { fontSize: fontSize.body, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  cardTitle: { fontSize: fontSize.heading, fontWeight: '700', color: colors.text },
  plantName: { fontSize: fontSize.heading, fontWeight: '700', color: colors.text, textAlign: 'center' },
  progressText: { fontSize: fontSize.body, color: colors.text, textAlign: 'center' },
  grown: { fontSize: fontSize.body, fontWeight: '700', color: colors.primary, textAlign: 'center' },
});
