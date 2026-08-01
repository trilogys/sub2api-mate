import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { ListCard } from '@/src/components/list-card';
import { PaginationControls } from '@/src/components/pagination-controls';
import { ScreenShell } from '@/src/components/screen-shell';
import { createChannelMonitor, deleteChannelMonitor, duplicateChannelMonitor, listChannelMonitors, runChannelMonitor, updateChannelMonitor } from '@/src/services/admin';
import type { ChannelMonitorRequest } from '@/src/types/admin';
import { Text, localizedAlert } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

type Provider = ChannelMonitorRequest['provider'];

export default function ChannelMonitorsScreen() {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [name, setName] = useState('');
  const [provider, setProvider] = useState<Provider>('openai');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [interval, setIntervalText] = useState('300');
  const query = useQuery({ queryKey: ['channel-monitors', page], queryFn: () => listChannelMonitors('', page), refetchInterval: 30000 });
  const refresh = async () => { await client.invalidateQueries({ queryKey: ['channel-monitors'] }); };
  const create = useMutation({ mutationFn: () => createChannelMonitor({ name: name.trim(), provider, endpoint: endpoint.trim(), api_key: apiKey.trim(), primary_model: model.trim(), interval_seconds: Number(interval), enabled: true }), onSuccess: async () => { setName(''); setApiKey(''); await refresh(); } });
  const toggle = useMutation({ mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => updateChannelMonitor(id, { enabled }), onSuccess: refresh });
  const duplicate = useMutation({ mutationFn: duplicateChannelMonitor, onSuccess: refresh });
  const remove = useMutation({ mutationFn: deleteChannelMonitor, onSuccess: refresh });
  const run = useMutation({ mutationFn: runChannelMonitor, onSuccess: refresh });

  return (
    <>
      <LocalizedStackScreen options={{ title: '渠道监控', headerShown: true }} />
      <ScreenShell title="渠道监控" subtitle={`${query.data?.total ?? 0} 个监控`} safeAreaEdges={['bottom']} bottomInsetClassName="pb-8" refreshing={query.isRefetching} onRefresh={() => query.refetch().then(() => undefined)}>
        <AdminSection title="创建监控" detail="定时探测 OpenAI、Anthropic、Gemini 或 Grok 兼容端点。API Key 仅提交给服务端保存。">
          <AdminField label="监控名称" value={name} onChangeText={setName} placeholder="主线路健康检查" />
          <View className="flex-row flex-wrap gap-2">{(['openai', 'anthropic', 'gemini', 'grok'] as const).map((item) => <AdminChip key={item} label={item} selected={provider === item} onPress={() => setProvider(item)} />)}</View>
          <AdminField label="接口地址" value={endpoint} onChangeText={setEndpoint} placeholder="https://api.example.com/v1" autoCapitalize="none" />
          <AdminField label="API Key" value={apiKey} onChangeText={setApiKey} placeholder="sk-..." autoCapitalize="none" secureTextEntry />
          <View className="flex-row gap-3"><View className="flex-1"><AdminField label="主测试模型" value={model} onChangeText={setModel} autoCapitalize="none" /></View><View className="w-28"><AdminField label="间隔（秒）" value={interval} onChangeText={setIntervalText} keyboardType="number-pad" /></View></View>
          <AdminButton label="创建渠道监控" pending={create.isPending} disabled={!name.trim() || !endpoint.trim() || !apiKey.trim() || !model.trim() || Number(interval) <= 0} onPress={() => create.mutate()} />
          <AdminMessage error={create.error} success={create.isSuccess ? '监控已创建' : undefined} />
        </AdminSection>

        {query.data?.items.map((item) => (
          <ListCard key={item.id} title={item.name} meta={`${item.provider} · ${item.primary_model} · ${item.primary_latency_ms ?? '-'}ms · 7日可用 ${item.availability_7d}%`} badge={item.primary_status || (item.enabled ? '等待检查' : '已停用')} badgeTone={item.primary_status === 'operational' ? 'success' : item.primary_status ? 'danger' : 'muted'}>
            <View className="mt-2 flex-row flex-wrap gap-3">
              <Pressable onPress={() => run.mutate(item.id)}><Text className="text-xs font-bold text-[#2F6DF6]">立即检查</Text></Pressable>
              <Pressable onPress={() => toggle.mutate({ id: item.id, enabled: !item.enabled })}><Text className="text-xs font-bold text-[#344054] dark:text-[#D5DDEA]">{item.enabled ? '停用' : '启用'}</Text></Pressable>
              <Pressable onPress={() => duplicate.mutate(item.id)}><Text className="text-xs font-bold text-[#344054] dark:text-[#D5DDEA]">复制</Text></Pressable>
              <Pressable onPress={() => localizedAlert('删除监控', `确定删除“${item.name}”吗？`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => remove.mutate(item.id) }])}><Text className="text-xs font-bold text-[#D9475C]">删除</Text></Pressable>
            </View>
          </ListCard>
        ))}
        {!query.isLoading && !query.data?.items.length ? <EmptyState /> : null}
        <AdminMessage error={query.error || toggle.error || duplicate.error || remove.error || run.error} success={run.data ? run.data.results.map((item) => `${item.model}: ${item.status} ${item.latency_ms ?? '-'}ms`).join('；') : undefined} />
        <PaginationControls page={page} pages={query.data?.pages ?? 1} total={query.data?.total} onChange={setPage} />
      </ScreenShell>
    </>
  );
}
