import { fetchWithWebProxy } from '@/src/lib/admin-fetch';
import type {
  CLIProxyAuthFile,
  CLIProxyAPIKeyUsageEntry,
  CLIProxyConnection,
  CLIProxyConnectionTest,
  CLIProxyGroupRouterConfig,
  CLIProxyGroupStrategy,
  CLIProxyLogResult,
  CLIProxyModel,
  CLIProxyOAuthProvider,
  CLIProxyOAuthSession,
  CLIProxyOAuthStatus,
  CLIProxyPluginList,
  CLIProxyPluginStore,
  CLIProxyQuotaReport,
  CLIProxyQuotaWindow,
  CLIProxyRequestErrorLog,
  CLIProxyRuntimeConfig,
} from '@/src/types/cliproxy';

export const CLIPROXY_GROUP_ROUTER_PLUGIN_ID = 'cliproxy-group-router';

type ErrorPayload = {
  error?: string;
  message?: string;
  detail?: string;
  reason?: string;
};

export function normalizeCLIProxyBaseUrl(value: string) {
  return value
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/management\.html$/i, '')
    .replace(/\/v0\/management$/i, '')
    .replace(/\/v1$/i, '');
}

export function getCLIProxyOpenAIBaseUrl(value: string) {
  const baseUrl = normalizeCLIProxyBaseUrl(value);
  return baseUrl ? `${baseUrl}/v1` : '';
}

function validateConnection(connection: CLIProxyConnection) {
  const baseUrl = normalizeCLIProxyBaseUrl(connection.baseUrl);
  const managementKey = connection.managementKey.trim();
  if (!baseUrl) throw new Error('CLIPROXY_BASE_URL_REQUIRED');
  if (!managementKey) throw new Error('CLIPROXY_MANAGEMENT_KEY_REQUIRED');
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('CLIPROXY_BASE_URL_INVALID');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('CLIPROXY_BASE_URL_INVALID');
  return { baseUrl, managementKey };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    if (!response.ok) throw new Error(`CLIPROXY_REQUEST_FAILED_${response.status}`);
    throw new Error('CLIPROXY_INVALID_SERVER_RESPONSE');
  }

  if (!response.ok) {
    const error = payload && typeof payload === 'object' ? payload as ErrorPayload : undefined;
    throw new Error(error?.reason || error?.message || error?.error || error?.detail || `CLIPROXY_REQUEST_FAILED_${response.status}`);
  }
  return payload as T;
}

async function managementResponse(connection: CLIProxyConnection, path: string, init: RequestInit = {}) {
  const validated = validateConnection(connection);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${validated.managementKey}`);
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (init.body && !isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetchWithWebProxy(`${validated.baseUrl}/v0/management${normalizedPath}`, { ...init, headers });
}

async function managementFetch<T>(connection: CLIProxyConnection, path: string, init: RequestInit = {}) {
  const response = await managementResponse(connection, path, init);
  return parseResponse<T>(response);
}

async function managementTextFetch(connection: CLIProxyConnection, path: string, init: RequestInit = {}) {
  const response = await managementResponse(connection, path, init);
  if (!response.ok) return parseResponse<never>(response);
  return response.text();
}

export async function listCLIProxyAuthFiles(connection: CLIProxyConnection) {
  const payload = await managementFetch<{ files?: CLIProxyAuthFile[] }>(connection, '/auth-files');
  return Array.isArray(payload.files) ? payload.files : [];
}

export function uploadCLIProxyAuthFile(connection: CLIProxyConnection, name: string, json: string) {
  const normalizedName = name.trim();
  if (!normalizedName.toLowerCase().endsWith('.json')) throw new Error('凭据文件名必须以 .json 结尾。');
  try {
    JSON.parse(json);
  } catch {
    throw new Error('凭据文件不是有效 JSON。');
  }
  return managementFetch<{ status: string }>(connection, `/auth-files?name=${encodeURIComponent(normalizedName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json,
  });
}

export function importCLIProxyVertexCredential(
  connection: CLIProxyConnection,
  file: Blob | { uri: string; name: string; type: string },
  location = 'us-central1',
) {
  const form = new FormData();
  form.append('file', file as Blob);
  form.append('location', location.trim() || 'us-central1');
  return managementFetch<{ status: string; 'auth-file'?: string; project_id?: string; email?: string; location?: string }>(connection, '/vertex/import', {
    method: 'POST',
    body: form,
  });
}

