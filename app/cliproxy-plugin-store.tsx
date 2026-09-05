import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Store } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
import { Text, localizedAlert } from '@/src/components/localized-text';
import { ScreenShell } from '@/src/components/screen-shell';
import { installCLIProxyStorePlugin, listCLIProxyPluginStore } from '@/src/services/cliproxy';
import { cliProxyConfigState } from '@/src/store/cliproxy-config';
import { workspaceModeState } from '@/src/store/workspace-mode';
import type { CLIProxyConnection, CLIProxyPluginStoreEntry } from '@/src/types/cliproxy';

const { useSnapshot } = require('valtio/react');

export default function CLIProxyPluginStoreScreen() {
  const queryClient = useQueryClient();
  const workspace = useSnapshot(workspaceModeState);
  const stored = useSnapshot(cliProxyConfigState);
  const connection = useMemo<CLIProxyConnection>(() => ({ baseUrl: stored.baseUrl, managementKey: stored.managementKey }), [stored.baseUrl, stored.managementKey]);
  const configured = workspace.mode === 'cliproxy' && Boolean(connection.baseUrl && connection.managementKey);
  const query = useQuery({ queryKey: ['cliproxy', 'plugin-store', stored.baseUrl, stored.revision], queryFn: () => listCLIProxyPluginStore(connection), enabled: configured, retry: false });
  const mutation = useMutation({
    mutationFn: (plugin: CLIProxyPluginStoreEntry) => installCLIProxyStorePlugin(connection, plugin.id, plugin.source_id, plugin.version),
    onSuccess: async (result) => { await queryClient.invalidateQueries({ queryKey: ['cliproxy'] }); localizedAlert('插件安装完成', result.restart_required ? '插件已下载，需要重启 CLIProxyAPI 后生效。' : '插件已安装并启用。'); },
  });

  if (workspace.mode !== 'cliproxy') return null;
  return (
    <>
      <LocalizedStackScreen options={{ title: '插件商店', headerShown: true }} />
      <ScreenShell title="插件商店" subtitle="浏览 CLIProxyAPI 官方与自定义注册表" safeAreaEdges={['bottom']} bottomInsetClassName="pb-10" refreshing={query.isRefetching} onRefresh={async () => { await query.refetch(); }}>
        <AdminSection title="商店源" detail="CLIProxyAPI 始终包含官方注册表，也可以在 config.yaml 中添加额外 store-sources。">
          {(query.data?.sources ?? []).map((source) => <View key={source.id} className="rounded-2xl bg-[#F6F8FC] p-3 dark:bg-[#152033]"><Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{source.name || source.id}</Text><Text selectable className="mt-1 text-[9px] text-[#7B8798] dark:text-[#9EABC0]">{source.url || source.id}</Text>{source.error ? <Text className="mt-1 text-[10px] text-[#D9475C]">{source.error}</Text> : null}</View>)}
          <AdminMessage error={query.error} />
        </AdminSection>
        <AdminSection title="可用插件" detail={`${query.data?.plugins.length ?? 0} 个插件；安装原生插件前请确认来源可信。`}>
          {query.isLoading ? <Text className="text-xs text-[#98A2B3]">正在加载插件商店…</Text> : null}
          {query.isSuccess && !query.data.plugins.length ? <EmptyState label="商店中没有可用插件" /> : null}
          {(query.data?.plugins ?? []).map((plugin) => <View key={plugin.store_id || `${plugin.source_id}/${plugin.id}`} className="flex-row items-start gap-3 rounded-2xl border border-[#E2E9F3] bg-[#F8FAFD] p-3 dark:border-[#273449] dark:bg-[#152033]"><View className="h-9 w-9 items-center justify-center rounded-xl bg-[#EAF2FF] dark:bg-[#172C55]"><Store size={17} color="#2F6DF6" /></View><View className="flex-1"><Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{plugin.name || plugin.id}</Text><Text className="mt-1 text-[9px] text-[#7B8798] dark:text-[#9EABC0]">{plugin.source_name || plugin.source_id} · {plugin.installed ? `已安装 ${plugin.installed_version || ''}` : `可用 ${plugin.version || ''}`}{plugin.update_available ? ' · 有更新' : ''}</Text>{plugin.description ? <Text className="mt-1 text-[10px] leading-4 text-[#6B778C] dark:text-[#9EABC0]">{plugin.description}</Text> : null}{plugin.auth_required && !plugin.auth_configured ? <Text className="mt-1 text-[10px] text-[#D98A16]">商店源认证尚未配置。</Text> : null}</View><Pressable disabled={mutation.isPending || (plugin.auth_required && !plugin.auth_configured)} onPress={() => localizedAlert(plugin.installed ? '更新插件？' : '安装插件？', `CLIProxyAPI 将从 ${plugin.source_name || plugin.source_id} 下载 ${plugin.name || plugin.id}。`, [{ text: '取消', style: 'cancel' }, { text: plugin.installed ? '更新' : '安装', onPress: () => mutation.mutate(plugin) }])} className="h-9 w-9 items-center justify-center rounded-xl bg-[#EAF2FF] disabled:opacity-35 dark:bg-[#172C55]"><Download size={15} color="#2F6DF6" /></Pressable></View>)}
          <AdminMessage error={mutation.error} />
        </AdminSection>
      </ScreenShell>
    </>
  );
}
