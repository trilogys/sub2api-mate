import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, View } from 'react-native';

import { getAccountUsage, queryOpenAIQuota, resetOpenAIQuota } from '@/src/services/admin';
import type { AccountUsageProgress, AdminAccount } from '@/src/types/admin';
import { Text, localizedAlert } from '@/src/components/localized-text';

function formatReset(value: string | null) {
  if (!value) return '未知';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function QuotaRow({ label, value }: { label: string; value: AccountUsageProgress }) {
  const used = Math.max(0, Math.min(100, Number(value.utilization) || 0));
  const remaining = Math.max(0, 100 - used);
  const remainingRequests = value.limit_requests != null && value.used_requests != null
    ? Math.max(0, value.limit_requests - value.used_requests)
    : null;

  return (
    <View className="gap-2 rounded-2xl bg-[#F6F8FC] dark:bg-[#152033] p-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-xs font-bold text-[#344054] dark:text-[#D5DDEA]">{label}</Text>
        <Text className="text-xs font-semibold tabular-nums text-[#2F6DF6]">剩余 {remaining.toFixed(1)}%</Text>
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-[#DCE6F5]">
        <View style={{ width: `${used}%`, height: '100%', borderRadius: 999, backgroundColor: '#2F6DF6' }} />
      </View>
      <View className="flex-row flex-wrap justify-between gap-x-3 gap-y-1">
        <Text className="text-[11px] text-[#7C8AA0] dark:text-[#9EABC0]">已用 {used.toFixed(1)}%</Text>
        {remainingRequests != null ? <Text className="text-[11px] text-[#7C8AA0] dark:text-[#9EABC0]">剩余请求 {remainingRequests}</Text> : null}
        <Text className="text-[11px] text-[#7C8AA0] dark:text-[#9EABC0]">重置 {formatReset(value.resets_at)}</Text>
      </View>
    </View>
  );
}

export function AccountQuotaPanel({ account, compact = false, autoQueryCredits = false }: {
  account: AdminAccount;
  compact?: boolean;
  autoQueryCredits?: boolean;
}) {
  const queryClient = useQueryClient();
  const supportsUsage = (
    (account.platform === 'anthropic' && ['oauth', 'setup-token'].includes(account.type)) ||
    (account.platform === 'openai' && account.type === 'oauth')
  );
  const isOpenAIOAuth = account.platform === 'openai' && account.type === 'oauth';

  const usageQuery = useQuery({
    queryKey: ['account-usage', account.id],
    queryFn: () => getAccountUsage(account.id, account.platform === 'anthropic' ? 'passive' : undefined),
    enabled: supportsUsage,
    staleTime: 60_000,
    retry: false,
  });
  const creditsQuery = useQuery({
    queryKey: ['openai-quota-credits', account.id],
    queryFn: () => queryOpenAIQuota(account.id),
    enabled: isOpenAIOAuth && autoQueryCredits,
    staleTime: 60_000,
    retry: false,
  });
  const refreshUsageMutation = useMutation({
    mutationFn: () => getAccountUsage(account.id, 'active', true),
    onSuccess: (usage) => {
      queryClient.setQueryData(['account-usage', account.id], usage);
    },
  });
  const resetMutation = useMutation({
    mutationFn: () => resetOpenAIQuota(account.id),
    onSuccess: async () => {
      await Promise.all([
        creditsQuery.refetch(),
        usageQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
      ]);
    },
  });

  if (!supportsUsage && !isOpenAIOAuth) return null;
  const count = creditsQuery.data?.rate_limit_reset_credits?.available_count ?? 0;
  const canReset = Boolean(creditsQuery.data) && count > 0 && account.parent_account_id == null;
  const windows = [
    ['5h', usageQuery.data?.five_hour],
    ['7d', usageQuery.data?.seven_day],
    ['7d Sonnet', usageQuery.data?.seven_day_sonnet],
    ['7d Fable', usageQuery.data?.seven_day_fable],
  ] as const;
  const hasWindow = windows.some(([, value]) => Boolean(value));

  const content = (
    <View className="gap-3">
      {hasWindow ? windows.map(([label, value]) => value ? <QuotaRow key={label} label={label} value={value} /> : null) : null}
      {usageQuery.isLoading ? <Text className="text-xs text-[#7C8AA0] dark:text-[#9EABC0]">正在读取 5h / 7d 额度…</Text> : null}
      {usageQuery.data?.error ? <Text className="text-xs text-[#D88A21]">{usageQuery.data.error}</Text> : null}
      {usageQuery.isError ? <Text className="text-xs text-[#D9475C]">{(usageQuery.error as Error).message}</Text> : null}
      {refreshUsageMutation.isError ? <Text className="text-xs text-[#D9475C]">{(refreshUsageMutation.error as Error).message}</Text> : null}
      {!usageQuery.isLoading && !hasWindow && !usageQuery.isError ? <Text className="text-xs text-[#7C8AA0] dark:text-[#9EABC0]">服务端暂未返回 5h / 7d 窗口数据。</Text> : null}

      <View className="flex-row flex-wrap gap-2">
        <Pressable disabled={refreshUsageMutation.isPending} onPress={(event) => { event.stopPropagation(); refreshUsageMutation.mutate(); }} className="rounded-xl bg-[#EAF2FF] dark:bg-[#172C55] px-3 py-2.5 disabled:opacity-50">
          <Text className="text-xs font-bold text-[#2459C4]">{refreshUsageMutation.isPending ? '刷新中…' : '刷新额度'}</Text>
        </Pressable>
        {isOpenAIOAuth ? (
          <>
            <Pressable disabled={creditsQuery.isFetching || resetMutation.isPending} onPress={(event) => { event.stopPropagation(); void creditsQuery.refetch(); }} className="rounded-xl bg-[#EAF2FF] dark:bg-[#172C55] px-3 py-2.5 disabled:opacity-50">
              <Text className="text-xs font-bold text-[#2459C4]">{creditsQuery.isFetching ? '查询中…' : '查询重置'}</Text>
            </Pressable>
            <Pressable
              disabled={!canReset || resetMutation.isPending}
              onPress={(event) => {
                event.stopPropagation();
                localizedAlert('重置 OpenAI 额度', `当前可用 ${count} 次，执行后会消耗 1 次。`, [
                  { text: '取消', style: 'cancel' },
                  { text: '确认重置', style: 'destructive', onPress: () => resetMutation.mutate() },
                ]);
              }}
              className="rounded-xl bg-[#FFF0F2] dark:bg-[#3A1720] px-3 py-2.5 disabled:opacity-40"
            >
              <Text className="text-xs font-bold text-[#D9475C]">{resetMutation.isPending ? '重置中…' : '重置额度'}</Text>
            </Pressable>
          </>
        ) : null}
      </View>
      {isOpenAIOAuth && creditsQuery.data && count > 0 ? <Text className="text-[11px] text-[#7C8AA0] dark:text-[#9EABC0]"><Text>可用次数：</Text>{count}</Text> : null}
      {isOpenAIOAuth && creditsQuery.data && count <= 0 ? <Text className="text-[11px] text-[#7C8AA0] dark:text-[#9EABC0]">当前没有可用次数，已禁用重置。</Text> : null}
      {account.parent_account_id != null ? <Text className="text-[11px] text-[#7C8AA0] dark:text-[#9EABC0]">影子账号不能重置，请在母账号上操作。</Text> : null}
      {creditsQuery.error ? <Text className="text-xs text-[#D9475C]">{(creditsQuery.error as Error).message}</Text> : null}
      {resetMutation.data ? <Text className="text-xs text-[#16794B]">重置成功，已重置 {resetMutation.data.windows_reset} 个窗口。</Text> : null}
      {resetMutation.error ? <Text className="text-xs text-[#D9475C]">{(resetMutation.error as Error).message}</Text> : null}
    </View>
  );

  if (compact) return content;
  return (
    <View className="gap-3 rounded-[22px] border border-[#E2E9F3] dark:border-[#273449] bg-white dark:bg-[#111827] p-4">
      <View>
        <Text className="text-base font-bold text-[#172033] dark:text-[#F4F7FB]">额度窗口</Text>
        <Text className="mt-1 text-xs leading-5 text-[#6B778C] dark:text-[#9EABC0]">显示 5h / 7d 已用与剩余；OpenAI 重置前必须先取得可用次数。</Text>
      </View>
      {content}
    </View>
  );
}
