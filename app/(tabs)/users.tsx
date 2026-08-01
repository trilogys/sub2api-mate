import { useQueries, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Edge } from 'react-native-safe-area-context';

import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { PaginationControls } from '@/src/components/pagination-controls';
import { formatCompactNumber, formatTokenValue } from '@/src/lib/formatters';
import { queryClient } from '@/src/lib/query-client';
import { getUser, getUsageStats, listUserApiKeys, listUsers } from '@/src/services/admin';
import { adminConfigState, hasAuthenticatedAdminSession } from '@/src/store/admin-config';
import type { AdminUser, UsageStats } from '@/src/types/admin';
import { Text, TextInput } from '@/src/components/localized-text';
import { useUserManagementColors } from '@/src/components/user-management-ui';

const { useSnapshot } = require('valtio/react');

type SortOrder = 'desc' | 'asc';
type RangeKey = '24h' | '7d' | '30d';

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
    granularity: rangeKey === '24h' ? ('hour' ) : ('day' ),
  };
}

function formatCost(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '$0.00';
  return `$${value.toFixed(2)}`;
}

function formatActivityTime(value?: string) {
  if (!value) return '时间未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

function toTimeValue(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function getTimeValue(user: AdminUser) {
  return toTimeValue(user.last_used_at) || toTimeValue(user.updated_at) || toTimeValue(user.created_at) || user.id || 0;
}

function getUserNameLabel(user: AdminUser) {
  if (user.username?.trim()) return user.username.trim();
  if (user.notes?.trim()) return user.notes.trim();
  return user.email.split('@')[0] || '未命名';
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

  return '当前无法加载页面数据，请检查服务地址、Token 和网络。';
}

function MetricTile({ title, value }: { title: string; value: string }) {
  const colors = useUserManagementColors();

  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: colors.mutedCard, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 12 }}>
      <Text style={{ fontSize: 11, color: colors.subtext }}>{title}</Text>
      <Text numberOfLines={1} style={{ marginTop: 6, fontSize: 16, fontWeight: '800', color: colors.text }}>
        {value}
      </Text>
    </View>
  );
}

function UserCard({ user, usage }: { user: AdminUser; usage?: UsageStats }) {
  const colors = useUserManagementColors();
  const isAdmin = user.role?.trim().toLowerCase() === 'admin';
  const isDisabled = user.status === 'inactive' || user.status === 'disabled';
  const userNameLabel = getUserNameLabel(user);
  const statusLabel = `${isAdmin ? 'admin · ' : ''}${user.status || 'active'} · ${userNameLabel}`;
  const totalCost = Number(usage?.total_account_cost ?? usage?.total_actual_cost ?? usage?.total_cost ?? 0);
  const totalTokens = Number(usage?.total_tokens ?? 0);
  const totalRequests = Number(usage?.total_requests ?? 0);

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
      <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{user.email}</Text>
      <View style={{ alignSelf: 'flex-start', marginTop: 6, backgroundColor: colors.mutedCard, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: isDisabled ? colors.subtext : colors.primary }}>{statusLabel}</Text>
      </View>

      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ marginTop: 6, fontSize: 12, color: colors.subtext }}>
        最近使用 {formatActivityTime(user.last_used_at || user.updated_at || user.created_at)}
      </Text>

      <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard, paddingHorizontal: 10, paddingVertical: 9 }}>
        <Text style={{ fontSize: 11, color: colors.subtext }}>剩余额度</Text>
        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '800', color: colors.text }}>{formatCost(user.balance)}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <MetricTile title="消费" value={formatCost(totalCost)} />
        <MetricTile title="总 Token" value={formatTokenValue(totalTokens)} />
        <MetricTile title="总请求" value={formatCompactNumber(totalRequests)} />
      </View>
    </View>
  );
}

