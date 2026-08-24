import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Braces, ExternalLink, Github, Pencil, Puzzle, Trash2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
import { Text, TextInput, localizedAlert } from '@/src/components/localized-text';
import { ScreenShell } from '@/src/components/screen-shell';
import { CLIPROXY_GROUP_ROUTER_PLUGIN_ID, deleteCLIProxyPlugin, getCLIProxyPluginConfig, listCLIProxyPlugins, saveCLIProxyPluginConfig, setCLIProxyPluginEnabled } from '@/src/services/cliproxy';
import { cliProxyConfigState } from '@/src/store/cliproxy-config';
import { workspaceModeState } from '@/src/store/workspace-mode';
import type { CLIProxyConnection, CLIProxyPluginConfigField, CLIProxyPluginEntry, CLIProxyPluginMenu } from '@/src/types/cliproxy';

const { useSnapshot } = require('valtio/react');

function pluginMenus(plugin: CLIProxyPluginEntry) {
  return plugin.menus?.length ? plugin.menus : plugin.metadata?.menus ?? [];
}

function pluginFields(plugin: CLIProxyPluginEntry | null) {
  if (!plugin) return [];
  return plugin.config_fields?.length ? plugin.config_fields : plugin.metadata?.config_fields ?? [];
}

function initialFieldValue(field: CLIProxyPluginConfigField, value: unknown): string | boolean {
  if (field.type === 'boolean') return value === true;
  if (field.type === 'array') return JSON.stringify(Array.isArray(value) ? value : [], null, 2);
  if (field.type === 'object') return JSON.stringify(value && typeof value === 'object' && !Array.isArray(value) ? value : {}, null, 2);
  if (field.type === 'enum' && (value === undefined || value === null || value === '')) return field.enum_values?.[0] || '';
  return value === undefined || value === null ? '' : String(value);
}

function buildVisualConfig(base: Record<string, unknown>, fields: CLIProxyPluginConfigField[], values: Record<string, string | boolean>) {
  const next = { ...base };
  for (const field of fields) {
    const value = values[field.name];
    if (field.type === 'boolean') {
      next[field.name] = value === true;
      continue;
    }
    const text = typeof value === 'string' ? value.trim() : '';
    if (field.type === 'number' || field.type === 'integer') {
      const parsed = Number(text || 0);
      if (!Number.isFinite(parsed) || (field.type === 'integer' && !Number.isInteger(parsed))) throw new Error(`${field.name} 必须是有效的${field.type === 'integer' ? '整数' : '数字'}。`);
      next[field.name] = parsed;
      continue;
    }
    if (field.type === 'array' || field.type === 'object') {
      let parsed: unknown;
      try { parsed = JSON.parse(text || (field.type === 'array' ? '[]' : '{}')); } catch { throw new Error(`${field.name} 不是有效 JSON。`); }
      if (field.type === 'array' && !Array.isArray(parsed)) throw new Error(`${field.name} 必须是 JSON 数组。`);
      if (field.type === 'object' && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) throw new Error(`${field.name} 必须是 JSON 对象。`);
      next[field.name] = parsed;
      continue;
    }
    if (field.type === 'enum' && field.enum_values?.length && !field.enum_values.includes(text)) throw new Error(`${field.name} 不是允许的选项。`);
    next[field.name] = text;
  }
  return next;
}

function sensitiveField(name: string) {
  return /(secret|token|password|api[-_]?key)/i.test(name);
}

function menuLabel(menu: CLIProxyPluginMenu, index: number) {
  return menu.title || menu.label || menu.name || menu.id || `插件页面 ${index + 1}`;
}

