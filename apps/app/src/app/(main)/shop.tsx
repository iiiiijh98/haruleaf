import { catalogClassLabel, type ShopItem } from '@haruleaf/shared';
import { router, useIsFocused } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '@/api/client';
import { fetchShop, purchaseRequest } from '@/api/coins';
import { Button } from '@/components/Button';
import { ConfirmModal } from '@/components/ConfirmModal';
import { FormMessage } from '@/components/FormMessage';
import { PlantImage } from '@/components/PlantImage';
import { Screen } from '@/components/Screen';
import { useRemoteData } from '@/hooks/useRemoteData';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

export default function ShopScreen() {
  // 탭 화면은 이동 후에도 남아 있으므로, 다시 들어올 때마다 안내·확인 창을 새로 시작한다.
  const isFocused = useIsFocused();
  return isFocused ? <ShopContent /> : null;
}

function ShopContent() {
  const { state, reload } = useRemoteData(fetchShop);
  const [target, setTarget] = useState<ShopItem | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function confirmPurchase() {
    if (!target || buying) return;
    setBuying(true);
    setBuyError(null);
    try {
      const { plant } = await purchaseRequest({ plantId: target.id });
      setTarget(null);
      setNotice(`${plant.name}을(를) 정원 식구로 맞았어요. 식물 고르기에서 선택할 수 있어요.`);
      reload();
    } catch (error) {
      setBuyError(error instanceof ApiError ? error.message : '구매하지 못했어요.');
      // 다른 기기에서 이미 샀거나 코인을 쓴 경우: 카드와 잔액을 서버 기준으로 맞춘다.
      if (error instanceof ApiError && error.status === 409) reload();
    } finally {
      setBuying(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        상점
      </Text>
      {notice && (
        <>
          <FormMessage tone="success" message={notice} />
          <Button title="식물 고르기로 가기" variant="secondary" onPress={() => router.push('/plants')} />
        </>
      )}
      {state.status === 'loading' && <Text style={styles.muted}>불러오는 중…</Text>}
      {state.status === 'error' && (
        <>
          <FormMessage tone="error" message={state.message} />
          <Button title="다시 시도" variant="secondary" onPress={reload} />
        </>
      )}
      {state.status === 'ready' && (
        <>
          <Text style={styles.balance} accessibilityLabel={`보유 코인 ${state.data.coinBalance}코인`}>
            🪙 {state.data.coinBalance.toLocaleString('ko-KR')}코인
          </Text>
          <Text style={styles.muted}>특별한 식물은 코인으로 만날 수 있어요. 한 번 사면 계속 함께해요.</Text>
          <View style={styles.grid}>
            {state.data.items.map((item) => {
              const shortage = item.coinPrice - state.data.coinBalance;
              return (
                <View key={item.id} style={styles.card}>
                  <Text style={[styles.badge, item.catalogClass === 'SPECIAL' && styles.badgeSpecial]}>{catalogClassLabel(item.catalogClass)}</Text>
                  <PlantImage plantId={item.id} stage={5} size={120} accessibilityLabel={`${item.name} 그림`} />
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.description}>{item.description}</Text>
                  <Text style={styles.price}>🪙 {item.coinPrice.toLocaleString('ko-KR')}코인</Text>
                  {item.owned ? (
                    <Text style={styles.owned}>보유 중</Text>
                  ) : (
                    <>
                      <Button
                        title="구매하기"
                        onPress={() => {
                          setBuyError(null);
                          setTarget(item);
                        }}
                        disabled={shortage > 0}
                      />
                      {shortage > 0 && <Text style={styles.shortage}>{shortage.toLocaleString('ko-KR')}코인 더 필요해요</Text>}
                    </>
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}
      <ConfirmModal
        visible={target !== null}
        title={target ? `${target.name}을(를) 살까요?` : ''}
        description={target ? `${target.coinPrice.toLocaleString('ko-KR')}코인이 차감돼요. 산 식물은 계정에 영구 보관돼요.` : ''}
        confirmLabel="구매"
        onConfirm={() => void confirmPurchase()}
        onCancel={() => {
          if (!buying) {
            setTarget(null);
            setBuyError(null);
          }
        }}
        loading={buying}>
        {buyError && <FormMessage tone="error" message={buyError} />}
      </ConfirmModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  muted: { fontSize: fontSize.body, color: colors.textMuted },
  balance: { fontSize: fontSize.heading, fontWeight: '700', color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: {
    flexBasis: 220,
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  badge: {
    alignSelf: 'flex-start',
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.surface,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  badgeSpecial: { backgroundColor: colors.danger },
  name: { fontSize: fontSize.body, fontWeight: '700', color: colors.text, textAlign: 'center' },
  description: { fontSize: fontSize.caption, color: colors.textMuted, textAlign: 'center' },
  price: { fontSize: fontSize.body, fontWeight: '600', color: colors.text, textAlign: 'center' },
  owned: { fontSize: fontSize.body, fontWeight: '700', color: colors.primary, textAlign: 'center' },
  shortage: { fontSize: fontSize.caption, color: colors.textMuted, textAlign: 'center' },
});
