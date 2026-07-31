type PerfMarkName =
  | 'app_start'
  | 'config_hydrated'
  | 'login_interactive'
  | 'dashboard_interactive'
  | 'users_interactive'
  | 'monitor_interactive';

declare global {
  var __xSapiPerfStartedAt: number | undefined;
  var __xSapiPerfMarks: Partial<Record<PerfMarkName, number>> | undefined;
}

function now() {
  if (typeof globalThis !== 'undefined' && globalThis.performance?.now) {
    return globalThis.performance.now();
  }

  return Date.now();
}

function ensureStore() {
  if (!globalThis.__xSapiPerfMarks) {
    globalThis.__xSapiPerfMarks = {};
  }

  return globalThis.__xSapiPerfMarks;
}

export function markAppStart() {
  if (!globalThis.__xSapiPerfStartedAt) {
    globalThis.__xSapiPerfStartedAt = now();
    ensureStore().app_start = globalThis.__xSapiPerfStartedAt;
  }
}

export function markPerformance(name: PerfMarkName) {
  ensureStore()[name] = now();

  if (__DEV__) {
    reportPerformance(name);
  }
}

export function reportPerformance(name: PerfMarkName) {
  const startedAt = globalThis.__xSapiPerfStartedAt;
  const mark = ensureStore()[name];

  if (!startedAt || !mark) {
    return;
  }

  const duration = Math.round(mark - startedAt);
  console.info(`[perf] ${name}: ${duration}ms since app_start`);
}

markAppStart();
