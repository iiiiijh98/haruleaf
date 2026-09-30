import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';
import { Placeholder } from '@/components/Placeholder';
import { ServerStatus } from '@/components/ServerStatus';
import { colors, fontSize } from '@/theme/tokens';

export default function LoginScreen() {
  return (
    <Placeholder title="하루한잎" description="로그인 화면은 3단계에서 구현합니다.">
      <ServerStatus />
      <Link href="/signup" style={styles.link}>
        회원가입으로 이동
      </Link>
    </Placeholder>
  );
}

const styles = StyleSheet.create({
  link: { fontSize: fontSize.body, color: colors.primary, fontWeight: '600' },
});
