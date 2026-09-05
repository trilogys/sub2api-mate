import type { CLIProxyQuotaReport, CLIProxyQuotaWindow } from '@/src/types/cliproxy';

export function cliProxyQuotaMinimum(report: Pick<CLIProxyQuotaReport, 'windows'>) {
  const values = report.windows.flatMap((window) => window.remainingPercent === null ? [] : [window.remainingPercent]);
  return values.length ? Math.min(...values) : undefined;
}

export function cliProxyQuotaColor(remaining?: number | null, status?: CLIProxyQuotaReport['status']) {
  if (status === 'error' || status === 'exhausted' || (remaining !== undefined && remaining !== null && remaining <= 20)) return '#D9475C';
  if (status === 'unknown' || remaining === undefined || remaining === null) return '#7B8798';
  if (remaining <= 50) return '#D98A16';
  if (remaining <= 80) return '#D4A017';
  return '#1C9B62';
}

export function cliProxyQuotaStatusLabel(status: CLIProxyQuotaReport['status']) {
  const labels: Record<CLIProxyQuotaReport['status'], string> = {
    full: '充足',
    high: '较高',
    medium: '中等',
    low: '偏低',
    exhausted: '已耗尽',
    unknown: '未知',
    error: '错误',
  };
  return labels[status];
}

export function cliProxyQuotaWindowColor(window: CLIProxyQuotaWindow) {
  return cliProxyQuotaColor(window.remainingPercent, window.exhausted ? 'exhausted' : undefined);
}
