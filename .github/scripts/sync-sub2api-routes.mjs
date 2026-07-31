import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const sourceUrl = 'https://raw.githubusercontent.com/Wei-Shaw/sub2api/main/backend/internal/server/routes/admin.go';
const outputPath = resolve(process.argv[2] || 'src/generated/sub2api-admin-routes.json');
const response = await fetch(sourceUrl, { headers: { 'User-Agent': 'sub2api-mobile-route-sync' } });

if (!response.ok) {
  throw new Error(`Failed to download admin routes: HTTP ${response.status}`);
}

const source = await response.text();
const groups = new Map([['admin', '/api/v1/admin']]);
const routes = [];

for (const rawLine of source.split(/\r?\n/)) {
  const line = rawLine.trim();
  const group = line.match(/^(\w+)\s*:=\s*(\w+)\.Group\("([^"]+)"\)/);
  if (group) {
    const [, name, parent, suffix] = group;
    const parentPath = groups.get(parent);
    if (parentPath) groups.set(name, `${parentPath}${suffix}`);
    continue;
  }

  const route = line.match(/^(\w+)\.(GET|POST|PUT|PATCH|DELETE)\("([^"]*)"\s*,\s*(.+)\)$/);
  if (!route) continue;
  const [, groupName, method, suffix, handlers] = route;
  const prefix = groups.get(groupName);
  if (!prefix) continue;
  const handler = handlers.split(',').at(-1)?.trim().replace(/\)+$/, '') || '';
  routes.push({ method, path: `${prefix}${suffix}`, handler });
}

routes.sort((left, right) => left.path.localeCompare(right.path) || left.method.localeCompare(right.method));
const manifest = {
  source: sourceUrl,
  routes_sha256: createHash('sha256').update(JSON.stringify(routes)).digest('hex'),
  route_count: routes.length,
  routes,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Wrote ${routes.length} routes to ${outputPath}`);
