import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ListCard } from '@/src/components/list-card';
import { PaginationControls } from '@/src/components/pagination-controls';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { listAuditLogs } from '@/src/services/admin';
import { Text, TextInput } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

export default function AuditLogsScreen() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all');
  const debounced = useDebouncedValue(search, 250);
  useEffect(() => setPage(1), [debounced]);
  const logsQuery = useQuery({ queryKey: ['audit-logs', debounced, filter, page], queryFn: () => listAuditLogs(debounced, page, 20, filter === 'all' ? undefined : filter === 'success') });
  return (
    <>
      <LocalizedStackScreen options={{ title: '操作审计', headerShown: true }} />
      <ScreenShell title="操作审计" subtitle={`${logsQuery.data?.total ?? 0} 条管理操作`} bottomInsetClassName="pb-8" safeAreaEdges={['bottom']} refreshing={logsQuery.isRefetching} onRefresh={() => logsQuery.refetch().then(() => undefined)}>
        <View className="flex-row gap-2">{([['all', '全部'], ['success', '成功'], ['failed', '失败']] as const).map(([value, label]) => <Pressable key={value} onPress={() => { setFilter(value); setPage(1); }} className={`rounded-full px-4 py-2 ${filter === value ? 'bg-[#2F6DF6]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}><Text className={`text-xs font-bold ${filter === value ? 'text-white' : 'text-[#475467] dark:text-[#C2CCDB]'}`}>{label}</Text></Pressable>)}</View>
        <View className="flex-row items-center gap-2 rounded-2xl bg-[#FFFFFF] dark:bg-[#111827] px-4 py-3"><Search size={17} color="#6B778C" /><TextInput value={search} onChangeText={setSearch} placeholder="搜索操作者、路径、请求 ID" placeholderTextColor="#98A2B3" autoCapitalize="none" className="flex-1 text-sm text-[#172033] dark:text-[#F4F7FB]" /></View>
        {logsQuery.data?.items.map((item) => <ListCard key={item.id} title={`${item.method} ${item.path}`} meta={`${item.actor_email || item.auth_method} · ${new Date(item.created_at).toLocaleString()}`} badge={String(item.status_code)} badgeTone={item.status_code >= 200 && item.status_code < 400 ? 'success' : 'danger'}><Text selectable className="text-xs leading-5 text-[#475467] dark:text-[#C2CCDB]">{item.action} · {item.client_ip} · {item.latency_ms}ms{item.request_body ? `\n${item.request_body}` : ''}</Text></ListCard>)}
        {logsQuery.isError ? <Text className="text-sm text-[#D9475C]">{(logsQuery.error as Error).message}</Text> : null}
        <PaginationControls page={page} pages={logsQuery.data?.pages ?? 1} total={logsQuery.data?.total} onChange={setPage} />
      </ScreenShell>
    </>
  );
}
