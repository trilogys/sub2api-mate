import type { PaginatedData } from '@/src/types/admin';

export type OpsTimeRange = '5m' | '30m' | '1h' | '6h' | '24h';
export type OpsQueryMode = 'auto' | 'raw' | 'preagg';

export type OpsQueryParams = {
  time_range?: OpsTimeRange;
  start_time?: string;
  end_time?: string;
  platform?: string;
  group_id?: number | null;
  mode?: OpsQueryMode;
};

export type OpsRateSummary = { current: number; peak: number; avg: number };
export type OpsPercentiles = {
  p50_ms?: number | null;
  p90_ms?: number | null;
  p95_ms?: number | null;
  p99_ms?: number | null;
  avg_ms?: number | null;
  max_ms?: number | null;
};

export type OpsSystemMetrics = {
  cpu_usage_percent?: number | null;
  memory_used_mb?: number | null;
  memory_total_mb?: number | null;
  memory_usage_percent?: number | null;
  db_ok?: boolean | null;
  redis_ok?: boolean | null;
  db_max_open_conns?: number | null;
  redis_pool_size?: number | null;
  redis_conn_total?: number | null;
  redis_conn_idle?: number | null;
  db_conn_active?: number | null;
  db_conn_idle?: number | null;
  db_conn_waiting?: number | null;
  goroutine_count?: number | null;
  concurrency_queue_depth?: number | null;
  account_switch_count?: number | null;
};

export type OpsJobHeartbeat = {
  job_name: string;
  last_run_at?: string | null;
  last_success_at?: string | null;
  last_error_at?: string | null;
  last_error?: string | null;
  last_duration_ms?: number | null;
  last_result?: string | null;
  updated_at: string;
};

export type OpsDashboardOverview = {
  start_time: string;
  end_time: string;
  platform: string;
  group_id?: number | null;
  health_score?: number;
  system_metrics?: OpsSystemMetrics | null;
  job_heartbeats?: OpsJobHeartbeat[] | null;
  success_count: number;
  error_count_total: number;
  business_limited_count: number;
  error_count_sla: number;
  request_count_total: number;
  request_count_sla: number;
  token_consumed: number;
  sla: number;
  error_rate: number;
  upstream_error_rate: number;
  upstream_error_count_excl_429_529: number;
  upstream_429_count: number;
  upstream_529_count: number;
  qps: OpsRateSummary;
  tps: OpsRateSummary;
  duration: OpsPercentiles;
  ttft: OpsPercentiles;
};

export type OpsThroughputPoint = {
  bucket_start: string;
  request_count: number;
  token_consumed: number;
  switch_count?: number;
  qps: number;
  tps: number;
};

export type OpsThroughputTrend = {
  bucket: string;
  points: OpsThroughputPoint[];
  by_platform?: Array<{ platform: string; request_count: number; token_consumed: number }>;
  top_groups?: Array<{ group_id: number; group_name: string; request_count: number; token_consumed: number }>;
};

export type OpsErrorTrend = {
  bucket: string;
  points: Array<{
    bucket_start: string;
    error_count_total: number;
    business_limited_count: number;
    error_count_sla: number;
    upstream_error_count_excl_429_529: number;
    upstream_429_count: number;
    upstream_529_count: number;
  }>;
};

export type OpsDashboardSnapshot = {
  generated_at: string;
  overview: OpsDashboardOverview;
  throughput_trend: OpsThroughputTrend;
  error_trend: OpsErrorTrend;
};

export type OpsLatencyHistogram = {
  total_requests: number;
  buckets: Array<{ range: string; count: number }>;
};

export type OpsErrorDistribution = {
  total: number;
  items: Array<{ status_code: number; total: number; sla: number; business_limited: number }>;
};

export type OpsConcurrencyEntry = {
  platform: string;
  current_in_use: number;
  max_capacity: number;
  load_percentage: number;
  waiting_in_queue: number;
  group_id?: number;
  group_name?: string;
  account_id?: number;
  account_name?: string;
};

export type OpsConcurrencyStats = {
  enabled: boolean;
  platform: Record<string, OpsConcurrencyEntry>;
  group: Record<string, OpsConcurrencyEntry>;
  account: Record<string, OpsConcurrencyEntry>;
  timestamp?: string;
};

export type OpsAvailabilityEntry = {
  platform: string;
  total_accounts: number;
  available_count: number;
  rate_limit_count: number;
  error_count: number;
  group_id?: number;
  group_name?: string;
};

export type OpsAccountAvailability = {
  enabled: boolean;
  platform: Record<string, OpsAvailabilityEntry>;
  group: Record<string, OpsAvailabilityEntry>;
  account: Record<string, {
    account_id: number;
    account_name: string;
    platform: string;
    status: string;
    is_available: boolean;
    is_rate_limited: boolean;
    rate_limit_remaining_sec?: number;
    has_error: boolean;
    error_message?: string;
  }>;
  timestamp?: string;
};

export type OpsRealtimeTraffic = {
  enabled: boolean;
  summary: {
    window: string;
    start_time: string;
    end_time: string;
    platform: string;
    group_id?: number | null;
    qps: OpsRateSummary;
    tps: OpsRateSummary;
  } | null;
  timestamp?: string;
};

export type OpsRequestDetail = {
  kind: 'success' | 'error';
  created_at: string;
  request_id: string;
  platform?: string;
  model?: string;
  duration_ms?: number | null;
  status_code?: number | null;
  error_id?: number | null;
  phase?: string;
  severity?: string;
  message?: string;
  user_id?: number | null;
  api_key_id?: number | null;
  account_id?: number | null;
  group_id?: number | null;
  stream?: boolean;
};

export type OpsRequestDetailsResponse = PaginatedData<OpsRequestDetail>;

export type OpsOpenAITokenStats = {
  items: Array<{
    model: string;
    request_count: number;
    avg_tokens_per_sec?: number | null;
    avg_first_token_ms?: number | null;
    total_output_tokens: number;
    avg_duration_ms: number;
  }>;
  total: number;
};

export type OpsAdvancedSettings = {
  data_retention: Record<string, unknown>;
  aggregation: Record<string, unknown>;
  openai_account_quota_auto_pause: Record<string, unknown>;
  ignore_count_tokens_errors: boolean;
  ignore_context_canceled: boolean;
  ignore_no_available_accounts: boolean;
  ignore_invalid_api_key_errors: boolean;
  ignore_insufficient_balance_errors: boolean;
  display_openai_token_stats: boolean;
  display_alert_events: boolean;
  auto_refresh_enabled: boolean;
  auto_refresh_interval_seconds: number;
};

export type OpsMetricThresholds = {
  sla_percent_min?: number | null;
  ttft_p99_ms_max?: number | null;
  request_error_rate_percent_max?: number | null;
  upstream_error_rate_percent_max?: number | null;
};

export type OpsSystemLogHealth = {
  queue_depth: number;
  queue_capacity: number;
  dropped_count: number;
  write_failed_count: number;
  written_count: number;
  avg_write_delay_ms: number;
  last_error?: string;
};
