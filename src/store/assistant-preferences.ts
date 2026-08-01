import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
const { proxy } = require('valtio');

const KEY = 'sub2api_assistant_preferences_v1';
export type AssistantPet = 'ai' | 'cat' | 'dog' | 'fox' | 'rabbit' | 'sprite' | 'tiga' | 'gg-bond';
export type AssistantPosition = { x: number; y: number };

type AssistantPreferences = {
  hydrated: boolean;
  floatingEnabled: boolean;
  pet: AssistantPet;
  floatingPosition: AssistantPosition | null;
};

type StoredAssistantPreferences = Partial<Omit<AssistantPreferences, 'hydrated'>>;

export const assistantPetOptions: { value: AssistantPet; label: string; emoji: string }[] = [
  { value: 'ai', label: 'AI 助手', emoji: '🤖' },
  { value: 'cat', label: '猫咪', emoji: '🐱' },
  { value: 'dog', label: '小狗', emoji: '🐶' },
  { value: 'fox', label: '狐狸', emoji: '🦊' },
  { value: 'rabbit', label: '兔子', emoji: '🐰' },
  { value: 'sprite', label: '小精灵', emoji: '🧚' },
  { value: 'tiga', label: '迪迦奥特曼', emoji: '🦸' },
  { value: 'gg-bond', label: '猪猪侠', emoji: '🐷' },
];

export const assistantPreferencesState = proxy({
  hydrated: false,
  floatingEnabled: true,
  pet: 'dog',
  floatingPosition: null,
} as AssistantPreferences) as AssistantPreferences;

function isAssistantPet(value: unknown): value is AssistantPet {
  return assistantPetOptions.some((option) => option.value === value);
}

function isAssistantPosition(value: unknown): value is AssistantPosition {
  if (!value || typeof value !== 'object') return false;
  const position = value as AssistantPosition;
  return Number.isFinite(position.x) && Number.isFinite(position.y);
}

async function persistAssistantPreferences() {
  const raw = JSON.stringify({
    floatingEnabled: assistantPreferencesState.floatingEnabled,
    pet: assistantPreferencesState.pet,
    floatingPosition: assistantPreferencesState.floatingPosition,
  });
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, raw);
  else await SecureStore.setItemAsync(KEY, raw);
}

export async function hydrateAssistantPreferences() {
  if (assistantPreferencesState.hydrated) return;
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredAssistantPreferences;
      assistantPreferencesState.floatingEnabled = parsed.floatingEnabled !== false;
      if (isAssistantPet(parsed.pet)) assistantPreferencesState.pet = parsed.pet;
      if (isAssistantPosition(parsed.floatingPosition)) assistantPreferencesState.floatingPosition = parsed.floatingPosition;
    }
  } catch {
    assistantPreferencesState.floatingEnabled = true;
    assistantPreferencesState.pet = 'dog';
    assistantPreferencesState.floatingPosition = null;
  } finally {
    assistantPreferencesState.hydrated = true;
  }
}

export async function setFloatingAssistantEnabled(enabled: boolean) {
  assistantPreferencesState.floatingEnabled = enabled;
  await persistAssistantPreferences();
}

export async function setAssistantPet(pet: AssistantPet) {
  assistantPreferencesState.pet = pet;
  await persistAssistantPreferences();
}

export async function setFloatingAssistantPosition(position: AssistantPosition) {
  assistantPreferencesState.floatingPosition = position;
  await persistAssistantPreferences();
}
