import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LineTrendChart } from '@/src/components/line-trend-chart';
import { getDashboardSnapshot, getUsageStats, getUser, listUserApiKeys, updateUserBalance, updateUserStatus } from '@/src/services/admin';
import type { AdminApiKey, BalanceOperation } from '@/src/types/admin';
import { Text, TextInput, localizedAlert } from '@/src/components/localized-text';
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

type RangeKey = '24h' | '7d' | '30d';

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: '24h', label: '24H' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
];

function getDateRange(rangeKey: RangeKey) {
  const end = new Date();
  const start = new Date();

  if (rangeKey === '24h') {
    start.setHours(end.getHours() - 23, 0, 0, 0);
  } else if (rangeKey === '30d') {
    start.setDate(end.getDate() - 29);
  } else {
    start.setDate(end.getDate() - 6);
  }

  const toDate = (value: Date) => value.toISOString().slice(0, 10);

  return {
    start_date: toDate(start),
    end_date: toDate(end),
    granularity: rangeKey === '24h' ? ('hour' as const) : ('day' as const),
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    switch (error.message) {
      case 'BASE_URL_REQUIRED':
        return '请先到服务器页填写服务地址。';
      case 'ADMIN_API_KEY_REQUIRED':
        return '请先到服务器页填写 Admin Token。';
      default:
        return error.message;
    }
  }

  return '加载失败，请稍后重试。';
}

function formatMoney(value?: number | null) {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function formatUsageCost(stats?: { total_account_cost?: number | null; total_actual_cost?: number | null; total_cost?: number | null }) {
  const value = Number(stats?.total_account_cost ?? stats?.total_actual_cost ?? stats?.total_cost ?? 0);
  return `$${value.toFixed(4)}`;
}

function formatTokenValue(value?: number | null) {
  const number = Number(value ?? 0);
  if (number >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(2)}B`;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(2)}K`;
  return new Intl.NumberFormat('en-US').format(number);
}


function formatQuotaUsage(quotaUsed?: number | null, quota?: number | null) {
  const used = Number(quotaUsed ?? 0);
  const limit = Number(quota ?? 0);

  if (limit <= 0) {
    return '∞';
  }

  return `${used}`;
}

function formatTime(value?: string | null) {
  if (!value) return '--';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

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

function GridField({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        width: '47%',
        backgroundColor: colors.muted,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 12, color: colors.subtext }}>{label}</Text>
      <Text style={{ marginTop: 6, fontSize: 15, fontWeight: '600', color: colors.text }}>{value}</Text>
    </View>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.muted,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 12, color: colors.subtext }}>{label}</Text>
      <Text style={{ marginTop: 6, fontSize: 16, fontWeight: '700', color: colors.text }}>{value}</Text>
    </View>
  );
}

function StatusBadge({ text }: { text: string }) {
  const normalized = text.toLowerCase();
  const backgroundColor = normalized === 'active' ? '#dff4ea' : normalized === 'inactive' || normalized === 'disabled' ? '#ece5da' : '#FFF0F2';
  const color = normalized === 'active' ? '#17663f' : normalized === 'inactive' || normalized === 'disabled' ? '#667085' : '#D9475C';

  return (
    <View style={{ backgroundColor, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color }}>{text}</Text>
    </View>
  );
}

function CopyInlineButton({ copied, onPress }: { copied: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        marginLeft: 8,
        backgroundColor: copied ? '#dff4ea' : '#E2E9F3',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '700', color: copied ? '#17663f' : '#344054' }}>{copied ? '已复制' : '复制'}</Text>
    </Pressable>
  );
}

