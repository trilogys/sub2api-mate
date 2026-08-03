import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, Cpu, Database, Gauge, MemoryStick, Server, ShieldCheck, Timer, Zap } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { LineTrendChart } from '@/src/components/line-trend-chart';
import { ListCard } from '@/src/components/list-card';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
import { PaginationControls } from '@/src/components/pagination-controls';
import { ScreenShell } from '@/src/components/screen-shell';
import { Text, TextInput, localizedAlert } from '@/src/components/localized-text';
import { formatTokenValue } from '@/src/lib/formatters';
import { listGroups } from '@/src/services/admin';
import {
  getOpsAccountAvailability,
  getOpsAdvancedSettings,
  getOpsConcurrency,
  getOpsErrorDistribution,
  getOpsErrorTrend,
  getOpsLatencyHistogram,
  getOpsMetricThresholds,
  getOpsOpenAITokenStats,
  getOpsOverview,
  getOpsRealtimeTraffic,
  getOpsSnapshot,
  getOpsSystemLogHealth,
  getOpsThroughputTrend,
  listOfficialOpsAlertEvents,
  listOfficialOpsSystemLogs,
  listOpsRequests,
  updateOfficialOpsAlertEventStatus,
  updateOpsAdvancedSettings,
  updateOpsMetricThresholds,
} from '@/src/services/ops';
import type { OpsAdvancedSettings, OpsMetricThresholds, OpsQueryMode, OpsRequestDetail, OpsTimeRange } from '@/src/types/ops';

type OpsTab = 'overview' | 'requests' | 'alerts' | 'logs' | 'settings';
type RequestKind = 'all' | 'success' | 'error';

const timeRanges: Array<[OpsTimeRange, string]> = [['5m', '5m'], ['30m', '30m'], ['1h', '1h'], ['6h', '6h'], ['24h', '24h']];
const platforms = ['', 'openai', 'anthropic', 'gemini', 'antigravity', 'grok'];

function compact(value?: number | null) {
  return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value ?? 0);
}

function percent(value?: number | null) {
  const next = value ?? 0;
  return `${(next >= 0 && next <= 1 ? next * 100 : next).toFixed(2)}%`;
}

function milliseconds(value?: number | null) {
  return value == null ? '-' : `${Math.round(value)} ms`;
}

