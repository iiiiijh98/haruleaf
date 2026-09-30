import { Placeholder } from '@/components/Placeholder';
import { ServerStatus } from '@/components/ServerStatus';

export default function HomeScreen() {
  return (
    <Placeholder title="홈" description="홈 화면은 4단계에서 구현합니다.">
      <ServerStatus />
    </Placeholder>
  );
}
