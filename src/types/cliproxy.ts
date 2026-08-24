export type CLIProxyConnection = {
  baseUrl: string;
  managementKey: string;
};

export type CLIProxyRequestBucket = {
  time: string;
  success: number;
  failed: number;
};

export type CLIProxyAuthFile = {
  id?: string;
  auth_index?: string;
  name: string;
  provider?: string;
  type?: string;
  label?: string;
  status?: string;
  status_message?: string;
  disabled?: boolean;
  unavailable?: boolean;
  runtime_only?: boolean;
  source?: 'file' | 'memory' | string;
  size?: number;
  modtime?: string;
  success?: number;
  failed?: number;
  recent_requests?: CLIProxyRequestBucket[];
  email?: string;
  account_type?: string;
  account?: string;
  plan_type?: string;
  tier?: string;
  created_at?: string;
  updated_at?: string;
  last_refresh?: string;
  next_retry_after?: string;
  project_id?: string;
  priority?: number;
  weight?: number;
  note?: string;
  request_retry?: number;
  id_token?: Record<string, unknown>;
};

export type CLIProxyOAuthProvider = 'anthropic' | 'codex' | 'gemini-cli' | 'antigravity' | 'kimi' | 'xai';

export type CLIProxyOAuthSession = {
  status: 'ok' | 'wait' | 'error' | string;
  url: string;
  state: string;
  flow?: 'device' | string;
  user_code?: string;
  expires_in?: number;
  error?: string;
};

export type CLIProxyOAuthStatus = {
  status: 'ok' | 'wait' | 'error' | string;
  error?: string;
};

export type CLIProxyModel = {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
  [key: string]: unknown;
};

export type CLIProxyConnectionTest = {
  credentialCount: number;
  availableCredentialCount: number;
  apiKeyCount: number;
};

export type CLIProxyQuotaWindow = {
  id: string;
  label: string;
  remainingPercent: number | null;
  usedPercent?: number | null;
  resetAt?: string;
  exhausted: boolean;
};

export type CLIProxyQuotaReport = {
  provider: 'codex' | 'gemini-cli' | 'antigravity';
  name: string;
  authIndex: string;
  planType?: string;
  status: 'full' | 'high' | 'medium' | 'low' | 'exhausted' | 'unknown' | 'error';
  windows: CLIProxyQuotaWindow[];
  fetchedAt: string;
  error?: string;
};

export type CLIProxyPluginEntry = {
  id: string;
  path?: string;
  configured?: boolean;
  registered?: boolean;
  enabled?: boolean;
  effective_enabled?: boolean;
  supports_oauth?: boolean;
  oauth_provider?: string;
  logo?: string;
  config_fields?: CLIProxyPluginConfigField[];
  menus?: CLIProxyPluginMenu[];
  metadata?: {
    name?: string;
    version?: string;
    author?: string;
    github_repository?: string;
    logo?: string;
    config_fields?: CLIProxyPluginConfigField[];
    menus?: CLIProxyPluginMenu[];
  } | null;
};

export type CLIProxyPluginConfigField = {
  name: string;
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'enum' | 'array' | 'object' | string;
  enum_values?: string[];
  description?: string;
};

export type CLIProxyPluginMenu = {
  id?: string;
  name?: string;
  title?: string;
  label?: string;
  path?: string;
  url?: string;
  href?: string;
  type?: string;
};

export type CLIProxyPluginList = {
  plugins_enabled: boolean;
  plugins_dir: string;
  plugins: CLIProxyPluginEntry[];
};

export type CLIProxyGroupStrategy = 'round-robin' | 'fill-first';

export type CLIProxyGroup = {
  id: string;
  name: string;
  enabled: boolean;
  strategy: CLIProxyGroupStrategy;
  api_keys: string[];
  auth_ids: string[];
};

export type CLIProxyGroupRouterConfig = {
  enabled: boolean;
  deny_unmapped: boolean;
  allow_shared_auths: boolean;
  groups: CLIProxyGroup[];
};

export type CLIProxyRuntimeConfig = Record<string, unknown> & {
  debug?: boolean;
  'proxy-url'?: string;
  'request-retry'?: number;
  'max-retry-interval'?: number;
  'request-log'?: boolean;
  'logging-to-file'?: boolean;
  'usage-statistics-enabled'?: boolean;
  'ws-auth'?: boolean;
  'force-model-prefix'?: boolean;
  'logs-max-total-size-mb'?: number;
  'error-logs-max-files'?: number;
  routing?: { strategy?: CLIProxyGroupStrategy };
  'quota-exceeded'?: {
    'switch-project'?: boolean;
    'switch-preview-model'?: boolean;
  };
};