function KeyItem({ item, copied, onCopy, onManage }: { item: AdminApiKey; copied: boolean; onCopy: () => void; onManage: () => void }) {
  return (
    <View
      style={{
        backgroundColor: colors.muted,
        borderRadius: 14,
        padding: 12,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{item.name || `Key #${item.id}`}</Text>
            <CopyInlineButton copied={copied} onPress={onCopy} />
            <Pressable onPress={onManage} style={{ marginLeft: 8, backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>修改分组</Text>
            </Pressable>
          </View>
          <Text style={{ marginTop: 4, fontSize: 12, color: colors.subtext }}>{item.group?.name || '未分组'}</Text>
        </View>
        <StatusBadge text={item.status || '--'} />
      </View>

      <Text style={{ marginTop: 10, fontSize: 12, lineHeight: 18, color: colors.text }}>{item.key || '--'}</Text>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginTop: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, color: colors.subtext }}>已用额度</Text>
          <Text style={{ marginTop: 4, fontSize: 16, fontWeight: '700', color: colors.text }}>{formatQuotaUsage(item.quota_used, item.quota)}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 11, color: colors.subtext }}>最后使用时间</Text>
          <Text style={{ marginTop: 4, fontSize: 13, color: colors.subtext }}>{formatTime(item.last_used_at || item.updated_at || item.created_at)}</Text>
        </View>
      </View>
    </View>
  );
}

export default function UserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = Number(id);
  const queryClient = useQueryClient();

  const [operation, setOperation] = useState<BalanceOperation>('add');
  const [amount, setAmount] = useState('10');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null);
  const [rangeKey, setRangeKey] = useState<RangeKey>('7d');
  const range = getDateRange(rangeKey);

  const userQuery = useQuery({
    queryKey: ['user', userId],
    queryFn: () => getUser(userId),
    enabled: Number.isFinite(userId),
  });

  const apiKeysQuery = useQuery({
    queryKey: ['user-api-keys', userId],
    queryFn: () => listUserApiKeys(userId),
    enabled: Number.isFinite(userId),
  });

  const usageStatsQuery = useQuery({
    queryKey: ['usage-stats', 'user', userId, rangeKey, range.start_date, range.end_date],
    queryFn: () => getUsageStats({ ...range, user_id: userId }),
    enabled: Number.isFinite(userId),
  });

  const usageSnapshotQuery = useQuery({
    queryKey: ['usage-snapshot', 'user', userId, rangeKey, range.start_date, range.end_date, range.granularity],
    queryFn: () =>
      getDashboardSnapshot({
        ...range,
        user_id: userId,
        include_stats: false,
        include_trend: true,
        include_model_stats: false,
        include_group_stats: false,
        include_users_trend: false,
      }),
    enabled: Number.isFinite(userId),
  });
