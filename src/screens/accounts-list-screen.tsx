import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CheckCircle2, CircleAlert, Clock3, KeyRound, Play, Search, ShieldCheck, ShieldOff, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, View } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';

import { AccountQuotaPanel } from '@/src/components/account-quota-panel';
import { AccountTestModal } from '@/src/components/account-test-modal';
import { runConfiguredAccountRefresh } from '@/src/components/account-refresh-coordinator';
import { ListCard } from '@/src/components/list-card';
import { PaginationControls } from '@/src/components/pagination-controls';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { formatTokenValue } from '@/src/lib/formatters';
import { getAccountTodayStats, listAccounts, recoverAccountState, setAccountSchedulable } from '@/src/services/admin';
import { accountRefreshState, updateAccountRefresh } from '@/src/store/account-refresh';
import type { AdminAccount } from '@/src/types/admin';
import { Text, TextInput } from '@/src/components/localized-text';
const { useSnapshot } = require('valtio/react');

type AccountStatusFilter = 'all' | 'active' | 'limited' | 'paused' | 'error';
type UsageSort = 'usage-desc' | 'usage-asc' | null;
type AccountVisualStatus = {
  filterKey: AccountStatusFilter;
  label: '正常' | '限流中' | '过载中' | '临时不可调度' | '配额用尽' | '停用' | '异常';
  badgeTone: 'success' | 'warning' | 'muted' | 'danger';
  code?: '429' | '529';
  detail?: string;
};

type AccountTodaySummary = {
  requests: number;
  tokens: number;
  cost: number;
};

type RecoverNotice = {
  tone: 'success' | 'error';
  title: string;
  message: string;
} | null;

