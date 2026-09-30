import { firstIssueByField, PASSWORD_RULE_HELP, signupSchema } from '@haruleaf/shared';
import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { signupRequest } from '@/api/auth';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/FormMessage';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { colors, fontSize } from '@/theme/tokens';

type Field = 'loginId' | 'password' | 'nickname';

export default function SignupScreen() {
  const { signIn } = useAuth();
  const [values, setValues] = useState<Record<Field, string>>({ loginId: '', password: '', nickname: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const change = (field: Field) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  async function submit() {
    if (submitting) return;
    const parsed = signupSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(firstIssueByField(parsed.error));
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      await signIn(await signupRequest(parsed.data));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'LOGIN_ID_TAKEN') {
        setErrors({ loginId: error.message });
      } else {
        setMessage(error instanceof ApiError ? error.message : '가입하지 못했어요.');
      }
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        회원가입
      </Text>
      <Text style={styles.subtitle}>아이디·비밀번호·닉네임만 있으면 시작할 수 있어요.</Text>
      {message && <FormMessage tone="error" message={message} />}
      <TextField
        label="아이디"
        value={values.loginId}
        onChangeText={change('loginId')}
        error={errors.loginId}
        help="영문 소문자·숫자·_ 3~20자"
        autoComplete="username"
        textContentType="username"
        returnKeyType="next"
      />
      <TextField
        label="비밀번호"
        value={values.password}
        onChangeText={change('password')}
        error={errors.password}
        help={PASSWORD_RULE_HELP}
        secure
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
      />
      <TextField
        label="닉네임"
        value={values.nickname}
        onChangeText={change('nickname')}
        error={errors.nickname}
        help="1~10자, 홈 인사말에 쓰여요"
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      <Button title="가입하기" onPress={() => void submit()} loading={submitting} />
      <Link href="/login" style={styles.link}>
        이미 계정이 있어요 · 로그인
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: fontSize.body, color: colors.textMuted },
  link: { fontSize: fontSize.body, color: colors.primary, fontWeight: '600', textAlign: 'center' },
});
