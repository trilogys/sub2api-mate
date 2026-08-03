import { adminFetch } from '@/src/lib/admin-fetch';
import type { PaginatedData } from '@/src/types/admin';
import type {
  OpsAccountAvailability,
  OpsAdvancedSettings,
  OpsConcurrencyStats,
  OpsDashboardOverview,
  OpsDashboardSnapshot,
  OpsErrorDistribution,
  OpsErrorTrend,
  OpsLatencyHistogram,
  OpsMetricThresholds,
  OpsOpenAITokenStats,
  OpsQueryParams,
  OpsRealtimeTraffic,
  OpsRequestDetailsResponse,
  OpsSystemLogHealth,
  OpsThroughputTrend,
} from '@/src/types/ops';
import type { OpsAlertEvent, OpsSystemLog } from '@/src/types/admin';

function query(params: Record<string, unknown>) {
  const values = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return values.length ? `?${values.join('&')}` : '';
}

export function getOpsSnapshot(params: OpsQueryParams) {
  return adminFetch<OpsDashboardSnapshot>(`/api/v1/admin/ops/dashboard/snapshot-v2${query(params)}`);
}

export function getOpsOverview(params: OpsQueryParams) {
  return adminFetch<OpsDashboardOverview>(`/api/v1/admin/ops/dashboard/overview${query(params)}`);
}

export function getOpsThroughputTrend(params: OpsQueryParams) {
  return adminFetch<OpsThroughputTrend>(`/api/v1/admin/ops/dashboard/throughput-trend${query(params)}`);
}

export function getOpsErrorTrend(params: OpsQueryParams) {
  return adminFetch<OpsErrorTrend>(`/api/v1/admin/ops/dashboard/error-trend${query(params)}`);
}

export function getOpsLatencyHistogram(params: OpsQueryParams) {
  return adminFetch<OpsLatencyHistogram>(`/api/v1/admin/ops/dashboard/latency-histogram${query(params)}`);
}

export function getOpsErrorDistribution(params: OpsQueryParams) {
  return adminFetch<OpsErrorDistribution>(`/api/v1/admin/ops/dashboard/error-distribution${query(params)}`);
}

export function getOpsConcurrency(params: Pick<OpsQueryParams, 'platform' | 'group_id'>) {
  return adminFetch<OpsConcurrencyStats>(`/api/v1/admin/ops/concurrency${query(params)}`);
}

export function getOpsAccountAvailability(params: Pick<OpsQueryParams, 'platform' | 'group_id'>) {
  return adminFetch<OpsAccountAvailability>(`/api/v1/admin/ops/account-availability${query(params)}`);
}

export function getOpsRealtimeTraffic(params: Pick<OpsQueryParams, 'platform' | 'group_id'> & { window: string }) {
  return adminFetch<OpsRealtimeTraffic>(`/api/v1/admin/ops/realtime-traffic${query(params)}`);
}

export function getOpsOpenAITokenStats(params: Pick<OpsQueryParams, 'platform' | 'group_id'> & { time_range: string; page?: number; page_size?: number }) {
  return adminFetch<OpsOpenAITokenStats>(`/api/v1/admin/ops/dashboard/openai-token-stats${query(params)}`);
}

export function listOpsRequests(params: Pick<OpsQueryParams, 'time_range' | 'start_time' | 'end_time' | 'platform' | 'group_id'> & {
  kind?: 'all' | 'success' | 'error';
  q?: string;
  page?: number;
  page_size?: number;
  sort?: 'created_at_desc' | 'duration_desc';
}) {
  return adminFetch<OpsRequestDetailsResponse>(`/api/v1/admin/ops/requests${query(params)}`);
}

export function listOfficialOpsAlertEvents(params: Pick<OpsQueryParams, 'time_range' | 'start_time' | 'end_time' | 'platform' | 'group_id'> & { limit?: number; status?: string }) {
  return adminFetch<OpsAlertEvent[]>(`/api/v1/admin/ops/alert-events${query(params)}`);
}

export function updateOfficialOpsAlertEventStatus(id: number, status: 'resolved' | 'manual_resolved') {
  return adminFetch<void>(`/api/v1/admin/ops/alert-events/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
}

export function listOfficialOpsSystemLogs(params: Pick<OpsQueryParams, 'time_range' | 'start_time' | 'end_time' | 'platform'> & {
  page?: number;
  page_size?: number;
  q?: string;
  level?: string;
}) {
  return adminFetch<PaginatedData<OpsSystemLog>>(`/api/v1/admin/ops/system-logs${query(params)}`);
}

export function getOpsSystemLogHealth() {
  return adminFetch<OpsSystemLogHealth>('/api/v1/admin/ops/system-logs/health');
}

export function getOpsAdvancedSettings() {
  return adminFetch<OpsAdvancedSettings>('/api/v1/admin/ops/advanced-settings');
}

export function updateOpsAdvancedSettings(settings: OpsAdvancedSettings) {
  return adminFetch<OpsAdvancedSettings>('/api/v1/admin/ops/advanced-settings', { method: 'PUT', body: JSON.stringify(settings) });
}

export function getOpsMetricThresholds() {
  return adminFetch<OpsMetricThresholds>('/api/v1/admin/ops/settings/metric-thresholds');
}

export function updateOpsMetricThresholds(settings: OpsMetricThresholds) {
  return adminFetch<void>('/api/v1/admin/ops/settings/metric-thresholds', { method: 'PUT', body: JSON.stringify(settings) });
}