export function downloadCLIProxyAuthFile(connection: CLIProxyConnection, name: string) {
  return managementTextFetch(connection, `/auth-files/download?name=${encodeURIComponent(name)}`);
}

export function deleteCLIProxyAuthFile(connection: CLIProxyConnection, name: string) {
  return managementFetch<{ status: string }>(connection, `/auth-files?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
}

export async function listCLIProxyAuthFileModels(connection: CLIProxyConnection, nameOrID: string) {
  const payload = await managementFetch<{ models?: CLIProxyModel[] }>(connection, `/auth-files/models?name=${encodeURIComponent(nameOrID)}`);
  return Array.isArray(payload.models) ? payload.models : [];
}

export async function getCLIProxyAPIKeys(connection: CLIProxyConnection) {
  const payload = await managementFetch<{ 'api-keys'?: string[] }>(connection, '/api-keys');
  return Array.isArray(payload['api-keys']) ? payload['api-keys'].filter((key) => typeof key === 'string') : [];
}

export function putCLIProxyAPIKeys(connection: CLIProxyConnection, keys: string[]) {
  const normalizedKeys = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
  return managementFetch<{ status: string }>(connection, '/api-keys', {
    method: 'PUT',
    body: JSON.stringify(normalizedKeys),
  });
}

export async function getCLIProxyAPIKeyUsage(connection: CLIProxyConnection) {
  const payload = await managementFetch<Record<string, unknown>>(connection, '/api-key-usage');
  const entries: CLIProxyAPIKeyUsageEntry[] = [];
  for (const [provider, providerValue] of Object.entries(payload)) {
    const providerEntries = record(providerValue);
    if (!providerEntries) continue;
    for (const [identity, rawValue] of Object.entries(providerEntries)) {
      const value = record(rawValue);
      if (!value) continue;
      const separator = identity.lastIndexOf('|');
      const baseUrl = separator >= 0 ? identity.slice(0, separator) : '';
      const key = separator >= 0 ? identity.slice(separator + 1) : identity;
      const recentRequests = Array.isArray(value.recent_requests) ? value.recent_requests.flatMap((item) => {
        const bucket = record(item);
        if (!bucket) return [];
        return [{ time: stringValue(bucket.time), success: numberValue(bucket.success) ?? 0, failed: numberValue(bucket.failed) ?? 0 }];
      }) : [];
      entries.push({
        provider,
        identity,
        baseUrl,
        maskedKey: key.length > 10 ? `${key.slice(0, 5)}••••${key.slice(-4)}` : `${key.slice(0, 2)}••••${key.slice(-2)}`,
        success: numberValue(value.success) ?? 0,
        failed: numberValue(value.failed) ?? 0,
        recentRequests,
      });
    }
  }
  return entries.sort((a, b) => (b.success + b.failed) - (a.success + a.failed));
}

export function getCLIProxyRuntimeConfig(connection: CLIProxyConnection) {
  return managementFetch<CLIProxyRuntimeConfig>(connection, '/config');
}

export async function getCLIProxyLatestVersion(connection: CLIProxyConnection) {
  const payload = await managementFetch<{ 'latest-version'?: string }>(connection, '/latest-version');
  return stringValue(payload['latest-version']);
}

export function getCLIProxyConfigYAML(connection: CLIProxyConnection) {
  return managementTextFetch(connection, '/config.yaml');
}

export function putCLIProxyConfigYAML(connection: CLIProxyConnection, yaml: string) {
  if (!yaml.trim()) throw new Error('配置 YAML 不能为空。');
  return managementFetch<{ ok?: boolean; changed?: string[] }>(connection, '/config.yaml', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/yaml' },
    body: yaml,
  });
}

export type CLIProxyRuntimeSettingPath =
  | 'debug'
  | 'proxy-url'
  | 'request-retry'
  | 'max-retry-interval'
  | 'request-log'
  | 'logging-to-file'
  | 'usage-statistics-enabled'
  | 'ws-auth'
  | 'force-model-prefix'
  | 'logs-max-total-size-mb'
  | 'error-logs-max-files'
  | 'quota-exceeded/switch-project'
  | 'quota-exceeded/switch-preview-model'
  | 'routing/strategy';

export function setCLIProxyRuntimeSetting(connection: CLIProxyConnection, path: CLIProxyRuntimeSettingPath, value: boolean | number | string) {
  return managementFetch<{ status: string }>(connection, `/${path}`, {
    method: 'PATCH',
    body: JSON.stringify({ value }),
  });
}

export async function getCLIProxyLogs(connection: CLIProxyConnection, options: { limit?: number; cursor?: string; after?: number } = {}): Promise<CLIProxyLogResult> {
  const query = new URLSearchParams();
  if (options.limit) query.set('limit', String(options.limit));
  if (options.cursor) query.set('cursor', options.cursor);
  if (options.after) query.set('after', String(options.after));
  const queryString = query.toString();
  const payload = await managementFetch<Record<string, unknown>>(connection, `/logs${queryString ? `?${queryString}` : ''}`);
  return {
    lines: Array.isArray(payload.lines) ? payload.lines.filter((line): line is string => typeof line === 'string') : [],
    lineCount: numberValue(payload['line-count']) ?? 0,
    latestTimestamp: numberValue(payload['latest-timestamp']) ?? 0,
    nextCursor: stringValue(payload['next-cursor']) || undefined,
    cursorReset: payload['cursor-reset'] === true,
  };
}

export function clearCLIProxyLogs(connection: CLIProxyConnection) {
  return managementFetch<{ success?: boolean; removed?: number }>(connection, '/logs', { method: 'DELETE' });
}

export async function listCLIProxyRequestErrorLogs(connection: CLIProxyConnection) {
  const payload = await managementFetch<{ files?: CLIProxyRequestErrorLog[] }>(connection, '/request-error-logs');
  return Array.isArray(payload.files) ? payload.files : [];
}

export function downloadCLIProxyRequestErrorLog(connection: CLIProxyConnection, name: string) {
  return managementTextFetch(connection, `/request-error-logs/${encodeURIComponent(name)}`);
}

export function listCLIProxyPlugins(connection: CLIProxyConnection) {
  return managementFetch<CLIProxyPluginList>(connection, '/plugins');
}

export function getCLIProxyPluginConfig(connection: CLIProxyConnection, id: string) {
  return managementFetch<Record<string, unknown>>(connection, `/plugins/${encodeURIComponent(id)}/config`);
}

export function saveCLIProxyPluginConfig(connection: CLIProxyConnection, id: string, config: Record<string, unknown>) {
  return managementFetch<{ status?: string }>(connection, `/plugins/${encodeURIComponent(id)}/config`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export function setCLIProxyPluginEnabled(connection: CLIProxyConnection, id: string, enabled: boolean) {
  return managementFetch<{ status: string }>(connection, `/plugins/${encodeURIComponent(id)}/enabled`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

export function deleteCLIProxyPlugin(connection: CLIProxyConnection, id: string) {
  return managementFetch<{ status?: string; restart_required?: boolean }>(connection, `/plugins/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function listCLIProxyPluginStore(connection: CLIProxyConnection) {
  return managementFetch<CLIProxyPluginStore>(connection, '/plugin-store');
}

export function installCLIProxyStorePlugin(connection: CLIProxyConnection, id: string, sourceID: string, version?: string) {
  const query = sourceID ? `?source=${encodeURIComponent(sourceID)}` : '';
  return managementFetch<{ status?: string; restart_required?: boolean; version?: string }>(connection, `/plugin-store/${encodeURIComponent(id)}/install${query}`, {
    method: 'POST',
    body: JSON.stringify(version ? { version } : {}),
  });
}

export type CLIProxyProviderCollectionPath =
  | 'gemini-api-key'
  | 'codex-api-key'
  | 'claude-api-key'
  | 'openai-compatibility'
  | 'interactions-api-key'
  | 'xai-api-key'
  | 'vertex-api-key';

export async function getCLIProxyProviderCollection(connection: CLIProxyConnection, path: CLIProxyProviderCollectionPath) {
  const payload = await managementFetch<Record<string, unknown>>(connection, `/${path}`);
  return Array.isArray(payload[path]) ? payload[path] as Record<string, unknown>[] : [];
}

export function saveCLIProxyProviderCollection(connection: CLIProxyConnection, path: CLIProxyProviderCollectionPath, items: Record<string, unknown>[]) {
  return managementFetch<{ status: string }>(connection, `/${path}`, {
    method: 'PUT',
    body: JSON.stringify(items),
  });
}

function normalizeGroupRouterConfig(value: unknown): CLIProxyGroupRouterConfig {
  const raw = record(value) ?? {};
  const groups = Array.isArray(raw.groups) ? raw.groups.flatMap((item) => {
    const group = record(item);
    if (!group) return [];
    const strategy: CLIProxyGroupStrategy = group.strategy === 'fill-first' ? 'fill-first' : 'round-robin';
    return [{
      id: stringValue(group.id),
      name: stringValue(group.name),
      enabled: group.enabled !== false,
      strategy,
      api_keys: Array.isArray(group.api_keys) ? group.api_keys.filter((key): key is string => typeof key === 'string' && Boolean(key.trim())).map((key) => key.trim()) : [],
      auth_ids: Array.isArray(group.auth_ids) ? group.auth_ids.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())).map((id) => id.trim()) : [],
    }];
  }) : [];
  return {
    enabled: raw.enabled !== false,
    deny_unmapped: raw.deny_unmapped !== false,
    allow_shared_auths: raw.allow_shared_auths === true,
    groups,
  };
}

