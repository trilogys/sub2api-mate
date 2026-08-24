import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Copy, Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Pressable, View } from 'react-native';

import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
import { Text, localizedAlert } from '@/src/components/localized-text';
import { ScreenShell } from '@/src/components/screen-shell';
import { copyWithFeedback } from '@/src/lib/clipboard';
import { cliProxyQuotaColor, cliProxyQuotaMinimum, cliProxyQuotaStatusLabel } from '@/src/lib/cliproxy-quota';
import {
  CLIPROXY_GROUP_ROUTER_PLUGIN_ID,
  getCLIProxyAPIKeys,
  getCLIProxyGroupRouterConfig,
  getCLIProxyQuotaReports,
  installCLIProxyStorePlugin,
  listCLIProxyAuthFiles,
  listCLIProxyPluginStore,
  listCLIProxyPlugins,
  putCLIProxyGroupRouterConfig,
  saveCLIProxyGroupRouterConfig,
  setCLIProxyAuthFileFields,
  setCLIProxyPluginEnabled,
} from '@/src/services/cliproxy';
import { cliProxyConfigState, hydrateCLIProxyConfig } from '@/src/store/cliproxy-config';
import { workspaceModeState } from '@/src/store/workspace-mode';
import type { CLIProxyConnection, CLIProxyGroup, CLIProxyGroupRouterConfig, CLIProxyGroupStrategy } from '@/src/types/cliproxy';

const { useSnapshot } = require('valtio/react');

const EMPTY_CONFIG: CLIProxyGroupRouterConfig = {
  enabled: true,
  deny_unmapped: true,
  allow_shared_auths: false,
  groups: [],
};

function maskKey(value: string) {
  if (value.length <= 10) return `${value.slice(0, 2)}••••${value.slice(-2)}`;
  return `${value.slice(0, 6)}••••••${value.slice(-4)}`;
}

function generateGroupID(name: string) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28);
  return `${slug || 'group'}-${Date.now().toString(36)}`;
}

