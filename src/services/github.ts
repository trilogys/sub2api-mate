import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const GITHUB_CONFIG_STORAGE_KEY = 'sub2api_github_config_v1';

export type GitHubConfig = {
  repository: string;
  token: string;
  baseBranch: string;
};

export type GitHubSourceFile = {
  path: string;
  sha: string;
  content: string;
  excerpt: string;
};

export type GitHubFixProposal = {
  title: string;
  summary: string;
  prBody: string;
  changes: Array<{
    path: string;
    reason: string;
    replacements: Array<{ old: string; new: string }>;
  }>;
};

export type GitHubWorkflowRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  head_branch: string;
  created_at: string;
  updated_at: string;
};

export type GitHubWorkflowStep = {
  number: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed' | string;
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null | string;
  started_at?: string | null;
  completed_at?: string | null;
};

export type GitHubWorkflowJob = {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed' | string;
  conclusion: string | null;
  html_url: string;
  started_at?: string | null;
  completed_at?: string | null;
  steps?: GitHubWorkflowStep[];
};

export type GitHubArtifact = {
  id: number;
  name: string;
  size_in_bytes: number;
  archive_download_url: string;
  expired: boolean;
  created_at: string;
  expires_at: string;
};

export type GitHubWorkflowRunDetails = {
  jobs: GitHubWorkflowJob[];
  artifacts: GitHubArtifact[];
};

const apiBase = 'https://api.github.com';
const allowedPath = /^(?:app|src)\/.+\.(?:ts|tsx|js|jsx|json)$/;

export const defaultGitHubConfig: GitHubConfig = {
  repository: 'trilogys/sub2api-mate',
  token: '',
  baseBranch: 'main',
};

export function normalizeGitHubRepository(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');
}

async function githubRequest<T>(config: GitHubConfig, path: string, init?: RequestInit): Promise<T> {
  const repository = normalizeGitHubRepository(config.repository);
  if (!/^[^/]+\/[^/]+$/.test(repository)) throw new Error('GitHub 仓库格式应为 owner/repository');
  if (!config.token.trim()) throw new Error('请先配置 GitHub Token');
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token.trim()}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    throw new Error(`GitHub 返回了无效响应（HTTP ${response.status}）`);
  }
  if (!response.ok) {
    const error = payload as { message?: string; errors?: Array<{ message?: string }> } | undefined;
    throw new Error(error?.errors?.[0]?.message || error?.message || `GitHub 请求失败（HTTP ${response.status}）`);
  }
  return payload as T;
}

function decodeBase64(value: string) {
  const binary = globalThis.atob(value.replace(/\s/g, ''));
  const escaped = Array.from(binary, (character) => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`).join('');
  return decodeURIComponent(escaped);
}

function encodeBase64(value: string) {
  return globalThis.btoa(unescape(encodeURIComponent(value)));
}

export async function loadGitHubConfig(): Promise<GitHubConfig> {
  if (Platform.OS === 'web') return defaultGitHubConfig;
  const value = await SecureStore.getItemAsync(GITHUB_CONFIG_STORAGE_KEY);
  if (!value) return defaultGitHubConfig;
  try {
    const saved = JSON.parse(value) as Partial<GitHubConfig>;
    return {
      ...defaultGitHubConfig,
      ...saved,
      repository: saved.repository === 'trilogys/sub2api-mobile'
        ? defaultGitHubConfig.repository
        : saved.repository ?? defaultGitHubConfig.repository,
    };
  } catch {
    return defaultGitHubConfig;
  }
}

export async function saveGitHubConfig(config: GitHubConfig) {
  if (Platform.OS === 'web') return;
  await SecureStore.setItemAsync(GITHUB_CONFIG_STORAGE_KEY, JSON.stringify({
    ...config,
    repository: normalizeGitHubRepository(config.repository),
    token: config.token.trim(),
    baseBranch: config.baseBranch.trim() || 'main',
  }));
}

export async function clearGitHubConfig() {
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(GITHUB_CONFIG_STORAGE_KEY);
}

export function getGitHubRepository(config: GitHubConfig) {
  return githubRequest<{
    full_name: string;
    default_branch: string;
    html_url: string;
    permissions?: { push?: boolean; admin?: boolean; maintain?: boolean };
  }>(config, `/repos/${normalizeGitHubRepository(config.repository)}`);
}

export async function dispatchGitHubWorkflow(
  config: GitHubConfig,
  workflow: string,
  ref: string,
  inputs: Record<string, string>,
) {
  const repository = normalizeGitHubRepository(config.repository);
  await githubRequest<void>(config, `/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: ref.trim() || config.baseBranch.trim() || 'main', inputs }),
  });
}