export async function getCLIProxyGroupRouterConfig(connection: CLIProxyConnection) {
  const payload = await managementFetch<Record<string, unknown>>(connection, `/plugins/${CLIPROXY_GROUP_ROUTER_PLUGIN_ID}/config`);
  return normalizeGroupRouterConfig(payload);
}

export async function putCLIProxyGroupRouterConfig(connection: CLIProxyConnection, config: CLIProxyGroupRouterConfig) {
  await managementFetch<{ status?: string } | Record<string, unknown>>(connection, `/plugins/${CLIPROXY_GROUP_ROUTER_PLUGIN_ID}/config`, {
    method: 'PUT',
    body: JSON.stringify({
      enabled: true,
      deny_unmapped: true,
      allow_shared_auths: false,
      groups: config.groups,
    }),
  });
  await managementFetch<{ status: string }>(connection, `/plugins/${CLIPROXY_GROUP_ROUTER_PLUGIN_ID}/enabled`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled: true }),
  });
}

export async function saveCLIProxyGroupRouterConfig(
  connection: CLIProxyConnection,
  previous: CLIProxyGroupRouterConfig,
  next: CLIProxyGroupRouterConfig,
) {
  const currentKeys = await getCLIProxyAPIKeys(connection);
  const previousGroupKeys = new Set(previous.groups.flatMap((group) => group.api_keys));
  const nextGroupKeys = next.groups.flatMap((group) => group.api_keys);
  const externalKeys = currentKeys.filter((key) => !previousGroupKeys.has(key));
  const nextKeys = [...new Set([...externalKeys, ...nextGroupKeys])];
  await putCLIProxyAPIKeys(connection, nextKeys);
  try {
    await putCLIProxyGroupRouterConfig(connection, next);
  } catch (error) {
    try {
      await putCLIProxyAPIKeys(connection, currentKeys);
    } catch {
      // Preserve the original plugin configuration error when key rollback also fails.
    }
    throw error;
  }
  return normalizeGroupRouterConfig(next);
}

