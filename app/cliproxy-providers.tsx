import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Braces, Network } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { AdminButton, AdminChip, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
import { Text, TextInput, localizedAlert } from '@/src/components/localized-text';
import { ScreenShell } from '@/src/components/screen-shell';
import { getCLIProxyProviderCollection, saveCLIProxyProviderCollection, type CLIProxyProviderCollectionPath } from '@/src/services/cliproxy';
import { cliProxyConfigState } from '@/src/store/cliproxy-config';
import { workspaceModeState } from '@/src/store/workspace-mode';
import type { CLIProxyConnection } from '@/src/types/cliproxy';

const { useSnapshot } = require('valtio/react');

const providers: Array<{ path: CLIProxyProviderCollectionPath; label: string }> = [
  { path: 'gemini-api-key', label: 'Gemini API Key' },
  { path: 'codex-api-key', label: 'Codex API Key' },
  { path: 'claude-api-key', label: 'Claude API Key' },
  { path: 'openai-compatibility', label: 'OpenAI 兼容' },
  { path: 'interactions-api-key', label: 'Interactions' },
  { path: 'xai-api-key', label: 'xAI' },
  { path: 'vertex-api-key', label: 'Vertex' },
];

export default function CLIProxyProvidersScreen() {
  const queryClient = useQueryClient();
  const workspace = useSnapshot(workspaceModeState);
  const stored = useSnapshot(cliProxyConfigState);
  const connection = useMemo<CLIProxyConnection>(() => ({ baseUrl: stored.baseUrl, managementKey: stored.managementKey }), [stored.baseUrl, stored.managementKey]);
  const configured = workspace.mode === 'cliproxy' && Boolean(connection.baseUrl && connection.managementKey);
  const [provider, setProvider] = useState<CLIProxyProviderCollectionPath>('gemini-api-key');
  const [json, setJSON] = useState('[]');
  const query = useQuery({
    queryKey: ['cliproxy', 'provider', provider, stored.baseUrl, stored.revision],
    queryFn: () => getCLIProxyProviderCollection(connection, provider),
    enabled: configured,
  });
  useEffect(() => { if (query.data) setJSON(JSON.stringify(query.data, null, 2)); }, [query.data]);
  const saveMutation = useMutation({
    mutationFn: async () => {
      let parsed: unknown;
      try { parsed = JSON.parse(json); } catch { throw new Error('Provider 配置不是有效 JSON。'); }
      if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error('Provider 配置必须是对象数组。');
      return saveCLIProxyProviderCollection(connection, provider, parsed as Record<string, unknown>[]);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cliproxy'] });
      localizedAlert('Provider 已保存', 'CLIProxyAPI 已写入配置并热重载。');
    },
  });
  const selected = providers.find((item) => item.path === provider)!;

  if (workspace.mode !== 'cliproxy') return null;
  return (
    <>
      <LocalizedStackScreen options={{ title: 'AI 提供商', headerShown: true }} />
      <ScreenShell title="AI 提供商" subtitle="管理 API Key 与 OpenAI 兼容上游" safeAreaEdges={['bottom']} bottomInsetClassName="pb-10" refreshing={query.isRefetching} onRefresh={async () => { await query.refetch(); }}>
        <AdminSection title="选择 Provider" detail="这里对应 CLIProxyAPI 原生 Provider 集合接口；OAuth 账号请在“OAuth 登录”中添加。">
          <View className="flex-row flex-wrap gap-2">{providers.map((item) => <AdminChip key={item.path} label={item.label} selected={provider === item.path} onPress={() => { setProvider(item.path); saveMutation.reset(); }} />)}</View>
          <View className="flex-row items-center gap-3 rounded-2xl bg-[#F6F8FC] p-3 dark:bg-[#152033]"><Network size={18} color="#2F6DF6" /><Text className="flex-1 text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{selected.label} · {query.data?.length ?? 0} 项</Text></View>
          <AdminMessage error={query.error} />
        </AdminSection>
        <AdminSection title={`${selected.label} 配置`} detail="保留 api-key、base-url、proxy-url、headers、models、excluded-models、priority、prefix 等上游支持字段。">
          {query.isLoading ? <Text className="text-xs text-[#98A2B3]">正在读取 Provider…</Text> : null}
          {query.isSuccess && !query.data.length ? <EmptyState label="当前 Provider 尚无配置，可直接编辑下面的 JSON 数组" /> : null}
          <View className="flex-row items-center gap-2"><Braces size={16} color="#2F6DF6" /><Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">JSON 对象数组</Text></View>
          <TextInput value={json} onChangeText={setJSON} multiline autoCapitalize="none" autoCorrect={false} textAlignVertical="top" className="min-h-[360px] rounded-2xl border border-[#E2E9F3] bg-[#0F1726] p-3 font-mono text-[10px] leading-5 text-[#D8E3F4] dark:border-[#273449]" />
          <AdminButton label="校验并保存 Provider" pending={saveMutation.isPending} disabled={!query.isSuccess} onPress={() => localizedAlert('覆盖当前 Provider 配置？', `将用编辑器中的数组完整替换 ${selected.label} 配置。`, [{ text: '取消', style: 'cancel' }, { text: '确认保存', onPress: () => saveMutation.mutate() }])} />
          <AdminMessage error={saveMutation.error} />
        </AdminSection>
      </ScreenShell>
    </>
  );
}
