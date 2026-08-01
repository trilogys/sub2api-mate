import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { ListCard } from '@/src/components/list-card';
import { ScreenShell } from '@/src/components/screen-shell';
import { createErrorPassthroughRule, createTLSFingerprintProfile, deleteErrorPassthroughRule, deleteTLSFingerprintProfile, listErrorPassthroughRules, listTLSFingerprintProfiles, updateErrorPassthroughRule, updateTLSFingerprintProfile } from '@/src/services/admin';
import { Text, localizedAlert } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

export default function TrafficPoliciesScreen() {
  const client = useQueryClient();
  const [ruleName, setRuleName] = useState('');
  const [codes, setCodes] = useState('429,500,502,503');
  const [tlsName, setTlsName] = useState('');
  const rules = useQuery({ queryKey: ['error-passthrough-rules'], queryFn: listErrorPassthroughRules });
  const tls = useQuery({ queryKey: ['tls-fingerprint-profiles'], queryFn: listTLSFingerprintProfiles });
  const refreshRules = async () => { await client.invalidateQueries({ queryKey: ['error-passthrough-rules'] }); };
  const refreshTLS = async () => { await client.invalidateQueries({ queryKey: ['tls-fingerprint-profiles'] }); };
  const createRule = useMutation({ mutationFn: () => createErrorPassthroughRule({ name: ruleName.trim(), enabled: true, error_codes: codes.split(',').map(Number).filter(Number.isFinite), match_mode: 'any', passthrough_code: true, passthrough_body: true }), onSuccess: async () => { setRuleName(''); await refreshRules(); } });
  const toggleRule = useMutation({ mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => updateErrorPassthroughRule(id, { enabled }), onSuccess: refreshRules });
  const removeRule = useMutation({ mutationFn: deleteErrorPassthroughRule, onSuccess: refreshRules });
  const createTLS = useMutation({ mutationFn: () => createTLSFingerprintProfile({ name: tlsName.trim(), enable_grease: true, alpn_protocols: ['h2', 'http/1.1'] }), onSuccess: async () => { setTlsName(''); await refreshTLS(); } });
  const toggleTLS = useMutation({ mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => updateTLSFingerprintProfile(id, { enable_grease: enabled }), onSuccess: refreshTLS });
  const removeTLS = useMutation({ mutationFn: deleteTLSFingerprintProfile, onSuccess: refreshTLS });

  return (
    <>
      <LocalizedStackScreen options={{ title: '流量策略', headerShown: true }} />
      <ScreenShell title="流量策略" subtitle="错误透传规则与 TLS 指纹配置" safeAreaEdges={['bottom']} bottomInsetClassName="pb-8" refreshing={rules.isRefetching || tls.isRefetching} onRefresh={async () => { await Promise.all([rules.refetch(), tls.refetch()]); }}>
        <AdminSection title="错误透传规则" detail="匹配指定上游状态码后保留响应码和响应体。">
          <AdminField label="规则名称" value={ruleName} onChangeText={setRuleName} placeholder="上游限流与网关错误" />
          <AdminField label="状态码（逗号分隔）" value={codes} onChangeText={setCodes} keyboardType="numbers-and-punctuation" />
          <AdminButton label="创建透传规则" pending={createRule.isPending} disabled={!ruleName.trim()} onPress={() => createRule.mutate()} />
          {rules.data?.map((item) => <ListCard key={item.id} title={item.name} meta={`优先级 ${item.priority} · ${item.error_codes.join(', ') || '按关键字匹配'}`} badge={item.enabled ? '启用' : '停用'} badgeTone={item.enabled ? 'success' : 'muted'}><View className="mt-2 flex-row gap-3"><Pressable onPress={() => toggleRule.mutate({ id: item.id, enabled: !item.enabled })}><Text className="text-xs font-bold text-[#2F6DF6]">{item.enabled ? '停用' : '启用'}</Text></Pressable><Pressable onPress={() => localizedAlert('删除规则', `确定删除“${item.name}”吗？`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => removeRule.mutate(item.id) }])}><Text className="text-xs font-bold text-[#D9475C]">删除</Text></Pressable></View></ListCard>)}
          {!rules.isLoading && !rules.data?.length ? <EmptyState label="暂无透传规则" /> : null}
          <AdminMessage error={rules.error || createRule.error || toggleRule.error || removeRule.error} success={createRule.isSuccess ? '透传规则已创建' : undefined} />
        </AdminSection>

        <AdminSection title="TLS 指纹配置" detail="创建基础浏览器兼容配置；复杂的 cipher、curve 和 extension 可继续由服务端模板维护。">
          <AdminField label="配置名称" value={tlsName} onChangeText={setTlsName} placeholder="Chrome-like" />
          <AdminButton label="创建 TLS 配置" pending={createTLS.isPending} disabled={!tlsName.trim()} onPress={() => createTLS.mutate()} />
          {tls.data?.map((item) => <ListCard key={item.id} title={item.name} meta={`${item.alpn_protocols.join(', ') || '未配置 ALPN'} · ${item.cipher_suites.length} 个 cipher`} badge={item.enable_grease ? 'GREASE' : '标准'} badgeTone={item.enable_grease ? 'success' : 'muted'}><View className="mt-2 flex-row gap-3"><AdminChip label="GREASE" selected={item.enable_grease} onPress={() => toggleTLS.mutate({ id: item.id, enabled: !item.enable_grease })} /><Pressable onPress={() => localizedAlert('删除 TLS 配置', `确定删除“${item.name}”吗？`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => removeTLS.mutate(item.id) }])}><Text className="pt-2.5 text-xs font-bold text-[#D9475C]">删除</Text></Pressable></View></ListCard>)}
          {!tls.isLoading && !tls.data?.length ? <EmptyState label="暂无 TLS 指纹配置" /> : null}
          <AdminMessage error={tls.error || createTLS.error || toggleTLS.error || removeTLS.error} success={createTLS.isSuccess ? 'TLS 配置已创建' : undefined} />
        </AdminSection>
      </ScreenShell>
    </>
  );
}