;
;

  const balanceMutation = useMutation({
    mutationFn: (payload: { amount: number; notes?: string; operation: BalanceOperation }) =>
      updateUserBalance(userId, {
        balance: payload.amount,
        notes: payload.notes,
        operation: payload.operation,
      }),
    onSuccess: () => {
      setFormError(null);
      setAmount('10');
      setNotes('');
      queryClient.invalidateQueries({ queryKey: ['user', userId] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const statusMutation = useMutation({
    mutationFn: (status: 'active' | 'disabled') => updateUserStatus(userId, status),
    onSuccess: () => {
      setStatusError(null);
      queryClient.invalidateQueries({ queryKey: ['user', userId] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => setStatusError(getErrorMessage(error)),
  });

  const user = userQuery.data;
  const apiKeys = apiKeysQuery.data?.items ?? [];

  const filteredApiKeys = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return apiKeys.filter((item) => {
      const haystack = [item.name, item.key, item.group?.name].filter(Boolean).join(' ').toLowerCase();
      return keyword ? haystack.includes(keyword) : true;
    });
  }, [apiKeys, searchText]);
  const trendPoints = (usageSnapshotQuery.data?.trend ?? []).map((item) => ({
    label: rangeKey === '24h' ? item.date.slice(11, 13) : item.date.slice(5, 10),
    value: item.total_tokens,
  }));

  function submitBalance() {
    const numericAmount = Number(amount);

    if (!amount.trim()) {
      setFormError('请输入金额。');
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      setFormError('金额格式不正确。');
      return;
    }

    balanceMutation.mutate({
      amount: numericAmount,
      notes: notes.trim() || undefined,
      operation,
    });
  }

  async function copyKey(item: AdminApiKey) {
    await Clipboard.setStringAsync(item.key || '');
    setCopiedKeyId(item.id);
    setTimeout(() => {
      setCopiedKeyId((current) => (current === item.id ? null : current));
    }, 1500);
  }

  function handleToggleUserStatus() {
    if (!user) return;
    const nextStatus: 'active' | 'disabled' = user.status === 'disabled' ? 'active' : 'disabled';
    const actionLabel = nextStatus === 'disabled' ? '禁用' : '启用';

    localizedAlert(`${actionLabel}用户`, `确认要${actionLabel}该用户吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '确认',
        style: nextStatus === 'disabled' ? 'destructive' : 'default',
        onPress: () => {
          setStatusError(null);
          statusMutation.mutate(nextStatus);
        },
      },
    ]);
  }

  return (
    <>
      <LocalizedStackScreen options={{ title: user?.email || '用户详情' }} />
      <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.page }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {userQuery.isLoading ? (
            <Section title="状态">
              <Text style={{ color: colors.subtext }}>正在加载用户详情...</Text>
            </Section>
          ) : null}

          {userQuery.error ? (
            <Section title="状态">
              <View style={{ backgroundColor: colors.errorBg, borderRadius: 12, padding: 12 }}>
                <Text style={{ color: colors.errorText, fontWeight: '700' }}>用户信息加载失败</Text>
                <Text style={{ marginTop: 6, color: colors.errorText }}>{getErrorMessage(userQuery.error)}</Text>
              </View>
            </Section>
          ) : null}

          {user ? (
            <Section title="基础信息">
              <Pressable
                onPress={() => router.push(`/users/edit?id=${user.id}`)}
                style={{ alignSelf: 'flex-end', marginBottom: 12, borderRadius: 10, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 9 }}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>编辑用户</Text>
              </Pressable>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
                <View
                  style={{
                    width: '47%',
                    justifyContent: 'center',
                    paddingHorizontal: 4,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ fontSize: 11, color: colors.subtext }}>邮箱</Text>
                  <Text style={{ marginTop: 4, fontSize: 13, color: colors.subtext }}>{user.email || '--'}</Text>
                </View>
                <GridField label="用户名" value={user.username || '--'} />
                <GridField label="余额" value={formatMoney(user.balance)} />
                <View
                  style={{
                    width: '47%',
                    justifyContent: 'center',
                    paddingHorizontal: 4,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ fontSize: 11, color: colors.subtext }}>最后使用时间</Text>
                  <Text style={{ marginTop: 4, fontSize: 13, color: colors.subtext }}>{formatTime(user.last_used_at || user.updated_at || user.created_at)}</Text>
                </View>
              </View>

              <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 12, color: colors.subtext }}>用户状态</Text>
                  <StatusBadge text={user.status || 'active'} />
                </View>
                <Pressable
                  disabled={statusMutation.isPending || user.role?.toLowerCase() === 'admin'}
                  onPress={handleToggleUserStatus}
                  style={{
                    backgroundColor: user.status === 'disabled' ? colors.primary : '#8b3f1f',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    opacity: statusMutation.isPending || user.role?.toLowerCase() === 'admin' ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                    {statusMutation.isPending ? '处理中...' : user.status === 'disabled' ? '启用用户' : '禁用用户'}
                  </Text>
                </Pressable>
              </View>

              {user.role?.toLowerCase() === 'admin' ? <Text style={{ marginTop: 8, fontSize: 12, color: colors.subtext }}>管理员用户不支持禁用。</Text> : null}

              {statusError ? (
                <View style={{ marginTop: 10, backgroundColor: colors.errorBg, borderRadius: 12, padding: 12 }}>
                  <Text style={{ color: colors.errorText }}>{statusError}</Text>
                </View>
              ) : null}
            </Section>
          ) : null}

          <Section title="总用量">
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {RANGE_OPTIONS.map((item) => {
                const active = item.key === rangeKey;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => setRangeKey(item.key)}
                    style={{
                      backgroundColor: active ? colors.primary : colors.muted,
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                    }}
                  >
                    <Text style={{ color: active ? '#fff' : colors.text, fontSize: 12, fontWeight: '700' }}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <MetricCard label="请求" value={formatTokenValue(usageStatsQuery.data?.total_requests)} />
              <MetricCard label="Token" value={formatTokenValue(usageStatsQuery.data?.total_tokens)} />
              <MetricCard label="成本" value={formatUsageCost(usageStatsQuery.data)} />
            </View>

            {usageStatsQuery.data ? (
              <Text style={{ marginTop: 10, fontSize: 12, color: colors.subtext }}>
                输入 {formatTokenValue(usageStatsQuery.data.total_input_tokens)} · 输出 {formatTokenValue(usageStatsQuery.data.total_output_tokens)}
              </Text>
            ) : null}

            {usageStatsQuery.isLoading ? <Text style={{ marginTop: 12, color: colors.subtext }}>正在加载用量统计...</Text> : null}

            {usageStatsQuery.error ? (
              <View style={{ marginTop: 12, backgroundColor: colors.errorBg, borderRadius: 12, padding: 12 }}>
                <Text style={{ color: colors.errorText, fontWeight: '700' }}>用量统计加载失败</Text>
                <Text style={{ marginTop: 6, color: colors.errorText }}>{getErrorMessage(usageStatsQuery.error)}</Text>
              </View>
            ) : null}

            {!usageSnapshotQuery.isLoading && trendPoints.length > 1 ? (
              <View style={{ marginTop: 14 }}>
                <LineTrendChart
                  title="用量趋势"
                  subtitle={`${range.start_date} 到 ${range.end_date}`}
                  points={trendPoints}
                  color="#2F6DF6"
                  formatValue={(value) => formatTokenValue(value)}
                  compact
                />
              </View>
            ) : null}

            {usageSnapshotQuery.isLoading ? <Text style={{ marginTop: 12, color: colors.subtext }}>正在加载趋势图...</Text> : null}

            {usageSnapshotQuery.error ? (
              <View style={{ marginTop: 12, backgroundColor: colors.errorBg, borderRadius: 12, padding: 12 }}>
                <Text style={{ color: colors.errorText, fontWeight: '700' }}>趋势加载失败</Text>
                <Text style={{ marginTop: 6, color: colors.errorText }}>{getErrorMessage(usageSnapshotQuery.error)}</Text>
              </View>
            ) : null}
          </Section>

          <Section title="API Keys">
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="搜索名称 / Key / 分组"
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

            {apiKeysQuery.isLoading ? <Text style={{ color: colors.subtext }}>正在加载 API Keys...</Text> : null}

            {apiKeysQuery.error ? (
              <View style={{ backgroundColor: colors.errorBg, borderRadius: 12, padding: 12 }}>
                <Text style={{ color: colors.errorText, fontWeight: '700' }}>API Keys 加载失败</Text>
                <Text style={{ marginTop: 6, color: colors.errorText }}>{getErrorMessage(apiKeysQuery.error)}</Text>
              </View>
            ) : null}

            {!apiKeysQuery.isLoading && !apiKeysQuery.error ? (
              filteredApiKeys.length > 0 ? (
                <View>
                  {filteredApiKeys.map((item) => (
                    <KeyItem
                      key={item.id}
                      item={item}
                      copied={copiedKeyId === item.id}
                      onCopy={() => copyKey(item)}
                      onManage={() => router.push(`/users/api-key?userId=${userId}&id=${item.id}`)}
                    />
                  ))}
                </View>
              ) : (
                <Text style={{ color: colors.subtext }}>当前筛选条件下没有 Key。</Text>
              )
            ) : null}
          </Section>

          <Section title="余额操作">
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {([
                { label: '充值', value: 'add' },
                { label: '扣减', value: 'subtract' },
                { label: '设为', value: 'set' },
              ] as const).map((item) => {
                const active = operation === item.value;
                return (
                  <Pressable
                    key={item.value}
                    onPress={() => setOperation(item.value)}
                    style={{
                      flex: 1,
                      backgroundColor: active ? colors.primary : colors.muted,
                      borderRadius: 12,
                      paddingVertical: 12,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                    }}
                  >
                    <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '700' }}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="输入金额，例如 10"
              placeholderTextColor="#98A2B3"
              keyboardType="decimal-pad"
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

            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="备注（可选）"
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

            {formError ? (
              <View style={{ backgroundColor: colors.errorBg, borderRadius: 12, padding: 12, marginBottom: 10 }}>
                <Text style={{ color: colors.errorText }}>{formError}</Text>
              </View>
            ) : null}

            <Pressable onPress={submitBalance} style={{ backgroundColor: colors.dark, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{balanceMutation.isPending ? '提交中...' : '确认提交'}</Text>
            </Pressable>
          </Section>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
