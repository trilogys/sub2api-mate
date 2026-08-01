import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
const { proxy } = require('valtio');

const BASE_URL_KEY = 'sub2api_base_url';
const ADMIN_KEY_KEY = 'sub2api_admin_api_key';
const ACCOUNTS_KEY = 'sub2api_accounts';
const ACTIVE_ACCOUNT_ID_KEY = 'sub2api_active_account_id';
const AUTH_SESSION_KEY = 'sub2api_auth_session';
const IS_WEB = Platform.OS === 'web';

export type AdminAccountProfile = {
  id: string;
  label: string;
  baseUrl: string;
  adminApiKey: string;
  authMode?: 'admin_key' | 'password';
  accessToken?: string;
  refreshToken?: string;
  user?: AuthenticatedUser | null;
  remembered?: boolean;
  loginEmail?: string;
  loginSecret?: string;
  updatedAt: string;
  enabled?: boolean;
};

export type AuthenticatedUser = {
  id: number;
  email: string;
  username?: string;
  role: 'admin' | 'user';
  status?: string;
  balance?: number;
};

type AuthSession = {
  authMode: 'admin_key' | 'password';
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser | null;
};

function createAccountId() {
  return `acct_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getAccountLabel(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    return url.host || baseUrl;
  } catch {
    return baseUrl;
  }
}

function normalizeConfig(input: { baseUrl: string; adminApiKey: string }) {
  return {
    baseUrl: input.baseUrl.trim().replace(/\/$/, ''),
    adminApiKey: input.adminApiKey.trim(),
  };
}

function sortAccounts(accounts: AdminAccountProfile[]) {
  return [...accounts].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function normalizeAccount(account: AdminAccountProfile): AdminAccountProfile {
  return {
    ...account,
    adminApiKey: account.adminApiKey ?? '',
    authMode: account.authMode ?? 'admin_key',
    accessToken: account.accessToken ?? '',
    refreshToken: account.refreshToken ?? '',
    user: account.user ?? null,
    remembered: account.remembered ?? true,
    loginEmail: account.loginEmail ?? account.user?.email ?? '',
    loginSecret: account.loginSecret ?? '',
    enabled: account.enabled ?? true,
  };
}

function sanitizeAccountsForWeb(accounts: AdminAccountProfile[]) {
  if (!IS_WEB) {
    return accounts;
  }

  return accounts.map((account) => ({
    ...account,
    adminApiKey: '',
    loginSecret: '',
  }));
}

function persistAdminApiKey(value: string) {
  if (IS_WEB) {
    return deleteItem(ADMIN_KEY_KEY);
  }

  return setItem(ADMIN_KEY_KEY, value);
}

function persistAccounts(accounts: AdminAccountProfile[]) {
  return setItem(ACCOUNTS_KEY, JSON.stringify(sanitizeAccountsForWeb(accounts)));
}

export function hasAuthenticatedAdminSession(config: { baseUrl: string; adminApiKey: string }) {
  const hasBaseUrl = Boolean(config.baseUrl.trim());

  if (!hasBaseUrl) {
    return false;
  }

  const session = config as typeof adminConfigState;
  if (session.authMode === 'password') return Boolean(session.accessToken.trim());
  if (!IS_WEB) return Boolean(config.adminApiKey.trim());
  return Boolean(config.adminApiKey.trim());
}

function getNextActiveAccount(accounts: AdminAccountProfile[], activeAccountId?: string) {
  const enabledAccounts = accounts.filter((account) => account.enabled !== false);

  if (activeAccountId) {
    const preferred = enabledAccounts.find((account) => account.id === activeAccountId);
    if (preferred) {
      return preferred;
    }
  }

  return enabledAccounts[0];
}

export function getDefaultAdminConfig() {
  return {
    baseUrl: '',
    adminApiKey: '',
    authMode: 'admin_key' as const,
    accessToken: '',
    refreshToken: '',
    user: null as AuthenticatedUser | null,
  };
}

async function getItem(key: string) {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') {
        return null;
      }

      return localStorage.getItem(key);
    }

    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function setItem(key: string, value: string) {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }

      return;
    }

    await SecureStore.setItemAsync(key, value);
  } catch {
    return;
  }
}

async function deleteItem(key: string) {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }

      return;
    }

    await SecureStore.deleteItemAsync(key);
  } catch {
    return;
  }
}

export const adminConfigState = proxy({
  ...getDefaultAdminConfig(),
  accounts: [] as AdminAccountProfile[],
  activeAccountId: '',
  hydrated: false,
  saving: false,
});

function authSessionFromAccount(account?: AdminAccountProfile): AuthSession {
  return {
    authMode: account?.authMode ?? 'admin_key',
    accessToken: account?.accessToken ?? '',
    refreshToken: account?.refreshToken ?? '',
    user: account?.user ?? null,
  };
}

function persistAuthSession(session: AuthSession) {
  return setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

export async function hydrateAdminConfig() {
  const defaults = getDefaultAdminConfig();

  try {
    const [baseUrl, adminApiKey, rawAccounts, activeAccountId, rawSession] = await Promise.all([
      getItem(BASE_URL_KEY),
      getItem(ADMIN_KEY_KEY),
      getItem(ACCOUNTS_KEY),
      getItem(ACTIVE_ACCOUNT_ID_KEY),
      getItem(AUTH_SESSION_KEY),
    ]);
    let legacySession: AuthSession | null = null;
    try { legacySession = rawSession ? JSON.parse(rawSession) as AuthSession : null; } catch { legacySession = null; }

    let accounts: AdminAccountProfile[] = [];

    if (rawAccounts) {
      try {
        const parsed = JSON.parse(rawAccounts) as AdminAccountProfile[];
        accounts = Array.isArray(parsed) ? sanitizeAccountsForWeb(parsed.map((account) => normalizeAccount(account))) : [];
      } catch {
        accounts = [];
      }
    }

    if (accounts.length === 0 && baseUrl) {
      const legacyConfig = normalizeConfig({
        baseUrl,
        adminApiKey: IS_WEB ? defaults.adminApiKey : adminApiKey ?? defaults.adminApiKey,
      });

      accounts = [
        {
          id: createAccountId(),
          label: getAccountLabel(legacyConfig.baseUrl),
          ...legacyConfig,
          ...(legacySession ?? authSessionFromAccount()),
          updatedAt: new Date().toISOString(),
          enabled: true,
        },
      ];
    }

    const sortedAccounts = sortAccounts(accounts);
    const activeAccount = activeAccountId || baseUrl ? getNextActiveAccount(sortedAccounts, activeAccountId ?? undefined) : undefined;
    const nextActiveAccountId = activeAccount?.id || '';

    adminConfigState.accounts = sortedAccounts;
    adminConfigState.activeAccountId = nextActiveAccountId;
    adminConfigState.baseUrl = activeAccount?.baseUrl ?? defaults.baseUrl;
    adminConfigState.adminApiKey = activeAccount?.adminApiKey ?? defaults.adminApiKey;
    const activeSession = activeAccount ? authSessionFromAccount(activeAccount) : (legacySession ?? authSessionFromAccount());
    adminConfigState.authMode = activeSession.authMode;
    adminConfigState.accessToken = activeSession.accessToken;
    adminConfigState.refreshToken = activeSession.refreshToken;
    adminConfigState.user = activeSession.user;

    await Promise.all([
      persistAccounts(sortedAccounts),
      nextActiveAccountId ? setItem(ACTIVE_ACCOUNT_ID_KEY, nextActiveAccountId) : deleteItem(ACTIVE_ACCOUNT_ID_KEY),
      setItem(BASE_URL_KEY, activeAccount?.baseUrl ?? defaults.baseUrl),
      persistAdminApiKey(activeAccount?.adminApiKey ?? defaults.adminApiKey),
      persistAuthSession(activeSession),
    ]);
  } finally {
    adminConfigState.hydrated = true;
  }
}

export async function saveAdminConfig(input: {
  baseUrl: string;
  adminApiKey?: string;
  authMode?: 'admin_key' | 'password';
  accessToken?: string;
  refreshToken?: string;
  user?: AuthenticatedUser | null;
  remember?: boolean;
  loginEmail?: string;
  loginSecret?: string;
}) {
  adminConfigState.saving = true;

  try {
    const normalized = normalizeConfig({ baseUrl: input.baseUrl, adminApiKey: input.adminApiKey ?? '' });
    const session: AuthSession = {
      authMode: input.authMode ?? 'admin_key',
      accessToken: input.accessToken ?? '',
      refreshToken: input.refreshToken ?? '',
      user: input.user ?? null,
    };
    const nextUpdatedAt = new Date().toISOString();
    const existingAccount = adminConfigState.accounts.find(
      (account: AdminAccountProfile) => account.baseUrl === normalized.baseUrl && account.authMode === session.authMode &&
        (session.authMode === 'password' ? account.user?.email === session.user?.email : account.adminApiKey === normalized.adminApiKey)
    );
    const remembered = input.remember ?? existingAccount?.remembered ?? true;
    const rememberedCredentials = remembered
      ? {
          loginEmail: input.loginEmail ?? existingAccount?.loginEmail ?? session.user?.email ?? '',
          loginSecret: input.loginSecret ?? existingAccount?.loginSecret ?? '',
        }
      : { loginEmail: '', loginSecret: '' };
    const nextAccount: AdminAccountProfile = existingAccount
      ? {
          ...existingAccount,
          label: getAccountLabel(normalized.baseUrl),
          updatedAt: nextUpdatedAt,
          ...session,
          remembered,
          ...rememberedCredentials,
        }
      : {
          id: createAccountId(),
          label: getAccountLabel(normalized.baseUrl),
          ...normalized,
          ...session,
          remembered,
          ...rememberedCredentials,
          updatedAt: nextUpdatedAt,
          enabled: true,
        };
    const nextAccounts = sortAccounts([
      nextAccount,
      ...adminConfigState.accounts.filter((account: AdminAccountProfile) => account.id !== nextAccount.id),
    ]);

    await Promise.all([
      setItem(BASE_URL_KEY, normalized.baseUrl),
      persistAdminApiKey(normalized.adminApiKey),
      persistAccounts(nextAccounts),
      setItem(ACTIVE_ACCOUNT_ID_KEY, nextAccount.id),
      persistAuthSession(session),
    ]);

    adminConfigState.accounts = nextAccounts;
    adminConfigState.activeAccountId = nextAccount.id;
    adminConfigState.baseUrl = normalized.baseUrl;
    adminConfigState.adminApiKey = normalized.adminApiKey;
    adminConfigState.authMode = session.authMode;
    adminConfigState.accessToken = session.accessToken;
    adminConfigState.refreshToken = session.refreshToken;
    adminConfigState.user = session.user;
  } finally {
    adminConfigState.saving = false;
  }
}

export async function switchAdminAccount(accountId: string) {
  const account = adminConfigState.accounts.find((item: AdminAccountProfile) => item.id === accountId);

  if (!account) {
    return;
  }

  if (account.enabled === false) {
    return;
  }

  const nextAccount = {
    ...account,
    updatedAt: new Date().toISOString(),
  };
  const nextAccounts = sortAccounts([
    nextAccount,
    ...adminConfigState.accounts.filter((item: AdminAccountProfile) => item.id !== accountId),
  ]);

  await Promise.all([
    setItem(BASE_URL_KEY, nextAccount.baseUrl),
    persistAdminApiKey(nextAccount.adminApiKey),
    persistAccounts(nextAccounts),
    setItem(ACTIVE_ACCOUNT_ID_KEY, nextAccount.id),
    persistAuthSession(authSessionFromAccount(nextAccount)),
  ]);

  adminConfigState.accounts = nextAccounts;
  adminConfigState.activeAccountId = nextAccount.id;
  adminConfigState.baseUrl = nextAccount.baseUrl;
  adminConfigState.adminApiKey = nextAccount.adminApiKey;
  adminConfigState.authMode = nextAccount.authMode ?? 'admin_key';
  adminConfigState.accessToken = nextAccount.accessToken ?? '';
  adminConfigState.refreshToken = nextAccount.refreshToken ?? '';
  adminConfigState.user = nextAccount.user ?? null;
}

export async function removeAdminAccount(accountId: string) {
  const nextAccounts = adminConfigState.accounts.filter((item: AdminAccountProfile) => item.id !== accountId);
  const nextActiveAccount = getNextActiveAccount(nextAccounts, adminConfigState.activeAccountId === accountId ? '' : adminConfigState.activeAccountId);

  await Promise.all([
    persistAccounts(nextAccounts),
    nextActiveAccount ? setItem(ACTIVE_ACCOUNT_ID_KEY, nextActiveAccount.id) : deleteItem(ACTIVE_ACCOUNT_ID_KEY),
    setItem(BASE_URL_KEY, nextActiveAccount?.baseUrl ?? ''),
    persistAdminApiKey(nextActiveAccount?.adminApiKey ?? ''),
    persistAuthSession(authSessionFromAccount(nextActiveAccount)),
  ]);

  adminConfigState.accounts = nextAccounts;
  adminConfigState.activeAccountId = nextActiveAccount?.id ?? '';
  adminConfigState.baseUrl = nextActiveAccount?.baseUrl ?? '';
  adminConfigState.adminApiKey = nextActiveAccount?.adminApiKey ?? '';
  Object.assign(adminConfigState, authSessionFromAccount(nextActiveAccount));
}

export async function forgetAdminAccount(accountId: string) {
  const nextAccounts = adminConfigState.accounts.filter((item: AdminAccountProfile) => item.id !== accountId);
  await persistAccounts(nextAccounts);
  adminConfigState.accounts = nextAccounts;
}

export async function logoutAdminAccount() {
  const nextAccounts = adminConfigState.accounts.filter(
    (account: AdminAccountProfile) => account.id !== adminConfigState.activeAccountId || account.remembered !== false
  );
  await Promise.all([persistAccounts(nextAccounts), setItem(BASE_URL_KEY, ''), persistAdminApiKey(''), deleteItem(ACTIVE_ACCOUNT_ID_KEY), deleteItem(AUTH_SESSION_KEY)]);

  adminConfigState.accounts = nextAccounts;
  adminConfigState.activeAccountId = '';
  adminConfigState.baseUrl = '';
  adminConfigState.adminApiKey = '';
  Object.assign(adminConfigState, authSessionFromAccount());
}

export async function setAdminAccountEnabled(accountId: string, enabled: boolean) {
  const nextAccounts = sortAccounts(
    adminConfigState.accounts.map((account: AdminAccountProfile) =>
      account.id === accountId ? { ...account, enabled, updatedAt: new Date().toISOString() } : account
    )
  );
  const nextActiveAccount = getNextActiveAccount(nextAccounts, enabled ? accountId : adminConfigState.activeAccountId);

  await Promise.all([
    persistAccounts(nextAccounts),
    nextActiveAccount ? setItem(ACTIVE_ACCOUNT_ID_KEY, nextActiveAccount.id) : deleteItem(ACTIVE_ACCOUNT_ID_KEY),
    setItem(BASE_URL_KEY, nextActiveAccount?.baseUrl ?? ''),
    persistAdminApiKey(nextActiveAccount?.adminApiKey ?? ''),
    persistAuthSession(authSessionFromAccount(nextActiveAccount)),
  ]);

  adminConfigState.accounts = nextAccounts;
  adminConfigState.activeAccountId = nextActiveAccount?.id ?? '';
  adminConfigState.baseUrl = nextActiveAccount?.baseUrl ?? '';
  adminConfigState.adminApiKey = nextActiveAccount?.adminApiKey ?? '';
  Object.assign(adminConfigState, authSessionFromAccount(nextActiveAccount));
}

export function isAdminSession() {
  return adminConfigState.authMode === 'admin_key' || adminConfigState.user?.role === 'admin';
}
