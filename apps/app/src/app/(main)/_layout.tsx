import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { colors } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** 선택된 탭은 채운 아이콘, 나머지는 테두리 아이콘 */
function tabIcon(name: IconName, outline: IconName) {
  function TabIcon({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) {
    return <Ionicons name={focused ? name : outline} size={size} color={color} />;
  }
  return TabIcon;
}

export default function MainLayout() {
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}>
      <Tabs.Screen name="index" options={{ title: '홈', tabBarIcon: tabIcon('home', 'home-outline') }} />
      <Tabs.Screen name="diary" options={{ title: '일기', tabBarIcon: tabIcon('book', 'book-outline') }} />
      <Tabs.Screen name="garden" options={{ title: '정원', tabBarIcon: tabIcon('leaf', 'leaf-outline') }} />
      <Tabs.Screen name="shop" options={{ title: '상점', tabBarIcon: tabIcon('storefront', 'storefront-outline') }} />
      <Tabs.Screen name="profile" options={{ title: '프로필', tabBarIcon: tabIcon('person-circle', 'person-circle-outline') }} />
      <Tabs.Screen name="plants" options={{ href: null, title: '식물 고르기' }} />
      <Tabs.Screen name="entry/write" options={{ href: null, title: '일기 쓰기' }} />
      <Tabs.Screen name="entry/edit/[date]" options={{ href: null, title: '일기 고치기' }} />
      <Tabs.Screen name="entry/[date]" options={{ href: null, title: '일기' }} />
      <Tabs.Screen name="garden/[month]" options={{ href: null, title: '정원 기록' }} />
    </Tabs>
  );
}
