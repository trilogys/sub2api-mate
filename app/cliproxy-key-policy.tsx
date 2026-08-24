import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, KeyRound, Layers3, Pencil, RefreshCw, Route, ShieldCheck, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
import { Text, TextInput, localizedAlert } from '@/src/components/localized-text';
import { ScreenShell } from '@/src/components/screen-shell';
import { copyWithFeedback } from '@/src/lib/clipboard';
import {
  createCLIProxyKeyPolicyKey,
  deleteCLIProxyKeyPolicyAlias,
  deleteCLIProxyKeyPolicyClassifyRule,
  deleteCLIProxyKeyPolicyKey,
  getCLIProxyKeyPolicyCatalog,
  getCLIProxyKeyPolicyKeyUsage,
  getCLIProxyKeyPolicyStatus,
  listCLIProxyKeyPolicyAliases,
  listCLIProxyKeyPolicyClassifyRules,
  listCLIProxyKeyPolicyKeys,
  previewCLIProxyKeyPolicyClassifyRules,
  reorderCLIProxyKeyPolicyClassifyRules,
  resetCLIProxyKeyPolicyRPM,
  rotateCLIProxyKeyPolicyKey,
  saveCLIProxyKeyPolicyAlias,
  saveCLIProxyKeyPolicyClassifyRule,
  updateCLIProxyKeyPolicyKey,
} from '@/src/services/cliproxy';
import { cliProxyConfigState } from '@/src/store/cliproxy-config';
import { workspaceModeState } from '@/src/store/workspace-mode';
import type {
  CLIProxyConnection,
  CLIProxyKeyPolicyAlias,
  CLIProxyKeyPolicyClassifyRule,
  CLIProxyKeyPolicyKey,
  CLIProxyKeyPolicyKeySecret,
} from '@/src/types/cliproxy';

const { useSnapshot } = require('valtio/react');

type PageMode = 'keys' | 'aliases' | 'rules';
type AliasForm = {
  alias: string;
  dispatch: 'round-robin' | 'priority';
  billingMode: 'tokens' | 'per_call';
  inputPrice: string;
  outputPrice: string;
  cachePrice: string;
  perCall: string;
  targets: string;
};

