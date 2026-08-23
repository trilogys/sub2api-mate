import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { CLIProxyConnection } from '@/src/types/cliproxy';

const { proxy } = require('valtio');

const STORAGE_KEY = 'sub2api_cliproxy_connection_v1';
const REFRESH_INTERVALS = [30, 60, 300, 900] as const;

type CLIProxyStoredConfig = CLIProxyConnection & {
  autoRefreshEnabled: boolean;
  autoRefreshIntervalSeconds: number;
  lastRefreshAt: string;
  lastRefreshMessage: string;
};

function normalizeStoredConnection(value: unknown): CLIProxyStoredConfig {
  const parsed = value && typeof value === 'object' ? value as Partial<CLIProxyStoredConfig> : {};
  const interval = REFRESH_INTERVALS.includes(parsed.autoRefreshIntervalSeconds as (typeof REFRESH_INTERVALS)[number])
    ? Number(parsed.autoRefreshIntervalSeconds)
    : 60;
  return {
    baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl.trim().replace(/\/+$/, '') : '',
    managementKey: typeof parsed.managementKey === 'string' ? parsed.managementKey.trim() : '',
    autoRefreshEnabled: parsed.autoRefreshEnabled === true,
    autoRefreshIntervalSeconds: interval,
    lastRefreshAt: typeof parsed.lastRefreshAt === 'string' ? parsed.lastRefreshAt : '',
    lastRefreshMessage: typeof parsed.lastRefreshMessage === 'string' ? parsed.lastRefreshMessage : '',
  };
}

export const cliProxyConfigState = proxy({
  baseUrl: '',
  managementKey: '',
  autoRefreshEnabled: false,
  autoRefreshIntervalSeconds: 60,
  lastRefreshAt: '',
  lastRefreshMessage: '',
  revision: 0,
  hydrated: false,
  saving: false,
});

async function readStoredValue() {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
    return await SecureStore.getItemAsync(STORAGE_KEY);
  } catch {
    return null;
  }
}

async function writeStoredValue(config: CLIProxyStoredConfig) {
  const persisted = Platform.OS === 'web' ? { ...config, managementKey: '' } : config;
  const raw = JSON.stringify(persisted);
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(STORAGE_KEY, raw);
    return;
  }
  await SecureStore.setItemAsync(STORAGE_KEY, raw);
}

export async function hydrateCLIProxyConfig() {
  if (cliProxyConfigState.hydrated) {
    return normalizeStoredConnection(cliProxyConfigState);
  }

  const raw = await readStoredValue();
  let connection = normalizeStoredConnection(undefined);
  try {
    connection = normalizeStoredConnection(raw ? JSON.parse(raw) : undefined);
  } catch {
    connection = normalizeStoredConnection(undefined);
  }

  cliProxyConfigState.baseUrl = connection.baseUrl;
  cliProxyConfigState.managementKey = connection.managementKey;
  cliProxyConfigState.autoRefreshEnabled = connection.autoRefreshEnabled;
  cliProxyConfigState.autoRefreshIntervalSeconds = connection.autoRefreshIntervalSeconds;
  cliProxyConfigState.lastRefreshAt = connection.lastRefreshAt;
  cliProxyConfigState.lastRefreshMessage = connection.lastRefreshMessage;
  cliProxyConfigState.revision += 1;
  cliProxyConfigState.hydrated = true;
  return connection;
}

export async function saveCLIProxyConfig(input: CLIProxyConnection) {
  const connection = normalizeStoredConnection({
    ...input,
    autoRefreshEnabled: cliProxyConfigState.autoRefreshEnabled,
    autoRefreshIntervalSeconds: cliProxyConfigState.autoRefreshIntervalSeconds,
    lastRefreshAt: cliProxyConfigState.lastRefreshAt,
    lastRefreshMessage: cliProxyConfigState.lastRefreshMessage,
  });
  cliProxyConfigState.saving = true;
  try {
    await writeStoredValue(connection);
    cliProxyConfigState.baseUrl = connection.baseUrl;
    cliProxyConfigState.managementKey = connection.managementKey;
    cliProxyConfigState.revision += 1;
    cliProxyConfigState.hydrated = true;
    return connection;
  } finally {
    cliProxyConfigState.saving = false;
  }
}

export async function updateCLIProxyRefresh(input: Partial<Pick<CLIProxyStoredConfig,
  'autoRefreshEnabled' | 'autoRefreshIntervalSeconds' | 'lastRefreshAt' | 'lastRefreshMessage'
>>) {
  const next = normalizeStoredConnection({
    baseUrl: cliProxyConfigState.baseUrl,
    managementKey: cliProxyConfigState.managementKey,
    autoRefreshEnabled: input.autoRefreshEnabled ?? cliProxyConfigState.autoRefreshEnabled,
    autoRefreshIntervalSeconds: input.autoRefreshIntervalSeconds ?? cliProxyConfigState.autoRefreshIntervalSeconds,
    lastRefreshAt: input.lastRefreshAt ?? cliProxyConfigState.lastRefreshAt,
    lastRefreshMessage: input.lastRefreshMessage ?? cliProxyConfigState.lastRefreshMessage,
  });
  await writeStoredValue(next);
  cliProxyConfigState.autoRefreshEnabled = next.autoRefreshEnabled;
  cliProxyConfigState.autoRefreshIntervalSeconds = next.autoRefreshIntervalSeconds;
  cliProxyConfigState.lastRefreshAt = next.lastRefreshAt;
  cliProxyConfigState.lastRefreshMessage = next.lastRefreshMessage;
}
