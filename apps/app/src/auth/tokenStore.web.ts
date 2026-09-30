const KEY = 'haruleaf.session';

export async function loadToken(): Promise<string | null> {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function saveToken(token: string): Promise<void> {
  try {
    window.localStorage.setItem(KEY, token);
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 이번 세션만 유지된다.
  }
}

export async function clearToken(): Promise<void> {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}