function nonNegative(value: string, label: string) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} 必须是不小于 0 的数字。`);
  return parsed;
}

function keyFormDefaults() {
  return { id: '', name: '', rpm: '0', daily: '0', weekly: '0', enabled: true, allowModels: false, aliasNames: [] as string[] };
}

function aliasFormDefaults(): AliasForm {
  return { alias: '', dispatch: 'round-robin', billingMode: 'tokens', inputPrice: '0', outputPrice: '0', cachePrice: '0', perCall: '0', targets: '[]' };
}

function ruleFormDefaults() {
  return { name: '', field: 'filename', pattern: '', group: '', enabled: true };
}

export default function CLIProxyKeyPolicyScreen() {
  const queryClient = useQueryClient();
  const workspace = useSnapshot(workspaceModeState);
  const stored = useSnapshot(cliProxyConfigState);
  const connection = useMemo<CLIProxyConnection>(() => ({ baseUrl: stored.baseUrl, managementKey: stored.managementKey }), [stored.baseUrl, stored.managementKey]);
  const configured = workspace.mode === 'cliproxy' && Boolean(connection.baseUrl && connection.managementKey);
  const [mode, setMode] = useState<PageMode>('keys');
  const [editingKeyID, setEditingKeyID] = useState('');
  const [keyForm, setKeyForm] = useState(keyFormDefaults);
  const [secret, setSecret] = useState<CLIProxyKeyPolicyKeySecret | null>(null);
  const [usageID, setUsageID] = useState('');
  const [editingAlias, setEditingAlias] = useState('');
  const [aliasForm, setAliasForm] = useState(aliasFormDefaults);
  const [editingRule, setEditingRule] = useState('');
  const [ruleForm, setRuleForm] = useState(ruleFormDefaults);

  const statusQuery = useQuery({ queryKey: ['cliproxy', 'key-policy', 'status', stored.baseUrl], queryFn: () => getCLIProxyKeyPolicyStatus(connection), enabled: configured, retry: false });
  const keysQuery = useQuery({ queryKey: ['cliproxy', 'key-policy', 'keys', stored.baseUrl], queryFn: () => listCLIProxyKeyPolicyKeys(connection), enabled: configured && statusQuery.isSuccess });
  const aliasesQuery = useQuery({ queryKey: ['cliproxy', 'key-policy', 'aliases', stored.baseUrl], queryFn: () => listCLIProxyKeyPolicyAliases(connection), enabled: configured && statusQuery.isSuccess });
  const rulesQuery = useQuery({ queryKey: ['cliproxy', 'key-policy', 'rules', stored.baseUrl], queryFn: () => listCLIProxyKeyPolicyClassifyRules(connection), enabled: configured && statusQuery.isSuccess });
  const usageQuery = useQuery({ queryKey: ['cliproxy', 'key-policy', 'usage', usageID, stored.baseUrl], queryFn: () => getCLIProxyKeyPolicyKeyUsage(connection, usageID), enabled: configured && Boolean(usageID) });
  const previewQuery = useQuery({ queryKey: ['cliproxy', 'key-policy', 'preview', stored.baseUrl], queryFn: () => previewCLIProxyKeyPolicyClassifyRules(connection), enabled: false });
  const catalogQuery = useQuery({ queryKey: ['cliproxy', 'key-policy', 'catalog', stored.baseUrl], queryFn: () => getCLIProxyKeyPolicyCatalog(connection), enabled: false });

  const invalidatePolicy = async () => { await queryClient.invalidateQueries({ queryKey: ['cliproxy', 'key-policy'] }); };
  const saveKeyMutation = useMutation({
    mutationFn: async () => {
      if (!keyForm.id.trim()) throw new Error('请输入 Key ID。');
      if (!keyForm.name.trim()) throw new Error('请输入 Key 名称。');
      if (!keyForm.aliasNames.length) throw new Error('至少选择一个 Alias。');
      const input = {
        id: keyForm.id.trim(),
        name: keyForm.name.trim(),
        enabled: keyForm.enabled,
        rpm: nonNegative(keyForm.rpm, 'RPM'),
        daily_limit_usd: nonNegative(keyForm.daily, '每日额度'),
        weekly_limit_usd: nonNegative(keyForm.weekly, '每周额度'),
        allow_models_endpoint: keyForm.allowModels,
        aliases: keyForm.aliasNames.map((alias) => ({ alias })),
      };
      return editingKeyID ? updateCLIProxyKeyPolicyKey(connection, input) : createCLIProxyKeyPolicyKey(connection, input);
    },
    onSuccess: async (result) => {
      if ('plain_key' in result) setSecret(result);
      setEditingKeyID('');
      setKeyForm(keyFormDefaults());
      await invalidatePolicy();
    },
  });
  const keyActionMutation = useMutation({
    mutationFn: async (action: { type: 'delete' | 'rotate' | 'reset'; key: CLIProxyKeyPolicyKey }) => {
      if (action.type === 'delete') return deleteCLIProxyKeyPolicyKey(connection, action.key.id);
      if (action.type === 'reset') return resetCLIProxyKeyPolicyRPM(connection, action.key.id);
      return rotateCLIProxyKeyPolicyKey(connection, action.key.id);
    },
    onSuccess: async (result) => { if (result && typeof result === 'object' && 'plain_key' in result) setSecret(result as CLIProxyKeyPolicyKeySecret); await invalidatePolicy(); },
  });
  const saveAliasMutation = useMutation({
    mutationFn: async () => {
      if (!aliasForm.alias.trim()) throw new Error('请输入 Alias 名称。');
      let targets: unknown;
      try { targets = JSON.parse(aliasForm.targets); } catch { throw new Error('Targets 不是有效 JSON。'); }
      if (!Array.isArray(targets) || !targets.length) throw new Error('Targets 必须是至少包含一项的数组。');
      return saveCLIProxyKeyPolicyAlias(connection, {
        alias: aliasForm.alias.trim(),
        targets: targets as CLIProxyKeyPolicyAlias['targets'],
        dispatch: aliasForm.dispatch,
        billing_mode: aliasForm.billingMode,
        input_price_per_million: nonNegative(aliasForm.inputPrice, '输入价格'),
        output_price_per_million: nonNegative(aliasForm.outputPrice, '输出价格'),
        cache_read_price_per_million: nonNegative(aliasForm.cachePrice, '缓存价格'),
        per_call_usd: nonNegative(aliasForm.perCall, '单次价格'),
      });
    },
    onSuccess: async () => { setEditingAlias(''); setAliasForm(aliasFormDefaults()); await invalidatePolicy(); },
  });
  const deleteAliasMutation = useMutation({ mutationFn: (alias: string) => deleteCLIProxyKeyPolicyAlias(connection, alias), onSuccess: invalidatePolicy });
  const saveRuleMutation = useMutation({
    mutationFn: () => {
      if (!ruleForm.name.trim() || !ruleForm.pattern.trim() || !ruleForm.group.trim()) throw new Error('规则名称、正则和目标组不能为空。');
      return saveCLIProxyKeyPolicyClassifyRule(connection, { name: ruleForm.name.trim(), field: ruleForm.field.trim(), pattern: ruleForm.pattern, group: ruleForm.group.trim(), enabled: ruleForm.enabled });
    },
    onSuccess: async () => { setEditingRule(''); setRuleForm(ruleFormDefaults()); await invalidatePolicy(); },
  });
  const deleteRuleMutation = useMutation({ mutationFn: (name: string) => deleteCLIProxyKeyPolicyClassifyRule(connection, name), onSuccess: invalidatePolicy });
  const reorderMutation = useMutation({ mutationFn: (names: string[]) => reorderCLIProxyKeyPolicyClassifyRules(connection, names), onSuccess: invalidatePolicy });

  const editKey = (key: CLIProxyKeyPolicyKey) => { setEditingKeyID(key.id); setKeyForm({ id: key.id, name: key.name, rpm: String(key.rpm), daily: String(key.daily_limit_usd), weekly: String(key.weekly_limit_usd), enabled: key.enabled, allowModels: Boolean(key.allow_models_endpoint), aliasNames: (key.aliases ?? []).map((item) => item.alias) }); };
  const editAlias = (alias: CLIProxyKeyPolicyAlias) => { setEditingAlias(alias.alias); setAliasForm({ alias: alias.alias, dispatch: alias.dispatch || 'round-robin', billingMode: alias.billing_mode || 'tokens', inputPrice: String(alias.input_price_per_million || 0), outputPrice: String(alias.output_price_per_million || 0), cachePrice: String(alias.cache_read_price_per_million || 0), perCall: String(alias.per_call_usd || 0), targets: JSON.stringify(alias.targets, null, 2) }); };
  const editRule = (rule: CLIProxyKeyPolicyClassifyRule) => { setEditingRule(rule.name); setRuleForm({ ...rule }); };
  const moveRule = (index: number, delta: number) => { const names = (rulesQuery.data ?? []).map((rule) => rule.name); const next = index + delta; if (next < 0 || next >= names.length) return; [names[index], names[next]] = [names[next], names[index]]; reorderMutation.mutate(names); };

  if (workspace.mode !== 'cliproxy') return null;
  return (
    <>
      <LocalizedStackScreen options={{ title: 'Key Policy', headerShown: true }} />
      <ScreenShell title="CPA Key Policy" subtitle="App 内管理 Key、Alias、预算与凭据分组" safeAreaEdges={['bottom']} bottomInsetClassName="pb-10" refreshing={statusQuery.isRefetching || keysQuery.isRefetching || aliasesQuery.isRefetching || rulesQuery.isRefetching} onRefresh={async () => { await Promise.all([statusQuery.refetch(), keysQuery.refetch(), aliasesQuery.refetch(), rulesQuery.refetch()]); }}>
        <AdminSection title="插件状态" detail="所有操作直接调用 CPA Key Policy 的 Management API。">
          <View className="flex-row items-center gap-3 rounded-2xl bg-[#F6F8FC] p-3 dark:bg-[#152033]"><ShieldCheck size={20} color={statusQuery.data?.enabled ? '#1C9B62' : '#D98A16'} /><View className="flex-1"><Text className="text-sm font-bold text-[#172033] dark:text-[#F4F7FB]">{statusQuery.data?.enabled ? 'Key Policy 已运行' : statusQuery.isLoading ? '正在检测插件' : 'Key Policy 不可用'}</Text><Text className="mt-1 text-[10px] text-[#7B8798] dark:text-[#9EABC0]">Keys：{statusQuery.data?.key_count ?? 0} · State：{statusQuery.data?.state_file || '—'}</Text></View></View>
          <AdminButton label="打开插件原生 Web UI" tone="muted" onPress={() => void Linking.openURL(`${connection.baseUrl.replace(/\/+$/, '')}/v0/resource/plugins/cpa-key-policy/index.html`)} />
          <AdminMessage error={statusQuery.error} />
        </AdminSection>

        <View className="flex-row flex-wrap gap-2">{([['keys', 'Keys'], ['aliases', 'Aliases'], ['rules', 'Classification']] as const).map(([value, label]) => <AdminChip key={value} label={label} selected={mode === value} onPress={() => setMode(value)} />)}</View>

        {secret ? <AdminSection title="请立即保存新 Key" detail="明文只在创建或轮换时返回一次。"><Text selectable className="rounded-2xl bg-[#0F1726] p-3 font-mono text-xs text-[#D8E3F4]">{secret.plain_key}</Text><AdminButton label="复制新 Key" onPress={() => void copyWithFeedback(secret.plain_key, 'CPA Key')} /><AdminButton label="我已保存" tone="muted" onPress={() => setSecret(null)} /></AdminSection> : null}

        {mode === 'keys' ? <>
          <AdminSection title={editingKeyID ? `编辑 Key · ${editingKeyID}` : '创建 CPA Key'} detail="Key Policy Key 不要加入 CLIProxy 原生 api-keys，否则会绕过策略。">
            <AdminField label="Key ID" value={keyForm.id} editable={!editingKeyID} onChangeText={(id) => setKeyForm((value) => ({ ...value, id }))} placeholder="team-a" autoCapitalize="none" />
            <AdminField label="显示名称" value={keyForm.name} onChangeText={(name) => setKeyForm((value) => ({ ...value, name }))} placeholder="Team A" />
            <View className="flex-row gap-2"><View className="flex-1"><AdminField label="RPM（0 不限制）" value={keyForm.rpm} onChangeText={(rpm) => setKeyForm((value) => ({ ...value, rpm }))} keyboardType="number-pad" /></View><View className="flex-1"><AdminField label="每日 USD" value={keyForm.daily} onChangeText={(daily) => setKeyForm((value) => ({ ...value, daily }))} keyboardType="decimal-pad" /></View><View className="flex-1"><AdminField label="每周 USD" value={keyForm.weekly} onChangeText={(weekly) => setKeyForm((value) => ({ ...value, weekly }))} keyboardType="decimal-pad" /></View></View>
            <View className="flex-row flex-wrap gap-2"><AdminChip label="启用" selected={keyForm.enabled} onPress={() => setKeyForm((value) => ({ ...value, enabled: !value.enabled }))} /><AdminChip label="允许 /v1/models" selected={keyForm.allowModels} onPress={() => setKeyForm((value) => ({ ...value, allowModels: !value.allowModels }))} /></View>
            <Text className="text-xs font-medium text-[#667085] dark:text-[#9EABC0]">允许的 Aliases（至少一个）</Text><View className="flex-row flex-wrap gap-2">{(aliasesQuery.data ?? []).map((alias) => <AdminChip key={alias.alias} label={alias.alias} selected={keyForm.aliasNames.includes(alias.alias)} onPress={() => setKeyForm((value) => ({ ...value, aliasNames: value.aliasNames.includes(alias.alias) ? value.aliasNames.filter((item) => item !== alias.alias) : [...value.aliasNames, alias.alias] }))} />)}</View>
            {!aliasesQuery.data?.length ? <EmptyState label="请先在 Aliases 页创建至少一个路由别名" /> : null}
            <View className="flex-row gap-2"><View className="flex-1"><AdminButton label={editingKeyID ? '保存 Key' : '生成 Key'} pending={saveKeyMutation.isPending} disabled={!keyForm.id.trim() || !keyForm.name.trim() || !keyForm.aliasNames.length} onPress={() => saveKeyMutation.mutate()} /></View>{editingKeyID ? <View className="flex-1"><AdminButton label="取消编辑" tone="muted" onPress={() => { setEditingKeyID(''); setKeyForm(keyFormDefaults()); }} /></View> : null}</View><AdminMessage error={saveKeyMutation.error} />
          </AdminSection>
          <AdminSection title="Keys" detail={`${keysQuery.data?.length ?? 0} 个插件 Key。`}>
            {keysQuery.isLoading ? <Text className="text-xs text-[#98A2B3]">正在读取 Keys…</Text> : null}{keysQuery.isSuccess && !keysQuery.data.length ? <EmptyState label="尚未创建 Key Policy Key" /> : null}
            {(keysQuery.data ?? []).map((key) => <View key={key.id} className="gap-3 rounded-2xl border border-[#E2E9F3] bg-[#F8FAFD] p-3 dark:border-[#273449] dark:bg-[#152033]"><View className="flex-row items-start gap-3"><KeyRound size={18} color={key.enabled ? '#1C9B62' : '#7B8798'} /><View className="flex-1"><Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{key.name}</Text><Text className="mt-1 text-[9px] text-[#7B8798] dark:text-[#9EABC0]">{key.id} · {key.key_preview} · RPM {key.rpm || '∞'} · {key.enabled ? '启用' : '停用'}</Text><Text className="mt-1 text-[9px] text-[#7B8798] dark:text-[#9EABC0]">今日 ${key.usage?.daily_usd?.toFixed?.(4) ?? 0} / ${key.daily_limit_usd || '∞'} · 本周 ${key.usage?.weekly_usd?.toFixed?.(4) ?? 0} / ${key.weekly_limit_usd || '∞'}</Text><Text className="mt-1 text-[9px] text-[#7B8798] dark:text-[#9EABC0]">Aliases：{(key.aliases ?? []).map((item) => item.alias).join(' · ') || '—'}</Text></View></View><View className="flex-row flex-wrap gap-2"><Pressable onPress={() => editKey(key)} className="flex-row items-center gap-1 rounded-xl bg-[#EAF2FF] px-3 py-2.5 dark:bg-[#172C55]"><Pencil size={13} color="#2F6DF6" /><Text className="text-[10px] font-bold text-[#2F6DF6]">编辑</Text></Pressable><Pressable onPress={() => setUsageID(usageID === key.id ? '' : key.id)} className="rounded-xl bg-[#EAF2FF] px-3 py-2.5 dark:bg-[#172C55]"><Text className="text-[10px] font-bold text-[#2F6DF6]">用量</Text></Pressable><Pressable onPress={() => localizedAlert('轮换 Key？', '旧 Key 将立即失效，新明文只显示一次。', [{ text: '取消', style: 'cancel' }, { text: '轮换', onPress: () => keyActionMutation.mutate({ type: 'rotate', key }) }])} className="rounded-xl bg-[#EAF2FF] px-3 py-2.5 dark:bg-[#172C55]"><Text className="text-[10px] font-bold text-[#2F6DF6]">轮换</Text></Pressable><Pressable onPress={() => keyActionMutation.mutate({ type: 'reset', key })} className="rounded-xl bg-[#EAF2FF] px-3 py-2.5 dark:bg-[#172C55]"><Text className="text-[10px] font-bold text-[#2F6DF6]">重置 RPM</Text></Pressable><Pressable onPress={() => localizedAlert('删除 Key？', `${key.name} 将立即失效。`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => keyActionMutation.mutate({ type: 'delete', key }) }])} className="rounded-xl bg-[#FFF0F2] px-3 py-2.5 dark:bg-[#3A1720]"><Trash2 size={13} color="#D9475C" /></Pressable></View>{usageID === key.id ? <View className="gap-1 rounded-xl bg-white p-2.5 dark:bg-[#111827]">{usageQuery.isLoading ? <Text className="text-[10px] text-[#98A2B3]">正在读取用量…</Text> : (usageQuery.data?.aliases ?? []).map((item) => <Text key={item.alias} className="text-[9px] text-[#6B778C] dark:text-[#9EABC0]">{item.alias} · 今日 ${item.daily.total_usd.toFixed(4)} / {item.daily.call_count ?? 0} 次 · 本周 ${item.weekly.total_usd.toFixed(4)} / {item.weekly.call_count ?? 0} 次</Text>)}</View> : null}</View>)}
            <AdminMessage error={keysQuery.error || keyActionMutation.error || usageQuery.error} />
          </AdminSection>
        </> : null}

        {mode === 'aliases' ? <>
          <AdminSection title={editingAlias ? `编辑 Alias · ${editingAlias}` : '创建 Alias'} detail="Alias 把客户端模型名路由到一个或多个 Provider / Model / Group。">
            <AdminField label="Alias" value={aliasForm.alias} editable={!editingAlias} onChangeText={(alias) => setAliasForm((value) => ({ ...value, alias }))} placeholder="fast" autoCapitalize="none" />
            <View className="flex-row flex-wrap gap-2"><AdminChip label="Round Robin" selected={aliasForm.dispatch === 'round-robin'} onPress={() => setAliasForm((value) => ({ ...value, dispatch: 'round-robin' }))} /><AdminChip label="Priority" selected={aliasForm.dispatch === 'priority'} onPress={() => setAliasForm((value) => ({ ...value, dispatch: 'priority' }))} /><AdminChip label="按 Tokens" selected={aliasForm.billingMode === 'tokens'} onPress={() => setAliasForm((value) => ({ ...value, billingMode: 'tokens' }))} /><AdminChip label="按次" selected={aliasForm.billingMode === 'per_call'} onPress={() => setAliasForm((value) => ({ ...value, billingMode: 'per_call' }))} /></View>
            <Text className="text-xs font-medium text-[#667085] dark:text-[#9EABC0]">Targets JSON</Text><TextInput value={aliasForm.targets} onChangeText={(targets) => setAliasForm((value) => ({ ...value, targets }))} multiline autoCapitalize="none" autoCorrect={false} textAlignVertical="top" className="min-h-[150px] rounded-2xl border border-[#E2E9F3] bg-[#0F1726] p-3 font-mono text-[10px] leading-5 text-[#D8E3F4] dark:border-[#273449]" />
            <AdminButton label="加载真实账号模型目录" pending={catalogQuery.isFetching} tone="muted" onPress={() => catalogQuery.refetch()} />{(catalogQuery.data ?? []).slice(0, 30).flatMap((entry) => entry.models.slice(0, 6).map((model) => <Pressable key={`${entry.provider}/${entry.group}/${model}`} onPress={() => setAliasForm((value) => ({ ...value, targets: JSON.stringify([{ provider: entry.provider, target_model: model, ...(entry.group ? { group: entry.group } : {}) }], null, 2) }))} className="rounded-xl bg-[#EAF2FF] px-3 py-2 dark:bg-[#172C55]"><Text className="text-[9px] font-bold text-[#2F6DF6]">{entry.provider}{entry.group ? ` · ${entry.group}` : ''} / {model}</Text></Pressable>))}
            {aliasForm.billingMode === 'tokens' ? <View className="flex-row gap-2"><View className="flex-1"><AdminField label="输入 / 1M" value={aliasForm.inputPrice} onChangeText={(inputPrice) => setAliasForm((value) => ({ ...value, inputPrice }))} keyboardType="decimal-pad" /></View><View className="flex-1"><AdminField label="输出 / 1M" value={aliasForm.outputPrice} onChangeText={(outputPrice) => setAliasForm((value) => ({ ...value, outputPrice }))} keyboardType="decimal-pad" /></View><View className="flex-1"><AdminField label="缓存 / 1M" value={aliasForm.cachePrice} onChangeText={(cachePrice) => setAliasForm((value) => ({ ...value, cachePrice }))} keyboardType="decimal-pad" /></View></View> : <AdminField label="每次 USD" value={aliasForm.perCall} onChangeText={(perCall) => setAliasForm((value) => ({ ...value, perCall }))} keyboardType="decimal-pad" />}
            <View className="flex-row gap-2"><View className="flex-1"><AdminButton label="保存 Alias" pending={saveAliasMutation.isPending} onPress={() => saveAliasMutation.mutate()} /></View>{editingAlias ? <View className="flex-1"><AdminButton label="取消编辑" tone="muted" onPress={() => { setEditingAlias(''); setAliasForm(aliasFormDefaults()); }} /></View> : null}</View><AdminMessage error={saveAliasMutation.error || catalogQuery.error} />
          </AdminSection>
          <AdminSection title="Aliases" detail={`${aliasesQuery.data?.length ?? 0} 个全局路由别名。`}>{aliasesQuery.isSuccess && !aliasesQuery.data.length ? <EmptyState label="尚未创建 Alias" /> : null}{(aliasesQuery.data ?? []).map((alias) => <View key={alias.alias} className="gap-2 rounded-2xl border border-[#E2E9F3] bg-[#F8FAFD] p-3 dark:border-[#273449] dark:bg-[#152033]"><View className="flex-row items-start gap-3"><Route size={18} color="#2F6DF6" /><View className="flex-1"><Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{alias.alias}</Text><Text className="mt-1 text-[9px] text-[#7B8798] dark:text-[#9EABC0]">{alias.dispatch} · {alias.billing_mode} · {alias.targets.length} 个目标</Text>{alias.targets.map((target, index) => <Text key={index} className="mt-1 text-[9px] text-[#6B778C] dark:text-[#9EABC0]">{target.provider} / {target.target_model}{target.group ? ` · ${target.group}` : ''}</Text>)}</View></View><View className="flex-row gap-2"><View className="flex-1"><AdminButton label="编辑" tone="muted" onPress={() => editAlias(alias)} /></View><Pressable onPress={() => localizedAlert('删除 Alias？', '引用该 Alias 的 Key 可能无法继续路由。', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => deleteAliasMutation.mutate(alias.alias) }])} className="h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF0F2] dark:bg-[#3A1720]"><Trash2 size={15} color="#D9475C" /></Pressable></View></View>)}<AdminMessage error={aliasesQuery.error || deleteAliasMutation.error} /></AdminSection>
        </> : null}

        {mode === 'rules' ? <>
          <AdminSection title={editingRule ? `编辑规则 · ${editingRule}` : '创建凭据分类规则'} detail="用 Go 正则匹配 filename、provider、plan_type、tier 或自定义字段。">
            <AdminField label="规则名称" value={ruleForm.name} editable={!editingRule} onChangeText={(name) => setRuleForm((value) => ({ ...value, name }))} placeholder="team-codex" autoCapitalize="none" /><View className="flex-row gap-2"><View className="flex-1"><AdminField label="匹配字段" value={ruleForm.field} onChangeText={(field) => setRuleForm((value) => ({ ...value, field }))} placeholder="filename" autoCapitalize="none" /></View><View className="flex-1"><AdminField label="目标组" value={ruleForm.group} onChangeText={(group) => setRuleForm((value) => ({ ...value, group }))} placeholder="vip" autoCapitalize="none" /></View></View><AdminField label="Go 正则表达式" value={ruleForm.pattern} onChangeText={(pattern) => setRuleForm((value) => ({ ...value, pattern }))} placeholder="(?i)team|business" autoCapitalize="none" autoCorrect={false} /><AdminChip label="启用规则" selected={ruleForm.enabled} onPress={() => setRuleForm((value) => ({ ...value, enabled: !value.enabled }))} /><View className="flex-row gap-2"><View className="flex-1"><AdminButton label="保存规则" pending={saveRuleMutation.isPending} onPress={() => saveRuleMutation.mutate()} /></View>{editingRule ? <View className="flex-1"><AdminButton label="取消编辑" tone="muted" onPress={() => { setEditingRule(''); setRuleForm(ruleFormDefaults()); }} /></View> : null}</View><AdminMessage error={saveRuleMutation.error} />
          </AdminSection>
          <AdminSection title="Classification Rules" detail="规则按顺序评估；一个凭据可匹配多个自定义组。"><AdminButton label="用真实凭据预览分组" pending={previewQuery.isFetching} tone="muted" onPress={() => previewQuery.refetch()} />{previewQuery.data ? <View className="gap-1 rounded-2xl bg-[#F6F8FC] p-3 dark:bg-[#152033]">{Object.entries(previewQuery.data.groups).map(([group, ids]) => <Text key={group} className="text-[9px] leading-4 text-[#6B778C] dark:text-[#9EABC0]">{group}（{ids.length}）：{ids.join(' · ')}</Text>)}</View> : null}{rulesQuery.isSuccess && !rulesQuery.data.length ? <EmptyState label="尚未创建分类规则；Codex/Antigravity 仍会使用内置 tier" /> : null}{(rulesQuery.data ?? []).map((rule, index) => <View key={rule.name} className="gap-2 rounded-2xl border border-[#E2E9F3] bg-[#F8FAFD] p-3 dark:border-[#273449] dark:bg-[#152033]"><View className="flex-row items-start gap-3"><Layers3 size={18} color={rule.enabled ? '#1C9B62' : '#7B8798'} /><View className="flex-1"><Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{rule.name}</Text><Text className="mt-1 text-[9px] text-[#7B8798] dark:text-[#9EABC0]">{rule.field} =~ {rule.pattern} → classify:{rule.group} · {rule.enabled ? '启用' : '停用'}</Text></View></View><View className="flex-row flex-wrap gap-2"><AdminButton label="上移" tone="muted" disabled={index === 0} onPress={() => moveRule(index, -1)} /><AdminButton label="下移" tone="muted" disabled={index === (rulesQuery.data?.length ?? 0) - 1} onPress={() => moveRule(index, 1)} /><AdminButton label="编辑" tone="muted" onPress={() => editRule(rule)} /><Pressable onPress={() => localizedAlert('删除分类规则？', '现有 Alias 对该 classify 组的引用可能失去匹配凭据。', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => deleteRuleMutation.mutate(rule.name) }])} className="h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF0F2] dark:bg-[#3A1720]"><Trash2 size={15} color="#D9475C" /></Pressable></View></View>)}<AdminMessage error={rulesQuery.error || previewQuery.error || deleteRuleMutation.error || reorderMutation.error} /></AdminSection>
        </> : null}

        <Pressable onPress={() => void Linking.openURL(`${connection.baseUrl.replace(/\/+$/, '')}/v0/resource/plugins/cpa-key-policy/index.html`)} className="flex-row items-center justify-center gap-2 rounded-2xl bg-[#F1F5FA] py-3 dark:bg-[#182235]"><ExternalLink size={14} color="#2F6DF6" /><Text className="text-xs font-bold text-[#2F6DF6]">需要高级功能时打开插件 Web UI</Text></Pressable>
      </ScreenShell>
    </>
  );
}
