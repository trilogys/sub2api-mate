import { useQuery } from '@tanstack/react-query';
import { Copy, KeyRound, Server } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AdminChip, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
import { Text } from '@/src/components/localized-text';
import { ScreenShell } from '@/src/components/screen-shell';
import { copyWithFeedback } from '@/src/lib/clipboard';
import { getCLIProxyAPIKeys, getCLIProxyOpenAIBaseUrl } from '@/src/services/cliproxy';
import { cliProxyConfigState } from '@/src/store/cliproxy-config';
import { workspaceModeState } from '@/src/store/workspace-mode';
import type { CLIProxyConnection } from '@/src/types/cliproxy';

const { useSnapshot } = require('valtio/react');

function maskKey(value: string) {
  if (value.length <= 10) return `${value.slice(0, 2)}••••${value.slice(-2)}`;
  return `${value.slice(0, 5)}••••••${value.slice(-4)}`;
}

function CopyBlock({ title, value }: { title: string; value: string }) {
  return (
    <View className="gap-2 rounded-2xl bg-[#F6F8FC] p-3 dark:bg-[#152033]">
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{title}</Text>
        <Pressable onPress={() => void copyWithFeedback(value, title)}><Copy size={15} color="#2F6DF6" /></Pressable>
      </View>
      <Text selectable className="font-mono text-[10px] leading-5 text-[#475467] dark:text-[#C2CCDB]">{value}</Text>
    </View>
  );
}

export default function CLIProxyQuickStartScreen() {
  const workspace = useSnapshot(workspaceModeState);
  const stored = useSnapshot(cliProxyConfigState);
  const connection = useMemo<CLIProxyConnection>(() => ({ baseUrl: stored.baseUrl, managementKey: stored.managementKey }), [stored.baseUrl, stored.managementKey]);
  const configured = workspace.mode === 'cliproxy' && Boolean(connection.baseUrl && connection.managementKey);
  const [apiKey, setAPIKey] = useState('');
  const keysQuery = useQuery({ queryKey: ['cliproxy', 'api-keys', stored.baseUrl, stored.revision], queryFn: () => getCLIProxyAPIKeys(connection), enabled: configured });
  useEffect(() => {
    if (!(keysQuery.data ?? []).includes(apiKey)) setAPIKey(keysQuery.data?.[0] || '');
  }, [apiKey, keysQuery.data]);
  const baseUrl = connection.baseUrl.replace(/\/+$/, '');
  const openAIBase = getCLIProxyOpenAIBaseUrl(baseUrl);

  if (workspace.mode !== 'cliproxy') return null;
  return (
    <>
      <LocalizedStackScreen options={{ title: '快速开始', headerShown: true }} />
      <ScreenShell title="快速开始" subtitle="复制当前单实例的客户端连接参数" safeAreaEdges={['bottom']} bottomInsetClassName="pb-10" refreshing={keysQuery.isRefetching} onRefresh={async () => { await keysQuery.refetch(); }}>
        <AdminSection title="选择 Client Key" detail="分组 Key 只会进入对应凭据池；未分组 Key 在 Group Router 开启时会被拒绝。">
          <View className="flex-row flex-wrap gap-2">{(keysQuery.data ?? []).map((key) => <AdminChip key={key} label={maskKey(key)} selected={key === apiKey} onPress={() => setAPIKey(key)} />)}</View>
          {!keysQuery.isLoading && !(keysQuery.data?.length) ? <EmptyState label="请先在 CLIProxy 分组中创建 Client Key" /> : null}
          <AdminMessage error={keysQuery.error} />
        </AdminSection>
        <AdminSection title="通用 OpenAI 兼容客户端" detail="适用于支持自定义 Base URL 和 API Key 的客户端。">
          <CopyBlock title="Base URL" value={openAIBase} />
          <CopyBlock title="API Key" value={apiKey || '请先创建 Client Key'} />
          <CopyBlock title="环境变量" value={`OPENAI_BASE_URL=${openAIBase}\nOPENAI_API_KEY=${apiKey || '<CLIENT_KEY>'}`} />
        </AdminSection>
        <AdminSection title="接口测试" detail="使用当前 Key 查询可见模型，验证认证、网络和分组路由。">
          <CopyBlock title="curl /v1/models" value={`curl "${openAIBase}/models" \\\n  -H "Authorization: Bearer ${apiKey || '<CLIENT_KEY>'}"`} />
          <View className="flex-row items-center gap-3 rounded-2xl bg-[#EEF4FF] p-3 dark:bg-[#172C55]"><Server size={18} color="#2F6DF6" /><Text selectable className="flex-1 text-[10px] text-[#4B6290] dark:text-[#B8CCF4]">服务：{baseUrl}</Text></View>
          <View className="flex-row items-center gap-3 rounded-2xl bg-[#EEF4FF] p-3 dark:bg-[#172C55]"><KeyRound size={18} color="#2F6DF6" /><Text className="flex-1 text-[10px] text-[#4B6290] dark:text-[#B8CCF4]">不要把 Management Key 当作客户端 API Key 使用。</Text></View>
        </AdminSection>
      </ScreenShell>
    </>
  );
}
