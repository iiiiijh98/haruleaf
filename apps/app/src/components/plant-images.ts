import type { GrowthStage } from '@haruleaf/shared';
import type { ImageSourcePropType } from 'react-native';

type StageImages = Record<GrowthStage, ImageSourcePropType>;

// 실제 이미지로 교체할 때는 같은 경로의 파일만 바꾸면 된다. 새 식물은 여기에 한 줄 추가.
const PLANT_IMAGES: Record<string, StageImages> = {
  monstera: {
    1: require('@/assets/plants/monstera/stage-1.png'),
    2: require('@/assets/plants/monstera/stage-2.png'),
    3: require('@/assets/plants/monstera/stage-3.png'),
    4: require('@/assets/plants/monstera/stage-4.png'),
    5: require('@/assets/plants/monstera/stage-5.png'),
  },
  rose: {
    1: require('@/assets/plants/rose/stage-1.png'),
    2: require('@/assets/plants/rose/stage-2.png'),
    3: require('@/assets/plants/rose/stage-3.png'),
    4: require('@/assets/plants/rose/stage-4.png'),
    5: require('@/assets/plants/rose/stage-5.png'),
  },
  sunflower: {
    1: require('@/assets/plants/sunflower/stage-1.png'),
    2: require('@/assets/plants/sunflower/stage-2.png'),
    3: require('@/assets/plants/sunflower/stage-3.png'),
    4: require('@/assets/plants/sunflower/stage-4.png'),
    5: require('@/assets/plants/sunflower/stage-5.png'),
  },
  tulip: {
    1: require('@/assets/plants/tulip/stage-1.png'),
    2: require('@/assets/plants/tulip/stage-2.png'),
    3: require('@/assets/plants/tulip/stage-3.png'),
    4: require('@/assets/plants/tulip/stage-4.png'),
    5: require('@/assets/plants/tulip/stage-5.png'),
  },
  lavender: {
    1: require('@/assets/plants/lavender/stage-1.png'),
    2: require('@/assets/plants/lavender/stage-2.png'),
    3: require('@/assets/plants/lavender/stage-3.png'),
    4: require('@/assets/plants/lavender/stage-4.png'),
    5: require('@/assets/plants/lavender/stage-5.png'),
  },
};

const DEFAULT_IMAGES: StageImages = {
  1: require('@/assets/plants/_default/stage-1.png'),
  2: require('@/assets/plants/_default/stage-2.png'),
  3: require('@/assets/plants/_default/stage-3.png'),
  4: require('@/assets/plants/_default/stage-4.png'),
  5: require('@/assets/plants/_default/stage-5.png'),
};

export function plantImage(plantId: string, stage: GrowthStage): ImageSourcePropType {
  return (PLANT_IMAGES[plantId] ?? DEFAULT_IMAGES)[stage];
}
