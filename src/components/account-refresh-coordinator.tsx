import { useEffect } from 'react';

import { queryClient } from '@/src/lib/query-client';
import { getAccountUsage } from '@/src/services/admin';
import { hydrateAccountRefresh, updateAccountRefresh } from '@/src/store/account-refresh';

async function refreshActiveAccountUsage() {
  const activeUsageQueries = queryClient.getQueryCache().findAll({
    queryKey: ['account-usage'],
    type: 'active',
  });
  const accountIds = [...new Set(activeUsageQueries
    .map((query) => query.queryKey[1])
    .filter((accountId): accountId is number => typeof accountId === 'number'))];

  const results = await Promise.allSettled(accountIds.map(async (accountId) => {
    const usage = await getAccountUsage(accountId, 'active', true);
    queryClient.setQueryData(['account-usage', accountId], usage);
    if (usage.error) throw new Error(usage.error);
  }));
  const failed = results.filter((result) => result.status === 'rejected').length;
  if (failed) throw new Error(`${failed} 个账号额度刷新失败`);
}

export async function runConfiguredAccountRefresh() {
  await Promise.all([
    queryClient.refetchQueries({ queryKey: ['accounts'], type: 'active' }, { throwOnError: true }),
    queryClient.refetchQueries({ queryKey: ['account-today-stats'], type: 'active' }, { throwOnError: true }),
    refreshActiveAccountUsage(),
  ]);
  await updateAccountRefresh({
    lastRunAt: new Date().toISOString(),
    lastMessage: '账号列表、今日统计与实时额度已刷新',
  });
}

export function AccountRefreshCoordinator() {
  useEffect(() => {
    void hydrateAccountRefresh();
  }, []);
  return null;
}
