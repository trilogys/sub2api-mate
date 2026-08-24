import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { CLIProxyConnection } from '@/src/types/cliproxy';

const { proxy } = require('valtio');

const STORAGE_KEY = 'sub2api_cliproxy_connection_v1';
const REFRESH_INTERVALS = [30, 60, 300, 900] as const;

type CLIProxyStoredConfig = CLIProxyConnection & {
  autoRefreshEnabled: boolean;
  autoRefreshIntervalSeconds: number;
  nextRefreshAt: string;
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
    nextRefreshAt: typeof parsed.nextRefreshAt === 'string' && Number.isFinite(Date.parse(parsed.nextRefreshAt)) ? parsed.nextRefreshAt : '',
    lastRefreshAt: typeof parsed.lastRefreshAt === 'string' ? parsed.lastRefreshAt : '',
    lastRefreshMessage: typeof parsed.lastRefreshMessage === 'string' ? parsed.lastRefreshMessage : '',
  };
}

export const cliProxyConfigState = proxy({
  baseUrl: '',
  managementKey: '',
  autoRefreshEnabled: false,
  autoRefreshIntervalSeconds: 60,
  nextRefreshAt: '',
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
  const scheduleCreated = connection.autoRefreshEnabled && !connection.nextRefreshAt;
  if (scheduleCreated) {
    connection.nextRefreshAt = new Date(Date.now() + connection.autoRefreshIntervalSeconds * 1_000).toISOString();
  }
  cliProxyConfigState.nextRefreshAt = connection.nextRefreshAt;
  cliProxyConfigState.lastRefreshAt = connection.lastRefreshAt;
  cliProxyConfigState.lastRefreshMessage = connection.lastRefreshMessage;
  cliProxyConfigState.revision += 1;
  cliProxyConfigState.hydrated = true;
  if (scheduleCreated) await writeStoredValue(connection);
  return connection;
}

export async function saveCLIProxyConfig(input: CLIProxyConnection) {
  const connection = normalizeStoredConnection({
    ...input,
    autoRefreshEnabled: cliProxyConfigState.autoRefreshEnabled,
    autoRefreshIntervalSeconds: cliProxyConfigState.autoRefreshIntervalSeconds,
    nextRefreshAt: cliProxyConfigState.nextRefreshAt,
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
  'autoRefreshEnabled' | 'autoRefreshIntervalSeconds' | 'nextRefreshAt' | 'lastRefreshAt' | 'lastRefreshMessage'
>>) {
  const nextEnabled = input.autoRefreshEnabled ?? cliProxyConfigState.autoRefreshEnabled;
  const nextInterval = input.autoRefreshIntervalSeconds ?? cliProxyConfigState.autoRefreshIntervalSeconds;
  const intervalChanged = nextInterval !== cliProxyConfigState.autoRefreshIntervalSeconds;
  const enabledChanged = nextEnabled !== cliProxyConfigState.autoRefreshEnabled;
  let nextRefreshAt = input.nextRefreshAt ?? cliProxyConfigState.nextRefreshAt;
  const nextTimestamp = Date.parse(nextRefreshAt);
  if (!nextEnabled) nextRefreshAt = '';
  else if (enabledChanged || intervalChanged || !Number.isFinite(nextTimestamp) || nextTimestamp <= Date.now()) {
    nextRefreshAt = new Date(Date.now() + nextInterval * 1_000).toISOString();
  }
  const next = normalizeStoredConnection({
    baseUrl: cliProxyConfigState.baseUrl,
    managementKey: cliProxyConfigState.managementKey,
    autoRefreshEnabled: nextEnabled,
    autoRefreshIntervalSeconds: nextInterval,
    nextRefreshAt,
    lastRefreshAt: input.lastRefreshAt ?? cliProxyConfigState.lastRefreshAt,
    lastRefreshMessage: input.lastRefreshMessage ?? cliProxyConfigState.lastRefreshMessage,
  });
  await writeStoredValue(next);
  cliProxyConfigState.autoRefreshEnabled = next.autoRefreshEnabled;
  cliProxyConfigState.autoRefreshIntervalSeconds = next.autoRefreshIntervalSeconds;
  cliProxyConfigState.nextRefreshAt = next.nextRefreshAt;
  cliProxyConfigState.lastRefreshAt = next.lastRefreshAt;
  cliProxyConfigState.lastRefreshMessage = next.lastRefreshMessage;
}
