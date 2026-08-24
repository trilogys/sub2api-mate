import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CheckCircle2, Clock3, Copy, ExternalLink, Play, RefreshCw, Server, ShieldCheck } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, View } from 'react-native';

import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
import { Text, localizedAlert } from '@/src/components/localized-text';
import { ScreenShell } from '@/src/components/screen-shell';
import { copyWithFeedback } from '@/src/lib/clipboard';
import { cliProxyQuotaColor, cliProxyQuotaMinimum, cliProxyQuotaStatusLabel, cliProxyQuotaWindowColor } from '@/src/lib/cliproxy-quota';
import {
  cancelCLIProxyOAuth,
  getCLIProxyOAuthStatus,
  getCLIProxyOpenAIBaseUrl,
  getCLIProxyAPIKeys,
  getCLIProxyQuotaReports,
  listCLIProxyAuthFiles,
  listCLIProxyModels,
  normalizeCLIProxyBaseUrl,
  resetCLIProxyQuota,
  setCLIProxyAuthFileDisabled,
  startCLIProxyOAuth,
  submitCLIProxyOAuthCallback,
  testCLIProxyConnection,
} from '@/src/services/cliproxy';
import { cliProxyConfigState, hydrateCLIProxyConfig, saveCLIProxyConfig, updateCLIProxyRefresh } from '@/src/store/cliproxy-config';
import { workspaceModeState } from '@/src/store/workspace-mode';
import type { CLIProxyAuthFile, CLIProxyConnection, CLIProxyOAuthProvider, CLIProxyOAuthSession, CLIProxyQuotaReport } from '@/src/types/cliproxy';

const { useSnapshot } = require('valtio/react');

const OAUTH_PROVIDERS: Array<{ value: CLIProxyOAuthProvider; label: string }> = [
  { value: 'anthropic', label: 'Claude' },
  { value: 'codex', label: 'Codex' },
  { value: 'gemini-cli', label: 'Gemini CLI' },
  { value: 'antigravity', label: 'Antigravity' },
  { value: 'kimi', label: 'Kimi' },
  { value: 'xai', label: 'Grok' },
];

function maskKey(value: string) {
  if (value.length <= 10) return `${value.slice(0, 2)}••••${value.slice(-2)}`;
  return `${value.slice(0, 5)}••••••${value.slice(-4)}`;
}

function authFileTitle(file: CLIProxyAuthFile) {
  return file.label || file.email || file.account || file.name;
}

function authFileStatus(file: CLIProxyAuthFile) {
  if (file.disabled) return '已停用';
  if (file.unavailable) return '不可用';
  return file.status || '正常';
}

function supportsLiveQuota(file: CLIProxyAuthFile) {
  const provider = (file.provider || file.type || '').toLowerCase();
  return provider === 'codex' || provider === 'gemini-cli' || provider === 'gemini' || provider === 'antigravity';
}

