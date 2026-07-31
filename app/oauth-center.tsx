import { useMutation } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { copyWithFeedback } from '@/src/lib/clipboard';

import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection } from '@/src/components/admin-ui';
import { ScreenShell } from '@/src/components/screen-shell';
import { exchangeOAuthCode, generateOAuthURL } from '@/src/services/admin';
import type { OAuthPlatform } from '@/src/services/admin';
import type { OAuthSession } from '@/src/types/admin';
import { Text } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

export default function OAuthCenterScreen() {
  const [platform, setPlatform] = useState<OAuthPlatform>('openai');
  const [proxyId, setProxyId] = useState('');
  const [session, setSession] = useState<OAuthSession | null>(null);
  const [code, setCode] = useState('');
  const [state, setState] = useState('');
  useEffect(() => { setSession(null); setCode(''); setState(''); }, [platform]);
  const generate = useMutation({ mutationFn: () => generateOAuthURL(platform, Number(proxyId) || undefined), onSuccess: (data) => { setSession(data); setState(data.state || ''); } });
  const exchange = useMutation({ mutationFn: () => exchangeOAuthCode(platform, { session_id: session!.session_id, code: code.trim(), state: state.trim() || session?.state, proxy_id: Number(proxyId) || undefined }) });
  const result = exchange.data ? JSON.stringify(exchange.data, null, 2) : '';

  return (
    <>
      <LocalizedStackScreen options={{ title: 'OAuth 授权', headerShown: true }} />
      <ScreenShell title="OAuth 授权" subtitle="Claude、OpenAI、Gemini、Antigravity 与 Grok" safeAreaEdges={['bottom']} bottomInsetClassName="pb-8">
        <AdminSection title="1. 生成授权链接" detail="选择平台和可选代理，生成一次性 OAuth 会话。">
          <View className="flex-row flex-wrap gap-2">{(['claude', 'openai', 'gemini', 'antigravity', 'grok'] as const).map((item) => <AdminChip key={item} label={item} selected={platform === item} onPress={() => setPlatform(item)} />)}</View>
          <AdminField label="代理 ID（可选）" value={proxyId} onChangeText={setProxyId} keyboardType="number-pad" placeholder="留空直连" />
          <AdminButton label="生成授权链接" pending={generate.isPending} onPress={() => generate.mutate()} />
          <AdminMessage error={generate.error} />
          {session ? <View className="gap-2 rounded-2xl bg-[#F1F5FA] dark:bg-[#182235] p-3"><Text selectable className="text-xs leading-5 text-[#344054] dark:text-[#D5DDEA]">{session.auth_url}</Text><View className="flex-row gap-2"><AdminButton label="打开授权页" onPress={() => Linking.openURL(session.auth_url)} /><AdminButton label="复制链接" tone="muted" onPress={() => void copyWithFeedback(session.auth_url, '授权链接')} /></View></View> : null}
        </AdminSection>

        <AdminSection title="2. 交换授权码" detail="完成浏览器授权后，粘贴回调中的 code；OpenAI、Gemini、Antigravity 和 Grok 还需要 state。">
          <AdminField label="Session ID" value={session?.session_id ?? ''} editable={false} placeholder="先生成授权链接" />
          <AdminField label="Code" value={code} onChangeText={setCode} placeholder="授权码" autoCapitalize="none" />
          {platform !== 'claude' ? <AdminField label="State" value={state} onChangeText={setState} placeholder="回调 state" autoCapitalize="none" /> : null}
          <AdminButton label="交换 Token" pending={exchange.isPending} disabled={!session || !code.trim() || (platform !== 'claude' && !state.trim())} onPress={() => exchange.mutate()} />
          <AdminMessage error={exchange.error} success={exchange.isSuccess ? 'Token 交换成功，可复制结果用于账号创建或重新授权。' : undefined} />
          {result ? <View className="gap-2 rounded-2xl bg-[#1F2A3D] p-3"><Text selectable className="font-mono text-xs leading-5 text-[#EDF3FA]">{result}</Text><AdminButton label="复制 Token 结果" tone="muted" onPress={() => void copyWithFeedback(result, 'Token 结果')} /></View> : null}
        </AdminSection>
      </ScreenShell>
    </>
  );
}
