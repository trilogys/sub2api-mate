import { Stack, router } from 'expo-router';
import { ChevronRight, RefreshCw, Search } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { AdminButton, AdminChip, AdminMessage } from '@/src/components/admin-ui';
import { ScreenShell } from '@/src/components/screen-shell';
import { getAdminRouteCoverage, getAllAdminRoutes, syncLatestAdminRoutes } from '@/src/services/app-knowledge';
import { Text, TextInput } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

const methods = ['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'WS'] as const;

export default function APIConsoleScreen() {
  const [routes, setRoutes] = useState(getAllAdminRoutes);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<unknown>();
  const [syncedAt, setSyncedAt] = useState<number>();
  const [upstreamChanged, setUpstreamChanged] = useState(false);
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState<(typeof methods)[number]>('ALL');
  const coverage = getAdminRouteCoverage();

  const refresh = async (force: boolean) => {
    setSyncing(true);
    setSyncError(undefined);
    try {
      const result = await syncLatestAdminRoutes(force);
      setRoutes(getAllAdminRoutes());
      setSyncedAt(result.fetchedAt);
      setUpstreamChanged(result.changed);
    } catch (error) {
      setSyncError(error);
      setRoutes(getAllAdminRoutes());
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => { void refresh(false); }, []);
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return routes.filter((route) => {
      const matchesMethod = method === 'ALL'
        || (method === 'WS' ? route.transport === 'websocket' : route.method === method);
      const matchesSearch = !keyword || `${route.method} ${route.path} ${route.handler}`.toLowerCase().includes(keyword);
      return matchesMethod && matchesSearch;
    });
  }, [method, routes, search]);

  return (
    <>
      <LocalizedStackScreen options={{ title: '全部 API', headerShown: true }} />
      <ScreenShell title="全部 API" subtitle={`${coverage.total} 条路由 · ${coverage.dedicated} 条专用封装 · ${coverage.console} 条控制台接入`} scroll={false} safeAreaEdges={['bottom']} bottomInsetClassName="pb-3">
        <View className="gap-3">
          <View className="flex-row items-center gap-2 rounded-2xl bg-[#FFFFFF] dark:bg-[#111827] px-4">
            <Search size={17} color="#6B778C" />
            <TextInput value={search} onChangeText={setSearch} placeholder="搜索路径、处理器或功能名称" placeholderTextColor="#98A2B3" className="min-h-12 flex-1 text-sm text-[#172033] dark:text-[#F4F7FB]" autoCapitalize="none" autoCorrect={false} />
          </View>
          <FlatList horizontal data={methods} keyExtractor={(item) => item} showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" renderItem={({ item }) => <AdminChip label={item} selected={method === item} onPress={() => setMethod(item)} />} />
          <View className="flex-row items-center gap-2 rounded-2xl bg-[#EAF2FF] dark:bg-[#172C55] p-3"><RefreshCw size={16} color="#2F6DF6" /><Text className="flex-1 text-xs leading-5 text-[#2F6DF6]">打开页面时自动检查上游，六小时内复用结果；手动刷新会立即重新检索。</Text></View>
          <AdminButton label="立即检索最新 API" tone="muted" pending={syncing} onPress={() => void refresh(true)} />
          <AdminMessage error={syncError} success={syncedAt ? `${new Date(syncedAt).toLocaleString()} 已检索 ${routes.length} 条${upstreamChanged ? '，与当前 APK 内置清单有变化' : '，与当前 APK 内置清单一致'}` : undefined} />
          <Text className="text-xs text-[#6B778C] dark:text-[#9EABC0]">显示 {filtered.length} 条。没有专用页面的接口也可以填写参数后直接调用。</Text>
        </View>
        <FlatList
          className="mt-3 flex-1"
          data={filtered}
          keyExtractor={(item) => `${item.method}-${item.path}`}
          contentContainerClassName="gap-2 pb-8"
          initialNumToRender={18}
          windowSize={7}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/api-console/[index]', params: { index: String(item.index) } })}
              className="flex-row items-center gap-3 rounded-2xl border border-[#E2E9F3] dark:border-[#273449] bg-[#FFFFFF] dark:bg-[#111827] p-4"
            >
              <View className={`rounded-lg px-2 py-1 ${item.transport === 'websocket' ? 'bg-[#FFF4E8]' : item.method === 'GET' ? 'bg-[#EAF2FF] dark:bg-[#172C55]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}>
                <Text className={`text-[10px] font-bold ${item.transport === 'websocket' ? 'text-[#D9475C]' : 'text-[#2F6DF6]'}`}>{item.transport === 'websocket' ? 'WS' : item.method}</Text>
              </View>
              <View className="flex-1">
                <Text selectable className="font-mono text-xs font-semibold text-[#27364F] dark:text-[#D5DDEA]">{item.path}</Text>
                <Text numberOfLines={1} className="mt-1 text-[11px] text-[#6B778C] dark:text-[#9EABC0]">{item.handler} · {item.dedicated ? '专用封装' : '通用控制台'}</Text>
              </View>
              <ChevronRight size={18} color="#98A2B3" />
            </Pressable>
          )}
        />
      </ScreenShell>
    </>
  );
}