export function setCLIProxyAuthFileDisabled(connection: CLIProxyConnection, name: string, disabled: boolean) {
  return managementFetch<{ status: string; disabled?: boolean }>(connection, '/auth-files/status', {
    method: 'PATCH',
    body: JSON.stringify({ name, disabled }),
  });
}

export function setCLIProxyAuthFileFields(connection: CLIProxyConnection, name: string, fields: Record<string, unknown>) {
  return managementFetch<{ status: string }>(connection, '/auth-files/fields', {
    method: 'PATCH',
    body: JSON.stringify({ name, ...fields }),
  });
}

export function resetCLIProxyQuota(connection: CLIProxyConnection, authIndex: string) {
  return managementFetch<{ status: string; auth_index?: string; models?: string[] }>(connection, '/reset-quota', {
    method: 'POST',
    body: JSON.stringify({ auth_index: authIndex }),
  });
}

const oauthEndpoints: Record<CLIProxyOAuthProvider, string> = {
  anthropic: 'anthropic-auth-url',
  codex: 'codex-auth-url',
  'gemini-cli': 'gemini-cli-auth-url',
  antigravity: 'antigravity-auth-url',
  kimi: 'kimi-auth-url',
  xai: 'xai-auth-url',
};

export function startCLIProxyOAuth(connection: CLIProxyConnection, provider: CLIProxyOAuthProvider) {
  const webUIQuery = provider === 'anthropic' || provider === 'codex' || provider === 'gemini-cli' || provider === 'antigravity' ? '?is_webui=true' : '';
  return managementFetch<CLIProxyOAuthSession>(connection, `/${oauthEndpoints[provider]}${webUIQuery}`);
}

