import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createAccount } from '@/src/services/admin';
import type { AccountPlatform, AccountType } from '@/src/types/admin';
import { Text, TextInput } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

const colors = {
  page: '#F4F7FC',
  card: '#FFFFFF',
  text: '#172033',
  subtext: '#667085',
  border: '#E2E9F3',
  primary: '#2F6DF6',
  dark: '#2F6DF6',
  errorBg: '#FFF0F2',
  errorText: '#D9475C',
  muted: '#FFF8EE',
};

const PLATFORM_OPTIONS: AccountPlatform[] = ['anthropic', 'openai', 'gemini', 'antigravity', 'grok'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{title}</Text>
      <View style={{ marginTop: 12 }}>{children}</View>
    </View>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    switch (error.message) {
      case 'BASE_URL_REQUIRED':
        return '请先到服务器页填写服务地址。';
      case 'ADMIN_API_KEY_REQUIRED':
        return '请先到服务器页填写 Admin Token。';
      case 'INVALID_SERVER_RESPONSE':
        return '服务返回格式异常，请确认后端接口可用并检查网关日志。';
      case 'REQUEST_FAILED':
        return '请求失败，请检查服务地址、Token 和网络连通性。';
      default:
        return error.message;
    }
  }

  return '创建账号失败，请稍后重试。';
}

function parseNumberValue(raw: string) {
  if (!raw.trim()) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function parseGroupIds(raw: string) {
  const values = raw
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);

  return values.length > 0 ? values : undefined;
}

function parseJsonObject(raw: string) {
  if (!raw.trim()) return {} as Record<string, string | number | boolean | null | undefined>;
  const parsed = JSON.parse(raw) as Record<string, string | number | boolean | null | undefined>;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const entries = Object.entries(parsed as Record<string, unknown>);
    for (const [, value] of entries) {
      const valueType = typeof value;
      if (
        value !== null
        && value !== undefined
        && valueType !== 'string'
        && valueType !== 'number'
        && valueType !== 'boolean'
      ) {
        throw new Error('JSON 仅支持 string / number / boolean / null。');
      }
    }

    return parsed;
  }
  throw new Error('JSON 需要是对象格式。');
}

