import type { CatalogPlant } from '@haruleaf/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '@/api/client';
import { fetchHome, fetchPlants, selectPlantRequest } from '@/api/diary';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/FormMessage';
import { PlantImage } from '@/components/PlantImage';
import { Screen } from '@/components/Screen';
import { useRemoteData } from '@/hooks/useRemoteData';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

function lockedReason(plant: CatalogPlant): string {
  return plant.catalogClass === 'STANDARD' ? '꾸준히 기록하면 해금' : '상점에서 만나요';
}

export default function PlantsScreen() {
  const plants = useRemoteData(fetchPlants);
  const home = useRemoteData(fetchHome);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function choose(plantId: string) {
    if (saving) return;
    setSaving(plantId);
    setMessage(null);
    try {
      await selectPlantRequest({ plantId });
      setSaving(null);
      router.replace('/');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '식물을 고르지 못했어요.');
      setSaving(null);
    }
  }

  const locked = home.state.status === 'ready' && home.state.data.selectionLocked;
  const currentId = home.state.status === 'ready' ? home.state.data.plant?.id : undefined;

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        이번 달 식물 고르기
      </Text>
      {locked && <FormMessage tone="success" message="첫 일기를 써서 이번 달 식물이 정해졌어요." />}
      {message && <FormMessage tone="error" message={message} />}
      {plants.state.status === 'loading' && <Text style={styles.muted}>불러오는 중…</Text>}
      {plants.state.status === 'error' && (
        <>
          <FormMessage tone="error" message={plants.state.message} />
          <Button title="다시 시도" variant="secondary" onPress={plants.reload} />
        </>
      )}
      {plants.state.status === 'ready' && (
        <View style={styles.grid}>
          {plants.state.data.plants.map((plant) => (
            <View key={plant.id} style={[styles.card, !plant.owned && styles.cardLocked]}>
              <PlantImage plantId={plant.id} stage={5} size={96} accessibilityLabel={plant.name} />
              <Text style={styles.name}>{plant.name}</Text>
              <Text style={styles.description}>{plant.description}</Text>
              {plant.owned ? (
                <Button
                  title={plant.id === currentId ? '선택됨' : '이 식물로 할래요'}
                  variant={plant.id === currentId ? 'secondary' : 'primary'}
                  onPress={() => void choose(plant.id)}
                  loading={saving === plant.id}
                  disabled={locked || plant.id === currentId}
                />
              ) : (
                <Text style={styles.lockText}>{lockedReason(plant)}</Text>
              )}
            </View>
          ))}
        </View>
      )}
      <Button title="돌아가기" variant="secondary" onPress={() => router.replace('/')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  muted: { fontSize: fontSize.body, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: {
    flexBasis: 160,
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardLocked: { opacity: 0.6 },
  name: { fontSize: fontSize.body, fontWeight: '700', color: colors.text, textAlign: 'center' },
  description: { fontSize: fontSize.caption, color: colors.textMuted, textAlign: 'center' },
  lockText: { fontSize: fontSize.caption, fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
});
