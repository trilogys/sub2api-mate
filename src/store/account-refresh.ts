import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
const { proxy } = require('valtio');
const KEY = 'sub2api_account_auto_refresh_v1';
export const accountRefreshState = proxy({ hydrated: false, enabled: false, intervalMinutes: 60, lastRunAt: '', lastMessage: '' });
async function write() { const raw = JSON.stringify({ enabled: accountRefreshState.enabled, intervalMinutes: accountRefreshState.intervalMinutes, lastRunAt: accountRefreshState.lastRunAt, lastMessage: accountRefreshState.lastMessage }); if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, raw); else await SecureStore.setItemAsync(KEY, raw); }
export async function hydrateAccountRefresh() { try { const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY); if (raw) Object.assign(accountRefreshState, JSON.parse(raw)); } catch {} finally { accountRefreshState.hydrated = true; } }
export async function updateAccountRefresh(input: Partial<{ enabled: boolean; intervalMinutes: number; lastRunAt: string; lastMessage: string }>) { Object.assign(accountRefreshState, input); await write(); }
