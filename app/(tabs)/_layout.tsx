import { Redirect, Tabs } from 'expo-router';
import { ChartNoAxesCombined, FolderKanban, KeyRound, SlidersHorizontal, Users } from 'lucide-react-native';

import { adminConfigState, hasAuthenticatedAdminSession } from '@/src/store/admin-config';
import { translateText } from '@/src/components/localized-text';
import { languageState } from '@/src/store/ui-preferences';

const { useSnapshot } = require('valtio/react');

export default function TabsLayout() {
  const config = useSnapshot(adminConfigState);
  const language = useSnapshot(languageState).value as 'zh' | 'en';
  const hasAccount = hasAuthenticatedAdminSession(config);

  if (!hasAccount) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      initialRouteName={hasAccount ? 'monitor' : 'settings'}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2F6DF6',
        tabBarInactiveTintColor: '#7C8AA0',
        tabBarStyle: {
          display: 'none',
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          height: 84,
          paddingTop: 10,
          paddingBottom: 18,
          shadowColor: '#24446F',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 12,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="monitor"
        options={{
          title: translateText('概览', language),
          tabBarIcon: ({ color, size }) => <ChartNoAxesCombined color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: translateText('用户', language),
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: translateText('账号', language),
          tabBarIcon: ({ color, size }) => <KeyRound color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: translateText('分组', language),
          tabBarIcon: ({ color, size }) => <FolderKanban color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: translateText('更多管理', language),
          tabBarIcon: ({ color, size }) => <SlidersHorizontal color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
