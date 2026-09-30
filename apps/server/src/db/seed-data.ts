export type PlantSeed = {
  id: string;
  name: string;
  description: string;
  kind: 'PLANT' | 'FLOWER';
  catalogClass: 'STANDARD' | 'LIMITED' | 'SPECIAL';
  initialFree: boolean;
  coinPrice: number | null;
  sortOrder: number;
};

// 임시 카탈로그. 이름·가격은 추후 교체 가능.
export const CATALOG: PlantSeed[] = [
  { id: 'monstera', name: '몬스테라', description: '잎 사이로 스며드는 작은 여유', kind: 'PLANT', catalogClass: 'STANDARD', initialFree: true, coinPrice: null, sortOrder: 1 },
  { id: 'rose', name: '장미', description: '차곡차곡 피어나는 나의 마음', kind: 'FLOWER', catalogClass: 'STANDARD', initialFree: true, coinPrice: null, sortOrder: 2 },
  { id: 'sunflower', name: '해바라기', description: '오늘의 빛을 기억하는 꽃', kind: 'FLOWER', catalogClass: 'STANDARD', initialFree: true, coinPrice: null, sortOrder: 3 },
  { id: 'tulip', name: '튤립', description: '조용히 시작하는 새로운 하루', kind: 'FLOWER', catalogClass: 'STANDARD', initialFree: true, coinPrice: null, sortOrder: 4 },
  { id: 'lavender', name: '라벤더', description: '하루의 끝에 남기는 보랏빛 쉼', kind: 'FLOWER', catalogClass: 'STANDARD', initialFree: true, coinPrice: null, sortOrder: 5 },
  { id: 'hydrangea', name: '수국', description: '꾸준한 기록으로 만나는 꽃', kind: 'FLOWER', catalogClass: 'STANDARD', initialFree: false, coinPrice: null, sortOrder: 6 },
  { id: 'daisy', name: '데이지', description: '소박한 날들이 모인 선물', kind: 'FLOWER', catalogClass: 'STANDARD', initialFree: false, coinPrice: null, sortOrder: 7 },
  { id: 'moonflower', name: '달빛 꽃', description: '밤하늘을 닮은 특별한 꽃', kind: 'FLOWER', catalogClass: 'LIMITED', initialFree: false, coinPrice: 50, sortOrder: 8 },
  { id: 'anthurium', name: '산호빛 안스리움', description: '정원에 더하는 따뜻한 색', kind: 'FLOWER', catalogClass: 'SPECIAL', initialFree: false, coinPrice: 100, sortOrder: 9 },
];
