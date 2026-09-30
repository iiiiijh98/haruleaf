import { deleteAccountSchema, updateNicknameSchema } from '@haruleaf/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { deleteAccountRequest, updateNicknameRequest } from '@/api/auth';
import { ApiError } from '@/api/client';
import { useAuth, useCurrentUser } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { ConfirmModal } from '@/components/ConfirmModal';
import { FormMessage } from '@/components/FormMessage';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

export default function ProfileScreen() {
  const user = useCurrentUser();
  const { setUser, signOut } = useAuth();
  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function saveNickname() {
    if (saving) return;
    const parsed = updateNicknameSchema.safeParse({ nickname });
    if (!parsed.success) {
      setNicknameError(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.');
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const { user: updated } = await updateNicknameRequest(parsed.data);
      setUser(updated);
      setNickname(updated.nickname);
      setNotice({ tone: 'success', message: '닉네임을 바꿨어요.' });
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof ApiError ? error.message : '닉네임을 바꾸지 못했어요.' });
    } finally {
      setSaving(false);
    }
  }

  function closeWithdraw() {
    if (deleting) return;
    setWithdrawOpen(false);
    setPassword('');
    setWithdrawError(null);
  }

  async function withdraw() {
    if (deleting) return;
    const parsed = deleteAccountSchema.safeParse({ password });
    if (!parsed.success) {
      setWithdrawError(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.');
      return;
    }
    setDeleting(true);
    setWithdrawError(null);
    try {
      await deleteAccountRequest(parsed.data);
      setWithdrawOpen(false);
      await signOut();
    } catch (error) {
      setWithdrawError(error instanceof ApiError ? error.message : '탈퇴하지 못했어요.');
      setDeleting(false);
    }
  }

  if (!user) return null;

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        프로필
      </Text>
      {notice && <FormMessage tone={notice.tone} message={notice.message} />}

      <View style={styles.card}>
        <Text style={styles.label}>아이디</Text>
        <Text style={styles.value}>{user.loginId}</Text>
      </View>

      <View style={styles.card}>
        <TextField
          label="닉네임"
          value={nickname}
          onChangeText={(value) => {
            setNickname(value);
            setNicknameError(null);
          }}
          error={nicknameError}
          help="1~10자"
          returnKeyType="done"
          onSubmitEditing={() => void saveNickname()}
        />
        <Button title="닉네임 저장" onPress={() => void saveNickname()} loading={saving} disabled={nickname.trim() === user.nickname} />
      </View>

      <Button title="로그아웃" variant="secondary" onPress={() => void signOut()} />
      <Button title="회원탈퇴" variant="danger" onPress={() => setWithdrawOpen(true)} />

      <ConfirmModal
        visible={withdrawOpen}
        title="정말 탈퇴할까요?"
        description="일기·코인·식물·정원 기록이 모두 삭제되며 되돌릴 수 없어요. 계속하려면 비밀번호를 입력해주세요."
        confirmLabel="탈퇴하기"
        confirmVariant="danger"
        onConfirm={() => void withdraw()}
        onCancel={closeWithdraw}
        loading={deleting}>
        <TextField
          label="비밀번호"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setWithdrawError(null);
          }}
          error={withdrawError}
          secure
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={() => void withdraw()}
        />
      </ConfirmModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  label: { fontSize: fontSize.caption, fontWeight: '600', color: colors.textMuted },
  value: { fontSize: fontSize.body, color: colors.text },
});
