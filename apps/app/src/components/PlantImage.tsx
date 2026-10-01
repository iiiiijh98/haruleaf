import type { GrowthStage } from '@haruleaf/shared';
import { useEffect, useState } from 'react';
import { Animated, Platform, type ImageSourcePropType } from 'react-native';
import { plantImage } from './plant-images';

type Props = { plantId: string; stage: GrowthStage; size?: number; accessibilityLabel: string };

/** 식물·단계가 바뀌면 새 그림이 서서히 나타난다(Fade, 명세서 SYS-08). */
export function PlantImage({ plantId, stage, size = 200, accessibilityLabel }: Props) {
  return (
    <FadeInImage
      key={`${plantId}-${stage}`}
      source={plantImage(plantId, stage)}
      size={size}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

function FadeInImage({ source, size, accessibilityLabel }: { source: ImageSourcePropType; size: number; accessibilityLabel: string }) {
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [opacity]);
  return (
    <Animated.Image
      source={source}
      style={{ width: size, height: size, opacity, alignSelf: 'center' }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    />
  );
}
