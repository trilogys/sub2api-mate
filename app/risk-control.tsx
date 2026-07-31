import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ListCard } from '@/src/components/list-card';
import { PaginationControls } from '@/src/components/pagination-controls';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { getRiskControlConfig, getRiskControlStatus, listRiskControlLogs, unbanRiskControlUser, updateRiskControlConfig } from '@/src/services/admin';
import type { ModerationMode } from '@/src/types/admin';
import { Text, TextInput } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

export default function RiskControlScreen() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<ModerationMode>('off');
  const [autoBan, setAutoBan] = useState(false);
  const [recordNonHits, setRecordNonHits] = useState(false);
  const debounced = useDebouncedValue(search, 250);
  const configQuery = useQuery({ queryKey: ['risk-control-config'], queryFn: getRiskControlConfig });
  const statusQuery = useQuery({ queryKey: ['risk-control-status'], queryFn: getRiskControlStatus });
  useEffect(() => setPage(1), [debounced]);
  const logsQuery = useQuery({ queryKey: ['risk-control-logs', debounced, page], queryFn: () => listRiskControlLogs(debounced, page) });

  useEffect(() => {
    if (!configQuery.data) return;
    setEnabled(configQuery.data.enabled);
    setMode(configQuery.data.mode);
    setAutoBan(configQuery.data.auto_ban_enabled);
    setRecordNonHits(configQuery.data.record_non_hits);
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => updateRiskControlConfig({ enabled, mode, auto_ban_enabled: autoBan, record_non_hits: recordNonHits }),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['risk-control-config'] }), queryClient.invalidateQueries({ queryKey: ['risk-control-status'] })]); },
  });
  const unbanMutation = useMutation({ mutationFn: unbanRiskControlUser, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['risk-control-logs'] }) });
  const runtime = statusQuery.data;

  return (
    <>
      <LocalizedStackScreen options={{ title: '风控中心', headerShown: true }} />
      <ScreenShell title="风控中心" subtitle="内容审核、拦截与自动封禁" bottomInsetClassName="pb-8" safeAreaEdges={['bottom']} refreshing={logsQuery.isRefetching} onRefresh={() => Promise.all([configQuery.refetch(), statusQuery.refetch(), logsQuery.refetch()]).then(() => undefined)}>
        <View className="flex-row gap-2">{[['已处理', runtime?.processed ?? 0], ['错误', runtime?.errors ?? 0], ['队列', runtime?.queue_length ?? 0], ['风险哈希', runtime?.flagged_hash_count ?? 0]].map(([label, value]) => <View key={String(label)} className="flex-1 rounded-2xl bg-[#FFFFFF] dark:bg-[#111827] p-3"><Text className="text-[10px] text-[#6B778C] dark:text-[#9EABC0]">{label}</Text><Text className="mt-1 text-lg font-bold text-[#172033] dark:text-[#F4F7FB]">{value}</Text></View>)}</View>
        <View className="gap-3 rounded-[20px] border border-[#E2E9F3] dark:border-[#273449] bg-[#FFFFFF] dark:bg-[#111827] p-4">
          <Text className="text-lg font-bold text-[#172033] dark:text-[#F4F7FB]">审核策略</Text>
          <Pressable onPress={() => setEnabled((v) => !v)} className={`rounded-xl px-3 py-3 ${enabled ? 'bg-[#EAF2FF] dark:bg-[#172C55]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}><Text className={`text-xs font-bold ${enabled ? 'text-[#2F6DF6]' : 'text-[#475467] dark:text-[#C2CCDB]'}`}>{enabled ? '✓ 内容审核已启用' : '内容审核已停用'}</Text></Pressable>
          <View className="flex-row gap-2">{([['off', '关闭'], ['observe', '仅观察'], ['pre_block', '预拦截']] as const).map(([value, label]) => <Pressable key={value} onPress={() => setMode(value)} className={`flex-1 rounded-xl py-3 ${mode === value ? 'bg-[#2F6DF6]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}><Text className={`text-center text-xs font-bold ${mode === value ? 'text-white' : 'text-[#475467] dark:text-[#C2CCDB]'}`}>{label}</Text></Pressable>)}</View>
          <View className="flex-row gap-2"><Pressable onPress={() => setAutoBan((v) => !v)} className={`flex-1 rounded-xl p-3 ${autoBan ? 'bg-[#EAF2FF] dark:bg-[#172C55]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}><Text className={`text-center text-xs font-bold ${autoBan ? 'text-[#2F6DF6]' : 'text-[#475467] dark:text-[#C2CCDB]'}`}>{autoBan ? '✓ 自动封禁' : '自动封禁'}</Text></Pressable><Pressable onPress={() => setRecordNonHits((v) => !v)} className={`flex-1 rounded-xl p-3 ${recordNonHits ? 'bg-[#EAF2FF] dark:bg-[#172C55]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}><Text className={`text-center text-xs font-bold ${recordNonHits ? 'text-[#2F6DF6]' : 'text-[#475467] dark:text-[#C2CCDB]'}`}>{recordNonHits ? '✓ 记录未命中' : '记录未命中'}</Text></Pressable></View>
          {saveMutation.error ? <Text className="text-xs text-[#D9475C]">{(saveMutation.error as Error).message}</Text> : null}
          <Pressable onPress={() => saveMutation.mutate()} className="rounded-2xl bg-[#2F6DF6] py-3.5"><Text className="text-center text-sm font-bold text-white">保存策略</Text></Pressable>
        </View>
        <View className="flex-row items-center gap-2 rounded-2xl bg-[#FFFFFF] dark:bg-[#111827] px-4 py-3"><Search size={17} color="#6B778C" /><TextInput value={search} onChangeText={setSearch} placeholder="搜索用户、模型、请求 ID" placeholderTextColor="#98A2B3" className="flex-1 text-sm text-[#172033] dark:text-[#F4F7FB]" /></View>
        {logsQuery.data?.items.map((item) => <ListCard key={item.id} title={item.user_email || item.request_id} meta={`${item.provider}/${item.model} · ${new Date(item.created_at).toLocaleString()}`} badge={item.action || (item.flagged ? 'flagged' : 'pass')} badgeTone={item.flagged ? 'danger' : 'muted'}><Text className="text-xs leading-5 text-[#475467] dark:text-[#C2CCDB]">{item.matched_keyword || item.highest_category || item.input_excerpt || item.error || '无摘要'}</Text>{item.auto_banned && item.user_id ? <Pressable onPress={() => unbanMutation.mutate(item.user_id!)} className="mt-3 self-start rounded-xl bg-[#EAF2FF] dark:bg-[#172C55] px-3 py-2"><Text className="text-xs font-bold text-[#2F6DF6]">解除封禁</Text></Pressable> : null}</ListCard>)}
        {logsQuery.isError ? <Text className="text-sm text-[#D9475C]">{(logsQuery.error as Error).message}</Text> : null}
        <PaginationControls page={page} pages={logsQuery.data?.pages ?? 1} total={logsQuery.data?.total} onChange={setPage} />
      </ScreenShell>
    </>
  );
}
