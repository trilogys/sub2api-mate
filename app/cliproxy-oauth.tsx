import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection } from '@/src/components/admin-ui';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
import { Text } from '@/src/components/localized-text';
import { ScreenShell } from '@/src/components/screen-shell';
import { copyWithFeedback } from '@/src/lib/clipboard';
import { cancelCLIProxyOAuth, getCLIProxyOAuthStatus, startCLIProxyOAuth, submitCLIProxyOAuthCallback } from '@/src/services/cliproxy';
import { cliProxyConfigState } from '@/src/store/cliproxy-config';
import { workspaceModeState } from '@/src/store/workspace-mode';
import type { CLIProxyConnection, CLIProxyOAuthProvider, CLIProxyOAuthSession } from '@/src/types/cliproxy';

const { useSnapshot } = require('valtio/react');

const providers: Array<{ value: CLIProxyOAuthProvider; label: string }> = [
  { value: 'anthropic', label: 'Claude' },
  { value: 'codex', label: 'Codex' },
  { value: 'gemini-cli', label: 'Gemini CLI' },
  { value: 'antigravity', label: 'Antigravity' },
  { value: 'kimi', label: 'Kimi' },
  { value: 'xai', label: 'Grok' },
];

export default function CLIProxyOAuthScreen() {
  const queryClient = useQueryClient();
  const workspace = useSnapshot(workspaceModeState);
  const stored = useSnapshot(cliProxyConfigState);
  const connection = useMemo<CLIProxyConnection>(() => ({ baseUrl: stored.baseUrl, managementKey: stored.managementKey }), [stored.baseUrl, stored.managementKey]);
  const configured = workspace.mode === 'cliproxy' && Boolean(connection.baseUrl && connection.managementKey);
  const [provider, setProvider] = useState<CLIProxyOAuthProvider>('codex');
  const [session, setSession] = useState<CLIProxyOAuthSession | null>(null);
  const [callbackUrl, setCallbackUrl] = useState('');
  const statusQuery = useQuery({
    queryKey: ['cliproxy', 'oauth-status', session?.state],
    queryFn: () => getCLIProxyOAuthStatus(connection, session!.state),
    enabled: configured && Boolean(session?.state),
    refetchInterval: (query) => query.state.data?.status === 'wait' ? 2_000 : false,
  });
  const startMutation = useMutation({ mutationFn: () => startCLIProxyOAuth(connection, provider), onSuccess: setSession });
  const cancelMutation = useMutation({ mutationFn: () => cancelCLIProxyOAuth(connection, session!.state), onSuccess: () => setSession(null) });
  const callbackMutation = useMutation({ mutationFn: () => submitCLIProxyOAuthCallback(connection, provider, session!.state, callbackUrl), onSuccess: async () => { setCallbackUrl(''); await statusQuery.refetch(); } });

  useEffect(() => {
    if (statusQuery.data?.status === 'ok') void queryClient.invalidateQueries({ queryKey: ['cliproxy', 'auth-files'] });
  }, [queryClient, statusQuery.data?.status]);
  if (workspace.mode !== 'cliproxy') return null;
  return (
    <>
      <LocalizedStackScreen options={{ title: 'OAuth 登录', headerShown: true }} />
      <ScreenShell title="OAuth 登录" subtitle="向 CLIProxyAPI 添加订阅账号凭据" safeAreaEdges={['bottom']} bottomInsetClassName="pb-10">
        <AdminSection title="选择登录提供商" detail="授权会话和 Token 均由 CLIProxyAPI 管理，GateNest 不保存 OAuth Token。">
          <View className="flex-row flex-wrap gap-2">{providers.map((item) => <AdminChip key={item.value} label={item.label} selected={provider === item.value} onPress={() => { setProvider(item.value); setSession(null); setCallbackUrl(''); startMutation.reset(); }} />)}</View>
          <AdminButton label="生成授权会话" pending={startMutation.isPending} disabled={!configured} onPress={() => startMutation.mutate()} />
          <AdminMessage error={startMutation.error || statusQuery.error || cancelMutation.error || callbackMutation.error} />
        </AdminSection>
        {session ? (
          <AdminSection title="当前授权会话" detail={`state: ${session.state}`}>
            <Text selectable className="text-xs leading-5 text-[#344054] dark:text-[#D5DDEA]">{session.url}</Text>
            {session.user_code ? <Text selectable className="text-lg font-bold text-[#2F6DF6]">设备码：{session.user_code}</Text> : null}
            <View className="flex-row gap-2">
              <View className="flex-1"><AdminButton label="打开授权页" onPress={() => Linking.openURL(session.url)} /></View>
              <View className="flex-1"><AdminButton label="复制授权信息" tone="muted" onPress={() => void copyWithFeedback(session.user_code || session.url, '授权信息')} /></View>
            </View>
            <View className="flex-row items-center gap-2 rounded-2xl bg-[#F6F8FC] p-3 dark:bg-[#152033]">
              {statusQuery.data?.status === 'ok' ? <CheckCircle2 size={18} color="#1C9B62" /> : <RefreshCw size={18} color="#2F6DF6" />}
              <Text className="flex-1 text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">状态：{statusQuery.data?.status || 'wait'}</Text>
              <Pressable onPress={() => statusQuery.refetch()}><Text className="text-xs font-bold text-[#2F6DF6]">立即刷新</Text></Pressable>
            </View>
            {session.flow !== 'device' && statusQuery.data?.status !== 'ok' ? <><AdminField label="OAuth 回调 URL" value={callbackUrl} onChangeText={setCallbackUrl} autoCapitalize="none" autoCorrect={false} placeholder="粘贴浏览器最终回调 URL" /><AdminButton label="提交回调 URL" pending={callbackMutation.isPending} disabled={!callbackUrl.trim()} tone="muted" onPress={() => callbackMutation.mutate()} /></> : null}
            {statusQuery.data?.status !== 'ok' ? <AdminButton label="取消授权会话" tone="danger" pending={cancelMutation.isPending} onPress={() => cancelMutation.mutate()} /> : null}
            <View className="flex-row items-center gap-2"><ExternalLink size={14} color="#7B8798" /><Text className="text-[10px] text-[#7B8798] dark:text-[#9EABC0]">远程部署无法自动回调时，复制浏览器地址栏中的完整回调 URL。</Text></View>
          </AdminSection>
        ) : null}
      </ScreenShell>
    </>
  );
}
