import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const { proxy } = require('valtio');

const KEY = 'sub2api_account_auto_refresh_v2';
const LEGACY_KEY = 'sub2api_account_auto_refresh_v1';
const SUPPORTED_INTERVALS = [10, 15, 30, 60] as const;

export const accountRefreshState = proxy({
  hydrated: false,
  enabled: false,
  intervalSeconds: 30,
  lastRunAt: '',
  lastMessage: '',
});

async function read(key: string) {
  return Platform.OS === 'web'
    ? globalThis.localStorage?.getItem(key)
    : SecureStore.getItemAsync(key);
}

async function write() {
  const raw = JSON.stringify({
    enabled: accountRefreshState.enabled,
    intervalSeconds: accountRefreshState.intervalSeconds,
    lastRunAt: accountRefreshState.lastRunAt,
    lastMessage: accountRefreshState.lastMessage,
  });
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, raw);
  else await SecureStore.setItemAsync(KEY, raw);
}

export async function hydrateAccountRefresh() {
  try {
    const currentRaw = await read(KEY);
    const legacyRaw = currentRaw ? null : await read(LEGACY_KEY);
    const parsed = JSON.parse(currentRaw || legacyRaw || '{}') as Partial<{
      enabled: boolean;
      intervalSeconds: number;
      lastRunAt: string;
      lastMessage: string;
    }>;
    const intervalSeconds = SUPPORTED_INTERVALS.includes(parsed.intervalSeconds as (typeof SUPPORTED_INTERVALS)[number])
      ? parsed.intervalSeconds
      : 30;
    Object.assign(accountRefreshState, {
      enabled: Boolean(parsed.enabled),
      intervalSeconds,
      lastRunAt: typeof parsed.lastRunAt === 'string' ? parsed.lastRunAt : '',
      lastMessage: typeof parsed.lastMessage === 'string' ? parsed.lastMessage : '',
    });
    if (!currentRaw && legacyRaw) await write();
  } catch {
    // Keep defaults when persisted preferences cannot be read.
  } finally {
    accountRefreshState.hydrated = true;
  }
}

export async function updateAccountRefresh(input: Partial<{
  enabled: boolean;
  intervalSeconds: number;
  lastRunAt: string;
  lastMessage: string;
}>) {
  Object.assign(accountRefreshState, input);
  await write();
}
