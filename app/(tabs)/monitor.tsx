import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { AlertTriangle, CheckCircle2, KeyRound, Server, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';
import { BarChartCard } from '@/src/components/bar-chart-card';
import { LineTrendChart } from '@/src/components/line-trend-chart';
import { getSessionDashboardModels, getSessionDashboardStats, getSessionDashboardTrend, listAccounts } from '@/src/services/admin';
import { adminConfigState, hasAuthenticatedAdminSession, isAdminSession } from '@/src/store/admin-config';
import { Text } from '@/src/components/localized-text';
const { useSnapshot } = require('valtio/react');
type Range = '24h' | '7d' | '30d';

function rangeFor(key: Range) { const end = new Date(); const start = new Date(end); if (key === '24h') start.setHours(start.getHours() - 23); else start.setDate(start.getDate() - (key === '7d' ? 6 : 29)); return { start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10), granularity: key === '24h' ? 'hour' as const : 'day' as const }; }
function compact(value?: number) { if (value == null) return '--'; return Intl.NumberFormat('zh-CN', { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value); }
function money(value?: number) { return value == null ? '--' : `$${value.toFixed(2)}`; }

export default function MonitorScreen() {
  const { theme } = useUniwind(); const dark = theme === 'dark';
  const config = useSnapshot(adminConfigState); const authenticated = hasAuthenticatedAdminSession(config); const admin = isAdminSession();
  const [range, setRange] = useState<Range>('7d'); const dates = useMemo(() => rangeFor(range), [range]);
  const stats = useQuery({ queryKey: ['session-dashboard-stats', admin], queryFn: getSessionDashboardStats, enabled: authenticated, staleTime: 60000 });
  const trend = useQuery({ queryKey: ['session-dashboard-trend', admin, range], queryFn: () => getSessionDashboardTrend(dates), enabled: authenticated, staleTime: 60000 });
  const models = useQuery({ queryKey: ['session-dashboard-models', admin, range], queryFn: () => getSessionDashboardModels(dates), enabled: authenticated, staleTime: 60000 });
  const accounts = useQuery({ queryKey: ['dashboard-accounts'], queryFn: () => listAccounts('', 1, 50), enabled: authenticated && admin, staleTime: 60000 });
  const refresh = () => { stats.refetch(); trend.refetch(); models.refetch(); if (admin) accounts.refetch(); };
  const points = trend.data?.trend ?? []; const data = stats.data; const refreshing = stats.isRefetching || trend.isRefetching || models.isRefetching || accounts.isRefetching;
  const totalTokens = points.reduce((sum, p) => sum + p.total_tokens, 0); const totalCost = points.reduce((sum, p) => sum + p.cost, 0);
  const cards = admin ? [
    ['用户', compact(data?.total_users), Users, '/users/overview'], ['API 密钥', compact(data?.total_api_keys), KeyRound, '/api-keys'], ['上游账号', compact(data?.total_accounts), Server, '/accounts/overview'], ['异常账号', compact(data?.error_accounts), AlertTriangle, '/ops-errors'],
  ] as const : [
    ['API 密钥', compact(data?.total_api_keys), KeyRound, '/api-keys'], ['今日请求', compact(data?.today_requests), CheckCircle2, '/usage-logs'], ['总请求', compact(data?.total_requests), Server, '/usage-logs'], ['今日消费', money(data?.today_cost), AlertTriangle, '/usage-logs'],
  ] as const;
  return <SafeAreaView style={{ flex: 1, backgroundColor: dark ? '#0B1220' : '#F4F7FC' }}><ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 50, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#2F6DF6" />}>
    <View style={{ marginTop: 16, paddingHorizontal: 4, paddingVertical: 4, flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}><View style={{ flex: 1 }}><Text style={{ fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: dark ? '#F4F7FB' : '#172033' }}>仪表盘</Text><Text numberOfLines={1} style={{ marginTop: 4, fontSize: 11, lineHeight: 16, color: dark ? '#9EABC0' : '#6B778C' }}>{config.user?.email || config.baseUrl} · {admin ? '管理员' : '普通用户'}</Text></View><View style={{ flexDirection: 'row', gap: 5 }}>{(['24h', '7d', '30d'] as Range[]).map((value) => <Pressable key={value} onPress={() => setRange(value)} style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: range === value ? '#2F6DF6' : dark ? '#273449' : '#E5EBF4' }}><Text style={{ color: range === value ? '#fff' : dark ? '#D5DDEA' : '#607086', fontSize: 10, fontWeight: '800' }}>{value.toUpperCase()}</Text></Pressable>)}</View></View>
    {(stats.isError || trend.isError) ? <View style={{ borderRadius: 18, padding: 14, backgroundColor: '#FFF0F3' }}><Text style={{ color: '#D9475C', fontSize: 12 }}>{((stats.error || trend.error) as Error).message}</Text></View> : null}
    <View style={{ gap: 9 }}>{[0, 2].map((start) => <View key={start} style={{ flexDirection: 'row', gap: 9 }}>{cards.slice(start, start + 2).map(([label, value, Icon, route]) => <Pressable key={label} onPress={() => router.push(route as never)} style={{ flex: 1, borderRadius: 18, padding: 12, backgroundColor: dark ? '#111827' : '#fff', borderWidth: 1, borderColor: dark ? '#273449' : '#E2E9F3' }}><View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? '#172C55' : '#EAF2FF' }}><Icon size={16} color="#2F6DF6" /></View><Text numberOfLines={1} style={{ flex: 1, marginLeft: 7, color: dark ? '#9EABC0' : '#718096', fontSize: 10 }}>{label}</Text></View><Text style={{ marginTop: 10, color: dark ? '#F4F7FB' : '#172033', fontSize: 18, fontWeight: '800' }}>{value}</Text></Pressable>)}</View>)}</View>
    <View style={{ flexDirection: 'row', gap: 9 }}><Metric label={`${range.toUpperCase()} Token`} value={compact(totalTokens || data?.today_tokens)} hint={`TPM ${compact(data?.tpm)}`} /><Metric label={`${range.toUpperCase()} 成本`} value={money(totalCost || data?.today_cost)} hint={`RPM ${compact(data?.rpm)}`} /></View>
    {points.length > 1 ? <LineTrendChart title="请求趋势" subtitle={`${dates.start_date} 至 ${dates.end_date}`} points={points.map((p) => ({ label: p.date.slice(range === '24h' ? 11 : 5, range === '24h' ? 16 : 10), value: p.requests }))} color="#2F6DF6" formatValue={compact} /> : null}
    <BarChartCard title="热门模型" subtitle="按 Token 使用量排序" items={(models.data?.models ?? []).slice(0, 6).map((m) => ({ label: m.model, value: m.total_tokens, color: '#2F6DF6', meta: `${compact(m.requests)} 次 · ${money(m.cost)}` }))} formatValue={compact} />
    {admin ? <View style={{ borderRadius: 20, padding: 15, backgroundColor: dark ? '#111827' : '#fff', borderWidth: 1, borderColor: dark ? '#273449' : '#E2E9F3' }}><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: dark ? '#F4F7FB' : '#172033' }}>运维状态</Text><Pressable onPress={() => router.push('/ops-center')}><Text style={{ fontSize: 11, fontWeight: '700', color: '#2F6DF6' }}>进入运维中心</Text></Pressable></View><Text style={{ marginTop: 9, fontSize: 11, lineHeight: 18, color: dark ? '#9EABC0' : '#6F7D91' }}>当前加载 {accounts.data?.items.length ?? 0} 个账号；正常 {accounts.data?.items.filter((a) => a.status === 'active' && !a.error_message).length ?? 0}，异常 {accounts.data?.items.filter((a) => a.status === 'error' || a.error_message).length ?? 0}。</Text></View> : null}
  </ScrollView></SafeAreaView>;
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) { const { theme } = useUniwind(); const dark = theme === 'dark'; return <View style={{ flex: 1, borderRadius: 18, padding: 14, backgroundColor: dark ? '#111827' : '#fff', borderWidth: 1, borderColor: dark ? '#273449' : '#E2E9F3' }}><Text style={{ fontSize: 10, color: dark ? '#9EABC0' : '#758297' }}>{label}</Text><Text style={{ marginTop: 8, fontSize: 18, fontWeight: '800', color: dark ? '#F4F7FB' : '#172033' }}>{value}</Text><Text style={{ marginTop: 5, fontSize: 10, color: '#2F6DF6' }}>{hint}</Text></View>; }