export function getCLIProxyOAuthStatus(connection: CLIProxyConnection, state: string) {
  return managementFetch<CLIProxyOAuthStatus>(connection, `/get-auth-status?state=${encodeURIComponent(state)}`);
}

export function cancelCLIProxyOAuth(connection: CLIProxyConnection, state: string) {
  return managementFetch<{ status: string; cancelled?: boolean }>(connection, `/oauth-session?state=${encodeURIComponent(state)}`, {
    method: 'DELETE',
  });
}

export function submitCLIProxyOAuthCallback(
  connection: CLIProxyConnection,
  provider: CLIProxyOAuthProvider,
  state: string,
  redirectUrl: string,
) {
  if (!redirectUrl.trim()) throw new Error('请粘贴 OAuth 回调 URL。');
  return managementFetch<{ status: string; error?: string }>(connection, '/oauth-callback', {
    method: 'POST',
    body: JSON.stringify({ provider, state, redirect_url: redirectUrl.trim() }),
  });
}

export async function listCLIProxyModels(baseUrl: string, apiKey: string) {
  const normalizedBaseUrl = normalizeCLIProxyBaseUrl(baseUrl);
  if (!normalizedBaseUrl) throw new Error('CLIPROXY_BASE_URL_REQUIRED');
  if (!apiKey.trim()) throw new Error('CLIPROXY_API_KEY_REQUIRED');
  const headers = new Headers({ Authorization: `Bearer ${apiKey.trim()}` });
  const response = await fetchWithWebProxy(`${normalizedBaseUrl}/v1/models`, { headers });
  const payload = await parseResponse<{ data?: CLIProxyModel[] }>(response);
  return Array.isArray(payload.data) ? payload.data : [];
}

export async function testCLIProxyConnection(connection: CLIProxyConnection): Promise<CLIProxyConnectionTest> {
  // Authenticate with one request first. CLIProxyAPI temporarily bans a client after
  // repeated authentication failures, so a wrong key must not fan out concurrently.
  const files = await listCLIProxyAuthFiles(connection);
  const apiKeys = await getCLIProxyAPIKeys(connection);
  return {
    credentialCount: files.length,
    availableCredentialCount: files.filter((file) => !file.disabled && !file.unavailable).length,
    apiKeyCount: apiKeys.length,
  };
}

type AuthenticatedAPICallResponse = {
  status_code?: number;
  statusCode?: number;
  body?: unknown;
};

const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const GEMINI_LOAD_URL = 'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist';
const GEMINI_QUOTA_URL = 'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota';
const ANTIGRAVITY_MODEL_URLS = [
  'https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
  'https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
  'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels',
];

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function parseAPICallBody(value: unknown) {
  if (record(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string' || !value.trim()) throw new Error('CLIPROXY_QUOTA_RESPONSE_EMPTY');
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!record(parsed)) throw new Error('CLIPROXY_QUOTA_RESPONSE_INVALID');
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message === 'CLIPROXY_QUOTA_RESPONSE_INVALID') throw error;
    throw new Error('CLIPROXY_QUOTA_RESPONSE_INVALID');
  }
}

async function authenticatedAPICall(
  connection: CLIProxyConnection,
  authIndex: string,
  request: { method: 'GET' | 'POST'; url: string; header: Record<string, string>; data?: string },
) {
  const response = await managementFetch<AuthenticatedAPICallResponse>(connection, '/api-call', {
    method: 'POST',
    body: JSON.stringify({ auth_index: authIndex, ...request }),
  });
  const status = numberValue(response.status_code, response.statusCode) ?? 0;
  if (status < 200 || status >= 300) {
    const body = typeof response.body === 'string' ? response.body.trim() : JSON.stringify(response.body ?? {});
    throw new Error(body.slice(0, 1_000) || `CLIPROXY_UPSTREAM_HTTP_${status}`);
  }
  return parseAPICallBody(response.body);
}

function nested(value: unknown, ...path: string[]) {
  let current: unknown = value;
  for (const key of path) {
    current = record(current)?.[key];
  }
  return current;
}

