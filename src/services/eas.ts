export type EASWorkflowStatus = 'new' | 'in-progress' | 'action-required' | 'success' | 'failure' | 'canceled';

export type EASWorkflowRun = {
  id: string;
  status: EASWorkflowStatus;
  url: string;
  requestedGitRef: string;
  gitCommitHash?: string;
  gitCommitMessage?: string;
  createdAt: string;
  updatedAt: string;
  jobs: Array<{
    id: string;
    key: string;
    name: string;
    type: string;
    status: string;
    buildId?: string | null;
    errors: unknown[];
  }>;
};

const apiBase = 'https://api.expo.dev';

export const EXPO_TOKEN_STORAGE_KEY = 'sub2api_expo_access_token';
export const EAS_PROJECT_ID = '13df808b-fe18-475e-b188-f4dd64e90e7e';
export const EAS_DEFAULT_GIT_REF = 'main';

async function easFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const text = await response.text();
  let payload: { data?: T; message?: string; error?: string; errors?: Array<{ message?: string }> } | undefined;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    throw new Error(`EAS 返回了无效响应（HTTP ${response.status}）`);
  }
  if (!response.ok || !payload?.data) {
    throw new Error(payload?.message || payload?.error || payload?.errors?.[0]?.message || `EAS 请求失败（HTTP ${response.status}）`);
  }
  return payload.data;
}

export function dispatchAPKWorkflow(input: {
  token: string;
  appId: string;
  gitRef: string;
  profile?: string;
}) {
  return easFetch<{ id: string; url: string }>('/v2/workflows/dispatch', input.token, {
    method: 'POST',
    body: JSON.stringify({
      appId: input.appId,
      gitRef: input.gitRef,
      fileName: 'build-apk.yml',
      inputs: { profile: input.profile || 'preview' },
    }),
  });
}

export function getEASWorkflowRun(token: string, runId: string) {
  return easFetch<EASWorkflowRun>(`/v2/workflows/runs/${encodeURIComponent(runId)}`, token);
}
