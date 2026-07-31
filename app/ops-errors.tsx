import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { CheckCircle2, RotateCcw, Search } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ListCard } from '@/src/components/list-card';
import { PaginationControls } from '@/src/components/pagination-controls';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { listOpsErrors, resolveOpsError } from '@/src/services/admin';
import type { OpsErrorKind } from '@/src/types/admin';
import { Text, TextInput } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

export default function OpsErrorsScreen() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<OpsErrorKind>('request');
  const [filter, setFilter] = useState<'unresolved' | 'resolved' | 'all'>('unresolved');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 250);
  const resolved = filter === 'all' ? undefined : filter === 'resolved';

  const errorsQuery = useQuery({
    queryKey: ['ops-errors', kind, filter, debouncedSearch, page],
    queryFn: () => listOpsErrors(kind, resolved, debouncedSearch, page),
  });
  const resolveMutation = useMutation({
    mutationFn: ({ id, value }: { id: number; value: boolean }) => resolveOpsError(kind, id, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ops-errors'] }),
  });

  return (
    <>
      <LocalizedStackScreen options={{ title: '错误中心', headerShown: true }} />
      <ScreenShell
        title="错误中心"
        subtitle="最近 24 小时 · 请求与上游错误"
        bottomInsetClassName="pb-8"
        safeAreaEdges={['bottom']}
        refreshing={errorsQuery.isRefetching}
        onRefresh={() => errorsQuery.refetch().then(() => undefined)}
      >
        <View className="flex-row gap-2 rounded-2xl bg-[#E2E9F3] dark:bg-[#273449] p-1">
          {([['request', '请求错误'], ['upstream', '上游错误']] as const).map(([value, label]) => (
            <Pressable key={value} onPress={() => { setKind(value); setPage(1); }} className={`flex-1 rounded-xl py-2.5 ${kind === value ? 'bg-[#FFFFFF] dark:bg-[#111827]' : ''}`}>
              <Text className={`text-center text-xs font-bold ${kind === value ? 'text-[#2F6DF6]' : 'text-[#6B778C] dark:text-[#9EABC0]'}`}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <View className="flex-row flex-wrap gap-2">
          {([['unresolved', '待处理'], ['resolved', '已处理'], ['all', '全部']] as const).map(([value, label]) => (
            <Pressable key={value} onPress={() => { setFilter(value); setPage(1); }} className={`rounded-full px-4 py-2 ${filter === value ? 'bg-[#2F6DF6]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}>
              <Text className={`text-xs font-bold ${filter === value ? 'text-white' : 'text-[#475467] dark:text-[#C2CCDB]'}`}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <View className="flex-row items-center gap-2 rounded-2xl bg-[#FFFFFF] dark:bg-[#111827] px-4 py-3">
          <Search size={17} color="#6B778C" />
          <TextInput value={search} onChangeText={(value) => { setSearch(value); setPage(1); }} placeholder="搜索消息、请求 ID、模型" placeholderTextColor="#98A2B3" autoCapitalize="none" className="flex-1 text-sm text-[#172033] dark:text-[#F4F7FB]" />
        </View>

        {errorsQuery.isError ? <Text className="text-sm text-[#D9475C]">{(errorsQuery.error as Error).message}</Text> : null}
        {errorsQuery.data?.items.map((item) => (
          <ListCard
            key={item.id}
            title={`${item.status_code} · ${item.type || item.phase}`}
            meta={`${item.platform || '--'} / ${item.requested_model || item.model || '--'} · ${new Date(item.created_at).toLocaleString()}`}
            badge={item.resolved ? '已处理' : item.severity || '待处理'}
            badgeTone={item.resolved ? 'success' : 'danger'}
          >
            <Text selectable className="text-xs leading-5 text-[#475467] dark:text-[#C2CCDB]">{item.message}</Text>
            <View className="mt-3 flex-row items-center justify-between gap-3">
              <Text numberOfLines={1} className="flex-1 text-[11px] text-[#98A2B3] dark:text-[#8391A6]">{item.account_name || item.user_email || item.request_id}</Text>
              <Pressable
                disabled={resolveMutation.isPending}
                onPress={() => resolveMutation.mutate({ id: item.id, value: !item.resolved })}
                className={`flex-row items-center gap-1.5 rounded-xl px-3 py-2 ${item.resolved ? 'bg-[#E2E9F3] dark:bg-[#273449]' : 'bg-[#EAF2FF] dark:bg-[#172C55]'}`}
              >
                {item.resolved ? <RotateCcw size={14} color="#475467" /> : <CheckCircle2 size={14} color="#2F6DF6" />}
                <Text className={`text-xs font-bold ${item.resolved ? 'text-[#475467] dark:text-[#C2CCDB]' : 'text-[#2F6DF6]'}`}>{item.resolved ? '重新打开' : '标记处理'}</Text>
              </Pressable>
            </View>
          </ListCard>
        ))}
        {!errorsQuery.isLoading && !errorsQuery.data?.items.length ? <Text className="py-8 text-center text-sm text-[#6B778C] dark:text-[#9EABC0]">当前筛选下没有错误</Text> : null}
        <PaginationControls page={page} pages={errorsQuery.data?.pages ?? 1} total={errorsQuery.data?.total} onChange={setPage} />
      </ScreenShell>
    </>
  );
}