export default function UsersScreen({ safeAreaEdges = ['top', 'bottom'] }: { safeAreaEdges?: Edge[] }) {
  const colors = useUserManagementColors();
  const config = useSnapshot(adminConfigState);
  const hasAccount = hasAuthenticatedAdminSession(config);
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const debouncedSearchText = useDebouncedValue(searchText, 250);
  useEffect(() => setPage(1), [debouncedSearchText]);

  const usersQuery = useQuery({
    queryKey: ['users', debouncedSearchText, page],
    queryFn: () => listUsers(debouncedSearchText, page),
    enabled: hasAccount,
  });

  const usageRange = useMemo(() => getDateRange('7d'), []);

  const users = useMemo(() => {
    const items = [...(usersQuery.data?.items ?? [])];
    items.sort((left, right) => {
      const value = getTimeValue(left) - getTimeValue(right);
      return sortOrder === 'desc' ? -value : value;
    });
    return items;
  }, [sortOrder, usersQuery.data?.items]);

  const usageQueries = useQueries({
    queries: users.map((user) => ({
      queryKey: ['usage-stats', 'user', user.id, '7d', usageRange.start_date, usageRange.end_date],
      queryFn: () => getUsageStats({ ...usageRange, user_id: user.id }),
      enabled: hasAccount,
      staleTime: 60_000,
    })),
  });

  const usageByUserId = useMemo(
    () => new Map(users.map((user, index) => [user.id, usageQueries[index]?.data] as const)),
    [users, usageQueries]
  );

  const errorMessage = getErrorMessage(usersQuery.error);

  return (
    <SafeAreaView edges={safeAreaEdges} style={{ flex: 1, backgroundColor: colors.page }}>
      <View style={{ flex: 1, paddingHorizontal: 16 }}>
        <View style={{ marginTop: 16, marginBottom: 10, paddingHorizontal: 4, paddingVertical: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: colors.text }}>用户管理</Text>
            <Text numberOfLines={1} style={{ marginTop: 4, fontSize: 11, lineHeight: 16, color: colors.subtext }}>查看用户列表并进入详情页管理账号。</Text>
          </View>
          <Pressable
            onPress={() => router.push('/users/create-user')}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 24, lineHeight: 24, fontWeight: '500' }}>+</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 10 }}>
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="搜索邮箱、用户名或备注"
              placeholderTextColor="#98A2B3"
              style={{ backgroundColor: colors.mutedCard, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colors.text }}
            />
          </View>
          <Pressable
            onPress={() => setSortOrder((value) => (value === 'desc' ? 'asc' : 'desc'))}
            style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 14, minWidth: 92, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 11, color: colors.subtext }}>时间</Text>
            <Text style={{ marginTop: 4, fontSize: 13, fontWeight: '700', color: colors.text }}>{sortOrder === 'desc' ? '倒序' : '正序'}</Text>
          </Pressable>
        </View>

        {!hasAccount ? (
          <View style={{ marginTop: 10, backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>未连接服务器</Text>
            <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 22, color: colors.subtext }}>请先退出并在登录页选择账号，再查看用户列表。</Text>
            <Pressable
              style={{ marginTop: 14, alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 }}
              onPress={() => router.replace('/login')}
            >
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>前往登录</Text>
            </Pressable>
          </View>
        ) : usersQuery.isLoading ? (
          <View style={{ marginTop: 10, backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>正在加载用户</Text>
            <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 22, color: colors.subtext }}>已连接服务器，正在拉取用户列表。</Text>
          </View>
        ) : usersQuery.error ? (
          <View style={{ marginTop: 10, backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>加载失败</Text>
            <View style={{ marginTop: 12, borderRadius: 14, backgroundColor: colors.dangerBg, paddingHorizontal: 14, paddingVertical: 12 }}>
              <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{errorMessage}</Text>
            </View>
          </View>
        ) : (
          <FlatList
            style={{ marginTop: 10, flex: 1 }}
            data={users}
            keyExtractor={(item) => `${item.id}`}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={usersQuery.isRefetching} onRefresh={() => void usersQuery.refetch()} tintColor="#2F6DF6" />}
            contentContainerStyle={{ paddingBottom: 8, gap: 12, flexGrow: users.length === 0 ? 1 : 0 }}
            ListEmptyComponent={
              <View style={{ backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>暂无用户</Text>
                <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 22, color: colors.subtext }}>当前搜索条件下没有匹配结果，可以修改关键词后重试。</Text>
              </View>
            }
            ListFooterComponent={<View style={{ paddingTop: 12 }}><PaginationControls page={page} pages={usersQuery.data?.pages ?? 1} total={usersQuery.data?.total} onChange={setPage} /></View>}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  void queryClient.prefetchQuery({ queryKey: ['user', item.id], queryFn: () => getUser(item.id) });
                  void queryClient.prefetchQuery({ queryKey: ['user-api-keys', item.id], queryFn: () => listUserApiKeys(item.id) });
                  router.push(`/users/${item.id}`);
                }}
              >
                <UserCard user={item} usage={usageByUserId.get(item.id)} />
              </Pressable>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
