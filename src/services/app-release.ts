export const APP_REPOSITORY = 'trilogys/sub2api-mate';
export const APP_REPOSITORY_URL = `https://github.com/${APP_REPOSITORY}`;

export type AppReleaseAsset = {
  id: number;
  name: string;
  browser_download_url: string;
  content_type: string;
  size: number;
};

export type AppRelease = {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  assets: AppReleaseAsset[];
};

function versionParts(value: string) {
  return value
    .trim()
    .replace(/^v/i, '')
    .split(/[+-]/, 1)[0]
    .split('.')
    .map((part) => Number.parseInt(part.replace(/\D.*$/, ''), 10) || 0);
}

export function isNewerAppVersion(latest: string, current: string) {
  const latestParts = versionParts(latest);
  const currentParts = versionParts(current);
  const length = Math.max(latestParts.length, currentParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (latestParts[index] ?? 0) - (currentParts[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

export async function getLatestAppRelease(): Promise<AppRelease | null> {
  const response = await fetch(`https://api.github.com/repos/${APP_REPOSITORY}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (response.status === 404) return null;
  const raw = await response.text();
  let data: any;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`GitHub 返回了无效响应（HTTP ${response.status}）`);
  }
  if (!response.ok) throw new Error(data?.message || `检查更新失败（HTTP ${response.status}）`);
  return {
    tag_name: String(data.tag_name || ''),
    name: String(data.name || data.tag_name || ''),
    body: String(data.body || ''),
    html_url: String(data.html_url || `${APP_REPOSITORY_URL}/releases`),
    published_at: String(data.published_at || ''),
    assets: Array.isArray(data.assets) ? data.assets.map((asset: any) => ({
      id: Number(asset.id),
      name: String(asset.name || ''),
      browser_download_url: String(asset.browser_download_url || ''),
      content_type: String(asset.content_type || ''),
      size: Number(asset.size || 0),
    })) : [],
  };
}

export function findAndroidApk(release: AppRelease | null | undefined, architectures?: readonly string[] | null) {
  const apks = release?.assets.filter((asset) => asset.name.toLowerCase().endsWith('.apk')) ?? [];
  if (apks.length === 0) return null;

  const architectureNames = architectures?.map((architecture) => architecture.toLowerCase()) ?? [];
  const preferredAbi = architectureNames.map((architecture) => {
    if (architecture.includes('arm64')) return 'arm64-v8a';
    if (architecture.includes('armeabi') || architecture.includes('armv7')) return 'armeabi-v7a';
    if (architecture.includes('x86_64') || architecture.includes('x86-64')) return 'x86_64';
    return null;
  }).find(Boolean);

  if (preferredAbi) {
    const matchingApk = apks.find((asset) => asset.name.toLowerCase().includes(preferredAbi));
    if (matchingApk) return matchingApk;
  }

  return apks.find((asset) => !/(arm64-v8a|armeabi-v7a|x86_64)/i.test(asset.name)) ?? apks[0];
}
