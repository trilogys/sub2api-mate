import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountQuotaPanel } from '@/src/components/account-quota-panel';
import { AccountTestModal } from '@/src/components/account-test-modal';
import {
  clearAccountError,
  clearAccountRateLimit,
  clearAccountTempUnschedulable,
  deleteAccount,
  duplicateAccount,
  getAccount,
  listAllGroups,
  recoverAccountState,
  refreshAccount,
  resetAccountQuota,
  updateAccount,
} from '@/src/services/admin';
import type { UpdateAccountRequest } from '@/src/types/admin';
import { Text, TextInput, localizedAlert } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

const colors = {
  page: '#F4F7FC',
  card: '#FFFFFF',
  muted: '#F1F5FA',
  border: '#E2E9F3',
  primary: '#2F6DF6',
  text: '#172033',
  subtext: '#667085',
  danger: '#D9475C',
};

type AccountAction = 'refresh' | 'recover' | 'clear-error' | 'clear-rate-limit' | 'reset-quota' | 'clear-temp' | 'duplicate' | 'delete';

function Field({ label, value, onChangeText, keyboardType = 'default', multiline = false, compact = false }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
  multiline?: boolean;
  compact?: boolean;
}) {
  return (
    <View style={{ flex: compact ? 1 : undefined, marginBottom: compact ? 0 : 12 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={{
          minHeight: multiline ? 80 : undefined,
          backgroundColor: colors.muted,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          paddingHorizontal: compact ? 8 : 12,
          paddingVertical: 12,
          color: colors.text,
        }}
      />
    </View>
  );
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 12,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.primary : colors.muted,
        paddingHorizontal: 13,
        paddingVertical: 10,
      }}
    >
      <Text style={{ color: active ? '#fff' : colors.text, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({ label, danger = false, disabled, onPress }: { label: string; danger?: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={{ flex: 1, borderRadius: 12, backgroundColor: danger ? '#FFF0F2' : colors.muted, paddingHorizontal: 6, paddingVertical: 12, alignItems: 'center' }}
    >
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: danger ? colors.danger : colors.text, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function optionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const accountId = Number(id);
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [priority, setPriority] = useState('0');
  const [concurrency, setConcurrency] = useState('');
  const [rateMultiplier, setRateMultiplier] = useState('1');
  const [groupIds, setGroupIds] = useState<number[]>([]);
  const [feedback, setFeedback] = useState('');
  const [testModalVisible, setTestModalVisible] = useState(false);

  const accountQuery = useQuery({
    queryKey: ['account', accountId],
    queryFn: () => getAccount(accountId),
    enabled: Number.isFinite(accountId),
  });
  const groupsQuery = useQuery({ queryKey: ['groups', 'all'], queryFn: listAllGroups });

  useEffect(() => {
    const account = accountQuery.data;
    if (!account) return;
    setName(account.name ?? '');
    setNotes(account.notes ?? '');
    setStatus(account.status === 'inactive' ? 'inactive' : 'active');
    setPriority(String(account.priority ?? 0));
    setConcurrency(account.concurrency == null ? '' : String(account.concurrency));
    setRateMultiplier(String(account.rate_multiplier ?? 1));
    setGroupIds(account.group_ids ?? account.groups?.map((group) => group.id) ?? []);
  }, [accountQuery.data]);

  const payload = useMemo<UpdateAccountRequest>(() => ({
    name: name.trim(),
    notes: notes.trim(),
    status,
    priority: optionalNumber(priority),
    concurrency: optionalNumber(concurrency),
    rate_multiplier: optionalNumber(rateMultiplier),
    group_ids: groupIds,
  }), [concurrency, groupIds, name, notes, priority, rateMultiplier, status]);

  const refreshQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['account', accountId] }),
      queryClient.invalidateQueries({ queryKey: ['accounts'] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: () => updateAccount(accountId, payload),
    onSuccess: async () => { setFeedback('账号设置已保存'); await refreshQueries(); },
    onError: (value) => setFeedback(value instanceof Error ? value.message : '保存失败'),
  });

  const actionMutation = useMutation({
    mutationFn: async (action: AccountAction) => {
      switch (action) {
        case 'refresh': return refreshAccount(accountId);
        case 'recover': return recoverAccountState(accountId);
        case 'clear-error': return clearAccountError(accountId);
        case 'clear-rate-limit': return clearAccountRateLimit(accountId);
        case 'reset-quota': return resetAccountQuota(accountId);
        case 'clear-temp': return clearAccountTempUnschedulable(accountId);
        case 'duplicate': return duplicateAccount(accountId);
        case 'delete': return deleteAccount(accountId);
      }
    },
    onSuccess: async (result, action) => {
      if (action === 'delete') {
        await queryClient.invalidateQueries({ queryKey: ['accounts'] });
        router.replace('/(tabs)/accounts');
        return;
      }
      if (action === 'duplicate' && result && typeof result === 'object' && 'id' in result) {
        await queryClient.invalidateQueries({ queryKey: ['accounts'] });
        router.replace(`/accounts/${String(result.id)}`);
        return;
      }
      setFeedback('操作完成');
      await refreshQueries();
    },
    onError: (value) => setFeedback(value instanceof Error ? value.message : '操作失败'),
  });

  const busy = saveMutation.isPending || actionMutation.isPending;
  const account = accountQuery.data;

  return (
    <>
      <LocalizedStackScreen options={{ title: account?.name || '账号管理', headerShown: true }} />
      <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.page }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
            <Text style={{ marginBottom: 14, fontSize: 18, fontWeight: '700', color: colors.text }}>基本设置</Text>
            <Field label="账号名称" value={name} onChangeText={setName} />
            <Field label="备注" value={notes} onChangeText={setNotes} multiline />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <Field compact label="优先级" value={priority} onChangeText={setPriority} keyboardType="number-pad" />
              <Field compact label="倍率" value={rateMultiplier} onChangeText={setRateMultiplier} keyboardType="decimal-pad" />
              <Field compact label="并发上限" value={concurrency} onChangeText={setConcurrency} keyboardType="number-pad" />
            </View>
            <Text style={{ marginBottom: 8, fontSize: 12, color: colors.subtext }}>状态</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              <Choice label="启用" active={status === 'active'} onPress={() => setStatus('active')} />
              <Choice label="停用" active={status === 'inactive'} onPress={() => setStatus('inactive')} />
            </View>
          </View>

          <View style={{ marginTop: 12, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
            <Text style={{ marginBottom: 10, fontSize: 18, fontWeight: '700', color: colors.text }}>所属分组</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(groupsQuery.data ?? []).map((group) => {
                const active = groupIds.includes(group.id);
                return <Choice key={group.id} label={group.name} active={active} onPress={() => setGroupIds((current) => active ? current.filter((value) => value !== group.id) : [...current, group.id])} />;
              })}
            </View>
          </View>

          {account ? <View style={{ marginTop: 12 }}><AccountQuotaPanel account={account} autoQueryCredits /></View> : null}

          <Pressable
            disabled={!name.trim() || busy}
            onPress={() => { setFeedback(''); saveMutation.mutate(); }}
            style={{ marginTop: 14, borderRadius: 12, backgroundColor: !name.trim() || busy ? '#7C8AA0' : colors.primary, paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>{saveMutation.isPending ? '保存中…' : '保存账号'}</Text>
          </Pressable>

          <View style={{ marginTop: 12, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
            <Text style={{ marginBottom: 10, fontSize: 18, fontWeight: '700', color: colors.text }}>维护操作</Text>
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <ActionButton label="选择模型测试" disabled={busy} onPress={() => setTestModalVisible(true)} />
                <ActionButton label="刷新凭据" disabled={busy} onPress={() => actionMutation.mutate('refresh')} />
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <ActionButton label="恢复运行状态" disabled={busy} onPress={() => actionMutation.mutate('recover')} />
                <ActionButton label="清除错误" disabled={busy} onPress={() => actionMutation.mutate('clear-error')} />
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <ActionButton label="清除限流" disabled={busy} onPress={() => actionMutation.mutate('clear-rate-limit')} />
                <ActionButton label="清除临时停用" disabled={busy} onPress={() => actionMutation.mutate('clear-temp')} />
              </View>
              {account?.platform === 'openai' && account.type === 'oauth' ? (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <ActionButton label="复制账号" disabled={busy} onPress={() => actionMutation.mutate('duplicate')} />
                  <ActionButton label="删除账号" danger disabled={busy} onPress={() => localizedAlert('删除账号', `确定删除“${name}”吗？`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => actionMutation.mutate('delete') }])} />
                </View>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <ActionButton label="重置本地额度" disabled={busy} onPress={() => localizedAlert('重置额度', '确定重置该账号的本地额度使用量吗？', [{ text: '取消', style: 'cancel' }, { text: '重置', onPress: () => actionMutation.mutate('reset-quota') }])} />
                    <ActionButton label="复制账号" disabled={busy} onPress={() => actionMutation.mutate('duplicate')} />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <ActionButton label="删除账号" danger disabled={busy} onPress={() => localizedAlert('删除账号', `确定删除“${name}”吗？`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => actionMutation.mutate('delete') }])} />
                    <View style={{ flex: 1 }} />
                  </View>
                </>
              )}
            </View>
          </View>

          {feedback || accountQuery.error ? (
            <View style={{ marginTop: 12, borderRadius: 12, backgroundColor: '#FFF7E7', padding: 12 }}>
              <Text style={{ color: accountQuery.error ? colors.danger : colors.text }}>{feedback || (accountQuery.error as Error)?.message}</Text>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
      <AccountTestModal account={account ?? null} visible={testModalVisible} onClose={() => setTestModalVisible(false)} />
    </>
  );
}