function generateClientKey() {
  const bytes = new Uint8Array(32);
  const cryptoAPI = globalThis.crypto;
  if (!cryptoAPI?.getRandomValues) throw new Error('当前设备不支持安全随机数，请手动输入高强度 Client Key。');
  cryptoAPI.getRandomValues(bytes);
  return `cpa_grp_${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export default function CLIProxyGroupsScreen() {
  const client = useQueryClient();
  const workspace = useSnapshot(workspaceModeState);
  const stored = useSnapshot(cliProxyConfigState);
  const connection = useMemo<CLIProxyConnection>(() => ({ baseUrl: stored.baseUrl, managementKey: stored.managementKey }), [stored.baseUrl, stored.managementKey]);
  const configured = workspace.mode === 'cliproxy' && stored.hydrated && Boolean(connection.baseUrl && connection.managementKey);
  const [editingID, setEditingID] = useState('');
  const [name, setName] = useState('');
  const [apiKey, setAPIKey] = useState('');
  const [strategy, setStrategy] = useState<CLIProxyGroupStrategy>('round-robin');
  const [enabled, setEnabled] = useState(true);
  const [authIDs, setAuthIDs] = useState<string[]>([]);
  const [formError, setFormError] = useState('');
  const autoRefreshRunningRef = useRef(false);

  useEffect(() => {
    if (workspace.mode === 'cliproxy') void hydrateCLIProxyConfig();
  }, [workspace.mode]);

  const pluginsQuery = useQuery({
    queryKey: ['cliproxy', 'plugins', stored.baseUrl, stored.revision],
    queryFn: () => listCLIProxyPlugins(connection),
    enabled: configured,
  });
  const pluginEntry = useMemo(() => (pluginsQuery.data?.plugins ?? []).find((item) =>
    item.id === CLIPROXY_GROUP_ROUTER_PLUGIN_ID || item.metadata?.name === 'CLIProxy Group Router'
  ), [pluginsQuery.data]);
  const pluginInstalled = Boolean(pluginEntry?.registered || pluginEntry?.path);
  const pluginConfigured = Boolean(pluginEntry?.configured);
  const pluginReady = Boolean(pluginsQuery.data?.plugins_enabled && pluginEntry?.effective_enabled);
  const keyPolicyEntry = useMemo(() => (pluginsQuery.data?.plugins ?? []).find((item) => item.id === 'cpa-key-policy'), [pluginsQuery.data]);
  const keyPolicyReady = Boolean(pluginsQuery.data?.plugins_enabled && keyPolicyEntry?.effective_enabled);
  const pluginStoreQuery = useQuery({
    queryKey: ['cliproxy', 'plugin-store', stored.baseUrl, stored.revision],
    queryFn: () => listCLIProxyPluginStore(connection),
    enabled: configured && !pluginInstalled,
    retry: false,
  });
  const keyPolicyStoreEntry = useMemo(() => (pluginStoreQuery.data?.plugins ?? []).find((item) => item.id === 'cpa-key-policy'), [pluginStoreQuery.data]);

  const configQuery = useQuery({
    queryKey: ['cliproxy', 'group-router-config', stored.baseUrl, stored.revision],
    queryFn: () => getCLIProxyGroupRouterConfig(connection),
    enabled: configured && (pluginInstalled || pluginConfigured),
  });
  const authFilesQuery = useQuery({
    queryKey: ['cliproxy', 'auth-files', stored.baseUrl, stored.revision],
    queryFn: () => listCLIProxyAuthFiles(connection),
    enabled: configured,
  });
  const apiKeysQuery = useQuery({
    queryKey: ['cliproxy', 'api-keys', stored.baseUrl, stored.revision],
    queryFn: () => getCLIProxyAPIKeys(connection),
    enabled: configured && authFilesQuery.isSuccess,
  });
  const quotaQuery = useQuery({
    queryKey: ['cliproxy', 'quotas', stored.baseUrl, stored.revision],
    queryFn: () => getCLIProxyQuotaReports(connection),
    enabled: false,
  });

  useEffect(() => {
    if (!configured || !pluginReady || !stored.autoRefreshEnabled) return;
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active' || autoRefreshRunningRef.current) return;
      autoRefreshRunningRef.current = true;
      void Promise.all([authFilesQuery.refetch(), quotaQuery.refetch()])
        .finally(() => { autoRefreshRunningRef.current = false; });
    }, stored.autoRefreshIntervalSeconds * 1_000);
    return () => clearInterval(timer);
  }, [configured, pluginReady, stored.autoRefreshEnabled, stored.autoRefreshIntervalSeconds, stored.revision]);

  const config = configQuery.data ?? EMPTY_CONFIG;
  const authOptions = useMemo(() => (authFilesQuery.data ?? []).map((file) => ({
    id: file.id || file.name,
    label: file.label || file.email || file.account || file.name,
    provider: file.provider || file.type || 'unknown',
    disabled: Boolean(file.disabled),
  })), [authFilesQuery.data]);
  const otherGroups = config.groups.filter((group) => group.id !== editingID);
  const otherAuthIDs = useMemo(() => new Set(otherGroups.flatMap((group) => group.auth_ids)), [otherGroups]);
  const quotaByAuth = useMemo(() => new Map((quotaQuery.data ?? []).map((report) => [report.authIndex, report])), [quotaQuery.data]);
  const authIDToIndex = useMemo(() => new Map((authFilesQuery.data ?? []).map((file) => [file.id || file.name, file.auth_index || ''])), [authFilesQuery.data]);
  const groupedKeySet = useMemo(() => new Set(config.groups.flatMap((group) => group.api_keys)), [config.groups]);
  const unassignedKeys = useMemo(() => (apiKeysQuery.data ?? []).filter((key) => !groupedKeySet.has(key)), [apiKeysQuery.data, groupedKeySet]);
  const priorityDrift = useMemo(() => (authFilesQuery.data ?? []).filter((file) => (file.priority ?? 0) !== 0), [authFilesQuery.data]);

  const resetForm = () => {
    setEditingID('');
    setName('');
    setAPIKey('');
    setStrategy('round-robin');
    setEnabled(true);
    setAuthIDs([]);
    setFormError('');
  };

  const editGroup = (group: CLIProxyGroup) => {
    setEditingID(group.id);
    setName(group.name);
    setAPIKey(group.api_keys[0] || '');
    setStrategy(group.strategy);
    setEnabled(group.enabled);
    setAuthIDs(group.auth_ids);
    setFormError('');
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!pluginInstalled) throw new Error('CLIProxy Group Router 插件尚未安装。');
      if (!configQuery.isSuccess) throw new Error('CLIProxy 分组配置尚未加载完成。');
      if (!name.trim()) throw new Error('请输入 CLIProxy 分组名称。');
      if (!apiKey.trim()) throw new Error('请输入该组专用 Client Key。');
      if (!authIDs.length) throw new Error('至少选择一个 CLIProxy 凭据。');
      if (otherGroups.some((group) => group.api_keys.includes(apiKey.trim()))) throw new Error('该 Client Key 已属于另一个 CLIProxy 分组。');
      const duplicateAuth = authIDs.find((id) => otherAuthIDs.has(id));
      if (duplicateAuth) throw new Error(`凭据 ${duplicateAuth} 已属于另一个 CLIProxy 分组。`);
      const group: CLIProxyGroup = {
        id: editingID || generateGroupID(name),
        name: name.trim(),
        enabled,
        strategy,
        api_keys: [apiKey.trim()],
        auth_ids: authIDs,
      };
      const next: CLIProxyGroupRouterConfig = {
        enabled: true,
        deny_unmapped: true,
        allow_shared_auths: false,
        groups: editingID ? config.groups.map((item) => item.id === editingID ? group : item) : [...config.groups, group],
      };
      // CLIProxy gives scheduler plugins only the globally highest priority tier.
      // Normalize every credential, including ungrouped ones, so a foreign high-priority
      // credential cannot hide a group's candidates before the plugin filters them.
      for (const file of authFilesQuery.data ?? []) {
        await setCLIProxyAuthFileFields(connection, file.name, { priority: 0 });
      }
      return saveCLIProxyGroupRouterConfig(connection, config, next);
    },
    onSuccess: async () => {
      resetForm();
      await client.invalidateQueries({ queryKey: ['cliproxy'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (groupID: string) => saveCLIProxyGroupRouterConfig(connection, config, {
      ...config,
      enabled: true,
      deny_unmapped: true,
      allow_shared_auths: false,
      groups: config.groups.filter((group) => group.id !== groupID),
    }),
    onSuccess: async () => {
      resetForm();
      await client.invalidateQueries({ queryKey: ['cliproxy'] });
    },
  });

  const enablePluginMutation = useMutation({
    mutationFn: () => putCLIProxyGroupRouterConfig(connection, configQuery.data ?? EMPTY_CONFIG),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['cliproxy'] });
    },
  });

  const normalizePriorityMutation = useMutation({
    mutationFn: async () => {
      for (const file of priorityDrift) await setCLIProxyAuthFileFields(connection, file.name, { priority: 0 });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['cliproxy', 'auth-files'] });
    },
  });
  const keyPolicyMutation = useMutation<unknown, Error, void>({
    mutationFn: () => keyPolicyEntry
      ? setCLIProxyPluginEnabled(connection, keyPolicyEntry.id, true)
      : keyPolicyStoreEntry
        ? installCLIProxyStorePlugin(connection, keyPolicyStoreEntry.id, keyPolicyStoreEntry.source_id, keyPolicyStoreEntry.version)
        : Promise.reject(new Error('官方插件商店未返回 CPA Key Policy。')),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['cliproxy'] }); },
  });
  const openKeyPolicy = () => router.push('/cliproxy-key-policy');

  if (workspace.mode !== 'cliproxy') return null;

  return (
    <>
      <LocalizedStackScreen options={{ title: 'CLIProxy 分组管理', headerShown: true }} />
      <ScreenShell
        title="CLIProxy 分组管理"
        subtitle="单实例 · Key 到凭据池的强制路由"
        safeAreaEdges={['bottom']}
        bottomInsetClassName="pb-10"
        refreshing={pluginsQuery.isRefetching || configQuery.isRefetching || authFilesQuery.isRefetching || apiKeysQuery.isRefetching || quotaQuery.isRefetching}
        onRefresh={configured ? async () => { await Promise.all([pluginsQuery.refetch(), configQuery.refetch(), authFilesQuery.refetch(), apiKeysQuery.refetch(), quotaQuery.refetch()]); } : undefined}
      >
        <AdminSection title="插件状态" detail="分组由 CLIProxyAPI 原生 Scheduler 插件执行，不依赖 Sub2API 数据。">
          <View className="flex-row items-center gap-3 rounded-2xl bg-[#F6F8FC] p-3 dark:bg-[#152033]">
            <ShieldCheck size={20} color={pluginReady ? '#1C9B62' : '#D98A16'} />
            <View className="flex-1">
              <Text className="text-sm font-bold text-[#172033] dark:text-[#F4F7FB]">{pluginReady ? 'CLIProxy Group Router 已生效' : pluginInstalled ? '插件已发现，但尚未全局启用' : pluginConfigured ? '存在分组配置，但插件文件缺失' : '尚未安装 CLIProxy Group Router'}</Text>
              <Text className="mt-1 text-[11px] leading-4 text-[#6B778C] dark:text-[#9EABC0]">插件目录：{pluginsQuery.data?.plugins_dir || '-'}</Text>
            </View>
          </View>
          {!pluginReady ? <Text className="text-[11px] leading-5 text-[#946321] dark:text-[#FFD66B]">先构建 `integrations/cliproxy-group-router`，把 `.so` 放入插件目录，设置 `plugins.enabled: true` 后重启 CLIProxyAPI。</Text> : null}
          {pluginReady && configQuery.isSuccess && unassignedKeys.length ? <Text className="text-[11px] leading-5 text-[#D9475C]">当前有 {unassignedKeys.length} 个未分组 Client Key；Group Router 会拒绝这些 Key 的模型请求。</Text> : null}
          {pluginReady && priorityDrift.length ? <Text className="text-[11px] leading-5 text-[#946321] dark:text-[#FFD66B]">当前有 {priorityDrift.length} 个凭据不在统一优先级，可能在分组过滤前隐藏其他组凭据。</Text> : null}
          {pluginReady && priorityDrift.length ? <AdminButton label="统一凭据优先级" pending={normalizePriorityMutation.isPending} tone="muted" onPress={() => normalizePriorityMutation.mutate()} /> : null}
          {pluginInstalled && !pluginReady ? <AdminButton label="启用 Group Router 插件" pending={enablePluginMutation.isPending} disabled={!configQuery.isSuccess} tone="muted" onPress={() => localizedAlert('启用 Group Router？', '启用后，尚未加入 CLIProxy 分组的 Client Key 将被拒绝。请随后立即创建分组。', [{ text: '取消', style: 'cancel' }, { text: '启用', onPress: () => enablePluginMutation.mutate() }])} /> : null}
          <AdminMessage error={pluginsQuery.error || configQuery.error || enablePluginMutation.error || normalizePriorityMutation.error} />
        </AdminSection>

        {!pluginInstalled ? (
          <AdminSection title="选择可用的分组实现" detail="当前没有 CLIProxy Group Router，因此显式 auth ID 分组表单不会伪装成可用状态。请选择下面一种实际可安装的实现。">
            <View className="gap-2 rounded-2xl border border-[#BDD0FA] bg-[#EEF4FF] p-3 dark:border-[#315189] dark:bg-[#172C55]">
              <Text className="text-xs font-bold text-[#2F6DF6]">推荐：CPA Key Policy（官方插件商店已收录）</Text>
              <Text className="text-[10px] leading-5 text-[#4B6290] dark:text-[#B8CCF4]">支持插件自有 Key、模型权限、RPM、日/周预算、Codex/Antigravity tier 和自定义正则凭据组；组内无匹配凭据时不会跨组回退。</Text>
              {keyPolicyReady ? <AdminButton label="在 GateNest 中管理 CPA Key Policy" onPress={openKeyPolicy} /> : keyPolicyEntry || keyPolicyStoreEntry ? <AdminButton label={keyPolicyEntry ? '启用 CPA Key Policy' : '从官方商店安装 CPA Key Policy'} pending={keyPolicyMutation.isPending} onPress={() => keyPolicyMutation.mutate()} /> : <AdminButton label="打开插件商店检查" tone="muted" onPress={() => router.push('/cliproxy-plugin-store')} />}
              <AdminMessage error={pluginStoreQuery.error || keyPolicyMutation.error} />
            </View>
            <View className="gap-2 rounded-2xl border border-[#E2E9F3] bg-[#F8FAFD] p-3 dark:border-[#273449] dark:bg-[#152033]">
              <Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">GateNest Group Router（精确选择 auth IDs）</Text>
              <Text className="text-[10px] leading-5 text-[#6B778C] dark:text-[#9EABC0]">适合必须在 GateNest 中逐个勾选凭据、强制一个凭据只属于一个组的场景。它尚未进入 CLIProxy 官方商店，需要把 Release 中的 `.so` 放入服务端插件目录并重启。</Text>
              <View className="flex-row gap-2"><View className="flex-1"><AdminButton label="打开 GateNest Release" tone="muted" onPress={() => void Linking.openURL('https://github.com/trilogys/sub2api-mate/releases/latest')} /></View><View className="flex-1"><AdminButton label="复制 Docker 安装命令" tone="muted" onPress={() => void copyWithFeedback('unzip cliproxy-group-router-linux-amd64.zip -d cliproxy-group-router\ndocker cp cliproxy-group-router/cliproxy-group-router.so <container>:/CLIProxyAPI/plugins/\ndocker restart <container>', 'Group Router 安装命令')} /></View></View>
            </View>
          </AdminSection>
        ) : null}

        {pluginInstalled && configQuery.isSuccess ? (
          <AdminSection title={editingID ? '编辑 CLIProxy 分组' : '新建 CLIProxy 分组'} detail="每个组使用独立 Client Key；一个凭据默认只能属于一个组。">
            <AdminField label="分组名称" value={name} onChangeText={setName} placeholder="例如：Codex Team A" />
            <AdminField label="专用 Client Key" value={apiKey} onChangeText={setAPIKey} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="cpa_grp_…" />
            <View className="flex-row gap-2">
              <View className="flex-1"><AdminButton label="生成安全 Key" tone="muted" onPress={() => { try { setAPIKey(generateClientKey()); setFormError(''); } catch (error) { setFormError(error instanceof Error ? error.message : '生成失败'); } }} /></View>
              {apiKey ? <View className="flex-1"><AdminButton label="复制 Key" tone="muted" onPress={() => void copyWithFeedback(apiKey, 'CLIProxy Group Key')} /></View> : null}
            </View>
            <Text className="text-xs font-medium text-[#667085] dark:text-[#9EABC0]">调度策略</Text>
            <View className="flex-row gap-2">
              <AdminChip label="Round Robin" selected={strategy === 'round-robin'} onPress={() => setStrategy('round-robin')} />
              <AdminChip label="Fill First" selected={strategy === 'fill-first'} onPress={() => setStrategy('fill-first')} />
              <AdminChip label="启用" selected={enabled} onPress={() => setEnabled(!enabled)} />
            </View>
            <Text className="text-xs font-medium text-[#667085] dark:text-[#9EABC0]">组内凭据（至少一个）</Text>
            <View className="gap-2">
              {authOptions.map((auth) => {
                const selected = authIDs.includes(auth.id);
                const occupied = otherAuthIDs.has(auth.id);
                return (
                  <Pressable
                    key={auth.id}
                    disabled={occupied}
                    onPress={() => setAuthIDs(selected ? authIDs.filter((id) => id !== auth.id) : [...authIDs, auth.id])}
                    className={`rounded-2xl border px-3 py-3 ${selected ? 'border-[#2F6DF6] bg-[#EAF2FF] dark:bg-[#172C55]' : 'border-[#E2E9F3] bg-[#F6F8FC] dark:border-[#273449] dark:bg-[#152033]'} ${occupied ? 'opacity-45' : ''}`}
                  >
                    <Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{selected ? '✓ ' : ''}{auth.label}</Text>
                    <Text className="mt-1 text-[10px] text-[#7B8798] dark:text-[#9EABC0]">{auth.provider} · {occupied ? '已属于其他组' : auth.disabled ? '凭据已停用' : auth.id}</Text>
                  </Pressable>
                );
              })}
            </View>
            {!authOptions.length ? <EmptyState label="CLIProxyAPI 账号池为空，请先完成 OAuth 授权" /> : null}
            <AdminMessage error={formError || saveMutation.error} />
            <View className="flex-row gap-2">
              <View className="flex-1"><AdminButton label={editingID ? '保存分组' : '创建分组'} pending={saveMutation.isPending} disabled={!name.trim() || !apiKey.trim() || !authIDs.length} onPress={() => saveMutation.mutate()} /></View>
              {editingID ? <View className="flex-1"><AdminButton label="取消编辑" tone="muted" onPress={resetForm} /></View> : null}
            </View>
          </AdminSection>
        ) : pluginInstalled ? <Text className="text-xs text-[#98A2B3]">正在加载 CLIProxy 分组配置…</Text> : null}

        <AdminSection title="CLIProxy 分组列表" detail="未分组 Key 默认拒绝；组内没有可用凭据时不会跨组回退。">
          <View className="flex-row items-center gap-2">
            <Text className="flex-1 text-xs text-[#6B778C] dark:text-[#9EABC0]">{config.groups.length} 个独立组</Text>
            <Pressable onPress={() => quotaQuery.refetch()} className="flex-row items-center gap-1 rounded-full bg-[#EAF2FF] px-3 py-2 dark:bg-[#172C55]"><RefreshCw size={12} color="#2F6DF6" /><Text className="text-[10px] font-bold text-[#2F6DF6]">刷新组配额</Text></Pressable>
            <Pressable onPress={resetForm} className="h-8 w-8 items-center justify-center rounded-full bg-[#2F6DF6]"><Plus size={15} color="#fff" /></Pressable>
          </View>
          {configQuery.isLoading ? <Text className="text-xs text-[#98A2B3]">正在加载 CLIProxy 分组配置…</Text> : null}
          {configQuery.isSuccess && !config.groups.length ? <EmptyState label="尚未创建 CLIProxy 分组" /> : null}
          {configQuery.isSuccess ? config.groups.map((group) => {
            const reports = group.auth_ids.flatMap((id) => {
              const index = authIDToIndex.get(id);
              const report = index ? quotaByAuth.get(index) : undefined;
              return report ? [report] : [];
            });
            const exhausted = reports.filter((report) => report.status === 'exhausted').length;
            const errors = reports.filter((report) => report.status === 'error').length;
            const remainingValues = reports.flatMap((report) => {
              const value = cliProxyQuotaMinimum(report);
              return value === undefined ? [] : [value];
            });
            const minimumRemaining = remainingValues.length ? Math.min(...remainingValues) : undefined;
            return (
              <View key={group.id} className="gap-3 rounded-2xl border border-[#E2E9F3] bg-[#F8FAFD] p-3 dark:border-[#273449] dark:bg-[#152033]">
                <View className="flex-row items-start gap-3">
                  <View className={`h-9 w-9 items-center justify-center rounded-xl ${group.enabled ? 'bg-[#E8F8F0] dark:bg-[#143A2C]' : 'bg-[#FFF0F2] dark:bg-[#3A1720]'}`}><ShieldCheck size={17} color={group.enabled ? '#1C9B62' : '#D9475C'} /></View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-[#172033] dark:text-[#F4F7FB]">{group.name}</Text>
                    <Text className="mt-1 text-[10px] text-[#6B778C] dark:text-[#9EABC0]">{group.strategy} · {group.auth_ids.length} 个凭据 · {group.enabled ? '启用' : '停用'}</Text>
                    <Text className="mt-1 text-[10px] text-[#6B778C] dark:text-[#9EABC0]">Key：{maskKey(group.api_keys[0] || '')}</Text>
                    {reports.length ? <Text className="mt-1 text-[10px] text-[#6B778C] dark:text-[#9EABC0]">组内配额：{reports.length} 份 · 最低剩余 {minimumRemaining === undefined ? '—' : `${minimumRemaining.toFixed(0)}%`} · 耗尽 {exhausted} · 错误 {errors}</Text> : null}
                  </View>
                  <Pressable onPress={() => void copyWithFeedback(group.api_keys[0] || '', 'CLIProxy Group Key')}><Copy size={16} color="#2F6DF6" /></Pressable>
                </View>
                {reports.length ? (
                  <View className="gap-1 rounded-xl bg-white p-2.5 dark:bg-[#111827]">
                    {reports.map((report) => {
                      const remaining = cliProxyQuotaMinimum(report);
                      return <Text key={report.authIndex} style={{ color: cliProxyQuotaColor(remaining, report.status), fontSize: 9 }}>{report.name} · {cliProxyQuotaStatusLabel(report.status)} · {remaining === undefined ? '—' : `${remaining.toFixed(0)}%`}</Text>;
                    })}
                  </View>
                ) : null}
                <View className="flex-row gap-2">
                  <Pressable onPress={() => editGroup(group)} className="flex-1 flex-row items-center justify-center gap-1 rounded-xl bg-[#EAF2FF] py-2.5 dark:bg-[#172C55]"><Pencil size={13} color="#2F6DF6" /><Text className="text-[10px] font-bold text-[#2F6DF6]">编辑</Text></Pressable>
                  <Pressable disabled={deleteMutation.isPending} onPress={() => localizedAlert('删除 CLIProxy 分组？', '删除后该组 Client Key 将立即失效，且不会路由到其他组。', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => deleteMutation.mutate(group.id) }])} className="flex-1 flex-row items-center justify-center gap-1 rounded-xl bg-[#FFF0F2] py-2.5 disabled:opacity-50 dark:bg-[#3A1720]"><Trash2 size={13} color="#D9475C" /><Text className="text-[10px] font-bold text-[#D9475C]">删除</Text></Pressable>
                </View>
              </View>
            );
          }) : null}
          <AdminMessage error={deleteMutation.error || quotaQuery.error} />
        </AdminSection>
      </ScreenShell>
    </>
  );
}
