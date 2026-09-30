import type { HealthResponse } from '@haruleaf/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { API_URL, ApiError } from '@/api/client';
import { getHealth } from '@/api/health';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; health: HealthResponse }
  | { kind: 'error'; message: string };

/** 서버·DB 연결 상태 표시(개발 확인용). */
export function ServerStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    getHealth()
      .then((health) => active && setState({ kind: 'ok', health }))
      .catch((error: unknown) =>
        active && setState({ kind: 'error', message: error instanceof ApiError ? error.message : '알 수 없는 오류' }),
      );
    return () => {
      active = false;
    };
  }, []);

  const ok = state.kind === 'ok';
  return (
    <View style={[styles.box, ok ? styles.ok : state.kind === 'error' ? styles.error : null]} accessibilityRole="summary">
      <Text style={styles.title}>
        {state.kind === 'loading' ? '서버 확인 중…' : ok ? '서버 연결 정상' : '서버 연결 실패'}
      </Text>
      {state.kind === 'ok' && <Text style={styles.detail}>서버 기준 오늘: {state.health.today}</Text>}
      {state.kind === 'error' && <Text style={styles.detail}>{state.message}</Text>}
      <Text style={styles.detail}>API: {API_URL}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  ok: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  error: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  title: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  detail: { fontSize: fontSize.caption, color: colors.textMuted },
});
