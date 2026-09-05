import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Activity, Download, FileWarning, RefreshCw } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';

import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
import { Text, localizedAlert } from '@/src/components/localized-text';
import { ScreenShell } from '@/src/components/screen-shell';
import {
  clearCLIProxyLogs,
  downloadCLIProxyRequestErrorLog,
  getCLIProxyAPIKeyUsage,
  getCLIProxyLogs,
  getCLIProxyRuntimeConfig,
  listCLIProxyRequestErrorLogs,
  setCLIProxyRuntimeSetting,
} from '@/src/services/cliproxy';
import { cliProxyConfigState } from '@/src/store/cliproxy-config';
import { workspaceModeState } from '@/src/store/workspace-mode';
import type { CLIProxyConnection } from '@/src/types/cliproxy';

const { useSnapshot } = require('valtio/react');

async function saveLogFile(name: string, content: string) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return;
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('当前设备不支持系统文件分享。');
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true, intermediates: true });
  file.write(content);
  try {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', UTI: 'public.plain-text', dialogTitle: `保存或分享 ${name}` });
  } finally {
    if (file.exists) file.delete();
  }
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

function formatTimestamp(value: number) {
  if (!value) return '—';
  return new Date(value * 1000).toLocaleString();
}

export default function CLIProxyObservabilityScreen() {
  const queryClient = useQueryClient();
  const workspace = useSnapshot(workspaceModeState);
  const stored = useSnapshot(cliProxyConfigState);
  const connection = useMemo<CLIProxyConnection>(() => ({ baseUrl: stored.baseUrl, managementKey: stored.managementKey }), [stored.baseUrl, stored.managementKey]);
  const configured = workspace.mode === 'cliproxy' && Boolean(connection.baseUrl && connection.managementKey);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [search, setSearch] = useState('');
  const [hideManagement, setHideManagement] = useState(true);

  const configQuery = useQuery({
    queryKey: ['cliproxy', 'runtime-config', stored.baseUrl, stored.revision],
    queryFn: () => getCLIProxyRuntimeConfig(connection),
    enabled: configured,
  });
  const loggingEnabled = configQuery.data?.['logging-to-file'] === true;

  const logsQuery = useQuery({
    queryKey: ['cliproxy', 'logs', stored.baseUrl],
    queryFn: () => getCLIProxyLogs(connection, { limit: 500 }),
    enabled: configured && loggingEnabled,
    refetchInterval: autoRefresh ? 3_000 : false,
  });
  const usageQuery = useQuery({
    queryKey: ['cliproxy', 'api-key-usage', stored.baseUrl],
    queryFn: () => getCLIProxyAPIKeyUsage(connection),
    enabled: configured,
    refetchInterval: autoRefresh ? 10_000 : false,
  });
  const errorLogsQuery = useQuery({
    queryKey: ['cliproxy', 'request-error-logs', stored.baseUrl],
    queryFn: () => listCLIProxyRequestErrorLogs(connection),
    enabled: configured,
    refetchInterval: autoRefresh ? 10_000 : false,
  });

  const filteredLines = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (logsQuery.data?.lines ?? []).filter((line) => {
      if (hideManagement && line.toLowerCase().includes('/v0/management')) return false;
      return !needle || line.toLowerCase().includes(needle);
    });
  }, [hideManagement, logsQuery.data?.lines, search]);

  const loggingMutation = useMutation({
    mutationFn: () => setCLIProxyRuntimeSetting(connection, 'logging-to-file', !loggingEnabled),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['cliproxy', 'runtime-config'] }); },
  });
  const clearMutation = useMutation({
    mutationFn: () => clearCLIProxyLogs(connection),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['cliproxy', 'logs'] }); },
  });
  const downloadMutation = useMutation({
    mutationFn: async (name: string) => {
      await saveLogFile(name, await downloadCLIProxyRequestErrorLog(connection, name));
      return name;
    },
    onSuccess: (name) => localizedAlert('错误日志已导出', `已打开 ${name} 的系统保存/分享面板。`),
  });

  const refreshAll = async () => {
    await Promise.all([configQuery.refetch(), usageQuery.refetch(), errorLogsQuery.refetch(), loggingEnabled ? logsQuery.refetch() : Promise.resolve()]);
  };

  if (workspace.mode !== 'cliproxy') return null;

  return (
    <>
      <LocalizedStackScreen options={{ title: 'CLIProxy 日志与统计', headerShown: true }} />
      <ScreenShell title="CLIProxy 日志与统计" subtitle="单实例日志、错误文件和 API Key 使用情况" safeAreaEdges={['bottom']} bottomInsetClassName="pb-10" refreshing={logsQuery.isRefetching || usageQuery.isRefetching || errorLogsQuery.isRefetching} onRefresh={refreshAll}>
        <AdminSection title="观测设置" detail="自动刷新只在此页面前台运行；不会消费 usage-queue，也不会删除服务端用量记录。">
          <View className="flex-row flex-wrap gap-2">
            <AdminChip label="3 秒刷新日志" selected={autoRefresh} onPress={() => setAutoRefresh(!autoRefresh)} />
            <AdminChip label="隐藏管理请求" selected={hideManagement} onPress={() => setHideManagement(!hideManagement)} />
            <AdminChip label="文件日志" selected={loggingEnabled} onPress={() => loggingMutation.mutate()} />
          </View>
          <View className="flex-row items-center gap-2 rounded-2xl bg-[#F6F8FC] p-3 dark:bg-[#152033]">
            <Activity size={18} color="#2F6DF6" />
            <Text className="flex-1 text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">日志 {loggingEnabled ? '已启用' : '未启用'} · 用量统计 {configQuery.data?.['usage-statistics-enabled'] === false ? '已关闭' : '已启用'}</Text>
            <Pressable onPress={() => void refreshAll()}><RefreshCw size={16} color="#2F6DF6" /></Pressable>
          </View>
          <AdminMessage error={configQuery.error || loggingMutation.error} />
        </AdminSection>

        <AdminSection title="API Key 使用统计" detail="按上游 Provider 与 API Key 汇总成功/失败，并显示最近 20 个十分钟桶。">
          {usageQuery.isLoading ? <Text className="text-xs text-[#98A2B3]">正在读取统计…</Text> : null}
          {!usageQuery.isLoading && !(usageQuery.data?.length) ? <EmptyState label="暂无 API Key 使用统计" /> : null}
          {(usageQuery.data ?? []).map((entry) => {
            const recent = entry.recentRequests.filter((bucket) => bucket.success || bucket.failed).slice(-8);
            return (
              <View key={`${entry.provider}:${entry.identity}`} className="gap-2 rounded-2xl border border-[#E2E9F3] bg-[#F8FAFD] p-3 dark:border-[#273449] dark:bg-[#152033]">
                <View className="flex-row items-center gap-2">
                  <Text className="flex-1 text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{entry.provider} · {entry.maskedKey}</Text>
                  <Text className="text-[10px] font-bold text-[#1C9B62]">成功 {entry.success}</Text>
                  <Text className="text-[10px] font-bold text-[#D9475C]">失败 {entry.failed}</Text>
                </View>
                {entry.baseUrl ? <Text selectable className="text-[9px] text-[#7B8798] dark:text-[#9EABC0]">{entry.baseUrl}</Text> : null}
                {recent.length ? <Text className="text-[9px] leading-4 text-[#6B778C] dark:text-[#9EABC0]">{recent.map((bucket) => `${bucket.time} ${bucket.success}/${bucket.failed}`).join(' · ')}</Text> : null}
              </View>
            );
          })}
          <AdminMessage error={usageQuery.error} />
        </AdminSection>

        <AdminSection title="运行日志" detail={`读取最近 500 行；当前显示 ${filteredLines.length}/${logsQuery.data?.lines.length ?? 0} 行。`}>
          <AdminField label="筛选日志" value={search} onChangeText={setSearch} placeholder="请求 ID、模型、错误文本" />
          {!loggingEnabled ? <AdminButton label="启用文件日志" pending={loggingMutation.isPending} onPress={() => loggingMutation.mutate()} /> : null}
          {loggingEnabled && logsQuery.isLoading ? <Text className="text-xs text-[#98A2B3]">正在读取日志…</Text> : null}
          {loggingEnabled && !logsQuery.isLoading && !filteredLines.length ? <EmptyState label="没有匹配的日志行" /> : null}
          {filteredLines.length ? (
            <ScrollView style={{ maxHeight: 520 }} nestedScrollEnabled className="rounded-2xl bg-[#0F1726] p-3">
              <Text selectable className="font-mono text-[9px] leading-4 text-[#D8E3F4]">{filteredLines.join('\n')}</Text>
            </ScrollView>
          ) : null}
          {logsQuery.data ? <Text className="text-[9px] text-[#7B8798] dark:text-[#9EABC0]">服务端扫描 {logsQuery.data.lineCount} 行 · 最新时间 {formatTimestamp(logsQuery.data.latestTimestamp)}</Text> : null}
          {loggingEnabled ? <AdminButton label="清空服务端日志" pending={clearMutation.isPending} tone="danger" onPress={() => localizedAlert('清空 CLIProxyAPI 日志？', '将删除轮换日志并清空主日志，操作不可撤销。', [{ text: '取消', style: 'cancel' }, { text: '确认清空', style: 'destructive', onPress: () => clearMutation.mutate() }])} /> : null}
          <AdminMessage error={logsQuery.error || clearMutation.error} />
        </AdminSection>

        <AdminSection title="请求错误日志" detail="当完整请求日志关闭时，CLIProxyAPI 会保留独立的 error-*.log 文件。">
          {errorLogsQuery.isLoading ? <Text className="text-xs text-[#98A2B3]">正在读取错误日志…</Text> : null}
          {!errorLogsQuery.isLoading && !(errorLogsQuery.data?.length) ? <EmptyState label="暂无请求错误日志" /> : null}
          {(errorLogsQuery.data ?? []).map((file) => (
            <View key={file.name} className="flex-row items-center gap-3 rounded-2xl border border-[#E2E9F3] bg-[#F8FAFD] p-3 dark:border-[#273449] dark:bg-[#152033]">
              <FileWarning size={18} color="#D9475C" />
              <View className="flex-1">
                <Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{file.name}</Text>
                <Text className="mt-1 text-[9px] text-[#7B8798] dark:text-[#9EABC0]">{formatBytes(file.size)} · {formatTimestamp(file.modified)}</Text>
              </View>
              <Pressable disabled={downloadMutation.isPending} onPress={() => downloadMutation.mutate(file.name)} className="h-9 w-9 items-center justify-center rounded-xl bg-[#EAF2FF] disabled:opacity-50 dark:bg-[#172C55]"><Download size={15} color="#2F6DF6" /></Pressable>
            </View>
          ))}
          <AdminMessage error={errorLogsQuery.error || downloadMutation.error} />
        </AdminSection>
      </ScreenShell>
    </>
  );
}