export default function CreateAccountScreen() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [platform, setPlatform] = useState<AccountPlatform>('anthropic');
  const [accountType, setAccountType] = useState<AccountType>('apikey');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [clientId, setClientId] = useState('');
  const [concurrency, setConcurrency] = useState('');
  const [priority, setPriority] = useState('');
  const [rateMultiplier, setRateMultiplier] = useState('');
  const [proxyId, setProxyId] = useState('');
  const [groupIds, setGroupIds] = useState('');
  const [extraCredentialsJson, setExtraCredentialsJson] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false;
    if (accountType === 'apikey') return Boolean(baseUrl.trim() && apiKey.trim());
    return Boolean(accessToken.trim());
  }, [accessToken, accountType, apiKey, baseUrl, name]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const credentialsFromJson = parseJsonObject(extraCredentialsJson);
      const credentials = accountType === 'apikey'
        ? {
            ...credentialsFromJson,
            base_url: baseUrl.trim(),
            api_key: apiKey.trim(),
          }
        : {
            ...credentialsFromJson,
            access_token: accessToken.trim(),
            refresh_token: refreshToken.trim() || undefined,
            client_id: clientId.trim() || undefined,
          };

      return createAccount({
        name: name.trim(),
        platform,
        type: accountType,
        notes: notes.trim() || undefined,
        concurrency: parseNumberValue(concurrency),
        priority: parseNumberValue(priority),
        rate_multiplier: parseNumberValue(rateMultiplier),
        proxy_id: parseNumberValue(proxyId),
        group_ids: parseGroupIds(groupIds),
        credentials,
      });
    },
    onSuccess: () => {
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      router.replace('/(tabs)/accounts');
    },
    onError: (error) => {
      setFormError(getErrorMessage(error));
    },
  });

  return (
    <>
      <LocalizedStackScreen options={{ title: '添加账号' }} />
      <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.page }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Section title="基础配置">
            <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>账号名称</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="例如：openai-main"
              placeholderTextColor="#98A2B3"
              style={{
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: colors.text,
                marginBottom: 10,
              }}
            />

            <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>平台</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {PLATFORM_OPTIONS.map((item) => {
                const active = platform === item;
                return (
                  <Pressable
                    key={item}
                    onPress={() => setPlatform(item)}
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary : colors.muted,
                    }}
                  >
                    <Text style={{ color: active ? '#fff' : colors.text, fontSize: 12, fontWeight: '700' }}>{item}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>账号类型</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              {(['apikey', 'oauth'] as const).map((item) => {
                const active = accountType === item;
                return (
                  <Pressable
                    key={item}
                    onPress={() => setAccountType(item)}
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      paddingVertical: 11,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary : colors.muted,
                    }}
                  >
                    <Text style={{ color: active ? '#fff' : colors.text, fontSize: 12, fontWeight: '700' }}>{item.toUpperCase()}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>备注（可选）</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="例如：主线路账号"
              placeholderTextColor="#98A2B3"
              style={{
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: colors.text,
                marginBottom: 10,
              }}
            />
          </Section>

          <Section title="凭证信息">
            {accountType === 'apikey' ? (
              <>
                <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>Base URL</Text>
                <TextInput
                  value={baseUrl}
                  onChangeText={setBaseUrl}
                  placeholder="https://api.example.com"
                  placeholderTextColor="#98A2B3"
                  autoCapitalize="none"
                  style={{
                    backgroundColor: colors.muted,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    color: colors.text,
                    marginBottom: 10,
                  }}
                />

                <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>API Key</Text>
                <TextInput
                  value={apiKey}
                  onChangeText={setApiKey}
                  placeholder="sk-..."
                  placeholderTextColor="#98A2B3"
                  autoCapitalize="none"
                  style={{
                    backgroundColor: colors.muted,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    color: colors.text,
                    marginBottom: 10,
                  }}
                />
              </>
            ) : (
              <>
                <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>Access Token</Text>
                <TextInput
                  value={accessToken}
                  onChangeText={setAccessToken}
                  placeholder="access_token"
                  placeholderTextColor="#98A2B3"
                  autoCapitalize="none"
                  style={{
                    backgroundColor: colors.muted,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    color: colors.text,
                    marginBottom: 10,
                  }}
                />

                <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>Refresh Token（可选）</Text>
                <TextInput
                  value={refreshToken}
                  onChangeText={setRefreshToken}
                  placeholder="refresh_token"
                  placeholderTextColor="#98A2B3"
                  autoCapitalize="none"
                  style={{
                    backgroundColor: colors.muted,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    color: colors.text,
                    marginBottom: 10,
                  }}
                />

                <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>Client ID（可选）</Text>
                <TextInput
                  value={clientId}
                  onChangeText={setClientId}
                  placeholder="client_id"
                  placeholderTextColor="#98A2B3"
                  autoCapitalize="none"
                  style={{
                    backgroundColor: colors.muted,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    color: colors.text,
                    marginBottom: 10,
                  }}
                />
              </>
            )}

            <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>额外凭证 JSON（可选）</Text>
            <TextInput
              value={extraCredentialsJson}
              onChangeText={setExtraCredentialsJson}
              placeholder='例如：{"project_id":"abc","tier_id":2}'
              placeholderTextColor="#98A2B3"
              multiline
              style={{
                minHeight: 88,
                textAlignVertical: 'top',
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: colors.text,
              }}
            />
          </Section>

          <Section title="高级参数（可选）">
            <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>并发 concurrency</Text>
            <TextInput
              value={concurrency}
              onChangeText={setConcurrency}
              keyboardType="number-pad"
              placeholder="例如：10"
              placeholderTextColor="#98A2B3"
              style={{
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: colors.text,
                marginBottom: 10,
              }}
            />

            <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>优先级 priority</Text>
            <TextInput
              value={priority}
              onChangeText={setPriority}
              keyboardType="number-pad"
              placeholder="例如：0"
              placeholderTextColor="#98A2B3"
              style={{
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: colors.text,
                marginBottom: 10,
              }}
            />

            <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>倍率 rate_multiplier</Text>
            <TextInput
              value={rateMultiplier}
              onChangeText={setRateMultiplier}
              keyboardType="decimal-pad"
              placeholder="例如：1"
              placeholderTextColor="#98A2B3"
              style={{
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: colors.text,
                marginBottom: 10,
              }}
            />

            <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>代理 ID proxy_id</Text>
            <TextInput
              value={proxyId}
              onChangeText={setProxyId}
              keyboardType="number-pad"
              placeholder="例如：3"
              placeholderTextColor="#98A2B3"
              style={{
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: colors.text,
                marginBottom: 10,
              }}
            />

            <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>分组 IDs（逗号分隔）</Text>
            <TextInput
              value={groupIds}
              onChangeText={setGroupIds}
              placeholder="例如：1,2,5"
              placeholderTextColor="#98A2B3"
              style={{
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: colors.text,
              }}
            />
          </Section>

          {formError ? (
            <View style={{ backgroundColor: colors.errorBg, borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <Text style={{ color: colors.errorText }}>{formError}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => {
              setFormError(null);
              createMutation.mutate();
            }}
            disabled={!canSubmit || createMutation.isPending}
            style={{
              backgroundColor: !canSubmit || createMutation.isPending ? '#7C8AA0' : colors.dark,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>{createMutation.isPending ? '提交中...' : '创建账号'}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
