import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const { proxy } = require('valtio');

const STORAGE_KEY = 'sub2api_mate_workspace_v1';

export type WorkspaceMode = 'sub2api' | 'cliproxy';

export const workspaceModeState = proxy({
  mode: 'sub2api' as WorkspaceMode,
  hydrated: false,
});

async function readMode() {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
    return await SecureStore.getItemAsync(STORAGE_KEY);
  } catch {
    return null;
  }
}

async function writeMode(mode: WorkspaceMode) {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(STORAGE_KEY, mode);
    return;
  }
  await SecureStore.setItemAsync(STORAGE_KEY, mode);
}

export async function hydrateWorkspaceMode() {
  if (workspaceModeState.hydrated) return workspaceModeState.mode;
  const stored = await readMode();
  workspaceModeState.mode = stored === 'cliproxy' ? 'cliproxy' : 'sub2api';
  workspaceModeState.hydrated = true;
  return workspaceModeState.mode;
}

export async function setWorkspaceMode(mode: WorkspaceMode) {
  await writeMode(mode);
  workspaceModeState.mode = mode;
  workspaceModeState.hydrated = true;
}
