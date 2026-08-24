import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Braces, Puzzle, Trash2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AdminButton, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
import { Text, TextInput, localizedAlert } from '@/src/components/localized-text';
import { ScreenShell } from '@/src/components/screen-shell';
import { CLIPROXY_GROUP_ROUTER_PLUGIN_ID, deleteCLIProxyPlugin, getCLIProxyPluginConfig, listCLIProxyPlugins, saveCLIProxyPluginConfig, setCLIProxyPluginEnabled } from '@/src/services/cliproxy';
import { cliProxyConfigState } from '@/src/store/cliproxy-config';
import { workspaceModeState } from '@/src/store/workspace-mode';
import type { CLIProxyConnection, CLIProxyPluginEntry } from '@/src/types/cliproxy';

const { useSnapshot } = require('valtio/react');

export default function CLIProxyPluginsScreen() {
  const queryClient = useQueryClient();
  const workspace = useSnapshot(workspaceModeState);
  const stored = useSnapshot(cliProxyConfigState);
  const connection = useMemo<CLIProxyConnection>(() => ({ baseUrl: stored.baseUrl, managementKey: stored.managementKey }), [stored.baseUrl, stored.managementKey]);
  const configured = workspace.mode === 'cliproxy' && Boolean(connection.baseUrl && connection.managementKey);
  const [selected, setSelected] = useState<CLIProxyPluginEntry | null>(null);
  const [json, setJSON] = useState('{}');
  const pluginsQuery = useQuery({ queryKey: ['cliproxy', 'plugins', stored.baseUrl, stored.revision], queryFn: () => listCLIProxyPlugins(connection), enabled: configured });
  const configQuery = useQuery({ queryKey: ['cliproxy', 'plugin-config', selected?.id, stored.baseUrl], queryFn: () => getCLIProxyPluginConfig(connection, selected!.id), enabled: configured && Boolean(selected?.id) });
  useEffect(() => { if (configQuery.data) setJSON(JSON.stringify(configQuery.data, null, 2)); }, [configQuery.data]);
  const toggleMutation = useMutation({ mutationFn: (plugin: CLIProxyPluginEntry) => setCLIProxyPluginEnabled(connection, plugin.id, !plugin.effective_enabled), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['cliproxy', 'plugins'] }); } });
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('请先选择插件。');
      let value: unknown;
      try { value = JSON.parse(json); } catch { throw new Error('插件配置不是有效 JSON。'); }
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('插件配置必须是 JSON 对象。');
      return saveCLIProxyPluginConfig(connection, selected.id, value as Record<string, unknown>);
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['cliproxy'] }); localizedAlert('插件配置已保存', 'CLIProxyAPI 已重新配置插件。'); },
  });
  const deleteMutation = useMutation({ mutationFn: (plugin: CLIProxyPluginEntry) => deleteCLIProxyPlugin(connection, plugin.id), onSuccess: async (result) => { setSelected(null); await queryClient.invalidateQueries({ queryKey: ['cliproxy'] }); if (result.restart_required) localizedAlert('需要重启', '插件文件已处理，但 CLIProxyAPI 需要重启后才能完全卸载。'); } });

  if (workspace.mode !== 'cliproxy') return null;
  return (
    <>
      <LocalizedStackScreen options={{ title: '插件管理', headerShown: true }} />
      <ScreenShell title="插件管理" subtitle="已发现插件、启停与配置" safeAreaEdges={['bottom']} bottomInsetClassName="pb-10" refreshing={pluginsQuery.isRefetching} onRefresh={async () => { await pluginsQuery.refetch(); }}>
        <AdminSection title="插件运行状态" detail={`全局插件：${pluginsQuery.data?.plugins_enabled ? '已启用' : '未启用'} · 目录：${pluginsQuery.data?.plugins_dir || '—'}`}>
          {pluginsQuery.isLoading ? <Text className="text-xs text-[#98A2B3]">正在读取插件…</Text> : null}
          {!pluginsQuery.isLoading && !(pluginsQuery.data?.plugins.length) ? <EmptyState label="当前未发现插件" /> : null}
          {(pluginsQuery.data?.plugins ?? []).map((plugin) => {
            const active = plugin.effective_enabled === true;
            const protectedPlugin = plugin.id === CLIPROXY_GROUP_ROUTER_PLUGIN_ID;
            return <View key={plugin.id} className="gap-3 rounded-2xl border border-[#E2E9F3] bg-[#F8FAFD] p-3 dark:border-[#273449] dark:bg-[#152033]"><View className="flex-row items-center gap-3"><View className={`h-9 w-9 items-center justify-center rounded-xl ${active ? 'bg-[#E8F8F0] dark:bg-[#143A2C]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}><Puzzle size={17} color={active ? '#1C9B62' : '#7B8798'} /></View><Pressable className="flex-1" onPress={() => setSelected(plugin)}><Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{plugin.metadata?.name || plugin.id}</Text><Text className="mt-1 text-[9px] text-[#7B8798] dark:text-[#9EABC0]">{plugin.id} · {plugin.metadata?.version || '—'} · {active ? '运行中' : plugin.enabled ? '已配置但未生效' : '已停用'}</Text></Pressable></View><View className="flex-row gap-2"><View className="flex-1"><AdminButton label={active ? '停用' : '启用'} tone="muted" pending={toggleMutation.isPending} onPress={() => toggleMutation.mutate(plugin)} /></View><Pressable disabled={protectedPlugin || deleteMutation.isPending} onPress={() => localizedAlert('卸载插件？', `将删除 ${plugin.id} 的插件文件和配置。`, [{ text: '取消', style: 'cancel' }, { text: '卸载', style: 'destructive', onPress: () => deleteMutation.mutate(plugin) }])} className="h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF0F2] disabled:opacity-30 dark:bg-[#3A1720]"><Trash2 size={16} color="#D9475C" /></Pressable></View>{protectedPlugin ? <Text className="text-[9px] text-[#946321] dark:text-[#FFD66B]">Group Router 由分组页面管理，为防止现有 Client Key 失效，这里禁止直接卸载。</Text> : null}</View>;
          })}
          <AdminMessage error={pluginsQuery.error || toggleMutation.error || deleteMutation.error} />
        </AdminSection>
        {selected ? <AdminSection title={`插件配置 · ${selected.metadata?.name || selected.id}`} detail="保存时完整替换该插件的配置对象。"><View className="flex-row items-center gap-2"><Braces size={16} color="#2F6DF6" /><Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">JSON 配置</Text></View><TextInput value={json} onChangeText={setJSON} multiline autoCapitalize="none" autoCorrect={false} textAlignVertical="top" className="min-h-[300px] rounded-2xl border border-[#E2E9F3] bg-[#0F1726] p-3 font-mono text-[10px] leading-5 text-[#D8E3F4] dark:border-[#273449]" /><View className="flex-row gap-2"><View className="flex-1"><AdminButton label="保存插件配置" pending={saveMutation.isPending} disabled={!configQuery.isSuccess} onPress={() => saveMutation.mutate()} /></View><View className="flex-1"><AdminButton label="关闭编辑" tone="muted" onPress={() => setSelected(null)} /></View></View><AdminMessage error={configQuery.error || saveMutation.error} /></AdminSection> : null}
      </ScreenShell>
    </>
  );
}
