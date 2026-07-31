import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { batchRefreshAccounts, listAccounts } from '@/src/services/admin';
import { accountRefreshState, hydrateAccountRefresh, updateAccountRefresh } from '@/src/store/account-refresh';
import { adminConfigState, isAdminSession } from '@/src/store/admin-config';
const { useSnapshot } = require('valtio/react');

export async function runConfiguredAccountRefresh() {
  const result = await listAccounts('', 1, 100);
  const ids = result.items.filter((item) => item.status !== 'inactive').map((item) => item.id);
  if (!ids.length) { await updateAccountRefresh({ lastRunAt: new Date().toISOString(), lastMessage: '没有可刷新的账号' }); return; }
  const response = await batchRefreshAccounts(ids);
  await updateAccountRefresh({ lastRunAt: new Date().toISOString(), lastMessage: `成功 ${response.success}，失败 ${response.failed}` });
}

export function AccountRefreshCoordinator() {
  const refresh = useSnapshot(accountRefreshState); const config = useSnapshot(adminConfigState); const running = useRef(false);
  useEffect(() => { hydrateAccountRefresh(); }, []);
  useEffect(() => { if (!refresh.hydrated || !refresh.enabled || !isAdminSession() || !config.baseUrl) return; const run = async () => { if (running.current || AppState.currentState !== 'active') return; running.current = true; try { await runConfiguredAccountRefresh(); } catch (reason) { await updateAccountRefresh({ lastRunAt: new Date().toISOString(), lastMessage: reason instanceof Error ? reason.message : '刷新失败' }); } finally { running.current = false; } }; const timer = setInterval(run, Math.max(15, refresh.intervalMinutes) * 60_000); return () => clearInterval(timer); }, [refresh.hydrated, refresh.enabled, refresh.intervalMinutes, config.baseUrl]);
  return null;
}
