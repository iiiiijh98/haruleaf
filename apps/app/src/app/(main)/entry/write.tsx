import { useIsFocused } from 'expo-router';
import { DiaryEditor } from '@/components/DiaryEditor';

// 탭 화면은 이동 후에도 마운트된 채 남으므로, 포커스가 없을 땐 내용을 비워 매 방문을 새로 시작한다.
// 수정은 별도 경로(entry/edit/[date])라서 이 화면은 항상 새 일기 작성이다.
export default function DiaryWriteScreen() {
  const isFocused = useIsFocused();
  return isFocused ? <DiaryEditor initialBody="" mode={{ kind: 'create' }} /> : null;
}