function timeLabel(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function OpsCenterScreen() {
  const client = useQueryClient();
  const [tab, setTab] = useState<OpsTab>('overview');
  const [timeRange, setTimeRange] = useState<OpsTimeRange>('1h');
  const [platform, setPlatform] = useState('');
  const [groupId, setGroupId] = useState<number | null>(null);
  const [queryMode, setQueryMode] = useState<OpsQueryMode>('auto');
  const [requestKind, setRequestKind] = useState<RequestKind>('all');
  const [requestSearch, setRequestSearch] = useState('');
  const [requestPage, setRequestPage] = useState(1);
  const [selectedRequest, setSelectedRequest] = useState<OpsRequestDetail | null>(null);
  const [logSearch, setLogSearch] = useState('');
  const [logLevel, setLogLevel] = useState('');
  const [logPage, setLogPage] = useState(1);
  const [settingsDraft, setSettingsDraft] = useState<OpsAdvancedSettings | null>(null);
  const [thresholdDraft, setThresholdDraft] = useState<Record<keyof OpsMetricThresholds, string>>({
    sla_percent_min: '',
    ttft_p99_ms_max: '',
    request_error_rate_percent_max: '',
    upstream_error_rate_percent_max: '',
  });

  const params = useMemo(() => ({
    time_range: timeRange,
    platform: platform || undefined,
    group_id: groupId,
    mode: queryMode,
  }), [groupId, platform, queryMode, timeRange]);
  const tokenStatsTimeRange = timeRange === '1h' ? '1h' : timeRange === '5m' || timeRange === '30m' ? '30m' : '1d';

  const advancedQuery = useQuery({ queryKey: ['ops-advanced-settings'], queryFn: getOpsAdvancedSettings });
  const refreshInterval = advancedQuery.data?.auto_refresh_enabled
    ? Math.max(10, advancedQuery.data.auto_refresh_interval_seconds || 30) * 1000
    : false;

  const coreQuery = useQuery({
    queryKey: ['ops-snapshot-v2', params],
    queryFn: async () => {
      try {
        return await getOpsSnapshot(params);
      } catch {
        const [overview, throughputTrend, errorTrend] = await Promise.all([
          getOpsOverview(params),
          getOpsThroughputTrend(params),
          getOpsErrorTrend(params),
        ]);
        return { generated_at: new Date().toISOString(), overview, throughput_trend: throughputTrend, error_trend: errorTrend };
      }
    },
    refetchInterval: refreshInterval,
  });
  const latencyQuery = useQuery({ queryKey: ['ops-latency', params], queryFn: () => getOpsLatencyHistogram(params), refetchInterval: refreshInterval });
  const errorDistributionQuery = useQuery({ queryKey: ['ops-error-distribution', params], queryFn: () => getOpsErrorDistribution(params), refetchInterval: refreshInterval });
  const concurrencyQuery = useQuery({ queryKey: ['ops-concurrency', platform, groupId], queryFn: () => getOpsConcurrency({ platform: platform || undefined, group_id: groupId }), refetchInterval: refreshInterval });
  const availabilityQuery = useQuery({ queryKey: ['ops-availability', platform, groupId], queryFn: () => getOpsAccountAvailability({ platform: platform || undefined, group_id: groupId }), refetchInterval: refreshInterval });
  const realtimeQuery = useQuery({ queryKey: ['ops-realtime', platform, groupId], queryFn: () => getOpsRealtimeTraffic({ window: '1m', platform: platform || undefined, group_id: groupId }), refetchInterval: 5000 });
  const groupsQuery = useQuery({ queryKey: ['ops-groups'], queryFn: () => listGroups('', 1, 100) });
  const alertsQuery = useQuery({
    queryKey: ['ops-alert-events-official', params],
    queryFn: () => listOfficialOpsAlertEvents({ time_range: timeRange, platform: platform || undefined, group_id: groupId, limit: 100 }),
    refetchInterval: refreshInterval || 30000,
  });
  const tokenStatsQuery = useQuery({
    queryKey: ['ops-openai-token-stats', timeRange, platform, groupId],
    queryFn: () => getOpsOpenAITokenStats({ time_range: tokenStatsTimeRange, platform: platform || undefined, group_id: groupId, page_size: 10 }),
    enabled: advancedQuery.data?.display_openai_token_stats === true,
    refetchInterval: refreshInterval,
  });
  const requestsQuery = useQuery({
    queryKey: ['ops-requests', params, requestKind, requestSearch, requestPage],
    queryFn: () => listOpsRequests({ time_range: timeRange, platform: platform || undefined, group_id: groupId, kind: requestKind, q: requestSearch.trim() || undefined, page: requestPage, page_size: 20, sort: 'created_at_desc' }),
    enabled: tab === 'requests',
    refetchInterval: tab === 'requests' ? refreshInterval : false,
  });
  const logsQuery = useQuery({
    queryKey: ['ops-system-logs-official', params, logLevel, logSearch, logPage],
    queryFn: () => listOfficialOpsSystemLogs({ time_range: timeRange, platform: platform || undefined, level: logLevel || undefined, q: logSearch.trim() || undefined, page: logPage, page_size: 20 }),
    enabled: tab === 'logs',
    refetchInterval: tab === 'logs' ? refreshInterval : false,
  });
  const logHealthQuery = useQuery({ queryKey: ['ops-system-log-health'], queryFn: getOpsSystemLogHealth, enabled: tab === 'logs', refetchInterval: tab === 'logs' ? 30000 : false });
  const thresholdsQuery = useQuery({ queryKey: ['ops-metric-thresholds'], queryFn: getOpsMetricThresholds, enabled: tab === 'settings' });

  useEffect(() => { if (advancedQuery.data) setSettingsDraft(advancedQuery.data); }, [advancedQuery.data]);
  useEffect(() => {
    if (!thresholdsQuery.data) return;
    setThresholdDraft({
      sla_percent_min: `${thresholdsQuery.data.sla_percent_min ?? ''}`,
      ttft_p99_ms_max: `${thresholdsQuery.data.ttft_p99_ms_max ?? ''}`,
      request_error_rate_percent_max: `${thresholdsQuery.data.request_error_rate_percent_max ?? ''}`,
      upstream_error_rate_percent_max: `${thresholdsQuery.data.upstream_error_rate_percent_max ?? ''}`,
    });
  }, [thresholdsQuery.data]);

  const resolveAlertMutation = useMutation({
    mutationFn: (id: number) => updateOfficialOpsAlertEventStatus(id, 'manual_resolved'),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['ops-alert-events-official'] }); localizedAlert('处理成功', '告警已标记为解决。'); },
    onError: (error) => localizedAlert('处理失败', error instanceof Error && error.message ? error.message : '请稍后重试。'),
  });
  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      if (!settingsDraft) throw new Error('设置尚未加载');
      const thresholds = Object.fromEntries(Object.entries(thresholdDraft).map(([key, value]) => [key, value.trim() === '' ? null : Number(value)])) as OpsMetricThresholds;
      const [settings] = await Promise.all([updateOpsAdvancedSettings(settingsDraft), updateOpsMetricThresholds(thresholds)]);
      return settings;
    },
    onSuccess: async (settings) => {
      setSettingsDraft(settings);
      await Promise.all([client.invalidateQueries({ queryKey: ['ops-advanced-settings'] }), client.invalidateQueries({ queryKey: ['ops-metric-thresholds'] })]);
      localizedAlert('保存成功', '运维监控设置已更新。');
    },
    onError: (error) => localizedAlert('保存失败', error instanceof Error && error.message ? error.message : '请稍后重试。'),
  });

  const overview = coreQuery.data?.overview;
  const throughput = coreQuery.data?.throughput_trend.points ?? [];
  const errorTrend = coreQuery.data?.error_trend.points ?? [];
  const firing = alertsQuery.data?.filter((item) => item.status === 'firing').length ?? 0;
  const realtime = realtimeQuery.data?.summary;
  const platformConcurrency = Object.values(concurrencyQuery.data?.platform ?? {});
  const platformAvailability = Object.values(availabilityQuery.data?.platform ?? {});
  const groupItems = groupsQuery.data?.items ?? [];
  const refreshing = [coreQuery, latencyQuery, errorDistributionQuery, concurrencyQuery, availabilityQuery, realtimeQuery].some((item) => item.isRefetching);

  const refresh = async () => {
    await Promise.all([
      coreQuery.refetch(), latencyQuery.refetch(), errorDistributionQuery.refetch(), concurrencyQuery.refetch(), availabilityQuery.refetch(), realtimeQuery.refetch(), alertsQuery.refetch(),
      tab === 'requests' ? requestsQuery.refetch() : Promise.resolve(),
      tab === 'logs' ? Promise.all([logsQuery.refetch(), logHealthQuery.refetch()]) : Promise.resolve(),
    ]);
  };

  const changeTab = (next: OpsTab) => { setTab(next); setSelectedRequest(null); };

  return (
    <>
      <LocalizedStackScreen options={{ title: '运维监控', headerShown: true }} />
      <ScreenShell
        title="运维监控"
        subtitle={`${advancedQuery.data?.auto_refresh_enabled ? `${advancedQuery.data.auto_refresh_interval_seconds}s 自动刷新` : '自动刷新已关闭'} · ${firing ? `${firing} 条活动告警` : '当前稳定'} · ${timeLabel(coreQuery.data?.generated_at)}`}
        safeAreaEdges={['bottom']}
        bottomInsetClassName="pb-8"
        refreshing={refreshing}
        onRefresh={() => refresh().then(() => undefined)}
      >
        <View className="flex-row flex-wrap gap-2">
          {([['overview', '实时概览'], ['requests', '请求详情'], ['alerts', `告警 ${firing}`], ['logs', '系统日志'], ['settings', '运维设置']] as const).map(([value, label]) => (
            <AdminChip key={value} label={label} selected={tab === value} onPress={() => changeTab(value)} />
          ))}
        </View>

        {tab !== 'settings' ? (
          <AdminSection title="监控范围" detail="使用官方 Ops 时间、平台、分组和查询模式参数">
            <View className="flex-row flex-wrap gap-2">{timeRanges.map(([value, label]) => <AdminChip key={value} label={label} selected={timeRange === value} onPress={() => setTimeRange(value)} />)}</View>
            <View className="flex-row flex-wrap gap-2">{platforms.map((value) => <AdminChip key={value || 'all'} label={value || '全部平台'} selected={platform === value} onPress={() => { setPlatform(value); setGroupId(null); }} />)}</View>
            {groupItems.length ? <View className="flex-row flex-wrap gap-2"><AdminChip label="全部分组" selected={groupId == null} onPress={() => setGroupId(null)} />{groupItems.slice(0, 12).map((group) => <AdminChip key={group.id} label={group.name} selected={groupId === group.id} onPress={() => setGroupId(group.id)} />)}</View> : null}
            <AdminField label="分组 ID（可选）" keyboardType="number-pad" value={groupId == null ? '' : `${groupId}`} onChangeText={(value) => setGroupId(value.trim() ? Number.parseInt(value, 10) || null : null)} placeholder="输入未显示在上方的分组 ID" />
            <View className="flex-row flex-wrap gap-2">{(['auto', 'raw', 'preagg'] as const).map((value) => <AdminChip key={value} label={value.toUpperCase()} selected={queryMode === value} onPress={() => setQueryMode(value)} />)}</View>
          </AdminSection>
        ) : null}

        {tab === 'overview' ? (
          <>
            <AdminMessage error={coreQuery.error || latencyQuery.error || errorDistributionQuery.error} />
            <View className="flex-row gap-2"><Metric label="健康评分" value={`${overview?.health_score ?? 0}`} icon={ShieldCheck} tone={(overview?.health_score ?? 0) >= 80 ? 'green' : 'amber'} /><Metric label="SLA" value={percent(overview?.sla)} icon={Gauge} tone={(overview?.sla ?? 100) >= 99 ? 'green' : 'red'} /></View>
            <View className="flex-row gap-2"><Metric label="请求总数" value={compact(overview?.request_count_total)} icon={Activity} tone="blue" /><Metric label="Token" value={formatTokenValue(overview?.token_consumed ?? 0)} icon={Zap} tone="purple" /></View>
            <View className="flex-row gap-2"><Metric label="请求错误率" value={percent(overview?.error_rate)} icon={AlertTriangle} tone={(overview?.error_rate ?? 0) > 0 ? 'red' : 'green'} /><Metric label="上游错误率" value={percent(overview?.upstream_error_rate)} icon={Server} tone={(overview?.upstream_error_rate ?? 0) > 0 ? 'red' : 'green'} /></View>

            <AdminSection title="实时流量" detail="1 分钟实时窗口，每 5 秒更新">
              <View className="flex-row gap-2"><Metric label="QPS 当前" value={(realtime?.qps.current ?? overview?.qps.current ?? 0).toFixed(2)} icon={Activity} tone="blue" compactCard /><Metric label="TPS 当前" value={(realtime?.tps.current ?? overview?.tps.current ?? 0).toFixed(2)} icon={Zap} tone="green" compactCard /></View>
              <View className="flex-row gap-2"><Metric label="QPS 峰值 / 平均" value={`${(realtime?.qps.peak ?? overview?.qps.peak ?? 0).toFixed(1)} / ${(realtime?.qps.avg ?? overview?.qps.avg ?? 0).toFixed(1)}`} icon={Gauge} tone="blue" compactCard /><Metric label="TPS 峰值 / 平均" value={`${(realtime?.tps.peak ?? overview?.tps.peak ?? 0).toFixed(1)} / ${(realtime?.tps.avg ?? overview?.tps.avg ?? 0).toFixed(1)}`} icon={Gauge} tone="green" compactCard /></View>
            </AdminSection>

            <AdminSection title="耗时与 TTFT" detail="官方 Ops 百分位统计">
              <PercentileRow label="请求耗时" value={overview?.duration} />
              <PercentileRow label="TTFT" value={overview?.ttft} />
            </AdminSection>

            {throughput.length > 1 ? (
              <>
                <LineTrendChart title="请求趋势" subtitle={`${timeRange} · ${coreQuery.data?.throughput_trend.bucket || '自动粒度'}`} points={throughput.map((point) => ({ label: point.bucket_start.slice(11, 16), value: point.request_count }))} color="#2F6DF6" formatValue={compact} compact />
                <LineTrendChart title="吞吐趋势" subtitle="TPS" points={throughput.map((point) => ({ label: point.bucket_start.slice(11, 16), value: point.tps }))} color="#18A874" formatValue={(value) => value.toFixed(2)} compact />
                <LineTrendChart title="账号切换趋势" subtitle="账号池切换次数" points={throughput.map((point) => ({ label: point.bucket_start.slice(11, 16), value: point.switch_count ?? 0 }))} color="#8B5CF6" formatValue={compact} compact />
              </>
            ) : <EmptyState label="暂无足够趋势数据" />}

            <View className="gap-3">
              {latencyQuery.data?.buckets?.length ? <LineTrendChart title="延迟分布" subtitle={`${compact(latencyQuery.data.total_requests)} 个请求`} points={latencyQuery.data.buckets.map((item) => ({ label: item.range, value: item.count }))} color="#F59E0B" formatValue={compact} compact /> : null}
              {errorTrend.length ? <LineTrendChart title="错误趋势" subtitle="请求错误总数" points={errorTrend.map((item) => ({ label: item.bucket_start.slice(11, 16), value: item.error_count_total }))} color="#D9475C" formatValue={compact} compact /> : null}
              {errorDistributionQuery.data?.items?.length ? <LineTrendChart title="错误分布" subtitle={`${compact(errorDistributionQuery.data.total)} 个错误`} points={errorDistributionQuery.data.items.map((item) => ({ label: `${item.status_code}`, value: item.total }))} color="#D9475C" formatValue={compact} compact /> : null}
            </View>

            <AdminSection title="并发与队列" detail={concurrencyQuery.data?.enabled ? '实时并发状态' : '服务端并发监控未启用'}>
              {platformConcurrency.length ? platformConcurrency.map((item) => <ProgressRow key={item.platform} label={item.platform} value={`${item.current_in_use}/${item.max_capacity || '∞'}`} percent={item.load_percentage} detail={`等待 ${item.waiting_in_queue}`} />) : <EmptyState label="暂无并发数据" />}
            </AdminSection>

            <AdminSection title="账号可用性" detail={availabilityQuery.data?.enabled ? '平台账号池状态' : '服务端可用性监控未启用'}>
              {platformAvailability.length ? platformAvailability.map((item) => <AvailabilityRow key={item.platform} item={item} />) : <EmptyState label="暂无账号池数据" />}
            </AdminSection>

            <AdminSection title="系统状态" detail="CPU、内存、数据库、Redis、队列与后台任务">
              <SystemMetrics metrics={overview?.system_metrics} />
              {overview?.job_heartbeats?.map((job) => <HealthRow key={job.job_name} label={job.job_name} value={job.last_error ? '异常' : timeLabel(job.last_success_at || job.last_run_at)} healthy={!job.last_error} />)}
            </AdminSection>

            {coreQuery.data?.throughput_trend.by_platform?.length ? <AdminSection title="平台吞吐" detail="按平台拆分"><View className="gap-2">{coreQuery.data.throughput_trend.by_platform.map((item) => <HealthRow key={item.platform} label={item.platform} value={`${compact(item.request_count)} 请求 · ${formatTokenValue(item.token_consumed)} Token`} healthy />)}</View></AdminSection> : null}
            {coreQuery.data?.throughput_trend.top_groups?.length ? <AdminSection title="分组吞吐" detail="请求量最高的分组"><View className="gap-2">{coreQuery.data.throughput_trend.top_groups.map((item) => <HealthRow key={item.group_id} label={item.group_name} value={`${compact(item.request_count)} 请求`} healthy />)}</View></AdminSection> : null}

            {advancedQuery.data?.display_openai_token_stats ? <AdminSection title="OpenAI Token 性能" detail="按模型统计输出速度和首 Token 延迟">{tokenStatsQuery.data?.items?.length ? tokenStatsQuery.data.items.map((item) => <View key={item.model} className="rounded-2xl bg-[#F4F7FC] p-3 dark:bg-[#0B1220]"><Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{item.model}</Text><Text className="mt-1 text-[11px] text-[#667085] dark:text-[#9EABC0]">{item.request_count} 请求 · {item.avg_tokens_per_sec?.toFixed(1) ?? '-'} tok/s · TTFT {milliseconds(item.avg_first_token_ms)}</Text></View>) : <EmptyState label="暂无 OpenAI Token 统计" />}</AdminSection> : null}
          </>
        ) : null}

        {tab === 'requests' ? (
          <>
            <AdminSection title="请求检索" detail="官方 Ops 请求明细">
              <View className="flex-row flex-wrap gap-2">{([['all', '全部'], ['success', '成功'], ['error', '错误']] as const).map(([value, label]) => <AdminChip key={value} label={label} selected={requestKind === value} onPress={() => { setRequestKind(value); setRequestPage(1); }} />)}</View>
              <View className="flex-row items-center rounded-2xl bg-[#F1F5FA] px-3 dark:bg-[#182235]"><TextInput value={requestSearch} onChangeText={(value) => { setRequestSearch(value); setRequestPage(1); }} placeholder="请求 ID、模型或消息" placeholderTextColor="#98A2B3" className="min-h-11 flex-1 text-sm text-[#172033] dark:text-[#F4F7FB]" /></View>
            </AdminSection>
            <AdminMessage error={requestsQuery.error} />
            {requestsQuery.data?.items.map((item) => <RequestCard key={`${item.kind}-${item.request_id}-${item.created_at}`} item={item} expanded={selectedRequest === item} onToggle={() => setSelectedRequest((current) => current === item ? null : item)} />)}
            {!requestsQuery.isLoading && !requestsQuery.data?.items.length ? <EmptyState label="当前筛选下没有请求" /> : null}
            <PaginationControls page={requestPage} pages={requestsQuery.data?.pages ?? 1} total={requestsQuery.data?.total} onChange={setRequestPage} />
          </>
        ) : null}

        {tab === 'alerts' ? (
          <>
            <AdminMessage error={alertsQuery.error || resolveAlertMutation.error} />
            {alertsQuery.data?.map((item) => <ListCard key={item.id} title={item.title || `告警规则 #${item.rule_id}`} meta={`${item.description || `${item.metric_value ?? '-'} / ${item.threshold_value ?? '-'}`} · ${timeLabel(item.fired_at)}`} badge={`${item.severity} · ${item.status}`} badgeTone={item.status === 'firing' ? 'danger' : 'success'}>{item.status === 'firing' ? <AdminButton label="标记已解决" pending={resolveAlertMutation.isPending} onPress={() => resolveAlertMutation.mutate(item.id)} /> : null}</ListCard>)}
            {!alertsQuery.isLoading && !alertsQuery.data?.length ? <EmptyState label="最近没有告警" /> : null}
          </>
        ) : null}

        {tab === 'logs' ? (
          <>
            <AdminSection title="日志写入健康" detail="服务端结构化日志队列">
              <View className="flex-row gap-2"><Metric label="队列" value={`${logHealthQuery.data?.queue_depth ?? 0}/${logHealthQuery.data?.queue_capacity ?? 0}`} icon={Database} tone="blue" compactCard /><Metric label="丢弃 / 失败" value={`${logHealthQuery.data?.dropped_count ?? 0} / ${logHealthQuery.data?.write_failed_count ?? 0}`} icon={AlertTriangle} tone={(logHealthQuery.data?.dropped_count || logHealthQuery.data?.write_failed_count) ? 'red' : 'green'} compactCard /></View>
              <HealthRow label="平均写入延迟" value={milliseconds(logHealthQuery.data?.avg_write_delay_ms)} healthy={!logHealthQuery.data?.last_error} />
            </AdminSection>
            <AdminSection title="日志筛选">
              <View className="flex-row flex-wrap gap-2">{[['', '全部'], ['debug', 'DEBUG'], ['info', 'INFO'], ['warn', 'WARN'], ['error', 'ERROR']].map(([value, label]) => <AdminChip key={value || 'all'} label={label} selected={logLevel === value} onPress={() => { setLogLevel(value); setLogPage(1); }} />)}</View>
              <AdminField label="搜索" value={logSearch} onChangeText={(value) => { setLogSearch(value); setLogPage(1); }} placeholder="消息、组件或 Request ID" />
            </AdminSection>
            <AdminMessage error={logsQuery.error || logHealthQuery.error} />
            {logsQuery.data?.items.map((item) => <ListCard key={item.id} title={`${item.level.toUpperCase()} · ${item.component || item.host}`} meta={`${item.message} · ${timeLabel(item.created_at)}`} badge={item.platform || item.host} badgeTone={item.level === 'error' ? 'danger' : 'muted'}><View className="gap-1"><Text selectable className="text-[11px] text-[#667085] dark:text-[#9EABC0]">Request {item.request_id || '-'}</Text><Text className="text-[11px] text-[#667085] dark:text-[#9EABC0]">{item.platform || '-'} / {item.model || '-'} · User {item.user_id ?? '-'} · Account {item.account_id ?? '-'}</Text></View></ListCard>)}
            {!logsQuery.isLoading && !logsQuery.data?.items.length ? <EmptyState label="没有匹配的系统日志" /> : null}
            <PaginationControls page={logPage} pages={logsQuery.data?.pages ?? 1} total={logsQuery.data?.total} onChange={setLogPage} />
          </>
        ) : null}

        {tab === 'settings' ? (
          <>
            <AdminMessage error={advancedQuery.error || thresholdsQuery.error || saveSettingsMutation.error} />
            {settingsDraft ? <AdminSection title="仪表盘设置" detail="与官方 Ops 高级设置保持一致">
              <ToggleRow label="自动刷新" detail="按服务端保存的间隔刷新" value={settingsDraft.auto_refresh_enabled} onChange={(value) => setSettingsDraft({ ...settingsDraft, auto_refresh_enabled: value })} />
              <View className="flex-row flex-wrap gap-2">{[10, 30, 60, 120].map((seconds) => <AdminChip key={seconds} label={`${seconds}s`} selected={settingsDraft.auto_refresh_interval_seconds === seconds} onPress={() => setSettingsDraft({ ...settingsDraft, auto_refresh_interval_seconds: seconds })} />)}</View>
              <ToggleRow label="展示告警事件" detail="在运维监控中加载告警" value={settingsDraft.display_alert_events} onChange={(value) => setSettingsDraft({ ...settingsDraft, display_alert_events: value })} />
              <ToggleRow label="展示 OpenAI Token 统计" detail="加载按模型性能统计" value={settingsDraft.display_openai_token_stats} onChange={(value) => setSettingsDraft({ ...settingsDraft, display_openai_token_stats: value })} />
            </AdminSection> : <EmptyState label="正在加载运维设置" />}
            <AdminSection title="指标阈值" detail="用于 SLA、TTFT 和错误率告警着色">
              <AdminField label="SLA 最低百分比" keyboardType="decimal-pad" value={thresholdDraft.sla_percent_min} onChangeText={(value) => setThresholdDraft({ ...thresholdDraft, sla_percent_min: value })} />
              <AdminField label="TTFT P99 上限（ms）" keyboardType="number-pad" value={thresholdDraft.ttft_p99_ms_max} onChangeText={(value) => setThresholdDraft({ ...thresholdDraft, ttft_p99_ms_max: value })} />
              <AdminField label="请求错误率上限（%）" keyboardType="decimal-pad" value={thresholdDraft.request_error_rate_percent_max} onChangeText={(value) => setThresholdDraft({ ...thresholdDraft, request_error_rate_percent_max: value })} />
              <AdminField label="上游错误率上限（%）" keyboardType="decimal-pad" value={thresholdDraft.upstream_error_rate_percent_max} onChangeText={(value) => setThresholdDraft({ ...thresholdDraft, upstream_error_rate_percent_max: value })} />
            </AdminSection>
            <AdminButton label="保存运维设置" pending={saveSettingsMutation.isPending} disabled={!settingsDraft} onPress={() => saveSettingsMutation.mutate()} />
          </>
        ) : null}
      </ScreenShell>
    </>
  );
}