function quotaStatus(windows: CLIProxyQuotaWindow[], error?: string): CLIProxyQuotaReport['status'] {
  if (error) return 'error';
  if (windows.some((window) => window.exhausted)) return 'exhausted';
  const remaining = windows.map((window) => window.remainingPercent).filter((value): value is number => value !== null);
  if (!remaining.length) return 'unknown';
  const lowest = Math.min(...remaining);
  if (lowest <= 0) return 'exhausted';
  if (lowest <= 20) return 'low';
  if (lowest <= 50) return 'medium';
  if (lowest <= 80) return 'high';
  return 'full';
}

function resetAtFromWindow(window: Record<string, unknown>) {
  const epoch = numberValue(window.reset_at, window.resetAt);
  if (epoch && epoch > 0) return new Date(epoch * 1_000).toISOString();
  const after = numberValue(window.reset_after_seconds, window.resetAfterSeconds);
  if (after && after > 0) return new Date(Date.now() + after * 1_000).toISOString();
  return undefined;
}

function buildCodexWindow(id: string, label: string, value: unknown, rateLimit: Record<string, unknown>) {
  const window = record(value);
  if (!window) return undefined;
  let used = numberValue(window.used_percent, window.usedPercent);
  if (used === undefined && (rateLimit.limit_reached === true || rateLimit.limitReached === true || rateLimit.allowed === false)) used = 100;
  const usedPercent = used === undefined ? null : clampPercent(used);
  const remainingPercent = usedPercent === null ? null : clampPercent(100 - usedPercent);
  return {
    id,
    label,
    remainingPercent,
    usedPercent,
    resetAt: resetAtFromWindow(window),
    exhausted: remainingPercent === 0,
  } satisfies CLIProxyQuotaWindow;
}

function codexAccountID(file: CLIProxyAuthFile) {
  const claims = file.id_token;
  return stringValue(
    claims?.chatgpt_account_id,
    nested(claims, 'https://api.openai.com/auth', 'chatgpt_account_id'),
  );
}

function codexPlanType(file: CLIProxyAuthFile) {
  const claims = file.id_token;
  return stringValue(
    claims?.plan_type,
    claims?.chatgpt_plan_type,
    nested(claims, 'https://api.openai.com/auth', 'chatgpt_plan_type'),
    nested(claims, 'https://api.openai.com/auth', 'plan_type'),
  );
}

async function queryCodexQuota(connection: CLIProxyConnection, file: CLIProxyAuthFile): Promise<CLIProxyQuotaReport> {
  const authIndex = file.auth_index || '';
  const accountID = codexAccountID(file);
  if (!authIndex || !accountID) throw new Error(!authIndex ? 'CLIPROXY_AUTH_INDEX_REQUIRED' : 'CLIPROXY_CODEX_ACCOUNT_ID_REQUIRED');
  const payload = await authenticatedAPICall(connection, authIndex, {
    method: 'GET',
    url: CODEX_USAGE_URL,
    header: {
      Authorization: 'Bearer $TOKEN$',
      'Content-Type': 'application/json',
      'User-Agent': 'codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal',
      'Chatgpt-Account-Id': accountID,
    },
  });
  const rateLimit = record(payload.rate_limit ?? payload.rateLimit) ?? {};
  const primary = record(rateLimit.primary_window ?? rateLimit.primaryWindow);
  const secondary = record(rateLimit.secondary_window ?? rateLimit.secondaryWindow);
  const candidates = [primary, secondary].filter((value): value is Record<string, unknown> => Boolean(value));
  const fiveHour = candidates.find((window) => numberValue(window.limit_window_seconds, window.limitWindowSeconds) === 18_000) ?? primary;
  const sevenDay = candidates.find((window) => numberValue(window.limit_window_seconds, window.limitWindowSeconds) === 604_800) ?? secondary;
  const windows: CLIProxyQuotaWindow[] = [];
  const fiveHourWindow = buildCodexWindow('codex-5h', '5h', fiveHour, rateLimit);
  const sevenDayWindow = buildCodexWindow('codex-7d', '7d', sevenDay, rateLimit);
  if (fiveHourWindow) windows.push(fiveHourWindow);
  if (sevenDayWindow) windows.push(sevenDayWindow);
  const planType = stringValue(payload.plan_type, payload.planType, codexPlanType(file));
  return {
    provider: 'codex',
    name: file.label || file.email || file.name,
    authIndex,
    planType,
    status: quotaStatus(windows),
    windows,
    fetchedAt: new Date().toISOString(),
  };
}

