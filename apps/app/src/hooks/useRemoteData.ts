import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ApiError } from '@/api/client';

export type RemoteState<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; message: string };

/**
 * 화면이 포커스될 때마다(다른 화면에서 돌아올 때 포함) 데이터를 다시 불러온다.
 * load는 안정적인 함수여야 한다(모듈 함수 또는 useCallback).
 */
export function useRemoteData<T>(load: () => Promise<T>): { state: RemoteState<T>; reload: () => void } {
  const [state, setState] = useState<RemoteState<T>>({ status: 'loading' });
  const [version, setVersion] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load()
        .then((data) => {
          if (active) setState({ status: 'ready', data });
        })
        .catch((error: unknown) => {
          if (active) setState({ status: 'error', message: error instanceof ApiError ? error.message : '불러오지 못했어요.' });
        });
      return () => {
        active = false;
      };
      // version이 바뀌면 다시 불러온다(reload).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, version]),
  );

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { state, reload };
}
