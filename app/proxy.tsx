import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  checkProxyQuality,
  createProxy,
  deleteProxy,
  getProxy,
  testProxy,
  updateProxy,
} from '@/src/services/admin';
import type { ProxyProtocol } from '@/src/types/admin';
import { Text, TextInput, localizedAlert } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

const protocols: ProxyProtocol[] = ['http', 'https', 'socks5', 'socks5h'];
const fieldClass = 'rounded-2xl bg-[#F1F5FA] dark:bg-[#182235] px-4 py-3.5 text-sm text-[#172033] dark:text-[#F4F7FB]';

function ActionButton({ label, onPress, danger = false, disabled = false }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`rounded-2xl px-4 py-3 ${danger ? 'bg-[#FFF0F2] dark:bg-[#3A1720]' : 'bg-[#EAF2FF] dark:bg-[#172C55]'} ${disabled ? 'opacity-50' : ''}`}
    >
      <Text className={`text-center text-sm font-bold ${danger ? 'text-[#D9475C]' : 'text-[#2F6DF6]'}`}>{label}</Text>
    </Pressable>
  );
}

export default function ProxyFormScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const proxyId = Number(params.id);
  const editing = Number.isFinite(proxyId) && proxyId > 0;
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [protocol, setProtocol] = useState<ProxyProtocol>('http');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [fallbackMode, setFallbackMode] = useState<'none' | 'direct'>('none');
  const [expiryWarnDays, setExpiryWarnDays] = useState('7');
  const [feedback, setFeedback] = useState('');

  const proxyQuery = useQuery({
    queryKey: ['proxy', proxyId],
    queryFn: () => getProxy(proxyId),
    enabled: editing,
  });

  useEffect(() => {
    const proxy = proxyQuery.data;
    if (!proxy) return;
    setName(proxy.name);
    setProtocol(proxy.protocol);
    setHost(proxy.host);
    setPort(String(proxy.port));
    setUsername(proxy.username || '');
    setStatus(proxy.status === 'inactive' ? 'inactive' : 'active');
    setFallbackMode(proxy.fallback_mode === 'direct' ? 'direct' : 'none');
    setExpiryWarnDays(String(proxy.expiry_warn_days ?? 7));
  }, [proxyQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        protocol,
        host: host.trim(),
        port: Number(port),
        username: username.trim() || null,
        password: password || undefined,
        fallback_mode: fallbackMode,
        expiry_warn_days: Number(expiryWarnDays) || 0,
      };
      return editing ? updateProxy(proxyId, { ...body, status }) : createProxy(body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['proxies'] });
      router.back();
    },
  });

  const maintenanceMutation = useMutation({
    mutationFn: async (action: 'test' | 'quality') => {
      if (action === 'test') {
        const result = await testProxy(proxyId);
        return `${result.success ? '连通成功' : '连通失败'} · ${result.latency_ms ?? '--'}ms · ${result.ip_address || ''}\n${result.message}`;
      }
      const result = await checkProxyQuality(proxyId);
      return `质量 ${result.grade} / ${result.score} 分 · ${result.summary}\n通过 ${result.passed_count}，警告 ${result.warn_count}，失败 ${result.failed_count}`;
    },
    onSuccess: async (message) => {
      setFeedback(message);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['proxy', proxyId] }),
        queryClient.invalidateQueries({ queryKey: ['proxies'] }),
      ]);
    },
    onError: (error) => setFeedback((error as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteProxy(proxyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['proxies'] });
      router.back();
    },
  });

  const invalid = !name.trim() || !host.trim() || !Number.isInteger(Number(port)) || Number(port) <= 0;
  const error = (saveMutation.error || deleteMutation.error) as Error | null;

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-[#F4F7FC] dark:bg-[#0B1220]">
      <LocalizedStackScreen options={{ title: editing ? '编辑代理' : '新增代理', headerShown: true }} />
      <ScrollView contentContainerClassName="gap-4 px-5 pb-10 pt-4" keyboardShouldPersistTaps="handled">
        <View className="gap-3 rounded-[20px] border border-[#E2E9F3] dark:border-[#273449] bg-[#FFFFFF] dark:bg-[#111827] p-4">
          <Text className="text-lg font-bold text-[#172033] dark:text-[#F4F7FB]">基本信息</Text>
          <TextInput value={name} onChangeText={setName} placeholder="代理名称" placeholderTextColor="#98A2B3" className={fieldClass} />
          <View className="flex-row flex-wrap gap-2">
            {protocols.map((item) => (
              <Pressable key={item} onPress={() => setProtocol(item)} className={`rounded-full px-3 py-2 ${protocol === item ? 'bg-[#2F6DF6]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}>
                <Text className={`text-xs font-bold ${protocol === item ? 'text-white' : 'text-[#475467] dark:text-[#C2CCDB]'}`}>{item}</Text>
              </Pressable>
            ))}
          </View>
          <View className="flex-row gap-3">
            <TextInput value={host} onChangeText={setHost} placeholder="主机/IP" placeholderTextColor="#98A2B3" autoCapitalize="none" className={`${fieldClass} flex-1`} />
            <TextInput value={port} onChangeText={setPort} placeholder="端口" placeholderTextColor="#98A2B3" keyboardType="number-pad" className={`${fieldClass} w-24`} />
          </View>
          <TextInput value={username} onChangeText={setUsername} placeholder="用户名（可选）" placeholderTextColor="#98A2B3" autoCapitalize="none" className={fieldClass} />
          <TextInput value={password} onChangeText={setPassword} placeholder={editing ? '密码（留空则不修改）' : '密码（可选）'} placeholderTextColor="#98A2B3" secureTextEntry className={fieldClass} />
          <TextInput value={expiryWarnDays} onChangeText={setExpiryWarnDays} placeholder="过期预警天数" placeholderTextColor="#98A2B3" keyboardType="number-pad" className={fieldClass} />

          {editing ? (
            <View className="flex-row gap-2">
              {(['active', 'inactive'] as const).map((item) => (
                <Pressable key={item} onPress={() => setStatus(item)} className={`flex-1 rounded-xl py-3 ${status === item ? 'bg-[#2F6DF6]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}>
                  <Text className={`text-center text-xs font-bold ${status === item ? 'text-white' : 'text-[#475467] dark:text-[#C2CCDB]'}`}>{item === 'active' ? '启用' : '停用'}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View className="flex-row gap-2">
            {(['none', 'direct'] as const).map((item) => (
              <Pressable key={item} onPress={() => setFallbackMode(item)} className={`flex-1 rounded-xl py-3 ${fallbackMode === item ? 'bg-[#2F6DF6]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}>
                <Text className={`text-center text-xs font-bold ${fallbackMode === item ? 'text-white' : 'text-[#475467] dark:text-[#C2CCDB]'}`}>{item === 'none' ? '失败即停止' : '失败走直连'}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {editing ? (
          <View className="gap-3 rounded-[20px] border border-[#E2E9F3] dark:border-[#273449] bg-[#FFFFFF] dark:bg-[#111827] p-4">
            <Text className="text-lg font-bold text-[#172033] dark:text-[#F4F7FB]">检测与维护</Text>
            <View className="flex-row gap-3">
              <View className="flex-1"><ActionButton label="连通测试" disabled={maintenanceMutation.isPending} onPress={() => maintenanceMutation.mutate('test')} /></View>
              <View className="flex-1"><ActionButton label="质量检测" disabled={maintenanceMutation.isPending} onPress={() => maintenanceMutation.mutate('quality')} /></View>
            </View>
            {feedback ? <Text className="rounded-xl bg-[#F1F5FA] dark:bg-[#182235] p-3 text-xs leading-5 text-[#475467] dark:text-[#C2CCDB]">{feedback}</Text> : null}
          </View>
        ) : null}

        {error ? <Text className="text-sm text-[#D9475C]">{error.message}</Text> : null}
        <Pressable disabled={invalid || saveMutation.isPending} onPress={() => saveMutation.mutate()} className={`rounded-2xl bg-[#2F6DF6] py-4 ${invalid || saveMutation.isPending ? 'opacity-50' : ''}`}>
          <Text className="text-center text-sm font-bold text-white">{saveMutation.isPending ? '保存中...' : '保存代理'}</Text>
        </Pressable>
        {editing ? (
          <ActionButton
            label="删除代理"
            danger
            disabled={deleteMutation.isPending}
            onPress={() => localizedAlert('删除代理', '使用该代理的账号可能受影响，确认删除？', [
              { text: '取消', style: 'cancel' },
              { text: '删除', style: 'destructive', onPress: () => deleteMutation.mutate() },
            ])}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
