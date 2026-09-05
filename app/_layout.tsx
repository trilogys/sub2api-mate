import '@/src/global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Uniwind, useUniwind } from 'uniwind';

import { AIAssistant } from '@/src/components/ai-assistant';
import { AccountRefreshCoordinator } from '@/src/components/account-refresh-coordinator';
import { ThemedAlertHost } from '@/src/components/themed-alert-host';
import { WorkspaceRouteGuard, WorkspaceSidebar } from '@/src/components/workspace-shell';
import { translateText } from '@/src/components/localized-text';
import { queryClient } from '@/src/lib/query-client';
import { markPerformance } from '@/src/lib/performance';
import { adminConfigState, hydrateAdminConfig } from '@/src/store/admin-config';
import { cliProxyConfigState, hydrateCLIProxyConfig } from '@/src/store/cliproxy-config';
import { applyAppLanguage, languageState, loadUIPreferences } from '@/src/store/ui-preferences';
import { hydrateWorkspaceMode, workspaceModeState } from '@/src/store/workspace-mode';

const { useSnapshot } = require('valtio/react');

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

const primaryStackScreens = [
  'ops-center',
  'api-keys',
  'proxies',
  'usage-logs',
  'ai-assistant',
  'account-refresh',
  'ip-management',
  'ops-errors',
  'audit-logs',
  'about',
  'manage',
] as const;

export default function RootLayout() {
  const config = useSnapshot(adminConfigState);
  const cliProxy = useSnapshot(cliProxyConfigState);
  const workspace = useSnapshot(workspaceModeState);
  const language = useSnapshot(languageState).value as 'zh' | 'en';
  const { theme } = useUniwind();
  const [uiReady, setUIReady] = useState(false);

  useEffect(() => {
    Promise.all([hydrateAdminConfig(), hydrateCLIProxyConfig(), hydrateWorkspaceMode(), loadUIPreferences()])
      .then(([, , , preferences]) => { Uniwind.setTheme(preferences.colorMode); applyAppLanguage(preferences.language); setUIReady(true); markPerformance('config_hydrated'); })
      .catch(() => setUIReady(true));
  }, []);

  const isReady = config.hydrated && cliProxy.hydrated && workspace.hydrated && uiReady;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <QueryClientProvider client={queryClient}>
        {!isReady ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme === 'dark' ? '#0B1220' : '#F4F7FC' }}>
            <ActivityIndicator color="#2F6DF6" />
          </View>
        ) : (
          <>
            <View style={{ flex: 1, flexDirection: 'row' }}>
              <WorkspaceSidebar />
              <View style={{ flex: 1 }}>
                <Stack
                  initialRouteName="(tabs)"
                  screenOptions={{
                    headerShown: false,
                    headerBackTitle: translateText('返回', language),
                    headerTintColor: theme === 'dark' ? '#F4F7FB' : '#172033',
                    headerStyle: { backgroundColor: theme === 'dark' ? '#0B1220' : '#F4F7FC' },
                    headerShadowVisible: false,
                    contentStyle: { backgroundColor: theme === 'dark' ? '#0B1220' : '#F4F7FC' },
                  }}
                >
                  <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'none' }} />
                  <Stack.Screen name="login" options={{ headerShown: false }} />
                  {primaryStackScreens.map((name) => (
                    <Stack.Screen key={name} name={name} options={{ headerShown: false, animation: 'none' }} />
                  ))}
                  <Stack.Screen
                    name="users/[id]"
                    options={{
                      animation: 'slide_from_right',
                      presentation: 'card',
                      headerShown: true,
                      title: translateText('用户详情', language),
                      headerBackTitle: translateText('返回', language),
                      headerTintColor: theme === 'dark' ? '#F4F7FB' : '#172033',
                      headerStyle: { backgroundColor: theme === 'dark' ? '#0B1220' : '#F4F7FC' },
                      headerShadowVisible: false,
                    }}
                  />
                  <Stack.Screen
                    name="users/create-account"
                    options={{
                      animation: 'slide_from_right',
                      presentation: 'card',
                      headerShown: true,
                      title: translateText('添加账号', language),
                      headerBackTitle: translateText('返回', language),
                      headerTintColor: theme === 'dark' ? '#F4F7FB' : '#172033',
                      headerStyle: { backgroundColor: theme === 'dark' ? '#0B1220' : '#F4F7FC' },
                      headerShadowVisible: false,
                    }}
                  />
                  <Stack.Screen
                    name="users/create-user"
                    options={{
                      animation: 'slide_from_right',
                      presentation: 'card',
                      headerShown: true,
                      title: translateText('添加用户', language),
                      headerBackTitle: translateText('返回', language),
                      headerTintColor: theme === 'dark' ? '#F4F7FB' : '#172033',
                      headerStyle: { backgroundColor: theme === 'dark' ? '#0B1220' : '#F4F7FC' },
                      headerShadowVisible: false,
                    }}
                  />
                  <Stack.Screen
                    name="accounts/create"
                    options={{
                      animation: 'slide_from_right',
                      presentation: 'card',
                      headerShown: true,
                      title: translateText('添加账号', language),
                      headerBackTitle: translateText('返回', language),
                      headerTintColor: theme === 'dark' ? '#F4F7FB' : '#172033',
                      headerStyle: { backgroundColor: theme === 'dark' ? '#0B1220' : '#F4F7FC' },
                      headerShadowVisible: false,
                    }}
                  />
                  <Stack.Screen
                    name="accounts/overview"
                    options={{
                      animation: 'slide_from_right',
                      presentation: 'card',
                      headerShown: true,
                      title: translateText('账号清单', language),
                      headerBackTitle: translateText('返回', language),
                      headerTintColor: theme === 'dark' ? '#F4F7FB' : '#172033',
                      headerStyle: { backgroundColor: theme === 'dark' ? '#0B1220' : '#F4F7FC' },
                      headerShadowVisible: false,
                    }}
                  />
                </Stack>
              </View>
            </View>
            <WorkspaceRouteGuard />
            {workspace.mode === 'sub2api' ? <AIAssistant /> : null}
            {workspace.mode === 'sub2api' ? <AccountRefreshCoordinator /> : null}
            <ThemedAlertHost />
          </>
        )}
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
