import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const upstreamRoot = resolve(process.argv[2] || '.upstream-sub2api');
const sourceDirectory = resolve(upstreamRoot, 'frontend/src/api/admin');
const backendDirectory = resolve(upstreamRoot, 'backend/internal/handler/admin');
const outputPath = resolve(process.argv[3] || 'src/generated/sub2api-upstream-client.json');

function clean(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function unique(values) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function findBalancedBlock(source, start) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return source.slice(start);
}

function normalizeEndpoint(endpoint) {
  return endpoint
    .replace(/^\/admin/, '/api/v1/admin')
    .replace(/\$\{([^}]+)\}/g, (_, expression) => `:${clean(expression)}`);
}

const files = (await readdir(sourceDirectory)).filter((file) => file.endsWith('.ts'));
const services = [];
const types = [];
const backendTypes = [];
const handlers = [];

for (const file of files) {
  const source = await readFile(resolve(sourceDirectory, file), 'utf8');
  const sourceName = basename(file, '.ts');
  const functionPattern = /export\s+async\s+function\s+(\w+)\s*\(([\s\S]*?)\)\s*(?::[^{]+)?\{/g;
  for (const match of source.matchAll(functionPattern)) {
    const blockStart = match.index + match[0].lastIndexOf('{');
    const body = findBalancedBlock(source, blockStart);
    const request = body.match(/apiClient\.(get|post|put|patch|delete)(?:<[\s\S]*?>)?\s*\(\s*([`'"])(\/admin\/[^`'"]+)\2/);
    if (!request) continue;
    services.push({
      kind: 'upstream_service',
      source: sourceName,
      name: match[1],
      signature: clean(match[2]),
      method: request[1].toUpperCase(),
      endpoint: normalizeEndpoint(request[3]),
    });
  }

  const typePattern = /export\s+(?:interface|type)\s+(\w+)[^{=]*(?:=\s*)?\{/g;
  for (const match of source.matchAll(typePattern)) {
    const blockStart = match.index + match[0].lastIndexOf('{');
    const body = findBalancedBlock(source, blockStart);
    const fields = unique([...body.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*\??)\s*:/gm)].map((item) => item[1]));
    if (fields.length) types.push({ kind: 'upstream_type', source: sourceName, name: match[1], fields });
  }
}

const backendFiles = (await readdir(backendDirectory)).filter((file) => file.endsWith('.go') && !file.endsWith('_test.go'));
for (const file of backendFiles) {
  const source = await readFile(resolve(backendDirectory, file), 'utf8');
  const sourceName = basename(file, '.go');
  const structPattern = /type\s+(\w+)\s+struct\s*\{/g;
  for (const match of source.matchAll(structPattern)) {
    const blockStart = match.index + match[0].lastIndexOf('{');
    const body = findBalancedBlock(source, blockStart);
    const fields = unique([...body.matchAll(/^\s*[A-Za-z_][A-Za-z0-9_]*\s+[^`\r\n]+`json:"([^",]+)[^"]*"`/gm)].map((item) => item[1]));
    if (fields.length) backendTypes.push({ kind: 'upstream_backend_type', source: sourceName, name: match[1], fields });
  }

  const handlerPattern = /func\s+\(h\s+\*\w+Handler\)\s+(\w+)\s*\(c\s+\*gin\.Context\)\s*\{/g;
  for (const match of source.matchAll(handlerPattern)) {
    const blockStart = match.index + match[0].lastIndexOf('{');
    const body = findBalancedBlock(source, blockStart);
    const pathParameters = unique([...body.matchAll(/c\.Param\("([^"]+)"\)/g)].map((item) => item[1]));
    const queryParameters = unique([...body.matchAll(/c\.(?:Query|DefaultQuery)\("([^"]+)"/g)].map((item) => item[1]));
    const requestTypes = unique([...body.matchAll(/var\s+\w+\s+([A-Za-z_][A-Za-z0-9_.]*)/g)].map((item) => item[1]).filter((name) => /(?:Request|Params|Payload|Config)$/i.test(name)));
    if (pathParameters.length || queryParameters.length || requestTypes.length) {
      handlers.push({ kind: 'upstream_handler', source: sourceName, name: match[1], path_parameters: pathParameters, query_parameters: queryParameters, request_types: requestTypes });
    }
  }
}

services.sort((left, right) => left.endpoint.localeCompare(right.endpoint) || left.method.localeCompare(right.method));
types.sort((left, right) => left.name.localeCompare(right.name));
backendTypes.sort((left, right) => left.name.localeCompare(right.name));
handlers.sort((left, right) => left.name.localeCompare(right.name));
const metadata = {
  source: 'Wei-Shaw/sub2api frontend/src/api/admin and backend/internal/handler/admin',
  counts: { services: services.length, types: types.length, backend_types: backendTypes.length, handlers: handlers.length },
  entries: [...services, ...types, ...backendTypes, ...handlers],
};
await writeFile(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
console.log(`Wrote ${services.length} upstream services, ${types.length} frontend types, ${backendTypes.length} backend types, and ${handlers.length} handler parameter maps to ${outputPath}`);
