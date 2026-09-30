import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';
import { Placeholder } from '@/components/Placeholder';
import { colors, fontSize } from '@/theme/tokens';

export default function SignupScreen() {
  return (
    <Placeholder title="회원가입" description="아이디·비밀번호·닉네임 입력 화면은 3단계에서 구현합니다.">
      <Link href="/login" style={styles.link}>
        로그인으로 돌아가기
      </Link>
    </Placeholder>
  );
}

const styles = StyleSheet.create({
  link: { fontSize: fontSize.body, color: colors.primary, fontWeight: '600' },
});