function Metric({ label, value, icon: Icon, tone, compactCard = false }: { label: string; value: string; icon: typeof Activity; tone: 'blue' | 'green' | 'red' | 'amber' | 'purple'; compactCard?: boolean }) {
  const color = tone === 'green' ? '#169B68' : tone === 'red' ? '#D9475C' : tone === 'amber' ? '#D88A18' : tone === 'purple' ? '#8B5CF6' : '#2F6DF6';
  return <View className={`min-w-0 flex-1 rounded-[18px] border border-[#E2E9F3] bg-white p-3 dark:border-[#273449] dark:bg-[#111827] ${compactCard ? 'min-h-[78px]' : 'min-h-[96px]'}`}><View className="flex-row items-center gap-2"><Icon size={14} color={color} /><Text numberOfLines={1} className="flex-1 text-[10px] text-[#7B8798] dark:text-[#9EABC0]">{label}</Text></View><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={{ color }} className={`mt-3 font-extrabold ${compactCard ? 'text-base' : 'text-xl'}`}>{value}</Text></View>;
}

function PercentileRow({ label, value }: { label: string; value?: { p50_ms?: number | null; p90_ms?: number | null; p95_ms?: number | null; p99_ms?: number | null; avg_ms?: number | null; max_ms?: number | null } }) {
  return <View className="rounded-2xl bg-[#F4F7FC] p-3 dark:bg-[#0B1220]"><Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{label}</Text><View className="mt-2 flex-row flex-wrap gap-2">{[['P50', value?.p50_ms], ['P90', value?.p90_ms], ['P95', value?.p95_ms], ['P99', value?.p99_ms], ['AVG', value?.avg_ms], ['MAX', value?.max_ms]].map(([name, amount]) => <View key={`${name}`} className="min-w-[29%] flex-1 rounded-xl bg-white px-2 py-2 dark:bg-[#182235]"><Text className="text-[9px] text-[#7C8AA0] dark:text-[#9EABC0]">{name}</Text><Text numberOfLines={1} className="mt-1 text-[11px] font-bold text-[#172033] dark:text-[#F4F7FB]">{milliseconds(amount as number | null)}</Text></View>)}</View></View>;
}

