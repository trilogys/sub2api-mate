import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { Plus, Search } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useEffect, useState } from 'react';

import { ListCard } from '@/src/components/list-card';
import { PaginationControls } from '@/src/components/pagination-controls';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { checkProxyQuality, listProxies, testProxy } from '@/src/services/admin';
import { Text, TextInput } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

export default function ProxiesScreen() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [runningKey, setRunningKey] = useState('');
  const [feedback, setFeedback] = useState<Record<number, string>>({});
  const queryClient = useQueryClient();
  const debouncedSearch = useDebouncedValue(search, 250);
  useEffect(() => setPage(1), [debouncedSearch]);
  const proxiesQuery = useQuery({
    queryKey: ['proxies', debouncedSearch, page],
    queryFn: () => listProxies(debouncedSearch, page),
  });
  const checkMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: 'connectivity' | 'quality' }) => {
      if (action === 'connectivity') {
        const result = await testProxy(id);
        return { id, message: `${result.success ? '连通成功' : '连通失败'} · ${result.latency_ms ?? '--'}ms${result.ip_address ? ` · ${result.ip_address}` : ''}` };
      }
      const result = await checkProxyQuality(id);
      return { id, message: `质量 ${result.grade} / ${result.score} 分 · 通过 ${result.passed_count}，警告 ${result.warn_count}，失败 ${result.failed_count}` };
    },
    onSuccess: async ({ id, message }) => {
      setFeedback((current) => ({ ...current, [id]: message }));
      await queryClient.invalidateQueries({ queryKey: ['proxies'] });
    },
    onError: (error, { id }) => {
      setFeedback((current) => ({ ...current, [id]: error instanceof Error ? error.message : '检测失败' }));
    },
    onSettled: () => setRunningKey(''),
  });

  return (
    <>
      <LocalizedStackScreen options={{ title: '代理管理', headerShown: true }} />
      <ScreenShell
        title="代理管理"
        subtitle={`${proxiesQuery.data?.total ?? 0} 个代理`}
        bottomInsetClassName="pb-8"
        safeAreaEdges={['bottom']}
        refreshing={proxiesQuery.isRefetching}
        onRefresh={() => proxiesQuery.refetch().then(() => undefined)}
        right={
          <Pressable onPress={() => router.push('/proxy')} className="h-10 w-10 items-center justify-center rounded-full bg-[#2F6DF6]">
            <Plus size={21} color="#fff" />
          </Pressable>
        }
      >
        <View className="flex-row items-center gap-2 rounded-2xl bg-[#FFFFFF] dark:bg-[#111827] px-4 py-3">
          <Search size={17} color="#6B778C" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="搜索名称、地址"
            placeholderTextColor="#98A2B3"
            autoCapitalize="none"
            className="flex-1 text-sm text-[#172033] dark:text-[#F4F7FB]"
          />
        </View>

        {proxiesQuery.isError ? <Text className="text-sm text-[#D9475C]">{(proxiesQuery.error as Error).message}</Text> : null}
        {proxiesQuery.data?.items.map((proxy) => {
          const connectivityKey = `${proxy.id}:connectivity`;
          const qualityKey = `${proxy.id}:quality`;
          return <Pressable key={proxy.id} onPress={() => router.push({ pathname: '/proxy', params: { id: String(proxy.id) } })}>
            <ListCard
              title={proxy.name}
              meta={`${proxy.protocol}://${proxy.host}:${proxy.port}`}
              badge={proxy.status}
              badgeTone={proxy.status === 'active' ? 'success' : proxy.status === 'expired' ? 'danger' : 'muted'}
            >
              <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                <Text className="text-xs text-[#6B778C] dark:text-[#9EABC0]">账号 {proxy.account_count ?? 0}</Text>
                <Text className="text-xs text-[#6B778C] dark:text-[#9EABC0]">延迟 {proxy.latency_ms == null ? '--' : `${proxy.latency_ms}ms`}</Text>
                <Text className="text-xs text-[#6B778C] dark:text-[#9EABC0]">{proxy.country || proxy.ip_address || '尚未检测'}</Text>
                {proxy.quality_grade ? <Text className="text-xs font-semibold text-[#2F6DF6]">质量 {proxy.quality_grade}</Text> : null}
              </View>
              <View className="mt-3 flex-row gap-2">
                <Pressable
                  disabled={checkMutation.isPending}
                  onPress={(event) => {
                    event.stopPropagation();
                    setRunningKey(connectivityKey);
                    checkMutation.mutate({ id: proxy.id, action: 'connectivity' });
                  }}
                  className="flex-1 items-center rounded-xl bg-[#2F6DF6] px-3 py-2.5 disabled:opacity-50"
                >
                  <Text className="text-xs font-bold text-white">{runningKey === connectivityKey ? '测试中…' : '连通测试'}</Text>
                </Pressable>
                <Pressable
                  disabled={checkMutation.isPending}
                  onPress={(event) => {
                    event.stopPropagation();
                    setRunningKey(qualityKey);
                    checkMutation.mutate({ id: proxy.id, action: 'quality' });
                  }}
                  className="flex-1 items-center rounded-xl bg-[#E2E9F3] dark:bg-[#273449] px-3 py-2.5 disabled:opacity-50"
                >
                  <Text className="text-xs font-bold text-[#344054] dark:text-[#D5DDEA]">{runningKey === qualityKey ? '检测中…' : '质量检测'}</Text>
                </Pressable>
              </View>
              {feedback[proxy.id] ? <Text className="mt-2 text-xs leading-5 text-[#2F6DF6]">{feedback[proxy.id]}</Text> : null}
            </ListCard>
          </Pressable>;
        })}
        {!proxiesQuery.isLoading && !proxiesQuery.data?.items.length ? (
          <Text className="py-8 text-center text-sm text-[#6B778C] dark:text-[#9EABC0]">暂无代理，点击右上角添加</Text>
        ) : null}
        <PaginationControls page={page} pages={proxiesQuery.data?.pages ?? 1} total={proxiesQuery.data?.total} onChange={setPage} />
      </ScreenShell>
    </>
  );
}
