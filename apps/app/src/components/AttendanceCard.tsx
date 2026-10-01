import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '@/api/client';
import { attendRequest } from '@/api/coins';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';
import { Button } from './Button';
import { FormMessage } from './FormMessage';

type Props = { coinBalance: number; attendedToday: boolean; onAttended: () => void };

/** 홈 잔액과 오늘 출석 버튼(FR-13·14·20). 결과는 onAttended로 홈을 다시 불러와 반영한다. */
export function AttendanceCard({ coinBalance, attendedToday, onAttended }: Props) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function attend() {
    if (pending || attendedToday) return;
    setPending(true);
    setMessage(null);
    try {
      await attendRequest();
    } catch (error) {
      if (!(error instanceof ApiError && error.code === 'ALREADY_ATTENDED')) {
        setMessage(error instanceof ApiError ? error.message : '출석하지 못했어요.');
      }
    } finally {
      setPending(false);
      onAttended();
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.balance} accessibilityLabel={`보유 코인 ${coinBalance}코인`}>
          🪙 {coinBalance.toLocaleString('ko-KR')}코인
        </Text>
        <View style={styles.action}>
          <Button
            title={attendedToday ? '오늘 출석 완료' : '출석하기'}
            variant={attendedToday ? 'secondary' : 'primary'}
            onPress={() => void attend()}
            loading={pending}
            disabled={attendedToday}
          />
        </View>
      </View>
      {message && <FormMessage tone="error" message={message} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  balance: { fontSize: fontSize.heading, fontWeight: '700', color: colors.text },
  action: { minWidth: 140 },
});
