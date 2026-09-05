import { useMutation, useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { ExternalLink, Info, Server } from 'lucide-react-native';
import { useMemo } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { AdminButton, AdminMessage, AdminSection } from '@/src/components/admin-ui';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
import { Text } from '@/src/components/localized-text';
import { ScreenShell } from '@/src/components/screen-shell';
import { getCLIProxyLatestVersion, getCLIProxyRuntimeConfig, listCLIProxyPlugins } from '@/src/services/cliproxy';
import { cliProxyConfigState } from '@/src/store/cliproxy-config';
import { workspaceModeState } from '@/src/store/workspace-mode';
import type { CLIProxyConnection } from '@/src/types/cliproxy';

const { useSnapshot } = require('valtio/react');

export default function CLIProxyHubScreen() {
  const workspace = useSnapshot(workspaceModeState);
  const stored = useSnapshot(cliProxyConfigState);
  const connection = useMemo<CLIProxyConnection>(() => ({ baseUrl: stored.baseUrl, managementKey: stored.managementKey }), [stored.baseUrl, stored.managementKey]);
  const configured = workspace.mode === 'cliproxy' && Boolean(connection.baseUrl && connection.managementKey);
  const configQuery = useQuery({ queryKey: ['cliproxy', 'runtime-config', stored.baseUrl, stored.revision], queryFn: () => getCLIProxyRuntimeConfig(connection), enabled: configured });
  const pluginsQuery = useQuery({ queryKey: ['cliproxy', 'plugins', stored.baseUrl, stored.revision], queryFn: () => listCLIProxyPlugins(connection), enabled: configured });
  const versionMutation = useMutation({ mutationFn: () => getCLIProxyLatestVersion(connection) });
  const credentialCount = Array.isArray(configQuery.data?.['auth-files']) ? configQuery.data['auth-files'].length : undefined;
  const clientKeyCount = Array.isArray(configQuery.data?.['api-keys']) ? configQuery.data['api-keys'].length : 0;
  const baseUrl = connection.baseUrl.replace(/\/+$/, '');

  if (workspace.mode !== 'cliproxy') return null;
  return (
    <>
      <LocalizedStackScreen options={{ title: '中心信息', headerShown: true }} />
      <ScreenShell title="中心信息" subtitle="CLIProxyAPI 实例和 GateNest 客户端信息" safeAreaEdges={['bottom']} bottomInsetClassName="pb-10" refreshing={configQuery.isRefetching || pluginsQuery.isRefetching} onRefresh={async () => { await Promise.all([configQuery.refetch(), pluginsQuery.refetch()]); }}>
        <AdminSection title="当前实例" detail="这里只显示 CLIProxyAPI 工作区信息，不包含 Sub2API 服务状态。">
          <View className="flex-row items-center gap-3 rounded-2xl bg-[#F6F8FC] p-3 dark:bg-[#152033]"><Server size={20} color="#2F6DF6" /><View className="flex-1"><Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">CLIProxyAPI</Text><Text selectable className="mt-1 text-[10px] text-[#7B8798] dark:text-[#9EABC0]">{baseUrl}</Text></View></View>
          <Text className="text-[10px] leading-5 text-[#6B778C] dark:text-[#9EABC0]">Client Keys：{clientKeyCount} · 插件：{pluginsQuery.data?.plugins.length ?? 0}{credentialCount === undefined ? '' : ` · 凭据：${credentialCount}`}</Text>
          <Text className="text-[10px] leading-5 text-[#6B778C] dark:text-[#9EABC0]">插件目录：{pluginsQuery.data?.plugins_dir || '—'} · 全局插件：{pluginsQuery.data?.plugins_enabled ? '启用' : '关闭'}</Text>
          <Pressable onPress={() => Linking.openURL(`${baseUrl}/management.html`)} className="flex-row items-center justify-center gap-2 rounded-2xl bg-[#EAF2FF] py-3 dark:bg-[#172C55]"><ExternalLink size={15} color="#2F6DF6" /><Text className="text-xs font-bold text-[#2F6DF6]">打开原生管理中心</Text></Pressable>
          <AdminMessage error={configQuery.error || pluginsQuery.error} />
        </AdminSection>
        <AdminSection title="版本信息" detail="上游版本查询由当前 CLIProxyAPI 实例执行。">
          <View className="flex-row items-center gap-3 rounded-2xl bg-[#F6F8FC] p-3 dark:bg-[#152033]"><Info size={20} color="#2F6DF6" /><View className="flex-1"><Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">GateNest {Constants.expoConfig?.version || '1.8.2'}</Text><Text className="mt-1 text-[10px] text-[#7B8798] dark:text-[#9EABC0]">CLIProxy 独立工作区</Text></View></View>
          <AdminButton label="检查 CLIProxyAPI 最新版本" pending={versionMutation.isPending} tone="muted" onPress={() => versionMutation.mutate()} />
          <AdminMessage error={versionMutation.error} success={versionMutation.data ? `CLIProxyAPI 最新版本：${versionMutation.data}` : undefined} />
        </AdminSection>
      </ScreenShell>
    </>
  );
}
