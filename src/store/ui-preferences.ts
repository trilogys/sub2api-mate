import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
const { proxy } = require('valtio');

const KEY = 'sub2api_ui_preferences_v1';
export type UIPreferences = {
  hiddenMenuIds: string[];
  menuOrder: string[];
  menuButtonPosition: { x: number; y: number } | null;
  defaultMenuId: string | null;
  colorMode: 'light' | 'dark';
  language: 'zh' | 'en';
  menuDefaultsVersion: number;
};
export const languageState = proxy({ value: 'zh' as 'zh' | 'en' });
export const defaultUIPreferences: UIPreferences = { hiddenMenuIds: ['account-refresh', 'ip'], menuOrder: [], menuButtonPosition: null, defaultMenuId: null, colorMode: 'light', language: 'zh', menuDefaultsVersion: 4 };

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))]
    : [];
}

export function normalizeUIPreferences(value: unknown): UIPreferences {
  const parsed = value && typeof value === 'object' ? value as Partial<UIPreferences> : {};
  const position = parsed.menuButtonPosition;
  return {
    hiddenMenuIds: stringArray(parsed.hiddenMenuIds),
    menuOrder: stringArray(parsed.menuOrder),
    menuButtonPosition: position && Number.isFinite(position.x) && Number.isFinite(position.y)
      ? { x: position.x, y: position.y }
      : null,
    defaultMenuId: typeof parsed.defaultMenuId === 'string' ? parsed.defaultMenuId : null,
    colorMode: parsed.colorMode === 'dark' ? 'dark' : 'light',
    language: parsed.language === 'en' ? 'en' : 'zh',
    menuDefaultsVersion: Number.isFinite(parsed.menuDefaultsVersion) ? Number(parsed.menuDefaultsVersion) : 0,
  };
}

function moveAfter(order: string[], id: string, anchorId: string) {
  const next = order.filter((item) => item !== id);
  const anchorIndex = next.indexOf(anchorId);
  if (anchorIndex < 0) return order;
  next.splice(anchorIndex + 1, 0, id);
  return next;
}

export async function loadUIPreferences(): Promise<UIPreferences> {
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    if (!raw) return normalizeUIPreferences(defaultUIPreferences);
    const parsed = normalizeUIPreferences(JSON.parse(raw));
    const hiddenMenuIds = [...parsed.hiddenMenuIds];
    let menuOrder = [...parsed.menuOrder];
    if (parsed.menuDefaultsVersion < 1 && !hiddenMenuIds.includes('account-refresh')) hiddenMenuIds.push('account-refresh');
    if (parsed.menuDefaultsVersion < 2 && !hiddenMenuIds.includes('ip')) hiddenMenuIds.push('ip');
    if (parsed.menuDefaultsVersion < 3 && menuOrder.length > 0) {
      menuOrder = moveAfter(menuOrder, 'ops', 'dashboard');
      menuOrder = moveAfter(menuOrder, 'ai', 'proxies');
    }
    if (parsed.menuDefaultsVersion < 4 && menuOrder.length > 0) {
      menuOrder = moveAfter(menuOrder, 'proxies', 'api-keys');
      menuOrder = moveAfter(menuOrder, 'usage', 'proxies');
      menuOrder = moveAfter(menuOrder, 'ai', 'usage');
      menuOrder = moveAfter(menuOrder, 'users', 'ai');
      menuOrder = moveAfter(menuOrder, 'groups', 'users');
    }
    return {
      hiddenMenuIds,
      menuOrder,
      menuButtonPosition: parsed.menuButtonPosition,
      defaultMenuId: parsed.defaultMenuId,
      colorMode: parsed.colorMode,
      language: parsed.language,
      menuDefaultsVersion: 4,
    };
  } catch { return normalizeUIPreferences(defaultUIPreferences); }
}

export async function saveUIPreferences(value: UIPreferences) {
  const raw = JSON.stringify(normalizeUIPreferences(value));
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, raw);
  else await SecureStore.setItemAsync(KEY, raw);
}

export function applyAppLanguage(language: 'zh' | 'en') {
  languageState.value = language;
}

export async function setAppLanguage(language: 'zh' | 'en') {
  applyAppLanguage(language);
  const preferences = await loadUIPreferences();
  await saveUIPreferences({ ...preferences, language });
}
