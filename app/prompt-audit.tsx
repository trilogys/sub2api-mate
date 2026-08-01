import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { ListCard } from '@/src/components/list-card';
import { PaginationControls } from '@/src/components/pagination-controls';
import { ScreenShell } from '@/src/components/screen-shell';
import { deletePromptAuditEvent, getPromptAuditConfig, getPromptAuditRuntime, listPromptAuditEvents, updatePromptAuditConfig } from '@/src/services/admin';
import type { PromptAuditConfig } from '@/src/types/admin';
import { Text, localizedAlert } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

export default function PromptAuditScreen() {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [config, setConfig] = useState<PromptAuditConfig | null>(null);
  const configQuery = useQuery({ queryKey: ['prompt-audit-config'], queryFn: getPromptAuditConfig });
  const runtimeQuery = useQuery({ queryKey: ['prompt-audit-runtime'], queryFn: getPromptAuditRuntime, refetchInterval: 15000 });
  const eventsQuery = useQuery({ queryKey: ['prompt-audit-events', page], queryFn: () => listPromptAuditEvents(page) });
  useEffect(() => { if (configQuery.data) setConfig(configQuery.data); }, [configQuery.data]);
  const save = useMutation({
    mutationFn: () => updatePromptAuditConfig(config!),
    onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ['prompt-audit-config'] }), client.invalidateQueries({ queryKey: ['prompt-audit-runtime'] })]); },
  });
  const remove = useMutation({ mutationFn: deletePromptAuditEvent, onSuccess: async () => { await client.invalidateQueries({ queryKey: ['prompt-audit-events'] }); } });
  const runtime = runtimeQuery.data;

  return (
    <>
      <LocalizedStackScreen options={{ title: '提示词审计', headerShown: true }} />
      <ScreenShell title="提示词审计" subtitle={`运行状态：${runtime?.process_status ?? '加载中'}`} safeAreaEdges={['bottom']} bottomInsetClassName="pb-8" refreshing={runtimeQuery.isRefetching || eventsQuery.isRefetching} onRefresh={async () => { await Promise.all([configQuery.refetch(), runtimeQuery.refetch(), eventsQuery.refetch()]); }}>
        <AdminSection title="运行状态" detail="审计工作进程、队列和持久化依赖的实时状态。">
          <View className="flex-row flex-wrap gap-2">
            <Text className="rounded-xl bg-[#EAF2FF] dark:bg-[#172C55] px-3 py-2 text-xs font-bold text-[#2F6DF6]">进程 {runtime?.process_status ?? '-'}</Text>
            <Text className="rounded-xl bg-[#E2E9F3] dark:bg-[#273449] px-3 py-2 text-xs text-[#344054] dark:text-[#D5DDEA]">Worker {runtime?.worker_active ?? 0}/{runtime?.worker_total ?? 0}</Text>
            <Text className="rounded-xl bg-[#E2E9F3] dark:bg-[#273449] px-3 py-2 text-xs text-[#344054] dark:text-[#D5DDEA]">已处理 {runtime?.processed_total ?? 0}</Text>
            <Text className="rounded-xl bg-[#E2E9F3] dark:bg-[#273449] px-3 py-2 text-xs text-[#344054] dark:text-[#D5DDEA]">失败 {runtime?.failed_total ?? 0}</Text>
          </View>
          {runtime?.last_error_message ? <Text className="text-xs leading-5 text-[#D9475C]">{runtime.last_error_message}</Text> : null}
        </AdminSection>

        {config ? (
          <AdminSection title="审计配置" detail={`配置版本 ${config.config_version} · ${config.endpoints.length} 个扫描端点`}>
            <View className="flex-row flex-wrap gap-2">
              <AdminChip label="启用审计" selected={config.enabled} onPress={() => setConfig({ ...config, enabled: !config.enabled })} />
              <AdminChip label="阻断模式" selected={config.blocking_enabled} onPress={() => setConfig({ ...config, blocking_enabled: !config.blocking_enabled })} />
              <AdminChip label="保存通过事件" selected={config.store_pass_events} onPress={() => setConfig({ ...config, store_pass_events: !config.store_pass_events })} />
              <AdminChip label="全部分组" selected={config.all_groups} onPress={() => setConfig({ ...config, all_groups: !config.all_groups })} />
            </View>
            <View className="flex-row gap-3"><View className="flex-1"><AdminField label="Worker 数" value={String(config.worker_count)} keyboardType="number-pad" onChangeText={(v) => setConfig({ ...config, worker_count: Number(v) || 1 })} /></View><View className="flex-1"><AdminField label="队列容量" value={String(config.queue_capacity)} keyboardType="number-pad" onChangeText={(v) => setConfig({ ...config, queue_capacity: Number(v) || 1 })} /></View></View>
            <AdminMessage error={save.error || configQuery.error} success={save.isSuccess ? '审计配置已保存' : undefined} />
            <AdminButton label="保存审计配置" pending={save.isPending} onPress={() => save.mutate()} />
          </AdminSection>
        ) : null}

        <AdminSection title="审计事件" detail={`${eventsQuery.data?.total ?? 0} 条记录`}>
          {eventsQuery.data?.items.map((item) => (
            <ListCard key={item.id} title={`${item.decision.toUpperCase()} · ${item.snapshot.model || item.snapshot.provider}`} meta={`${item.snapshot.user_email || '未知用户'} · ${item.snapshot.redacted_preview || '无预览'}`} badge={item.risk_level} badgeTone={item.decision === 'pass' ? 'success' : 'danger'}>
              <View className="mt-2 flex-row items-center justify-between"><Text className="text-xs text-[#6B778C] dark:text-[#9EABC0]">{item.categories.join(', ') || item.action} · {item.latency_ms}ms</Text><Pressable onPress={() => localizedAlert('删除审计事件', '此操作不可恢复，确定继续？', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => remove.mutate(item.id) }])}><Text className="text-xs font-bold text-[#D9475C]">删除</Text></Pressable></View>
            </ListCard>
          ))}
          {!eventsQuery.isLoading && !eventsQuery.data?.items.length ? <EmptyState /> : null}
          <AdminMessage error={eventsQuery.error || remove.error || runtimeQuery.error} />
          <PaginationControls page={page} pages={eventsQuery.data?.pages ?? 1} total={eventsQuery.data?.total} onChange={setPage} />
        </AdminSection>
      </ScreenShell>
    </>
  );
}