const GEMINI_METADATA = {
  ideType: 'IDE_UNSPECIFIED',
  platform: 'PLATFORM_UNSPECIFIED',
  pluginType: 'GEMINI',
};
const ANTIGRAVITY_METADATA = {
  ideType: 'ANTIGRAVITY',
  platform: 'PLATFORM_UNSPECIFIED',
  pluginType: 'GEMINI',
};

function googleHeaders(metadata: Record<string, string>) {
  return {
    Authorization: 'Bearer $TOKEN$',
    'Content-Type': 'application/json',
    'User-Agent': 'google-api-nodejs-client/9.15.1',
    'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
    'Client-Metadata': JSON.stringify(metadata),
  };
}

async function loadGoogleProject(connection: CLIProxyConnection, authIndex: string, metadata: Record<string, string>, projectID = '') {
  const request: Record<string, unknown> = { metadata };
  if (projectID) request.cloudaicompanionProject = projectID;
  return authenticatedAPICall(connection, authIndex, {
    method: 'POST',
    url: GEMINI_LOAD_URL,
    header: googleHeaders(metadata),
    data: JSON.stringify(request),
  });
}

function googlePlanType(payload: Record<string, unknown>) {
  return stringValue(nested(payload, 'currentTier', 'id'), nested(payload, 'currentTier', 'name'));
}