export async function getLatestGitHubWorkflowRun(
  config: GitHubConfig,
  workflow: string,
  branch: string,
  requestedAt: number,
): Promise<GitHubWorkflowRun | null> {
  const repository = normalizeGitHubRepository(config.repository);
  const query = new URLSearchParams({ event: 'workflow_dispatch', branch, per_page: '10' });
  const result = await githubRequest<{ workflow_runs?: GitHubWorkflowRun[] }>(
    config,
    `/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/runs?${query}`,
  );
  const earliest = requestedAt - 30000;
  return (result.workflow_runs ?? []).find((run) => Date.parse(run.created_at) >= earliest) ?? null;
}

export async function getGitHubWorkflowRunDetails(config: GitHubConfig, runId: number): Promise<GitHubWorkflowRunDetails> {
  const repository = normalizeGitHubRepository(config.repository);
  const [jobsResult, artifactsResult] = await Promise.all([
    githubRequest<{ jobs?: GitHubWorkflowJob[] }>(config, `/repos/${repository}/actions/runs/${runId}/jobs?per_page=100`),
    githubRequest<{ artifacts?: GitHubArtifact[] }>(config, `/repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`),
  ]);
  return {
    jobs: jobsResult.jobs ?? [],
    artifacts: (artifactsResult.artifacts ?? []).filter((artifact) => !artifact.expired),
  };
}

async function fetchRepositoryFile(config: GitHubConfig, path: string): Promise<GitHubSourceFile> {
  const repository = normalizeGitHubRepository(config.repository);
  const branch = encodeURIComponent(config.baseBranch.trim() || 'main');
  const file = await githubRequest<{ path: string; sha: string; content: string; encoding: string }>(
    config,
    `/repos/${repository}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${branch}`,
  );
  if (file.encoding !== 'base64') throw new Error(`不支持的 GitHub 文件编码：${file.encoding}`);
  const content = decodeBase64(file.content);
  return { path: file.path, sha: file.sha, content, excerpt: content.slice(0, 6000) };
}

function excerptForProblem(content: string, problem: string) {
  const route = problem.match(/\/api\/v1\/admin\/[A-Za-z0-9_./:-]+/)?.[0] || '';
  const group = route.split('/')[4] || '';
  const candidates = [route, route.replace('/api/v1', ''), group].filter((value) => value.length > 2);
  const index = candidates.map((candidate) => content.toLowerCase().indexOf(candidate.toLowerCase())).find((value) => value >= 0) ?? -1;
  if (index < 0) return content.slice(0, 6000);
  return content.slice(Math.max(0, index - 2500), Math.min(content.length, index + 5500));
}

