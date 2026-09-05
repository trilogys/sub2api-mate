import type { SystemVersionInfo } from '../types/admin';

const releaseBase = 'https://github.com/Wei-Shaw/sub2api/releases/tag/';

export function getSub2APIReleaseUrl(version: Pick<SystemVersionInfo, 'latest_version' | 'release_info'> | undefined) {
  const releaseUrl = version?.release_info?.html_url?.trim();
  if (releaseUrl) {
    try {
      const url = new URL(releaseUrl);
      if (url.protocol === 'https:' && url.hostname === 'github.com'
        && /^\/Wei-Shaw\/sub2api\/releases\/tag\/[^/]+$/i.test(url.pathname)
        && !url.username && !url.password && !url.port) return url.href;
    } catch {
      // Older servers can omit the release URL; use their reported version below.
    }
  }
  const latest = version?.latest_version?.trim();
  if (!latest || !/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(latest)) return null;
  const tag = latest.startsWith('v') ? latest : `v${latest}`;
  return `${releaseBase}${encodeURIComponent(tag)}`;
}
