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

export type CLIProxyOAuthProvider = 'anthropic' | 'codex' | 'antigravity' | 'kimi' | 'xai';

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
  metadata?: {
    name?: string;
    version?: string;
    author?: string;
  } | null;
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