export type CLIProxyLogResult = {
  lines: string[];
  lineCount: number;
  latestTimestamp: number;
  nextCursor?: string;
  cursorReset?: boolean;
};

export type CLIProxyRequestErrorLog = {
  name: string;
  size: number;
  modified: number;
};

export type CLIProxyAPIKeyUsageEntry = {
  provider: string;
  identity: string;
  baseUrl: string;
  maskedKey: string;
  success: number;
  failed: number;
  recentRequests: CLIProxyRequestBucket[];
};

export type CLIProxyPluginStoreEntry = {
  store_id: string;
  source_id: string;
  source_name?: string;
  id: string;
  name: string;
  description?: string;
  author?: string;
  version?: string;
  installed?: boolean;
  installed_version?: string;
  enabled?: boolean;
  effective_enabled?: boolean;
  update_available?: boolean;
  auth_required?: boolean;
  auth_configured?: boolean;
};

export type CLIProxyPluginStore = {
  plugins_enabled: boolean;
  plugins_dir: string;
  sources: Array<{ id: string; name?: string; url?: string; error?: string }>;
  plugins: CLIProxyPluginStoreEntry[];
};

export type CLIProxyKeyPolicyAliasTarget = {
  provider: string;
  target_model: string;
  group?: string;
};

export type CLIProxyKeyPolicyAlias = {
  alias: string;
  targets: CLIProxyKeyPolicyAliasTarget[];
  dispatch: 'round-robin' | 'priority';
  billing_mode: 'tokens' | 'per_call';
  input_price_per_million?: number;
  output_price_per_million?: number;
  cache_read_price_per_million?: number;
  per_call_usd?: number;
};

export type CLIProxyKeyPolicyAliasRef = {
  alias: string;
  input_price_per_million?: number | null;
  output_price_per_million?: number | null;
  cache_read_price_per_million?: number | null;
  per_call_usd?: number | null;
};

export type CLIProxyKeyPolicyUsageSummary = {
  daily_usd: number;
  weekly_usd: number;
  daily_limit_usd: number;
  weekly_limit_usd: number;
  daily_reset_at?: string;
  weekly_reset_at?: string;
  daily_call_count?: number;
  weekly_call_count?: number;
};

export type CLIProxyKeyPolicyKey = {
  id: string;
  name: string;
  enabled: boolean;
  key_preview: string;
  rpm: number;
  aliases: CLIProxyKeyPolicyAliasRef[];
  daily_limit_usd: number;
  weekly_limit_usd: number;
  allow_models_endpoint?: boolean;
  usage: CLIProxyKeyPolicyUsageSummary;
  created_at?: string;
  updated_at?: string;
};

export type CLIProxyKeyPolicyKeyWrite = {
  id: string;
  name?: string;
  enabled?: boolean;
  key?: string;
  rpm?: number;
  aliases?: CLIProxyKeyPolicyAliasRef[];
  daily_limit_usd?: number;
  weekly_limit_usd?: number;
  allow_models_endpoint?: boolean;
};

export type CLIProxyKeyPolicyKeySecret = {
  key: CLIProxyKeyPolicyKey;
  plain_key: string;
  generated: boolean;
};

export type CLIProxyKeyPolicyClassifyRule = {
  name: string;
  field: string;
  pattern: string;
  group: string;
  enabled: boolean;
};

export type CLIProxyKeyPolicyPreview = {
  groups: Record<string, string[]>;
  group_counts: Record<string, number>;
};

export type CLIProxyKeyPolicyCatalogEntry = {
  provider: string;
  group?: string;
  models: string[];
};

export type CLIProxyKeyPolicyUsageWindow = {
  total_usd: number;
  window_start?: string;
  cache_read_tokens?: number;
  cache_cost_usd?: number;
  input_tokens?: number;
  output_tokens?: number;
  call_count?: number;
};

export type CLIProxyKeyPolicyAliasUsage = {
  alias: string;
  provider?: string;
  target_model?: string;
  billing_mode?: 'tokens' | 'per_call';
  per_call_usd?: number;
  in_config: boolean;
  daily: CLIProxyKeyPolicyUsageWindow;
  weekly: CLIProxyKeyPolicyUsageWindow;
};

export type CLIProxyKeyPolicyKeyUsage = {
  key_id: string;
  key_name: string;
  daily_limit_usd: number;
  weekly_limit_usd: number;
  aliases: CLIProxyKeyPolicyAliasUsage[];
};

export type CLIProxyKeyPolicyStatus = {
  enabled: boolean;
  state_file: string;
  key_count: number;
  rpm_usage?: Record<string, unknown>;
};
