import { Tabs } from 'expo-router';
import { colors } from '@/theme/tokens';

export default function MainLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}>
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="diary" options={{ title: '일기' }} />
      <Tabs.Screen name="garden" options={{ title: '정원' }} />
      <Tabs.Screen name="shop" options={{ title: '상점' }} />
      <Tabs.Screen name="profile" options={{ title: '프로필' }} />
    </Tabs>
  );
}