function googleResetAt(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function googleQuotaWindow(id: string, label: string, remainingFraction: unknown, resetTime: unknown, remainingAmount?: unknown) {
  const fractionText = typeof remainingFraction === 'string' ? remainingFraction.trim() : '';
  const explicitPercent = fractionText.endsWith('%') ? numberValue(fractionText.slice(0, -1)) : undefined;
  const fraction = numberValue(remainingFraction);
  const amount = numberValue(remainingAmount);
  const resetAt = googleResetAt(resetTime);
  const remainingPercent = explicitPercent !== undefined
    ? clampPercent(explicitPercent)
    : fraction === undefined
      ? (amount !== undefined && amount <= 0 ? 0 : null)
      : clampPercent(fraction >= 0 && fraction <= 1 ? fraction * 100 : fraction);
  return {
    id,
    label,
    remainingPercent,
    usedPercent: remainingPercent === null ? null : 100 - remainingPercent,
    resetAt,
    exhausted: remainingPercent === 0,
  } satisfies CLIProxyQuotaWindow;
}

function projectIDFromAuth(file: CLIProxyAuthFile) {
  if (file.project_id?.trim()) return file.project_id.trim();
  const match = file.account?.match(/\(([^()]+)\)/);
  return match?.[1]?.trim() || '';
}

async function queryGeminiQuota(connection: CLIProxyConnection, file: CLIProxyAuthFile): Promise<CLIProxyQuotaReport> {
  const authIndex = file.auth_index || '';
  if (!authIndex) throw new Error('CLIPROXY_AUTH_INDEX_REQUIRED');
  let projectID = projectIDFromAuth(file);
  let planType = '';
  let load: Record<string, unknown> = {};
  try {
    load = await loadGoogleProject(connection, authIndex, GEMINI_METADATA, projectID);
  } catch (error) {
    if (!projectID) throw error;
  }
  projectID = projectID || stringValue(load.cloudaicompanionProject, nested(load, 'cloudaicompanionProject', 'id'));
  planType = googlePlanType(load);
  if (!projectID) throw new Error('CLIPROXY_GOOGLE_PROJECT_ID_REQUIRED');
  const payload = await authenticatedAPICall(connection, authIndex, {
    method: 'POST',
    url: GEMINI_QUOTA_URL,
    header: googleHeaders(GEMINI_METADATA),
    data: JSON.stringify({ project: projectID }),
  });
  const buckets = Array.isArray(payload.buckets) ? payload.buckets : [];
  const windows = buckets.flatMap((item, index) => {
    const bucket = record(item);
    if (!bucket) return [];
    const model = stringValue(bucket.modelId, bucket.model_id).replace(/_vertex$/, '');
    if (!model) return [];
    return [googleQuotaWindow(
      `gemini-${model || index}`,
      model,
      bucket.remainingFraction ?? bucket.remaining_fraction ?? bucket.remaining,
      bucket.resetTime ?? bucket.reset_time,
      bucket.remainingAmount ?? bucket.remaining_amount,
    )];
  });
  return {
    provider: 'gemini-cli',
    name: file.label || file.email || file.name,
    authIndex,
    planType,
    status: quotaStatus(windows),
    windows,
    fetchedAt: new Date().toISOString(),
  };
}

async function queryAntigravityQuota(connection: CLIProxyConnection, file: CLIProxyAuthFile): Promise<CLIProxyQuotaReport> {
  const authIndex = file.auth_index || '';
  if (!authIndex) throw new Error('CLIPROXY_AUTH_INDEX_REQUIRED');
  let projectID = projectIDFromAuth(file);
  let load: Record<string, unknown> = {};
  try {
    load = await loadGoogleProject(connection, authIndex, ANTIGRAVITY_METADATA, projectID);
  } catch (error) {
    if (!projectID) throw error;
  }
  projectID = projectID || stringValue(load.cloudaicompanionProject, nested(load, 'cloudaicompanionProject', 'id'));
  if (!projectID) throw new Error('CLIPROXY_GOOGLE_PROJECT_ID_REQUIRED');
  let payload: Record<string, unknown> | undefined;
  let lastError: unknown;
  for (const url of ANTIGRAVITY_MODEL_URLS) {
    try {
      payload = await authenticatedAPICall(connection, authIndex, {
        method: 'POST',
        url,
        header: {
          Authorization: 'Bearer $TOKEN$',
          'Content-Type': 'application/json',
          'User-Agent': 'antigravity/1.11.5 windows/amd64',
        },
        data: JSON.stringify({ project: projectID }),
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!payload) throw lastError instanceof Error ? lastError : new Error('CLIPROXY_ANTIGRAVITY_QUOTA_FAILED');
  const models = record(payload.models) ?? {};
  const windows = Object.entries(models).flatMap(([modelID, value]) => {
    const model = record(value);
    const quota = record(model?.quotaInfo ?? model?.quota_info);
    if (!quota) return [];
    return [googleQuotaWindow(
      `antigravity-${modelID}`,
      stringValue(model?.displayName, modelID),
      quota.remainingFraction ?? quota.remaining_fraction ?? quota.remaining,
      quota.resetTime ?? quota.reset_time,
    )];
  });
  return {
    provider: 'antigravity',
    name: file.label || file.email || file.name,
    authIndex,
    planType: googlePlanType(load),
    status: quotaStatus(windows),
    windows,
    fetchedAt: new Date().toISOString(),
  };
}

function normalizedQuotaProvider(file: CLIProxyAuthFile) {
  const provider = (file.provider || file.type || '').trim().toLowerCase();
  if (provider === 'codex') return 'codex' as const;
  if (provider === 'gemini-cli' || provider === 'gemini') return 'gemini-cli' as const;
  if (provider === 'antigravity') return 'antigravity' as const;
  return undefined;
}

async function queryOneQuota(connection: CLIProxyConnection, file: CLIProxyAuthFile): Promise<CLIProxyQuotaReport | undefined> {
  const provider = normalizedQuotaProvider(file);
  if (!provider || file.disabled) return undefined;
  try {
    if (provider === 'codex') return await queryCodexQuota(connection, file);
    if (provider === 'gemini-cli') return await queryGeminiQuota(connection, file);
    return await queryAntigravityQuota(connection, file);
  } catch (error) {
    return {
      provider,
      name: file.label || file.email || file.name,
      authIndex: file.auth_index || '',
      planType: provider === 'codex' ? codexPlanType(file) : undefined,
      status: 'error',
      windows: [],
      fetchedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'CLIPROXY_QUOTA_QUERY_FAILED',
    };
  }
}

export async function getCLIProxyQuotaReports(connection: CLIProxyConnection, concurrency = 4) {
  const files = await listCLIProxyAuthFiles(connection);
  const supported = files.filter((file) => normalizedQuotaProvider(file) && !file.disabled);
  const reports = new Array<CLIProxyQuotaReport | undefined>(supported.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < supported.length) {
      const index = cursor;
      cursor += 1;
      reports[index] = await queryOneQuota(connection, supported[index]);
    }
  };
  const workerCount = Math.min(Math.max(Math.floor(concurrency), 1), Math.max(supported.length, 1));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return reports.filter((report): report is CLIProxyQuotaReport => Boolean(report));
}
