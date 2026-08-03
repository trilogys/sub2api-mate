const forcedAccountIds = new Set<number>();

export function forceEnableAccountQuota(accountId: number) {
  forcedAccountIds.add(accountId);
}

export function clearAccountQuotaOverride(accountId: number) {
  forcedAccountIds.delete(accountId);
}

export function isAccountQuotaForceEnabled(accountId: number) {
  return forcedAccountIds.has(accountId);
}
