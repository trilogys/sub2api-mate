const forwardedRequestHeaders = ['accept', 'authorization', 'content-type', 'idempotency-key', 'x-api-key'];
const forwardedResponseHeaders = ['content-disposition', 'content-type'];

function readRequestBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : undefined));
    request.on('error', reject);
  });
}

function getTargetUrl(request) {
  const value = request.headers['x-sub2api-target-url'];
  if (typeof value !== 'string' || !value.trim()) throw new Error('SUB2API_TARGET_URL_REQUIRED');
  const target = new URL(value.trim());
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('SUB2API_TARGET_PROTOCOL_NOT_ALLOWED');
  if (target.username || target.password) throw new Error('SUB2API_TARGET_CREDENTIALS_NOT_ALLOWED');
  return target;
}

async function proxySub2APIRequest(request, response) {
  try {
    const target = getTargetUrl(request);
    const headers = new Headers();
    forwardedRequestHeaders.forEach((name) => {
      const value = request.headers[name];
      if (typeof value === 'string' && value) headers.set(name, value);
    });
    const body = await readRequestBody(request);
    const upstream = await fetch(target, { method: request.method, headers, body, redirect: 'follow' });
    response.statusCode = upstream.status;
    forwardedResponseHeaders.forEach((name) => {
      const value = upstream.headers.get(name);
      if (value) response.setHeader(name, value);
    });
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    response.statusCode = 502;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({
      code: 502,
      message: 'WEB_PROXY_REQUEST_FAILED',
      reason: 'WEB_PROXY_UPSTREAM_UNREACHABLE',
      detail: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
    }));
  }
}

module.exports = { proxySub2APIRequest };