export async function findRelevantRepositoryFiles(config: GitHubConfig, problem: string): Promise<GitHubSourceFile[]> {
  const repository = normalizeGitHubRepository(config.repository);
  const route = problem.match(/\/api\/v1\/admin\/[A-Za-z0-9_./:-]+/)?.[0];
  const group = route?.split('/')[4];
  const searchTerm = route ? route.replace('/api/v1', '') : group || 'adminFetch';
  const query = encodeURIComponent(`${searchTerm} repo:${repository}`);
  let paths: string[] = [];
  try {
    const result = await githubRequest<{ items?: Array<{ path: string }> }>(config, `/search/code?q=${query}&per_page=10`);
    paths = (result.items ?? []).map((item) => item.path).filter((path) => allowedPath.test(path));
  } catch {
    paths = [];
  }
  const defaults = group ? [`app/${group}.tsx`, `src/services/admin.ts`, `src/types/admin.ts`] : ['src/services/admin.ts', 'src/types/admin.ts'];
  const selected = [...new Set([...paths, ...defaults])].filter((path) => allowedPath.test(path)).slice(0, 4);
  const files: GitHubSourceFile[] = [];
  for (const path of selected) {
    try {
      const file = await fetchRepositoryFile(config, path);
      files.push({ ...file, excerpt: excerptForProblem(file.content, problem) });
    } catch {
      // A suggested path may not exist on every branch; continue with the remaining evidence.
    }
  }
  if (!files.length) throw new Error('没有在仓库中找到可供 AI 检查的 app/src 源文件');
  return files;
}

function applyProposal(files: GitHubSourceFile[], proposal: GitHubFixProposal) {
  if (!proposal.changes.length || proposal.changes.length > 3) throw new Error('AI 修复方案必须修改 1 到 3 个文件');
  if (new Set(proposal.changes.map((change) => change.path)).size !== proposal.changes.length) throw new Error('AI 修复方案包含重复文件');
  return proposal.changes.map((change) => {
    if (!allowedPath.test(change.path)) throw new Error(`不允许自动修改该路径：${change.path}`);
    const file = files.find((item) => item.path === change.path);
    if (!file) throw new Error(`AI 尝试修改未提供给它的文件：${change.path}`);
    if (!change.replacements.length) throw new Error(`AI 没有提供 ${change.path} 的代码替换`);
    let content = file.content;
    for (const replacement of change.replacements) {
      if (!replacement.old || replacement.old === replacement.new) throw new Error(`无效替换：${change.path}`);
      const first = content.indexOf(replacement.old);
      if (first < 0 || content.indexOf(replacement.old, first + replacement.old.length) >= 0) {
        throw new Error(`无法唯一定位 ${change.path} 中的待替换代码`);
      }
      content = `${content.slice(0, first)}${replacement.new}${content.slice(first + replacement.old.length)}`;
    }
    if (/github_pat_|ghp_[A-Za-z0-9]+|sk-[A-Za-z0-9]{16,}/.test(content)) throw new Error(`修复内容疑似包含密钥：${change.path}`);
    if (content === file.content) throw new Error(`AI 没有实际修改 ${change.path}`);
    return { ...change, sha: file.sha, content };
  });
}

export async function createGitHubFixPullRequest(config: GitHubConfig, files: GitHubSourceFile[], proposal: GitHubFixProposal) {
  const repository = normalizeGitHubRepository(config.repository);
  const baseBranch = config.baseBranch.trim() || 'main';
  const changes = applyProposal(files, proposal);
  const ref = await githubRequest<{ object: { sha: string } }>(config, `/repos/${repository}/git/ref/heads/${encodeURIComponent(baseBranch)}`);
  const branch = `ai/api-fix-${Date.now()}`;
  await githubRequest(config, `/repos/${repository}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: ref.object.sha }),
  });
  for (const change of changes) {
    await githubRequest(config, `/repos/${repository}/contents/${change.path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Fix API error in ${change.path}`,
        content: encodeBase64(change.content),
        sha: change.sha,
        branch,
      }),
    });
  }
  return githubRequest<{ html_url: string; number: number; title: string }>(config, `/repos/${repository}/pulls`, {
    method: 'POST',
    body: JSON.stringify({ title: proposal.title.trim().slice(0, 120), body: proposal.prBody.trim(), head: branch, base: baseBranch, draft: true }),
  });
}
