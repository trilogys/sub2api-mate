import { useQuery } from '@tanstack/react-query';
import { Clock3, Gauge, RefreshCw } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { AdminChip, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
import { Text } from '@/src/components/localized-text';
import { ScreenShell } from '@/src/components/screen-shell';
import { cliProxyQuotaColor, cliProxyQuotaMinimum, cliProxyQuotaStatusLabel, cliProxyQuotaWindowColor } from '@/src/lib/cliproxy-quota';
import { getCLIProxyQuotaReports, listCLIProxyAuthFiles } from '@/src/services/cliproxy';
import { cliProxyConfigState, updateCLIProxyRefresh } from '@/src/store/cliproxy-config';
import { workspaceModeState } from '@/src/store/workspace-mode';
import type { CLIProxyConnection } from '@/src/types/cliproxy';

const { useSnapshot } = require('valtio/react');

function intervalLabel(seconds: number) {
  return seconds >= 60 ? `${seconds / 60}min` : `${seconds}s`;
}

function dateTime(value?: string) {
  if (!value) return '—';
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? new Date(stamp).toLocaleString() : value;
}

export default function CLIProxyQuotasScreen() {
  const workspace = useSnapshot(workspaceModeState);
  const stored = useSnapshot(cliProxyConfigState);
  const connection = useMemo<CLIProxyConnection>(() => ({ baseUrl: stored.baseUrl, managementKey: stored.managementKey }), [stored.baseUrl, stored.managementKey]);
  const configured = workspace.mode === 'cliproxy' && Boolean(connection.baseUrl && connection.managementKey);
  const filesQuery = useQuery({ queryKey: ['cliproxy', 'auth-files', stored.baseUrl, stored.revision], queryFn: () => listCLIProxyAuthFiles(connection), enabled: configured });
  const quotaQuery = useQuery({
    queryKey: ['cliproxy', 'quotas', stored.baseUrl, stored.revision],
    queryFn: () => getCLIProxyQuotaReports(connection),
    enabled: configured,
    refetchInterval: stored.autoRefreshEnabled ? stored.autoRefreshIntervalSeconds * 1_000 : false,
    refetchIntervalInBackground: false,
  });
  const supported = (filesQuery.data ?? []).filter((file) => ['codex', 'gemini', 'gemini-cli', 'antigravity'].includes((file.provider || file.type || '').toLowerCase()) && !file.disabled);

  if (workspace.mode !== 'cliproxy') return null;
  return (
    <>
      <LocalizedStackScreen options={{ title: '配额管理', headerShown: true }} />
      <ScreenShell title="配额管理" subtitle="真实上游窗口、重置时间与自动刷新" safeAreaEdges={['bottom']} bottomInsetClassName="pb-10" refreshing={quotaQuery.isRefetching || filesQuery.isRefetching} onRefresh={async () => { await Promise.all([filesQuery.refetch(), quotaQuery.refetch()]); }}>
        <AdminSection title="刷新策略" detail="颜色按最低剩余配额计算：≤20% 红色、21–50% 橙色、51–80% 黄色、>80% 绿色。">
          <View className="flex-row items-center gap-3 rounded-2xl bg-[#F6F8FC] p-3 dark:bg-[#152033]"><Clock3 size={19} color="#2F6DF6" /><Text className="flex-1 text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">前台自动刷新：{stored.autoRefreshEnabled ? intervalLabel(stored.autoRefreshIntervalSeconds) : '关闭'}</Text><Pressable onPress={() => quotaQuery.refetch()}><RefreshCw size={16} color="#2F6DF6" /></Pressable></View>
          <View className="flex-row flex-wrap gap-2">
            <AdminChip label="自动刷新" selected={stored.autoRefreshEnabled} onPress={() => void updateCLIProxyRefresh({ autoRefreshEnabled: !stored.autoRefreshEnabled })} />
            {[30, 60, 300, 900].map((seconds) => <AdminChip key={seconds} label={intervalLabel(seconds)} selected={stored.autoRefreshIntervalSeconds === seconds} onPress={() => void updateCLIProxyRefresh({ autoRefreshIntervalSeconds: seconds })} />)}
          </View>
          <Text className="text-[10px] text-[#7B8798] dark:text-[#9EABC0]">可查询凭据：{supported.length}；支持 Codex、Gemini CLI 和 Antigravity。</Text>
          <AdminMessage error={filesQuery.error || quotaQuery.error} />
        </AdminSection>
        <AdminSection title="实时配额" detail="每张卡片的状态和标题颜色都来自窗口最低剩余值，不再固定显示绿色。">
          {quotaQuery.isLoading ? <Text className="text-xs text-[#98A2B3]">正在查询上游配额…</Text> : null}
          {!quotaQuery.isLoading && !(quotaQuery.data?.length) ? <EmptyState label="暂无可显示的实时配额" /> : null}
          {(quotaQuery.data ?? []).map((report) => {
            const minimum = cliProxyQuotaMinimum(report);
            const color = cliProxyQuotaColor(minimum, report.status);
            return (
              <View key={report.authIndex} className="gap-3 rounded-2xl border border-[#E2E9F3] bg-[#F8FAFD] p-3 dark:border-[#273449] dark:bg-[#152033]">
                <View className="flex-row items-center gap-3"><View style={{ backgroundColor: `${color}20` }} className="h-10 w-10 items-center justify-center rounded-xl"><Gauge size={19} color={color} /></View><View className="flex-1"><Text className="text-sm font-bold text-[#172033] dark:text-[#F4F7FB]">{report.name}</Text><Text style={{ color, fontSize: 10, fontWeight: '800', marginTop: 3 }}>{cliProxyQuotaStatusLabel(report.status)} · 最低剩余 {minimum === undefined ? '—' : `${minimum.toFixed(0)}%`}{report.planType ? ` · ${report.planType}` : ''}</Text></View></View>
                {report.error ? <Text className="text-[10px] text-[#D9475C]">{report.error}</Text> : null}
                {report.windows.map((window) => {
                  const windowColor = cliProxyQuotaWindowColor(window);
                  return <View key={window.id} className="gap-1"><View className="flex-row"><Text className="flex-1 text-[10px] text-[#475467] dark:text-[#C2CCDB]">{window.label}</Text><Text style={{ color: windowColor, fontSize: 10, fontWeight: '800' }}>{window.remainingPercent === null ? '—' : `${window.remainingPercent.toFixed(0)}%`}</Text></View><View className="h-2 overflow-hidden rounded-full bg-[#E2E9F3] dark:bg-[#273449]"><View style={{ width: `${window.remainingPercent ?? 0}%`, height: '100%', borderRadius: 999, backgroundColor: windowColor }} /></View>{window.resetAt ? <Text className="text-[9px] text-[#7B8798] dark:text-[#9EABC0]">重置：{dateTime(window.resetAt)}</Text> : null}</View>;
                })}
                <Text className="text-[9px] text-[#98A2B3]">查询于 {dateTime(report.fetchedAt)}</Text>
              </View>
            );
          })}
        </AdminSection>
      </ScreenShell>
    </>
  );
}