function RecoverNoticeModal({ notice, onClose }: { notice: RecoverNotice; onClose: () => void }) {
  const success = notice?.tone === 'success';
  return (
    <Modal visible={Boolean(notice)} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 items-center justify-center bg-black/40 px-5">
        <Pressable onPress={(event) => event.stopPropagation()} className="w-full max-w-[360px] rounded-[26px] border border-[#E2E9F3] bg-white p-5 dark:border-[#273449] dark:bg-[#111827]">
          <View className="flex-row items-start">
            <View className={`h-11 w-11 items-center justify-center rounded-2xl ${success ? 'bg-[#EAF8F0] dark:bg-[#153326]' : 'bg-[#FFF0F2] dark:bg-[#3A1720]'}`}>
              {success ? <CheckCircle2 size={22} color="#20A66A" /> : <CircleAlert size={22} color="#D9475C" />}
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-base font-bold text-[#172033] dark:text-[#F4F7FB]">{notice?.title}</Text>
              <Text className="mt-1 text-xs leading-5 text-[#6B778C] dark:text-[#9EABC0]">{notice?.message}</Text>
            </View>
            <Pressable accessibilityLabel="关闭" hitSlop={10} onPress={onClose} className="p-1">
              <X size={18} color="#7C8AA0" />
            </Pressable>
          </View>
          <Pressable onPress={onClose} className="mt-5 items-center rounded-2xl bg-[#2F6DF6] py-3">
            <Text className="text-sm font-bold text-white">知道了</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function formatTime(value?: string | null) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function futureTimestamp(value?: string | null) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now() ? timestamp : 0;
}

function formatCountdown(value?: string | null) {
  const remainingSeconds = Math.max(0, Math.floor((futureTimestamp(value) - Date.now()) / 1000));
  if (!remainingSeconds) return '';
  const days = Math.floor(remainingSeconds / 86400);
  const hours = Math.floor((remainingSeconds % 86400) / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  if (days) return `${days}d${hours ? ` ${hours}h` : ''}`;
  if (hours) return `${hours}h${minutes ? ` ${minutes}m` : ''}`;
  if (minutes) return `${minutes}m`;
  return `${remainingSeconds}s`;
}

function quotaExceeded(used?: number | null, limit?: number | null) {
  return typeof limit === 'number' && limit > 0 && typeof used === 'number' && used >= limit;
}

function getAccountError(account: AdminAccount) {
  const normalizedStatus = `${account.status ?? ''}`.toLowerCase();
  const availableStatuses = ['', 'active', 'normal', 'healthy', 'enabled'];
  const pausedStatuses = ['inactive', 'disabled', 'paused', 'stop', 'stopped'];
  return normalizedStatus === 'error' || (!availableStatuses.includes(normalizedStatus) && !pausedStatuses.includes(normalizedStatus));
}

function getAccountVisualStatus(account: AdminAccount): AccountVisualStatus {
  const normalizedStatus = `${account.status ?? ''}`.toLowerCase();
  const isPausedStatus = ['inactive', 'disabled', 'paused', 'stop', 'stopped'].includes(normalizedStatus);
  const rateLimitCountdown = formatCountdown(account.rate_limit_reset_at);
  const overloadCountdown = formatCountdown(account.overload_until);
  const tempCountdown = formatCountdown(account.temp_unschedulable_until);

  if (rateLimitCountdown) {
    return { filterKey: 'limited', label: '限流中', badgeTone: 'warning', code: '429', detail: `${rateLimitCountdown} 自动恢复` };
  }
  if (overloadCountdown) {
    return { filterKey: 'limited', label: '过载中', badgeTone: 'danger', code: '529', detail: `${overloadCountdown} 自动恢复` };
  }

  if (getAccountError(account)) {
    return { filterKey: 'error', label: '异常', badgeTone: 'danger', detail: account.error_message || (normalizedStatus ? `未知状态：${normalizedStatus}` : undefined) };
  }
  if (tempCountdown) {
    return { filterKey: 'limited', label: '临时不可调度', badgeTone: 'warning', detail: account.temp_unschedulable_reason || `${tempCountdown} 后恢复` };
  }
  if (isPausedStatus) {
    return { filterKey: 'paused', label: '停用', badgeTone: 'muted' };
  }
  if (
    quotaExceeded(account.quota_used, account.quota_limit) ||
    quotaExceeded(account.quota_daily_used, account.quota_daily_limit) ||
    quotaExceeded(account.quota_weekly_used, account.quota_weekly_limit)
  ) {
    const resetAt = quotaExceeded(account.quota_daily_used, account.quota_daily_limit)
      ? account.quota_daily_reset_at
      : quotaExceeded(account.quota_weekly_used, account.quota_weekly_limit)
        ? account.quota_weekly_reset_at
        : null;
    const countdown = formatCountdown(resetAt);
    return { filterKey: 'limited', label: '配额用尽', badgeTone: 'warning', detail: countdown ? `${countdown} 自动恢复` : '已达到账号配额上限' };
  }
  if (account.schedulable === false) {
    return { filterKey: 'paused', label: '停用', badgeTone: 'muted', detail: '已停止参与调度' };
  }
  return { filterKey: 'active', label: '正常', badgeTone: 'success' };
}

type AccountsListScreenProps = {
  safeAreaEdges?: Edge[];
};

export function AccountsListScreen({ safeAreaEdges }: AccountsListScreenProps) {
  const refreshConfig = useSnapshot(accountRefreshState);
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<AccountStatusFilter>('all');
  const [usageSort, setUsageSort] = useState<UsageSort>('usage-desc');
  const [testAccountTarget, setTestAccountTarget] = useState<AdminAccount | null>(null);
  const [togglingAccountId, setTogglingAccountId] = useState<number | null>(null);
  const [recoveringAccountId, setRecoveringAccountId] = useState<number | null>(null);
  const [recoverNotice, setRecoverNotice] = useState<RecoverNotice>(null);
  const [runningRefresh, setRunningRefresh] = useState(false);
  const keyword = useDebouncedValue(searchText.trim(), 300);
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: ['accounts', keyword, page],
    queryFn: () => listAccounts(keyword, page),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ accountId, schedulable }: { accountId: number; schedulable: boolean }) =>
      setAccountSchedulable(accountId, schedulable),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const recoverMutation = useMutation({
    mutationFn: (accountId: number) => recoverAccountState(accountId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setRecoverNotice({ tone: 'success', title: '恢复状态', message: '账号状态已恢复。' });
    },
    onError: (error) => {
      setRecoverNotice({ tone: 'error', title: '恢复失败', message: error instanceof Error ? error.message : '账号状态恢复失败，请稍后重试。' });
    },
  });

  const items = accountsQuery.data?.items ?? [];
  const accountCostQueries = useQueries({
    queries: items.map((account) => ({
      queryKey: ['account-today-stats', account.id],
      queryFn: () => getAccountTodayStats(account.id),
      staleTime: 60_000,
    })),
  });

  const todayByAccountId = useMemo(() => {
    const next = new Map<number, AccountTodaySummary>();
    items.forEach((account, index) => {
      const result = accountCostQueries[index]?.data;
      const fromStatsCost = typeof result?.cost === 'number' && Number.isFinite(result.cost) ? result.cost : undefined;
      const fromExtra = typeof account.extra?.today_cost === 'number' ? account.extra.today_cost : undefined;
      const cost = fromStatsCost ?? fromExtra ?? 0;
      const requests = typeof result?.requests === 'number' && Number.isFinite(result.requests) ? result.requests : 0;
      const tokens = typeof result?.tokens === 'number' && Number.isFinite(result.tokens) ? result.tokens : 0;
      next.set(account.id, { requests, tokens, cost });
    });
    return next;
  }, [accountCostQueries, items]);

  const filteredItems = useMemo(() => {
    const statusMatched = items.filter((account) => {
      const visualStatus = getAccountVisualStatus(account);
      if (filter === 'all') return true;
      if (filter === 'active') return visualStatus.filterKey === 'active';
      if (filter === 'limited') return visualStatus.filterKey === 'limited';
      if (filter === 'paused') return visualStatus.filterKey === 'paused';
      if (filter === 'error') return visualStatus.filterKey === 'error';
      return true;
    });

    if (!usageSort) return statusMatched;

    const sorted = [...statusMatched].sort((left, right) => {
      const requestsLeft = todayByAccountId.get(left.id)?.requests ?? 0;
      const requestsRight = todayByAccountId.get(right.id)?.requests ?? 0;
      if (requestsLeft === requestsRight) {
        const tokensLeft = todayByAccountId.get(left.id)?.tokens ?? 0;
        const tokensRight = todayByAccountId.get(right.id)?.tokens ?? 0;
        return tokensLeft - tokensRight;
      }
      if (usageSort === 'usage-asc') return requestsLeft - requestsRight;
      return requestsRight - requestsLeft;
    });

    return sorted;
  }, [filter, items, todayByAccountId, usageSort]);
  const errorMessage = accountsQuery.error instanceof Error ? accountsQuery.error.message : '';
  const runRefresh = async () => { setRunningRefresh(true); try { await runConfiguredAccountRefresh(); await accountsQuery.refetch(); } finally { setRunningRefresh(false); } };

  const summary = useMemo(() => {
    const total = items.length;
    const errors = items.filter((item) => getAccountVisualStatus(item).filterKey === 'error').length;
    const limited = items.filter((item) => getAccountVisualStatus(item).filterKey === 'limited').length;
    const paused = items.filter((item) => getAccountVisualStatus(item).filterKey === 'paused').length;
    const active = items.filter((item) => getAccountVisualStatus(item).filterKey === 'active').length;
    return { total, active, limited, paused, errors };
  }, [items]);

  const listHeader = useMemo(
    () => (
      <View className="pb-2">
        <View className="mb-3 rounded-[22px] border border-[#DDE6F2] dark:border-[#273449] bg-white dark:bg-[#111827] p-4">
          <View className="flex-row items-center"><View className="h-9 w-9 items-center justify-center rounded-xl bg-[#EAF2FF] dark:bg-[#172C55]"><Clock3 size={17} color="#2F6DF6" /></View><View className="ml-3 flex-1"><Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">账号定时刷新</Text><Text className="mt-1 text-[10px] text-[#667085] dark:text-[#9EABC0]">{refreshConfig.enabled ? `每 ${refreshConfig.intervalMinutes < 60 ? `${refreshConfig.intervalMinutes} 分钟` : `${refreshConfig.intervalMinutes / 60} 小时`}刷新` : '已关闭'}</Text></View><Pressable onPress={() => updateAccountRefresh({ enabled: !refreshConfig.enabled })} className={`h-7 w-12 justify-center rounded-full px-1 ${refreshConfig.enabled ? 'bg-[#2F6DF6]' : 'bg-[#CBD5E1]'}`}><View className={`h-5 w-5 rounded-full bg-white dark:bg-[#111827] ${refreshConfig.enabled ? 'self-end' : 'self-start'}`} /></Pressable></View>
          <View className="mt-3 flex-row items-center gap-2"><View className="flex-1 flex-row flex-wrap gap-1">{[15, 30, 60, 180].map((minutes) => <Pressable key={minutes} onPress={() => updateAccountRefresh({ intervalMinutes: minutes })} className={`rounded-full px-2.5 py-1.5 ${refreshConfig.intervalMinutes === minutes ? 'bg-[#2F6DF6]' : 'bg-[#EEF3F9] dark:bg-[#1A2638]'}`}><Text className={`text-[9px] font-bold ${refreshConfig.intervalMinutes === minutes ? 'text-white' : 'text-[#607086] dark:text-[#AAB6C8]'}`}>{minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}</Text></Pressable>)}</View><Pressable disabled={runningRefresh} onPress={() => void runRefresh()} className="flex-row items-center gap-1 rounded-full bg-[#EAF2FF] dark:bg-[#172C55] px-3 py-2"><Play size={12} color="#2F6DF6" /><Text className="text-[9px] font-bold text-[#2F6DF6]">{runningRefresh ? '刷新中' : '立即刷新'}</Text></Pressable></View>
        </View>
        <View className="rounded-[20px] bg-[#FFFFFF] dark:bg-[#111827] p-2">
          <View className="flex-row items-center rounded-[14px] bg-[#F1F5FA] dark:bg-[#182235] px-3 py-1.5">
            <Search color="#6B778C" size={16} />
            <TextInput
              defaultValue=""
              onChangeText={(value) => { setSearchText(value); setPage(1); }}
              placeholder="搜索账号名称 / 平台"
              placeholderTextColor="#98A2B3"
              className="ml-2 flex-1 py-1 text-sm text-[#172033] dark:text-[#F4F7FB]"
            />
          </View>

          <View className="mt-3 flex-row flex-wrap gap-1.5">
            {([
              ['all', `全部 ${summary.total}`],
              ['active', `正常 ${summary.active}`],
              ['limited', `受限 ${summary.limited}`],
              ['paused', `停用 ${summary.paused}`],
              ['error', `异常 ${summary.errors}`],
            ] as const).map(([key, label]) => {
              const active = filter === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setFilter(key)}
                  className={active ? 'rounded-full bg-[#2F6DF6] px-2 py-1.5' : 'rounded-full bg-[#E2E9F3] dark:bg-[#273449] px-2 py-1.5'}
                >
                  <Text className={active ? 'text-[10px] font-semibold text-white' : 'text-[10px] font-semibold text-[#344054] dark:text-[#D5DDEA]'}>{label}</Text>
                </Pressable>
              );
            })}
            {([
              ['usage-desc', '请求高→低'],
              ['usage-asc', '请求低→高'],
            ] as const).map(([key, label]) => {
              const active = usageSort === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setUsageSort((current) => current === key ? null : key)}
                  className={active ? 'rounded-full bg-[#344054] px-2 py-1.5' : 'rounded-full bg-[#E2E9F3] px-2 py-1.5 dark:bg-[#273449]'}
                >
                  <Text className={active ? 'text-[10px] font-semibold text-white' : 'text-[10px] font-semibold text-[#344054] dark:text-[#D5DDEA]'}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    ),
    [filter, refreshConfig.enabled, refreshConfig.intervalMinutes, runningRefresh, summary.active, summary.errors, summary.limited, summary.paused, summary.total, usageSort]
  );

  const renderItem = useCallback(
    ({ item: account }: { item: (typeof filteredItems)[number] }) => {
      const isError = getAccountError(account);
      const visualStatus = getAccountVisualStatus(account);
      const statusText = visualStatus.label;
      const statusIconColor = visualStatus.filterKey === 'active' ? '#20B26B' : visualStatus.filterKey === 'limited' || visualStatus.filterKey === 'paused' ? '#E5A11A' : '#D9475C';
      const groupsText = account.groups?.map((group) => group.name).filter(Boolean).slice(0, 3).join(' · ');
      const todayStats = todayByAccountId.get(account.id) ?? { requests: 0, tokens: 0, cost: 0 };
      const nextSchedulable = visualStatus.filterKey === 'paused';
      const toggleLabel = nextSchedulable ? '启用' : '停用';
      const isTogglingCurrent = togglingAccountId === account.id && toggleMutation.isPending;
      const showRecover = visualStatus.filterKey !== 'active' && visualStatus.filterKey !== 'paused';
      const isRecoveringCurrent = recoveringAccountId === account.id && recoverMutation.isPending;

      return (
        <Pressable onPress={() => router.push(`/accounts/${account.id}`)}>
          <ListCard
            title={account.name}
            meta={`${account.platform} · ${account.type}`}
            badge={statusText}
            badgeTone={visualStatus.badgeTone}
            icon={KeyRound}
          >
            <View className="gap-3">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  {visualStatus.filterKey === 'active' ? <ShieldCheck color={statusIconColor} size={14} /> : <ShieldOff color={statusIconColor} size={14} />}
                  <Text className="text-sm text-[#6B778C] dark:text-[#9EABC0]">状态：{statusText}</Text>
                </View>
                <Text className="text-xs text-[#6B778C] dark:text-[#9EABC0]">最近使用 {formatTime(account.last_used_at || account.updated_at)}</Text>
              </View>

              {visualStatus.detail || visualStatus.code ? (
                <View className="flex-row flex-wrap items-center gap-2">
                  {visualStatus.detail ? <Text className={`text-[11px] ${visualStatus.filterKey === 'error' ? 'text-[#D9475C]' : 'text-[#B7791F] dark:text-[#F4C15D]'}`}>{visualStatus.detail}</Text> : null}
                  {visualStatus.code ? <View className={`flex-row items-center rounded-md px-2 py-1 ${visualStatus.code === '529' ? 'bg-[#FFF0F2] dark:bg-[#3A1720]' : 'bg-[#FFF4D6] dark:bg-[#422F12]'}`}><Text className={`text-[10px] font-semibold ${visualStatus.code === '529' ? 'text-[#D9475C]' : 'text-[#B7791F] dark:text-[#F4C15D]'}`}>⚠ {visualStatus.code}</Text></View> : null}
                </View>
              ) : null}

              <View className="flex-row gap-2">
                <View className="min-h-[68px] flex-1 justify-between rounded-[14px] bg-[#F1F5FA] dark:bg-[#182235] px-3 py-3">
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} className="text-[11px] text-[#6B778C] dark:text-[#9EABC0]">请求次数</Text>
                  <Text className="mt-1 text-sm font-bold text-[#172033] dark:text-[#F4F7FB]">{todayStats.requests}</Text>
                </View>
                <View className="min-h-[68px] flex-1 justify-between rounded-[14px] bg-[#F1F5FA] dark:bg-[#182235] px-3 py-3">
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} className="text-[11px] text-[#6B778C] dark:text-[#9EABC0]">消费金额</Text>
                  <Text className="mt-1 text-sm font-bold text-[#172033] dark:text-[#F4F7FB]">${todayStats.cost.toFixed(2)}</Text>
                </View>
                <View className="min-h-[68px] flex-1 justify-between rounded-[14px] bg-[#F1F5FA] dark:bg-[#182235] px-3 py-3">
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} className="text-[11px] text-[#6B778C] dark:text-[#9EABC0]">token消耗</Text>
                  <Text className="mt-1 text-sm font-bold text-[#172033] dark:text-[#F4F7FB]">{formatTokenValue(todayStats.tokens)}</Text>
                </View>
              </View>

              <Text className="text-xs text-[#6B778C] dark:text-[#9EABC0]">优先级 {account.priority ?? 0} · 倍率 {(account.rate_multiplier ?? 1).toFixed(2)}x</Text>

              {groupsText ? <Text className="text-xs text-[#6B778C] dark:text-[#9EABC0]">分组 {groupsText}</Text> : null}
              {isError && account.error_message && visualStatus.detail !== account.error_message ? <Text className="text-xs text-[#D9475C]">异常信息：{account.error_message}</Text> : null}

              <AccountQuotaPanel account={account} compact />

              <View className="flex-row gap-2">
                <Pressable
                  className="min-w-0 flex-1 items-center rounded-full bg-[#2F6DF6] px-2 py-2"
                  onPress={(event) => {
                    event.stopPropagation();
                    setTestAccountTarget(account);
                  }}
                >
                  <Text className="text-xs font-semibold uppercase tracking-[1.2px] text-[#FFFFFF]">测试连接</Text>
                </Pressable>
                <Pressable
                  className="min-w-0 flex-1 items-center rounded-full bg-[#E2E9F3] dark:bg-[#273449] px-2 py-2"
                  disabled={isTogglingCurrent}
                  onPress={(event) => {
                    event.stopPropagation();
                    setTogglingAccountId(account.id);
                    toggleMutation.mutate({
                      accountId: account.id,
                      schedulable: nextSchedulable,
                    }, {
                      onSettled: () => {
                        setTogglingAccountId((current) => (current === account.id ? null : current));
                      },
                    });
                  }}
                >
                  <Text className="text-xs font-semibold uppercase tracking-[1.2px] text-[#344054] dark:text-[#D5DDEA]">{isTogglingCurrent ? '处理中...' : toggleLabel}</Text>
                </Pressable>
                {showRecover ? (
                  <Pressable
                    className="min-w-0 flex-1 items-center rounded-full bg-[#FFF4D6] dark:bg-[#422F12] px-2 py-2"
                    disabled={isRecoveringCurrent}
                    onPress={(event) => {
                      event.stopPropagation();
                      setRecoveringAccountId(account.id);
                      recoverMutation.mutate(account.id, {
                        onSettled: () => setRecoveringAccountId((current) => (current === account.id ? null : current)),
                      });
                    }}
                  >
                    <Text className="text-xs font-semibold uppercase tracking-[1.2px] text-[#B7791F] dark:text-[#F4C15D]">{isRecoveringCurrent ? '恢复中...' : '恢复状态'}</Text>
                  </Pressable>
                ) : null}
              </View>

            </View>
          </ListCard>
        </Pressable>
      );
    },
    [recoverMutation, recoveringAccountId, todayByAccountId, toggleMutation, togglingAccountId]
  );

  const emptyState = useMemo(
    () => <ListCard title="暂无账号" meta={errorMessage || '连上后这里会展示账号列表。'} icon={KeyRound} />,
    [errorMessage]
  );

  return (
    <ScreenShell
      title="账号清单"
      subtitle="查看名称、平台&类型、请求次数、消费金额、token消耗，并支持筛选与排序。"
      right={(
        <Pressable onPress={() => router.push('/accounts/create')} className="rounded-full bg-[#2F6DF6] px-4 py-2">
          <Text className="text-xs font-semibold text-white">新增账号</Text>
        </Pressable>
      )}
      variant="minimal"
      scroll={false}
      safeAreaEdges={safeAreaEdges}
      bottomInsetClassName="pb-6"
      contentGapClassName="mt-2 gap-2"
    >
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }}
        data={filteredItems}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.id}`}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={accountsQuery.isRefetching} onRefresh={() => void accountsQuery.refetch()} tintColor="#2F6DF6" />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyState}
        ListFooterComponent={<View className="pt-4"><PaginationControls page={page} pages={accountsQuery.data?.pages ?? 1} total={accountsQuery.data?.total} onChange={setPage} /></View>}
        ItemSeparatorComponent={() => <View className="h-4" />}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
      />
      <AccountTestModal account={testAccountTarget} visible={Boolean(testAccountTarget)} onClose={() => setTestAccountTarget(null)} />
      <RecoverNoticeModal notice={recoverNotice} onClose={() => setRecoverNotice(null)} />
    </ScreenShell>
  );
}
