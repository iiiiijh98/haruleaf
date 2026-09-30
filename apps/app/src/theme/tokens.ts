// 임시 디자인 토큰. Figma 디자인 시스템이 확정되면 이 파일의 값만 교체한다.
export const colors = {
  background: '#F6F8F4',
  surface: '#FFFFFF',
  text: '#263B31',
  textMuted: '#65776B',
  primary: '#356547',
  primarySoft: '#E7EEE2',
  border: '#DCE4D8',
  danger: '#A64141',
  dangerSoft: '#FCECEC',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 18 } as const;

export const fontSize = { caption: 12, body: 16, heading: 20, title: 26 } as const;

/** 넓은 Web 화면에서 콘텐츠가 퍼지지 않도록 하는 최대 폭 */
export const MAX_CONTENT_WIDTH = 960;