function pluginMenuURL(baseUrl: string, pluginID: string, menu: CLIProxyPluginMenu) {
  const value = (menu.url || menu.href || menu.path || '').trim();
  if (/^https?:\/\//i.test(value)) return value;
  const base = baseUrl.replace(/\/+$/, '');
  if (value.startsWith('/')) return `${base}${value}`;
  return `${base}/v0/resource/plugins/${encodeURIComponent(pluginID)}/${value || 'index.html'}`;
}

export default function CLIProxyPluginsScreen() {
  const queryClient = useQueryClient();
  const workspace = useSnapshot(workspaceModeState);
  const stored = useSnapshot(cliProxyConfigState);
  const connection = useMemo<CLIProxyConnection>(() => ({ baseUrl: stored.baseUrl, managementKey: stored.managementKey }), [stored.baseUrl, stored.managementKey]);
  const configured = workspace.mode === 'cliproxy' && Boolean(connection.baseUrl && connection.managementKey);
  const [selected, setSelected] = useState<CLIProxyPluginEntry | null>(null);
  const [json, setJSON] = useState('{}');
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>({});
  const pluginsQuery = useQuery({ queryKey: ['cliproxy', 'plugins', stored.baseUrl, stored.revision], queryFn: () => listCLIProxyPlugins(connection), enabled: configured });
  const configQuery = useQuery({ queryKey: ['cliproxy', 'plugin-config', selected?.id, stored.baseUrl], queryFn: () => getCLIProxyPluginConfig(connection, selected!.id), enabled: configured && Boolean(selected?.id) });
  const selectedFields = useMemo(() => pluginFields(selected), [selected]);
  useEffect(() => {
    if (!configQuery.data) return;
    setJSON(JSON.stringify(configQuery.data, null, 2));
    setFormValues(Object.fromEntries(selectedFields.map((field) => [field.name, initialFieldValue(field, configQuery.data[field.name])])));
  }, [configQuery.data, selectedFields]);
  const toggleMutation = useMutation({ mutationFn: (plugin: CLIProxyPluginEntry) => setCLIProxyPluginEnabled(connection, plugin.id, !plugin.effective_enabled), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['cliproxy', 'plugins'] }); } });
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('请先选择插件。');
      if (selectedFields.length) return saveCLIProxyPluginConfig(connection, selected.id, buildVisualConfig(configQuery.data ?? {}, selectedFields, formValues));
      let value: unknown;
      try { value = JSON.parse(json); } catch { throw new Error('插件配置不是有效 JSON。'); }
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('插件配置必须是 JSON 对象。');
      return saveCLIProxyPluginConfig(connection, selected.id, value as Record<string, unknown>);
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['cliproxy'] }); localizedAlert('插件配置已保存', 'CLIProxyAPI 已重新配置插件。'); },
  });
  const deleteMutation = useMutation({ mutationFn: (plugin: CLIProxyPluginEntry) => deleteCLIProxyPlugin(connection, plugin.id), onSuccess: async (result) => { setSelected(null); await queryClient.invalidateQueries({ queryKey: ['cliproxy'] }); if (result.restart_required) localizedAlert('需要重启', '插件文件已处理，但 CLIProxyAPI 需要重启后才能完全卸载。'); } });
  const openPluginMenu = (plugin: CLIProxyPluginEntry, menu: CLIProxyPluginMenu) => {
    void Linking.openURL(pluginMenuURL(connection.baseUrl, plugin.id, menu)).catch(() => localizedAlert('无法打开插件页面', pluginMenuURL(connection.baseUrl, plugin.id, menu)));
  };

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
            const menus = pluginMenus(plugin);
            const fields = plugin.config_fields?.length ? plugin.config_fields : plugin.metadata?.config_fields ?? [];
            const togglePending = toggleMutation.isPending && toggleMutation.variables?.id === plugin.id;
            return <View key={plugin.id} className="gap-3 rounded-2xl border border-[#E2E9F3] bg-[#F8FAFD] p-3 dark:border-[#273449] dark:bg-[#152033]"><View className="flex-row items-center gap-3"><View className={`h-9 w-9 items-center justify-center rounded-xl ${active ? 'bg-[#E8F8F0] dark:bg-[#143A2C]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}><Puzzle size={17} color={active ? '#1C9B62' : '#7B8798'} /></View><View className="flex-1"><Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{plugin.metadata?.name || plugin.id}</Text><Text className="mt-1 text-[9px] text-[#7B8798] dark:text-[#9EABC0]">{plugin.id} · {plugin.metadata?.version || '—'} · {active ? '运行中' : plugin.enabled ? '已配置但未生效' : '已停用'}</Text><Text className="mt-1 text-[9px] text-[#7B8798] dark:text-[#9EABC0]">配置字段 {fields.length} · 插件页面 {menus.length}</Text></View></View>{menus.map((menu, index) => <AdminButton key={`${menu.id || menu.path || index}`} label={`打开 ${menuLabel(menu, index)}`} disabled={!active} onPress={() => openPluginMenu(plugin, menu)} />)}<View className="flex-row gap-2"><View className="flex-1"><AdminButton label="编辑" tone="muted" onPress={() => { setSelected(plugin); setFormValues({}); saveMutation.reset(); }} /></View><View className="flex-1"><AdminButton label={active ? '停用' : '启用'} tone="muted" pending={togglePending} disabled={toggleMutation.isPending && !togglePending} onPress={() => toggleMutation.mutate(plugin)} /></View><Pressable disabled={protectedPlugin || deleteMutation.isPending} onPress={() => localizedAlert('卸载插件？', `将删除 ${plugin.id} 的插件文件和配置。`, [{ text: '取消', style: 'cancel' }, { text: '卸载', style: 'destructive', onPress: () => deleteMutation.mutate(plugin) }])} className="h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF0F2] disabled:opacity-30 dark:bg-[#3A1720]"><Trash2 size={16} color="#D9475C" /></Pressable></View>{plugin.metadata?.github_repository ? <Pressable onPress={() => void Linking.openURL(plugin.metadata!.github_repository!)} className="flex-row items-center gap-2"><Github size={13} color="#2F6DF6" /><Text className="text-[10px] font-bold text-[#2F6DF6]">打开插件仓库</Text><ExternalLink size={12} color="#2F6DF6" /></Pressable> : null}{protectedPlugin ? <Text className="text-[9px] text-[#946321] dark:text-[#FFD66B]">Group Router 由分组页面管理，为防止现有 Client Key 失效，这里禁止直接卸载。</Text> : null}</View>;
          })}
          <AdminMessage error={pluginsQuery.error || toggleMutation.error || deleteMutation.error} />
        </AdminSection>
        {selected ? (
          <AdminSection title={`插件配置 · ${selected.metadata?.name || selected.id}`} detail={selectedFields.length ? '根据插件声明的字段生成原生控件；未声明字段会原样保留。' : '该插件没有声明可视化字段，使用 JSON 回退编辑器。'}>
            <View className="flex-row items-center gap-2"><Pencil size={16} color="#2F6DF6" /><Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{selectedFields.length ? '可视化配置' : 'JSON 配置'}</Text></View>
            {selectedFields.map((field) => {
              const value = formValues[field.name];
              return (
                <View key={field.name} className="gap-2 rounded-2xl bg-[#F6F8FC] p-3 dark:bg-[#152033]">
                  <Text className="text-xs font-bold text-[#475467] dark:text-[#C2CCDB]">{field.name}</Text>
                  {field.description ? <Text className="text-[10px] leading-4 text-[#7B8798] dark:text-[#9EABC0]">{field.description}</Text> : null}
                  {field.type === 'boolean' ? (
                    <AdminChip label={value === true ? '已启用' : '已停用'} selected={value === true} onPress={() => setFormValues((current) => ({ ...current, [field.name]: current[field.name] !== true }))} />
                  ) : field.type === 'enum' && field.enum_values?.length ? (
                    <View className="flex-row flex-wrap gap-2">{field.enum_values.map((option) => <AdminChip key={option} label={option} selected={value === option} onPress={() => setFormValues((current) => ({ ...current, [field.name]: option }))} />)}</View>
                  ) : field.type === 'array' || field.type === 'object' ? (
                    <TextInput value={typeof value === 'string' ? value : ''} onChangeText={(text) => setFormValues((current) => ({ ...current, [field.name]: text }))} multiline autoCapitalize="none" autoCorrect={false} textAlignVertical="top" className="min-h-[120px] rounded-2xl border border-[#E2E9F3] bg-[#0F1726] p-3 font-mono text-[10px] leading-5 text-[#D8E3F4] dark:border-[#273449]" />
                  ) : (
                    <AdminField label={field.type === 'number' ? '数字' : field.type === 'integer' ? '整数' : '值'} value={typeof value === 'string' ? value : ''} onChangeText={(text) => setFormValues((current) => ({ ...current, [field.name]: text }))} keyboardType={field.type === 'number' ? 'decimal-pad' : field.type === 'integer' ? 'number-pad' : 'default'} secureTextEntry={sensitiveField(field.name)} autoCapitalize="none" autoCorrect={false} />
                  )}
                </View>
              );
            })}
            {!selectedFields.length ? <><View className="flex-row items-center gap-2"><Braces size={16} color="#2F6DF6" /><Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">高级 JSON</Text></View><TextInput value={json} onChangeText={setJSON} multiline autoCapitalize="none" autoCorrect={false} textAlignVertical="top" className="min-h-[300px] rounded-2xl border border-[#E2E9F3] bg-[#0F1726] p-3 font-mono text-[10px] leading-5 text-[#D8E3F4] dark:border-[#273449]" /></> : null}
            <View className="flex-row gap-2"><View className="flex-1"><AdminButton label="保存配置" pending={saveMutation.isPending} disabled={!configQuery.isSuccess} onPress={() => saveMutation.mutate()} /></View><View className="flex-1"><AdminButton label="关闭编辑" tone="muted" onPress={() => setSelected(null)} /></View></View>
            <AdminMessage error={configQuery.error || saveMutation.error} />
          </AdminSection>
        ) : null}
      </ScreenShell>
    </>
  );
}