function formatRefreshInterval(seconds: number) {
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60}min`;
  return `${seconds}s`;
}

function formatDateTime(value?: string) {
  if (!value) return '—';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value;
}

export default function CLIProxyScreen() {
  const queryClient = useQueryClient();
  const workspace = useSnapshot(workspaceModeState);
  const stored = useSnapshot(cliProxyConfigState);
  const [baseUrl, setBaseUrl] = useState('');
  const [managementKey, setManagementKey] = useState('');
  const [selectedAPIKey, setSelectedAPIKey] = useState('');
  const [provider, setProvider] = useState<CLIProxyOAuthProvider>('codex');
  const [oauthSession, setOAuthSession] = useState<CLIProxyOAuthSession | null>(null);
  const [oauthCallbackUrl, setOAuthCallbackUrl] = useState('');
  const [refreshCountdown, setRefreshCountdown] = useState(stored.autoRefreshIntervalSeconds);
  const refreshCountdownRef = useRef(stored.autoRefreshIntervalSeconds);
  const refreshRunningRef = useRef(false);
  const [refreshRunning, setRefreshRunning] = useState(false);

  useEffect(() => {
    if (workspace.mode !== 'cliproxy') return;
    hydrateCLIProxyConfig().then((connection) => {
      setBaseUrl(connection.baseUrl);
      setManagementKey(connection.managementKey);
    });
  }, [workspace.mode]);

  const connection = useMemo<CLIProxyConnection>(() => ({
    baseUrl: stored.baseUrl,
    managementKey: stored.managementKey,
  }), [stored.baseUrl, stored.managementKey]);
  const configured = workspace.mode === 'cliproxy' && stored.hydrated && Boolean(connection.baseUrl && connection.managementKey);
  const openAIBaseUrl = getCLIProxyOpenAIBaseUrl(connection.baseUrl);

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

  const quotaByAuthIndex = useMemo(
    () => new Map((quotaQuery.data ?? []).map((report) => [report.authIndex, report])),
    [quotaQuery.data],
  );

  useEffect(() => {
    const keys = apiKeysQuery.data ?? [];
    if (!keys.includes(selectedAPIKey)) setSelectedAPIKey(keys[0] || '');
  }, [apiKeysQuery.data, selectedAPIKey]);

  useEffect(() => {
    refreshCountdownRef.current = stored.autoRefreshIntervalSeconds;
    setRefreshCountdown(stored.autoRefreshIntervalSeconds);
  }, [stored.autoRefreshEnabled, stored.autoRefreshIntervalSeconds]);

  const saveMutation = useMutation({
    mutationFn: async (test: boolean) => {
      const nextConnection = {
        baseUrl: normalizeCLIProxyBaseUrl(baseUrl),
        managementKey: managementKey.trim(),
      };
      const result = test ? await testCLIProxyConnection(nextConnection) : undefined;
      await saveCLIProxyConfig(nextConnection);
      await queryClient.invalidateQueries({ queryKey: ['cliproxy'] });
      return result;
    },
  });

  const modelMutation = useMutation({
    mutationFn: () => listCLIProxyModels(connection.baseUrl, selectedAPIKey),
  });

  useEffect(() => {
    modelMutation.reset();
  }, [selectedAPIKey]);

  const authActionMutation = useMutation({
    mutationFn: (action: { type: 'toggle'; file: CLIProxyAuthFile } | { type: 'reset'; file: CLIProxyAuthFile }) => {
      if (action.type === 'toggle') {
        return setCLIProxyAuthFileDisabled(connection, action.file.name, !action.file.disabled);
      }
      if (!action.file.auth_index) throw new Error('CLIPROXY_AUTH_INDEX_REQUIRED');
      return resetCLIProxyQuota(connection, action.file.auth_index);
    },
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['cliproxy', 'quotas'] });
      await queryClient.invalidateQueries({ queryKey: ['cliproxy', 'auth-files'] });
    },
  });

  const startOAuthMutation = useMutation({
    mutationFn: () => startCLIProxyOAuth(connection, provider),
    onSuccess: (session) => setOAuthSession(session),
  });
  const cancelOAuthMutation = useMutation({
    mutationFn: () => cancelCLIProxyOAuth(connection, oauthSession!.state),
    onSuccess: () => setOAuthSession(null),
  });
  const callbackOAuthMutation = useMutation({
    mutationFn: () => submitCLIProxyOAuthCallback(connection, provider, oauthSession!.state, oauthCallbackUrl),
    onSuccess: async () => {
      setOAuthCallbackUrl('');
      await oauthStatusQuery.refetch();
    },
  });
  const oauthStatusQuery = useQuery({
    queryKey: ['cliproxy', 'oauth-status', oauthSession?.state],
    queryFn: () => getCLIProxyOAuthStatus(connection, oauthSession!.state),
    enabled: configured && Boolean(oauthSession?.state),
    refetchInterval: (query) => query.state.data?.status === 'wait' ? 2_000 : false,
  });

  useEffect(() => {
    if (oauthStatusQuery.data?.status === 'ok') {
      queryClient.removeQueries({ queryKey: ['cliproxy', 'quotas'] });
      void queryClient.invalidateQueries({ queryKey: ['cliproxy', 'auth-files'] });
    }
  }, [oauthStatusQuery.data?.status, queryClient]);

  const runFullRefresh = async (showMessage: boolean) => {
    if (!configured || refreshRunningRef.current) return;
    refreshRunningRef.current = true;
    setRefreshRunning(true);
    try {
      // Authenticate once before fanning out. CLIProxyAPI temporarily bans clients
      // after repeated bad management keys, so a stale key should cost one failure.
      const authResult = await authFilesQuery.refetch();
      if (authResult.error) throw authResult.error;
      const [keyResult, quotaResult] = await Promise.all([
        apiKeysQuery.refetch(),
        quotaQuery.refetch(),
      ]);
      const error = keyResult.error || quotaResult.error;
      if (error) throw error;
      const quotaFailures = quotaResult.data?.filter((report) => report.status === 'error').length ?? 0;
      const message = quotaFailures ? '刷新完成，但部分配额查询失败。' : '账号状态与实时配额已刷新。';
      await updateCLIProxyRefresh({
        lastRefreshAt: new Date().toISOString(),
        lastRefreshMessage: message,
      });
      if (showMessage) localizedAlert(quotaFailures ? '刷新完成（有错误）' : '刷新成功', message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'CLIProxyAPI 刷新失败';
      await updateCLIProxyRefresh({
        lastRefreshAt: new Date().toISOString(),
        lastRefreshMessage: message,
      });
      if (showMessage) localizedAlert('刷新失败', message);
    } finally {
      refreshCountdownRef.current = stored.autoRefreshIntervalSeconds;
      setRefreshCountdown(stored.autoRefreshIntervalSeconds);
      refreshRunningRef.current = false;
      setRefreshRunning(false);
    }
  };

  useEffect(() => {
    if (!configured || !stored.autoRefreshEnabled) return;
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active' || refreshRunningRef.current) return;
      const next = refreshCountdownRef.current - 1;
      if (next > 0) {
        refreshCountdownRef.current = next;
        setRefreshCountdown(next);
        return;
      }
      refreshCountdownRef.current = stored.autoRefreshIntervalSeconds;
      setRefreshCountdown(stored.autoRefreshIntervalSeconds);
      void runFullRefresh(false);
    }, 1_000);
    return () => clearInterval(timer);
  }, [configured, stored.autoRefreshEnabled, stored.autoRefreshIntervalSeconds, stored.revision]);

  const testResult = saveMutation.data;
  const models = modelMutation.data ?? [];

  if (workspace.mode !== 'cliproxy') return null;

  return (
    <>
      <LocalizedStackScreen options={{ title: 'CLIProxyAPI 管理', headerShown: true }} />
      <ScreenShell
        title="CLIProxyAPI 管理"
        subtitle="独立管理分组、Client Key、账号池与实时配额"
        safeAreaEdges={['bottom']}
        bottomInsetClassName="pb-10"
        refreshing={configured && (refreshRunning || authFilesQuery.isRefetching || apiKeysQuery.isRefetching || quotaQuery.isFetching)}
        onRefresh={configured ? () => runFullRefresh(false) : undefined}
      >
        <AdminSection title="1. 连接 CLIProxyAPI" detail="需要可从本设备访问的服务地址，以及已启用远程管理的 Management Key。">
          <AdminField
            label="CLIProxyAPI 服务地址"
            value={baseUrl}
            onChangeText={setBaseUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="例如：http://192.168.1.10:8317"
          />
          <AdminField
            label="Management Key"
            value={managementKey}
            onChangeText={setManagementKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder="remote-management.secret-key"
          />
          {Platform.OS === 'web' ? <Text className="text-[11px] leading-5 text-[#946321] dark:text-[#FFD66B]">Web 端不会持久化 Management Key；生产环境还需要配置 Web 请求代理。</Text> : null}
          <View className="flex-row gap-2">
            <View className="flex-1"><AdminButton label="保存配置" pending={saveMutation.isPending} disabled={!baseUrl.trim() || !managementKey.trim()} onPress={() => saveMutation.mutate(false)} /></View>
            <View className="flex-1"><AdminButton label="保存并测试" pending={saveMutation.isPending} disabled={!baseUrl.trim() || !managementKey.trim()} tone="muted" onPress={() => saveMutation.mutate(true)} /></View>
          </View>
          <AdminMessage error={saveMutation.error} success={testResult ? 'CLIProxyAPI 管理接口连接成功。' : saveMutation.isSuccess ? 'CLIProxyAPI 配置已保存。' : undefined} />
          {testResult ? (
            <View className="flex-row flex-wrap gap-2 rounded-2xl bg-[#EEF4FF] p-3 dark:bg-[#172C55]">
              <Text className="text-xs font-bold text-[#2F6DF6]">凭据：{testResult.availableCredentialCount}/{testResult.credentialCount}</Text>
              <Text className="text-xs font-bold text-[#2F6DF6]">API Keys：{testResult.apiKeyCount}</Text>
            </View>
          ) : null}
          {configured ? (
            <Pressable onPress={() => Linking.openURL(`${normalizeCLIProxyBaseUrl(connection.baseUrl)}/management.html`)} className="flex-row items-center justify-center gap-2 rounded-2xl bg-[#F1F5FA] py-3 dark:bg-[#182235]">
              <ExternalLink size={16} color="#2F6DF6" />
              <Text className="text-xs font-bold text-[#2F6DF6]">打开 CLIProxyAPI 原生管理页</Text>
            </Pressable>
          ) : null}
        </AdminSection>

        <AdminSection title="2. CLIProxy 分组与 Client Key" detail="CLIProxy 分组独立于 Sub2API；每个组用专用 Key 绑定自己的凭据池。">
          <View className="rounded-2xl border border-[#BDD0FA] bg-[#EEF4FF] p-3 dark:border-[#315189] dark:bg-[#172C55]">
            <Text className="text-xs font-bold text-[#2F6DF6]">单实例分组由 CLIProxy Group Router 插件执行</Text>
            <Text className="mt-1 text-[11px] leading-5 text-[#4B6290] dark:text-[#B8CCF4]">未分组 Key、停用组或组内无可用凭据时会直接拒绝，不会回退到其他组的账号。分组数据只写入 CLIProxy 插件配置。</Text>
          </View>
          <AdminButton label="打开 CLIProxy 分组管理" disabled={!configured} onPress={() => router.push('/cliproxy-groups')} />
          <View className="flex-row items-center gap-2 rounded-2xl bg-[#F6F8FC] p-3 dark:bg-[#152033]">
            <Server size={18} color="#2F6DF6" />
            <View className="flex-1">
              <Text className="text-[10px] text-[#7B8798] dark:text-[#9EABC0]">OpenAI Base URL</Text>
              <Text selectable className="mt-1 text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{openAIBaseUrl || '-'}</Text>
            </View>
            {openAIBaseUrl ? <Pressable onPress={() => void copyWithFeedback(openAIBaseUrl, 'Base URL')}><Copy size={17} color="#2F6DF6" /></Pressable> : null}
          </View>

          <Text className="text-xs font-medium text-[#667085] dark:text-[#9EABC0]">已注册 Client Key</Text>
          <View className="flex-row flex-wrap gap-2">
            {(apiKeysQuery.data ?? []).map((key) => (
              <AdminChip key={key} label={maskKey(key)} selected={selectedAPIKey === key} onPress={() => setSelectedAPIKey(key)} />
            ))}
          </View>
          {apiKeysQuery.isLoading ? <Text className="text-xs text-[#98A2B3]">正在读取 API Keys…</Text> : null}
          {!apiKeysQuery.isLoading && configured && (apiKeysQuery.data?.length ?? 0) === 0 ? <EmptyState label="CLIProxyAPI 尚未配置客户端 API Key" /> : null}
          <AdminMessage error={apiKeysQuery.error} />

          {selectedAPIKey ? (
            <View className="flex-row gap-2">
              <View className="flex-1"><AdminButton label="复制选中密钥" tone="muted" onPress={() => void copyWithFeedback(selectedAPIKey, 'API Key')} /></View>
              <View className="flex-1"><AdminButton label="测试模型列表" pending={modelMutation.isPending} tone="muted" onPress={() => modelMutation.mutate()} /></View>
            </View>
          ) : null}
          <AdminMessage error={modelMutation.error} success={modelMutation.isSuccess ? '模型接口可用。' : undefined} />
          {modelMutation.isSuccess ? <Text className="text-[11px] font-bold text-[#6B778C] dark:text-[#9EABC0]">模型数量：{models.length}</Text> : null}
          {models.length ? <Text selectable className="text-[11px] leading-5 text-[#6B778C] dark:text-[#9EABC0]">{models.slice(0, 12).map((model) => model.id).join(' · ')}</Text> : null}
        </AdminSection>

        <AdminSection title="3. CLI 账号授权" detail="授权由 CLIProxyAPI 处理；Mate 只轮询状态，凭据保存在 CLIProxyAPI。">
          <View className="flex-row flex-wrap gap-2">
            {OAUTH_PROVIDERS.map((item) => <AdminChip key={item.value} label={item.label} selected={provider === item.value} onPress={() => { setProvider(item.value); setOAuthSession(null); startOAuthMutation.reset(); }} />)}
          </View>
          <AdminButton label="生成授权会话" pending={startOAuthMutation.isPending} disabled={!configured} onPress={() => startOAuthMutation.mutate()} />
          <AdminMessage error={startOAuthMutation.error || oauthStatusQuery.error || cancelOAuthMutation.error || callbackOAuthMutation.error} />
          {oauthSession ? (
            <View className="gap-3 rounded-2xl border border-[#BDD0FA] bg-[#EEF4FF] p-3 dark:border-[#315189] dark:bg-[#172C55]">
              <Text selectable className="text-xs leading-5 text-[#344054] dark:text-[#D5DDEA]">{oauthSession.url}</Text>
              {oauthSession.user_code ? <Text selectable className="text-base font-bold text-[#2F6DF6]">设备码：{oauthSession.user_code}</Text> : null}
              <View className="flex-row gap-2">
                <View className="flex-1"><AdminButton label="打开授权页" onPress={() => Linking.openURL(oauthSession.url)} /></View>
                <View className="flex-1"><AdminButton label="复制授权信息" tone="muted" onPress={() => void copyWithFeedback(oauthSession.user_code || oauthSession.url, '授权信息')} /></View>
              </View>
              <View className="flex-row items-center gap-2">
                {oauthStatusQuery.data?.status === 'ok' ? <CheckCircle2 size={17} color="#1C9B62" /> : <RefreshCw size={17} color="#2F6DF6" />}
                <Text className="flex-1 text-xs font-bold text-[#344054] dark:text-[#D5DDEA]">授权状态：{oauthStatusQuery.data?.status || 'wait'}</Text>
                <Pressable onPress={() => oauthStatusQuery.refetch()}><Text className="text-xs font-bold text-[#2F6DF6]">立即刷新</Text></Pressable>
              </View>
              {oauthSession.flow !== 'device' && oauthStatusQuery.data?.status !== 'ok' ? (
                <View className="gap-2">
                  <AdminField label="OAuth 回调 URL（远程/无自动回调时）" value={oauthCallbackUrl} onChangeText={setOAuthCallbackUrl} autoCapitalize="none" autoCorrect={false} placeholder="http://localhost/…?code=…&state=…" />
                  <AdminButton label="提交回调 URL" pending={callbackOAuthMutation.isPending} disabled={!oauthCallbackUrl.trim()} tone="muted" onPress={() => callbackOAuthMutation.mutate()} />
                </View>
              ) : null}
              {oauthStatusQuery.data?.error ? <Text className="text-xs text-[#D9475C]">{oauthStatusQuery.data.error}</Text> : null}
              {oauthStatusQuery.data?.status !== 'ok' ? <AdminButton label="取消授权会话" tone="danger" pending={cancelOAuthMutation.isPending} onPress={() => cancelOAuthMutation.mutate()} /> : null}
            </View>
          ) : null}
        </AdminSection>

        <AdminSection title="4. 配额与自动刷新" detail="仅在 CLIProxy 管理页面前台时定时刷新账号状态与真实配额，不在后台持续唤醒。">
          <View className="flex-row items-center gap-3 rounded-2xl bg-[#F6F8FC] p-3 dark:bg-[#152033]">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-[#EAF2FF] dark:bg-[#172C55]"><Clock3 size={18} color="#2F6DF6" /></View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-[#172033] dark:text-[#F4F7FB]">自动刷新实时配额</Text>
              <Text className="mt-1 text-[11px] text-[#6B778C] dark:text-[#9EABC0]">{stored.autoRefreshEnabled ? `${refreshCountdown}s` : '已关闭'}{stored.autoRefreshEnabled ? ' 后刷新' : ''}</Text>
            </View>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: stored.autoRefreshEnabled }}
              onPress={() => void updateCLIProxyRefresh({ autoRefreshEnabled: !stored.autoRefreshEnabled })}
              className={`h-7 w-12 justify-center rounded-full px-1 ${stored.autoRefreshEnabled ? 'bg-[#2F6DF6]' : 'bg-[#CBD5E1] dark:bg-[#3A4658]'}`}
            >
              <View className={`h-5 w-5 rounded-full bg-white ${stored.autoRefreshEnabled ? 'self-end' : 'self-start'}`} />
            </Pressable>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {[30, 60, 300, 900].map((seconds) => <AdminChip key={seconds} label={formatRefreshInterval(seconds)} selected={stored.autoRefreshIntervalSeconds === seconds} onPress={() => void updateCLIProxyRefresh({ autoRefreshIntervalSeconds: seconds })} />)}
          </View>
          <AdminButton label={refreshRunning ? '正在刷新账号与配额…' : '立即刷新全部配额'} pending={refreshRunning} disabled={!configured} onPress={() => void runFullRefresh(true)} />
          <AdminMessage error={quotaQuery.error} />
          <View className="rounded-2xl bg-[#F1F5FA] p-3 dark:bg-[#182235]">
            <Text className="text-[10px] text-[#7B8798] dark:text-[#9EABC0]">上次执行</Text>
            <Text className="mt-1 text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{formatDateTime(stored.lastRefreshAt)}</Text>
            <Text className="mt-1 text-[11px] leading-4 text-[#6B778C] dark:text-[#9EABC0]">{stored.lastRefreshMessage || '尚未查询实时配额'}</Text>
          </View>
          <Text className="text-[10px] leading-5 text-[#7B8798] dark:text-[#9EABC0]">支持 Codex 5h/7d、Gemini CLI 模型桶和 Antigravity 模型配额。CLIProxyAPI 自身仍负责 OAuth Token 的后台自动刷新；这里刷新的是管理端展示数据。</Text>
        </AdminSection>

        <AdminSection title="5. CLIProxyAPI 账号池" detail="查看运行时状态、真实配额，可停用凭据或清除指定凭据的配额冷却状态。">
          {authFilesQuery.isLoading ? <Text className="text-xs text-[#98A2B3]">正在读取账号池…</Text> : null}
          <AdminMessage error={authFilesQuery.error || authActionMutation.error} />
          {!authFilesQuery.isLoading && configured && (authFilesQuery.data?.length ?? 0) === 0 ? <EmptyState label="CLIProxyAPI 账号池为空" /> : null}
          {(authFilesQuery.data ?? []).map((file) => {
            const unavailable = Boolean(file.disabled || file.unavailable);
            const quota = file.auth_index ? quotaByAuthIndex.get(file.auth_index) : undefined;
            return (
              <View key={file.auth_index || file.id || file.name} className="gap-3 rounded-2xl border border-[#E8EDF5] bg-[#F8FAFD] p-3 dark:border-[#273449] dark:bg-[#152033]">
                <View className="flex-row items-start gap-3">
                  <View className={`h-9 w-9 items-center justify-center rounded-xl ${unavailable ? 'bg-[#FFF0F2] dark:bg-[#3A1720]' : 'bg-[#E8F8F0] dark:bg-[#143A2C]'}`}>
                    <ShieldCheck size={18} color={unavailable ? '#D9475C' : '#1C9B62'} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-[#172033] dark:text-[#F4F7FB]">{authFileTitle(file)}</Text>
                    <Text className="mt-1 text-[11px] leading-4 text-[#6B778C] dark:text-[#9EABC0]">{file.provider || file.type || 'unknown'} · {authFileStatus(file)} · 成功 {file.success ?? 0} / 失败 {file.failed ?? 0}</Text>
                    {file.last_refresh ? <Text className="mt-1 text-[10px] text-[#7B8798] dark:text-[#9EABC0]">Token 刷新：{formatDateTime(file.last_refresh)}</Text> : null}
                    {file.next_retry_after ? <Text className="mt-1 text-[10px] text-[#D98A16]">下次恢复：{formatDateTime(file.next_retry_after)}</Text> : null}
                    {file.status_message && file.status_message !== 'ok' ? <Text className="mt-1 text-[11px] text-[#D9475C]">{file.status_message}</Text> : null}
                  </View>
                </View>
                {quota ? (
                  <View className="gap-2 rounded-2xl bg-white p-3 dark:bg-[#111827]">
                    <View className="flex-row items-center gap-2">
                      <Text className="flex-1 text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">实时配额{quota.planType ? ` · ${quota.planType}` : ''}</Text>
                      <Text style={{ color: cliProxyQuotaColor(cliProxyQuotaMinimum(quota), quota.status), fontSize: 10, fontWeight: '800' }}>{cliProxyQuotaStatusLabel(quota.status)}</Text>
                    </View>
                    {quota.error ? <Text className="text-[10px] leading-4 text-[#D9475C]">{quota.error}</Text> : null}
                    {quota.windows.slice(0, 12).map((window) => {
                      const remaining = window.remainingPercent;
                      const barColor = cliProxyQuotaWindowColor(window);
                      return (
                        <View key={window.id} className="gap-1">
                          <View className="flex-row items-center gap-2">
                            <Text numberOfLines={1} className="flex-1 text-[10px] font-semibold text-[#475467] dark:text-[#C2CCDB]">{window.label}</Text>
                            <Text className="text-[10px] font-bold text-[#475467] dark:text-[#C2CCDB]">{remaining === null ? '—' : `${remaining.toFixed(0)}%`}</Text>
                          </View>
                          <View className="h-1.5 overflow-hidden rounded-full bg-[#E2E9F3] dark:bg-[#273449]">
                            <View style={{ width: `${remaining ?? 0}%`, height: '100%', borderRadius: 999, backgroundColor: barColor }} />
                          </View>
                          {window.resetAt ? <Text className="text-[9px] text-[#7B8798] dark:text-[#9EABC0]">重置：{formatDateTime(window.resetAt)}</Text> : null}
                        </View>
                      );
                    })}
                    <Text className="text-[9px] text-[#98A2B3]">查询于 {formatDateTime(quota.fetchedAt)}</Text>
                  </View>
                ) : supportsLiveQuota(file) && !file.disabled ? (
                  <Text className="text-[10px] text-[#7B8798] dark:text-[#9EABC0]">尚未查询真实配额；点击“立即刷新全部配额”。</Text>
                ) : null}
                <View className="flex-row gap-2">
                  <View className="flex-1"><AdminButton label={file.disabled ? '启用凭据' : '停用凭据'} tone="muted" pending={authActionMutation.isPending} onPress={() => authActionMutation.mutate({ type: 'toggle', file })} /></View>
                  {file.auth_index ? <View className="flex-1"><AdminButton label="清除配额冷却" tone="muted" pending={authActionMutation.isPending} onPress={() => authActionMutation.mutate({ type: 'reset', file })} /></View> : null}
                </View>
              </View>
            );
          })}
        </AdminSection>
      </ScreenShell>
    </>
  );
}
