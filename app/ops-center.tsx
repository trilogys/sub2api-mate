import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AdminChip, AdminField, AdminMessage, EmptyState } from '@/src/components/admin-ui';
import { LineTrendChart } from '@/src/components/line-trend-chart';
import { ListCard } from '@/src/components/list-card';
import { PaginationControls } from '@/src/components/pagination-controls';
import { ScreenShell } from '@/src/components/screen-shell';
import { getDashboardStats, getDashboardTrend, listOpsAlertEvents, listOpsSystemLogs, resolveOpsAlertEvent } from '@/src/services/admin';
import { Text } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

function iso(offsetHours: number) { const date = new Date(Date.now() + offsetHours * 3600000); return date.toISOString(); }
function compact(value?: number) { return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value ?? 0); }

export default function OpsCenterScreen() {
  const client = useQueryClient();
  const [tab, setTab] = useState<'overview' | 'alerts' | 'logs'>('overview');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const range = useMemo(() => ({ start_date: iso(-24), end_date: iso(0), granularity: 'hour' as const }), []);
  const stats = useQuery({ queryKey: ['ops-dashboard-stats'], queryFn: getDashboardStats, refetchInterval: 30000 });
  const trend = useQuery({ queryKey: ['ops-dashboard-trend', range], queryFn: () => getDashboardTrend(range), refetchInterval: 30000 });
  const alerts = useQuery({ queryKey: ['ops-alert-events'], queryFn: listOpsAlertEvents, enabled: tab !== 'logs', refetchInterval: 30000 });
  const logs = useQuery({ queryKey: ['ops-system-logs', search, page], queryFn: () => listOpsSystemLogs(search, page), enabled: tab === 'logs', refetchInterval: 30000 });
  const resolve = useMutation({ mutationFn: resolveOpsAlertEvent, onSuccess: async () => { await client.invalidateQueries({ queryKey: ['ops-alert-events'] }); } });
  const changeTab = (next: typeof tab) => { setTab(next); setPage(1); };
  const firing = alerts.data?.filter((item) => item.status === 'firing').length ?? 0;
  const points = trend.data?.trend ?? [];
  const refreshing = stats.isRefetching || trend.isRefetching || alerts.isRefetching || logs.isRefetching;
  const refresh = async () => { await Promise.all([stats.refetch(), trend.refetch(), tab === 'logs' ? logs.refetch() : alerts.refetch()]); };

  return <><LocalizedStackScreen options={{ title: '运维监控', headerShown: true }} /><ScreenShell title="运维监控" subtitle={`30 秒自动刷新 · ${firing ? `${firing} 条活动告警` : '当前稳定'}`} safeAreaEdges={['bottom']} bottomInsetClassName="pb-8" refreshing={refreshing} onRefresh={() => refresh().then(() => undefined)}>
    <View className="flex-row gap-2"><AdminChip label="实时概览" selected={tab === 'overview'} onPress={() => changeTab('overview')} /><AdminChip label={`告警 ${firing}`} selected={tab === 'alerts'} onPress={() => changeTab('alerts')} /><AdminChip label="系统日志" selected={tab === 'logs'} onPress={() => changeTab('logs')} /></View>
    {tab === 'overview' ? <>
      <View className="flex-row gap-2"><Metric label="RPM" value={compact(stats.data?.rpm)} tone="blue" /><Metric label="TPM" value={compact(stats.data?.tpm)} tone="green" /><Metric label="今日请求" value={compact(stats.data?.today_requests)} tone="blue" /></View>
      <View className="flex-row gap-2"><Metric label="正常账号" value={`${stats.data?.normal_accounts ?? 0}`} tone="green" /><Metric label="异常账号" value={`${stats.data?.error_accounts ?? 0}`} tone={stats.data?.error_accounts ? 'red' : 'green'} /><Metric label="活动密钥" value={`${stats.data?.active_api_keys ?? 0}`} tone="blue" /></View>
      {points.length > 1 ? <><LineTrendChart title="请求趋势" subtitle="最近 24 小时 · 每小时请求量" points={points.map((point) => ({ label: point.date.slice(11, 16), value: point.requests }))} color="#2F6DF6" formatValue={compact} compact /><LineTrendChart title="吞吐趋势" subtitle="最近 24 小时 · Token 消耗" points={points.map((point) => ({ label: point.date.slice(11, 16), value: point.total_tokens }))} color="#18A874" formatValue={compact} compact /></> : <EmptyState label="暂无足够趋势数据" />}
      <View className="rounded-[22px] border border-[#DDE6F2] dark:border-[#273449] bg-white dark:bg-[#111827] p-4"><Text className="text-sm font-bold text-[#172033] dark:text-[#F4F7FB]">运行健康</Text><View className="mt-3 gap-2"><HealthRow label="账号池" value={`${stats.data?.normal_accounts ?? 0} 正常 / ${stats.data?.error_accounts ?? 0} 异常`} healthy={!stats.data?.error_accounts} /><HealthRow label="告警" value={firing ? `${firing} 条待处理` : '无活动告警'} healthy={!firing} /><HealthRow label="刷新" value={new Date().toLocaleTimeString()} healthy /></View></View>
    </> : null}
    {tab === 'logs' ? <AdminField label="日志搜索" value={search} onChangeText={(value) => { setSearch(value); setPage(1); }} placeholder="消息、组件、request ID" /> : null}
    {tab === 'alerts' ? alerts.data?.map((item) => <ListCard key={item.id} title={item.title || `告警规则 #${item.rule_id}`} meta={`${item.description || `${item.metric_value ?? '-'} / ${item.threshold_value ?? '-'}`} · ${item.fired_at}`} badge={`${item.severity} · ${item.status}`} badgeTone={item.status === 'firing' ? 'danger' : 'success'}>{item.status === 'firing' ? <Pressable onPress={() => resolve.mutate(item.id)} className="mt-2"><Text className="text-xs font-bold text-[#2F6DF6]">标记已解决</Text></Pressable> : null}</ListCard>) : null}
    {tab === 'logs' ? logs.data?.items.map((item) => <ListCard key={item.id} title={`${item.level.toUpperCase()} · ${item.component || item.host}`} meta={`${item.message} · ${item.created_at}`} badge={item.platform || item.host} badgeTone={item.level === 'error' ? 'danger' : 'muted'}><Text className="mt-2 text-xs text-[#6B778C] dark:text-[#9EABC0]">{item.request_id ? `Request ${item.request_id}` : `${item.platform || '-'} / ${item.model || '-'}`}</Text></ListCard>) : null}
    {tab === 'alerts' && !alerts.isLoading && !alerts.data?.length ? <EmptyState label="最近没有告警" /> : null}{tab === 'logs' && !logs.isLoading && !logs.data?.items.length ? <EmptyState label="没有匹配的系统日志" /> : null}
    <AdminMessage error={stats.error || trend.error || alerts.error || logs.error || resolve.error} success={resolve.isSuccess ? '告警已标记解决' : undefined} />
    {tab === 'logs' ? <PaginationControls page={page} pages={logs.data?.pages ?? 1} total={logs.data?.total} onChange={setPage} /> : null}
  </ScreenShell></>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'green' | 'red' }) { const color = tone === 'green' ? '#169B68' : tone === 'red' ? '#D9475C' : '#2F6DF6'; return <View className="flex-1 rounded-[18px] border border-[#E2E9F3] dark:border-[#273449] bg-white dark:bg-[#111827] p-3"><Text className="text-[9px] text-[#7B8798] dark:text-[#9EABC0]">{label}</Text><Text numberOfLines={1} style={{ color }} className="mt-2 text-lg font-extrabold">{value}</Text></View>; }
function HealthRow({ label, value, healthy }: { label: string; value: string; healthy: boolean }) { return <View className="flex-row items-center rounded-xl bg-[#F4F7FC] dark:bg-[#0B1220] px-3 py-2"><View className={`mr-2 h-2 w-2 rounded-full ${healthy ? 'bg-[#20B26B]' : 'bg-[#D9475C]'}`} /><Text className="flex-1 text-[11px] text-[#667085] dark:text-[#9EABC0]">{label}</Text><Text className="text-[11px] font-bold text-[#172033] dark:text-[#F4F7FB]">{value}</Text></View>; }
