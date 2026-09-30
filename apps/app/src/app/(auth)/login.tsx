import { loginSchema } from '@haruleaf/shared';
import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { loginRequest } from '@/api/auth';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/FormMessage';
import { Screen } from '@/components/Screen';
import { ServerStatus } from '@/components/ServerStatus';
import { TextField } from '@/components/TextField';
import { colors, fontSize } from '@/theme/tokens';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    const parsed = loginSchema.safeParse({ loginId, password });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.');
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      await signIn(await loginRequest(parsed.data));
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '로그인하지 못했어요.');
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        하루한잎
      </Text>
      <Text style={styles.subtitle}>오늘의 한 잎을 남기러 오셨군요.</Text>
      {message && <FormMessage tone="error" message={message} />}
      <TextField label="아이디" value={loginId} onChangeText={setLoginId} autoComplete="username" textContentType="username" returnKeyType="next" />
      <TextField
        label="비밀번호"
        value={password}
        onChangeText={setPassword}
        secure
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      <Button title="로그인" onPress={() => void submit()} loading={submitting} />
      <Link href="/signup" style={styles.link}>
        처음이신가요? 회원가입
      </Link>
      {__DEV__ && <ServerStatus />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: fontSize.body, color: colors.textMuted },
  link: { fontSize: fontSize.body, color: colors.primary, fontWeight: '600', textAlign: 'center' },
});
