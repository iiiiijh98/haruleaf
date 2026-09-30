const PRIVATE_RANGE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/**
 * os.networkInterfaces() 결과에서 같은 Wi-Fi의 다른 기기가 접속할 수 있는 IPv4 주소를 고른다.
 * 우선순위: en0(맥 Wi-Fi) → 사설 IP 대역 → 그 밖의 외부 IPv4 → 'localhost'
 */
export function pickLanAddress(interfaces) {
  const candidates = [];
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const entry of addresses ?? []) {
      const isV4 = entry.family === 'IPv4' || entry.family === 4;
      if (isV4 && !entry.internal) candidates.push({ name, address: entry.address });
    }
  }
  const chosen =
    candidates.find((candidate) => candidate.name === 'en0') ??
    candidates.find((candidate) => PRIVATE_RANGE.test(candidate.address)) ??
    candidates[0];
  return chosen?.address ?? 'localhost';
}
