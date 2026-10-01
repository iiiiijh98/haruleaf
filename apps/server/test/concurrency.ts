/** 같은 요청을 동시에 count번 보낸다(모두 시작한 뒤 한꺼번에 기다림). */
export function fireConcurrently<T>(count: number, fn: () => Promise<T>): Promise<T[]> {
  return Promise.all(Array.from({ length: count }, () => fn()));
}
