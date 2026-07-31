export function trimServerUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

export function getServerRootUrl(value: string) {
  return trimServerUrl(value).replace(/(?:\/api\/v1|\/v1)$/i, '');
}

export function getOpenAIBaseUrl(value: string) {
  return `${getServerRootUrl(value)}/v1`;
}