function ProgressRow({ label, value, percent: progress, detail }: { label: string; value: string; percent: number; detail: string }) {
  const safe = Math.max(0, Math.min(progress || 0, 100));
  return <View className="rounded-2xl bg-[#F4F7FC] p-3 dark:bg-[#0B1220]"><View className="flex-row items-center"><Text className="flex-1 text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{label}</Text><Text className="text-xs font-bold text-[#2F6DF6]">{value}</Text></View><View className="mt-2 h-2 overflow-hidden rounded-full bg-[#DCE6F4] dark:bg-[#273449]"><View style={{ width: `${safe}%` }} className="h-full rounded-full bg-[#2F6DF6]" /></View><Text className="mt-1 text-[10px] text-[#7C8AA0] dark:text-[#9EABC0]">负载 {safe.toFixed(1)}% · {detail}</Text></View>;
}

function AvailabilityRow({ item }: { item: { platform: string; total_accounts: number; available_count: number; rate_limit_count: number; error_count: number } }) {
  const healthy = item.error_count === 0 && item.rate_limit_count === 0;
  return <View className="rounded-2xl bg-[#F4F7FC] p-3 dark:bg-[#0B1220]"><View className="flex-row items-center"><View className={`mr-2 h-2 w-2 rounded-full ${healthy ? 'bg-[#20B26B]' : 'bg-[#D88A18]'}`} /><Text className="flex-1 text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{item.platform}</Text><Text className="text-xs text-[#2F6DF6]">{item.available_count}/{item.total_accounts}</Text></View><Text className="mt-2 text-[10px] text-[#7C8AA0] dark:text-[#9EABC0]">限流 {item.rate_limit_count} · 异常 {item.error_count}</Text></View>;
}

function SystemMetrics({ metrics }: { metrics?: { cpu_usage_percent?: number | null; memory_usage_percent?: number | null; db_ok?: boolean | null; redis_ok?: boolean | null; db_conn_active?: number | null; db_conn_idle?: number | null; db_conn_waiting?: number | null; redis_conn_total?: number | null; redis_conn_idle?: number | null; goroutine_count?: number | null; concurrency_queue_depth?: number | null; account_switch_count?: number | null } | null }) {
  if (!metrics) return <EmptyState label="服务端暂未返回系统指标" />;
  return <View className="gap-2"><HealthRow label="CPU" value={percent(metrics.cpu_usage_percent)} healthy={(metrics.cpu_usage_percent ?? 0) < 80} icon={Cpu} /><HealthRow label="内存" value={percent(metrics.memory_usage_percent)} healthy={(metrics.memory_usage_percent ?? 0) < 80} icon={MemoryStick} /><HealthRow label="数据库" value={`${metrics.db_conn_active ?? 0} 活跃 / ${metrics.db_conn_idle ?? 0} 空闲 / ${metrics.db_conn_waiting ?? 0} 等待`} healthy={metrics.db_ok !== false} icon={Database} /><HealthRow label="Redis" value={`${metrics.redis_conn_total ?? 0} 连接 / ${metrics.redis_conn_idle ?? 0} 空闲`} healthy={metrics.redis_ok !== false} icon={Server} /><HealthRow label="协程 / 队列" value={`${metrics.goroutine_count ?? 0} / ${metrics.concurrency_queue_depth ?? 0}`} healthy={(metrics.concurrency_queue_depth ?? 0) === 0} icon={Activity} /><HealthRow label="账号切换" value={`${metrics.account_switch_count ?? 0}`} healthy icon={Zap} /></View>;
}

function HealthRow({ label, value, healthy, icon: Icon = ShieldCheck }: { label: string; value: string; healthy: boolean; icon?: typeof ShieldCheck }) {
  return <View className="flex-row items-center rounded-xl bg-[#F4F7FC] px-3 py-2.5 dark:bg-[#0B1220]"><Icon size={13} color={healthy ? '#20B26B' : '#D9475C'} /><Text className="ml-2 flex-1 text-[11px] text-[#667085] dark:text-[#9EABC0]">{label}</Text><Text numberOfLines={2} className="max-w-[58%] text-right text-[11px] font-bold text-[#172033] dark:text-[#F4F7FB]">{value}</Text></View>;
}

function RequestCard({ item, expanded, onToggle }: { item: OpsRequestDetail; expanded: boolean; onToggle: () => void }) {
  return <ListCard title={item.model || 'Unknown model'} meta={`${item.platform || '-'} · ${timeLabel(item.created_at)}`} badge={`${item.status_code ?? '-'} · ${item.kind}`} badgeTone={item.kind === 'error' ? 'danger' : 'success'}><View className="gap-2"><View className="flex-row gap-2"><Metric label="耗时" value={milliseconds(item.duration_ms)} icon={Timer} tone="blue" compactCard /><Metric label="流式" value={item.stream ? 'YES' : 'NO'} icon={Zap} tone={item.stream ? 'green' : 'blue'} compactCard /></View><Pressable onPress={onToggle} className="rounded-xl bg-[#EAF2FF] px-3 py-2 dark:bg-[#172C55]"><Text className="text-center text-xs font-bold text-[#2F6DF6]">{expanded ? '收起详情' : '查看详情'}</Text></Pressable>{expanded ? <View className="gap-1 rounded-2xl bg-[#F4F7FC] p-3 dark:bg-[#0B1220]"><Detail label="Request ID" value={item.request_id} /><Detail label="User ID" value={item.user_id} /><Detail label="API Key ID" value={item.api_key_id} /><Detail label="Account ID" value={item.account_id} /><Detail label="Group ID" value={item.group_id} /><Detail label="Phase" value={item.phase} /><Detail label="Severity" value={item.severity} />{item.message ? <Text selectable className="mt-2 text-[11px] leading-5 text-[#D9475C]">{item.message}</Text> : null}</View> : null}</View></ListCard>;
}

function Detail({ label, value }: { label: string; value?: string | number | null }) {
  return <View className="flex-row"><Text className="w-[92px] text-[10px] text-[#7C8AA0] dark:text-[#9EABC0]">{label}</Text><Text selectable numberOfLines={2} className="min-w-0 flex-1 text-[10px] font-medium text-[#172033] dark:text-[#F4F7FB]">{value ?? '-'}</Text></View>;
}

function ToggleRow({ label, detail, value, onChange }: { label: string; detail: string; value: boolean; onChange: (value: boolean) => void }) {
  return <Pressable onPress={() => onChange(!value)} className="flex-row items-center rounded-2xl bg-[#F4F7FC] p-3 dark:bg-[#0B1220]"><View className="min-w-0 flex-1"><Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{label}</Text><Text className="mt-1 text-[10px] text-[#7C8AA0] dark:text-[#9EABC0]">{detail}</Text></View><View className={`ml-3 h-7 w-12 justify-center rounded-full px-1 ${value ? 'bg-[#2F6DF6]' : 'bg-[#CBD5E1]'}`}><View className={`h-5 w-5 rounded-full bg-white ${value ? 'self-end' : 'self-start'}`} /></View></Pressable>;
}
