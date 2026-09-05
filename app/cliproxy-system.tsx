import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileCode2, Puzzle, Settings2, ShieldAlert } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection } from '@/src/components/admin-ui';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
import { Text, TextInput, localizedAlert } from '@/src/components/localized-text';
import { ScreenShell } from '@/src/components/screen-shell';
import {
  getCLIProxyConfigYAML,
  getCLIProxyLatestVersion,
  getCLIProxyRuntimeConfig,
  installCLIProxyStorePlugin,
  listCLIProxyPluginStore,
  putCLIProxyConfigYAML,
  setCLIProxyRuntimeSetting,
  type CLIProxyRuntimeSettingPath,
} from '@/src/services/cliproxy';
import { cliProxyConfigState } from '@/src/store/cliproxy-config';
import { workspaceModeState } from '@/src/store/workspace-mode';
import type { CLIProxyConnection, CLIProxyGroupStrategy, CLIProxyRuntimeConfig } from '@/src/types/cliproxy';

const { useSnapshot } = require('valtio/react');

type SettingsForm = {
  debug: boolean;
  proxyUrl: string;
  requestRetry: string;
  maxRetryInterval: string;
  requestLog: boolean;
  loggingToFile: boolean;
  usageStatistics: boolean;
  wsAuth: boolean;
  forceModelPrefix: boolean;
  switchProject: boolean;
  switchPreviewModel: boolean;
  strategy: CLIProxyGroupStrategy;
  logsMaxSize: string;
  errorLogsMaxFiles: string;
};

function numberText(value: unknown, fallback: number) {
  const parsed = Number(value);
  return String(Number.isFinite(parsed) ? parsed : fallback);
}

function formFromConfig(config?: CLIProxyRuntimeConfig): SettingsForm {
  return {
    debug: config?.debug === true,
    proxyUrl: typeof config?.['proxy-url'] === 'string' ? config['proxy-url'] : '',
    requestRetry: numberText(config?.['request-retry'], 3),
    maxRetryInterval: numberText(config?.['max-retry-interval'], 30),
    requestLog: config?.['request-log'] === true,
    loggingToFile: config?.['logging-to-file'] === true,
    usageStatistics: config?.['usage-statistics-enabled'] !== false,
    wsAuth: config?.['ws-auth'] !== false,
    forceModelPrefix: config?.['force-model-prefix'] === true,
    switchProject: config?.['quota-exceeded']?.['switch-project'] !== false,
    switchPreviewModel: config?.['quota-exceeded']?.['switch-preview-model'] !== false,
    strategy: config?.routing?.strategy === 'fill-first' ? 'fill-first' : 'round-robin',
    logsMaxSize: numberText(config?.['logs-max-total-size-mb'], 0),
    errorLogsMaxFiles: numberText(config?.['error-logs-max-files'], 10),
  };
}

function integer(value: string, label: string, min = 0) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) throw new Error(`${label} 必须是不小于 ${min} 的整数。`);
  return parsed;
}

function providerSummary(config?: CLIProxyRuntimeConfig) {
  if (!config) return [];
  const keys = ['gemini-api-key', 'codex-api-key', 'claude-api-key', 'openai-compatibility', 'interactions-api-key', 'xai-api-key', 'vertex-api-key'];
  return keys.map((key) => ({ key, count: Array.isArray(config[key]) ? config[key].length : 0 })).filter((item) => item.count > 0);
}

export default function CLIProxySystemScreen() {
  const queryClient = useQueryClient();
  const workspace = useSnapshot(workspaceModeState);
  const stored = useSnapshot(cliProxyConfigState);
  const connection = useMemo<CLIProxyConnection>(() => ({ baseUrl: stored.baseUrl, managementKey: stored.managementKey }), [stored.baseUrl, stored.managementKey]);
  const configured = workspace.mode === 'cliproxy' && Boolean(connection.baseUrl && connection.managementKey);
  const [form, setForm] = useState<SettingsForm>(() => formFromConfig());
  const [yaml, setYaml] = useState('');
  const [yamlLoaded, setYamlLoaded] = useState(false);

  const configQuery = useQuery({
    queryKey: ['cliproxy', 'runtime-config', stored.baseUrl, stored.revision],
    queryFn: () => getCLIProxyRuntimeConfig(connection),
    enabled: configured,
  });
  const pluginStoreQuery = useQuery({
    queryKey: ['cliproxy', 'plugin-store', stored.baseUrl, stored.revision],
    queryFn: () => listCLIProxyPluginStore(connection),
    enabled: configured,
    retry: false,
  });

  useEffect(() => {
    if (configQuery.data) setForm(formFromConfig(configQuery.data));
  }, [configQuery.data]);

  const settingsMutation = useMutation({
    mutationFn: async () => {
      const original = formFromConfig(configQuery.data);
      const values: Array<[CLIProxyRuntimeSettingPath, boolean | number | string, boolean]> = [
        ['debug', form.debug, form.debug !== original.debug],
        ['proxy-url', form.proxyUrl.trim(), form.proxyUrl.trim() !== original.proxyUrl],
        ['request-retry', integer(form.requestRetry, '请求重试次数'), form.requestRetry !== original.requestRetry],
        ['max-retry-interval', integer(form.maxRetryInterval, '最大重试间隔'), form.maxRetryInterval !== original.maxRetryInterval],
        ['request-log', form.requestLog, form.requestLog !== original.requestLog],
        ['logging-to-file', form.loggingToFile, form.loggingToFile !== original.loggingToFile],
        ['usage-statistics-enabled', form.usageStatistics, form.usageStatistics !== original.usageStatistics],
        ['ws-auth', form.wsAuth, form.wsAuth !== original.wsAuth],
        ['force-model-prefix', form.forceModelPrefix, form.forceModelPrefix !== original.forceModelPrefix],
        ['quota-exceeded/switch-project', form.switchProject, form.switchProject !== original.switchProject],
        ['quota-exceeded/switch-preview-model', form.switchPreviewModel, form.switchPreviewModel !== original.switchPreviewModel],
        ['routing/strategy', form.strategy, form.strategy !== original.strategy],
        ['logs-max-total-size-mb', integer(form.logsMaxSize, '日志总大小'), form.logsMaxSize !== original.logsMaxSize],
        ['error-logs-max-files', integer(form.errorLogsMaxFiles, '错误日志保留数量'), form.errorLogsMaxFiles !== original.errorLogsMaxFiles],
      ];
      const changed = values.filter(([, , isChanged]) => isChanged);
      for (const [path, value] of changed) await setCLIProxyRuntimeSetting(connection, path, value);
      return changed.length;
    },
    onSuccess: async (count) => {
      await queryClient.invalidateQueries({ queryKey: ['cliproxy', 'runtime-config'] });
      localizedAlert(count ? '设置已保存' : '没有变更', count ? `已热更新 ${count} 项 CLIProxyAPI 运行参数。` : '当前设置与服务端一致。');
    },
  });

  const yamlLoadMutation = useMutation({
    mutationFn: () => getCLIProxyConfigYAML(connection),
    onSuccess: (content) => { setYaml(content); setYamlLoaded(true); },
  });

  const yamlSaveMutation = useMutation({
    mutationFn: () => putCLIProxyConfigYAML(connection, yaml),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cliproxy'] });
      localizedAlert('完整配置已保存', 'CLIProxyAPI 已校验并热重载 config.yaml。无法热更新的启动项仍需重启服务。');
    },
  });

  const versionMutation = useMutation({ mutationFn: () => getCLIProxyLatestVersion(connection) });
  const pluginInstallMutation = useMutation({
    mutationFn: (plugin: { id: string; source_id: string; version?: string }) => installCLIProxyStorePlugin(connection, plugin.id, plugin.source_id, plugin.version),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['cliproxy'] });
      localizedAlert('插件安装完成', result.restart_required ? '插件文件已安装，需要重启 CLIProxyAPI 后生效。' : '插件已安装并启用。');
    },
  });
  const providers = providerSummary(configQuery.data);

  const toggle = (key: keyof SettingsForm) => setForm((current) => ({ ...current, [key]: !current[key] }));

  if (workspace.mode !== 'cliproxy') return null;

  return (
    <>
      <LocalizedStackScreen options={{ title: 'CLIProxy 系统设置', headerShown: true }} />
      <ScreenShell title="CLIProxy 系统设置" subtitle="运行参数、Provider 配置与完整 YAML" safeAreaEdges={['bottom']} bottomInsetClassName="pb-10" refreshing={configQuery.isRefetching} onRefresh={async () => { await configQuery.refetch(); }}>
        <AdminSection title="运行状态" detail="配置来自当前 CLIProxyAPI 单实例，不读取 Sub2API。">
          <View className="flex-row items-center gap-3 rounded-2xl bg-[#F6F8FC] p-3 dark:bg-[#152033]">
            <Settings2 size={20} color="#2F6DF6" />
            <View className="flex-1">
              <Text className="text-sm font-bold text-[#172033] dark:text-[#F4F7FB]">{configQuery.isSuccess ? '管理接口已连接' : configQuery.isLoading ? '正在读取配置' : '配置读取失败'}</Text>
              <Text className="mt-1 text-[10px] text-[#6B778C] dark:text-[#9EABC0]">Provider 配置：{providers.reduce((sum, item) => sum + item.count, 0)} 项 · Client Keys：{Array.isArray(configQuery.data?.['api-keys']) ? configQuery.data['api-keys'].length : 0}</Text>
            </View>
          </View>
          {providers.length ? <Text className="text-[10px] leading-5 text-[#6B778C] dark:text-[#9EABC0]">{providers.map((item) => `${item.key} ${item.count}`).join(' · ')}</Text> : null}
          <AdminButton label="检查 CLIProxyAPI 最新版本" pending={versionMutation.isPending} tone="muted" onPress={() => versionMutation.mutate()} />
          <AdminMessage error={configQuery.error || versionMutation.error} success={versionMutation.data ? `上游最新版本：${versionMutation.data}` : undefined} />
        </AdminSection>

        <AdminSection title="常用运行参数" detail="保存后由 CLIProxyAPI 写回配置并热重载；只提交发生变化的字段。">
          <View className="flex-row flex-wrap gap-2">
            <AdminChip label="Debug" selected={form.debug} onPress={() => toggle('debug')} />
            <AdminChip label="请求日志" selected={form.requestLog} onPress={() => toggle('requestLog')} />
            <AdminChip label="文件日志" selected={form.loggingToFile} onPress={() => toggle('loggingToFile')} />
            <AdminChip label="用量统计" selected={form.usageStatistics} onPress={() => toggle('usageStatistics')} />
            <AdminChip label="WebSocket 鉴权" selected={form.wsAuth} onPress={() => toggle('wsAuth')} />
            <AdminChip label="强制模型前缀" selected={form.forceModelPrefix} onPress={() => toggle('forceModelPrefix')} />
            <AdminChip label="配额切换 Project" selected={form.switchProject} onPress={() => toggle('switchProject')} />
            <AdminChip label="切换 Preview 模型" selected={form.switchPreviewModel} onPress={() => toggle('switchPreviewModel')} />
          </View>
          <Text className="text-xs font-medium text-[#667085] dark:text-[#9EABC0]">全局凭据调度</Text>
          <View className="flex-row gap-2">
            <AdminChip label="Round Robin" selected={form.strategy === 'round-robin'} onPress={() => setForm((value) => ({ ...value, strategy: 'round-robin' }))} />
            <AdminChip label="Fill First" selected={form.strategy === 'fill-first'} onPress={() => setForm((value) => ({ ...value, strategy: 'fill-first' }))} />
          </View>
          <Text className="text-[10px] leading-5 text-[#946321] dark:text-[#FFD66B]">CLIProxy 分组启用后，每个组仍使用自己的调度策略；这里设置的是未被专用 Scheduler 接管时的全局策略。</Text>
          <AdminField label="全局代理 URL" value={form.proxyUrl} onChangeText={(proxyUrl) => setForm((value) => ({ ...value, proxyUrl }))} autoCapitalize="none" autoCorrect={false} placeholder="http://127.0.0.1:7890 或 socks5://…" />
          <View className="flex-row gap-2">
            <View className="flex-1"><AdminField label="请求重试次数" value={form.requestRetry} onChangeText={(requestRetry) => setForm((value) => ({ ...value, requestRetry }))} keyboardType="number-pad" /></View>
            <View className="flex-1"><AdminField label="最大重试间隔（秒）" value={form.maxRetryInterval} onChangeText={(maxRetryInterval) => setForm((value) => ({ ...value, maxRetryInterval }))} keyboardType="number-pad" /></View>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1"><AdminField label="日志总大小 MiB" value={form.logsMaxSize} onChangeText={(logsMaxSize) => setForm((value) => ({ ...value, logsMaxSize }))} keyboardType="number-pad" /></View>
            <View className="flex-1"><AdminField label="错误日志保留数" value={form.errorLogsMaxFiles} onChangeText={(errorLogsMaxFiles) => setForm((value) => ({ ...value, errorLogsMaxFiles }))} keyboardType="number-pad" /></View>
          </View>
          <AdminButton label="保存常用设置" pending={settingsMutation.isPending} disabled={!configQuery.isSuccess} onPress={() => settingsMutation.mutate()} />
          <AdminMessage error={settingsMutation.error} />
        </AdminSection>

        <AdminSection title="插件商店" detail="读取 CLIProxyAPI 配置的可信商店源，可安装或更新其中的原生插件。">
          {pluginStoreQuery.isLoading ? <Text className="text-xs text-[#98A2B3]">正在读取插件商店…</Text> : null}
          {(pluginStoreQuery.data?.sources ?? []).map((source) => (
            <View key={source.id} className="rounded-xl bg-[#F6F8FC] p-3 dark:bg-[#152033]">
              <Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{source.name || source.id}</Text>
              <Text selectable className="mt-1 text-[9px] text-[#7B8798] dark:text-[#9EABC0]">{source.url || source.id}</Text>
              {source.error ? <Text className="mt-1 text-[10px] text-[#D9475C]">{source.error}</Text> : null}
            </View>
          ))}
          {(pluginStoreQuery.data?.plugins ?? []).map((plugin) => (
            <View key={plugin.store_id || `${plugin.source_id}/${plugin.id}`} className="flex-row items-start gap-3 rounded-2xl border border-[#E2E9F3] bg-[#F8FAFD] p-3 dark:border-[#273449] dark:bg-[#152033]">
              <View className="h-9 w-9 items-center justify-center rounded-xl bg-[#EAF2FF] dark:bg-[#172C55]"><Puzzle size={17} color="#2F6DF6" /></View>
              <View className="flex-1">
                <Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{plugin.name || plugin.id}</Text>
                <Text className="mt-1 text-[9px] text-[#7B8798] dark:text-[#9EABC0]">{plugin.source_name || plugin.source_id} · {plugin.installed ? `已安装 ${plugin.installed_version || ''}` : `可用 ${plugin.version || ''}`}{plugin.update_available ? ' · 有更新' : ''}</Text>
                {plugin.description ? <Text className="mt-1 text-[10px] leading-4 text-[#6B778C] dark:text-[#9EABC0]">{plugin.description}</Text> : null}
                {plugin.auth_required && !plugin.auth_configured ? <Text className="mt-1 text-[10px] text-[#D98A16]">商店源需要先配置认证。</Text> : null}
              </View>
              <Pressable
                disabled={pluginInstallMutation.isPending || (plugin.auth_required && !plugin.auth_configured)}
                onPress={() => localizedAlert(plugin.installed ? '更新原生插件？' : '安装原生插件？', `CLIProxyAPI 将从 ${plugin.source_name || plugin.source_id} 下载并启用 ${plugin.name || plugin.id}。仅在信任该商店源时继续。`, [{ text: '取消', style: 'cancel' }, { text: plugin.installed ? '更新' : '安装', onPress: () => pluginInstallMutation.mutate(plugin) }])}
                className="h-9 w-9 items-center justify-center rounded-xl bg-[#EAF2FF] disabled:opacity-35 dark:bg-[#172C55]"
              ><Download size={15} color="#2F6DF6" /></Pressable>
            </View>
          ))}
          {pluginStoreQuery.isSuccess && !(pluginStoreQuery.data.plugins?.length) ? <Text className="py-4 text-center text-xs text-[#98A2B3]">未配置插件商店，仍可通过挂载 plugins 目录安装 Group Router。</Text> : null}
          <AdminMessage error={pluginStoreQuery.error || pluginInstallMutation.error} />
        </AdminSection>

        <AdminSection title="完整 config.yaml" detail="覆盖所有 Provider API Key、OpenAI 兼容、模型别名、排除模型、代理和插件商店配置。">
          <View className="flex-row items-start gap-3 rounded-2xl border border-[#F4D594] bg-[#FFF8E8] p-3 dark:border-[#6A4C1F] dark:bg-[#332611]">
            <ShieldAlert size={20} color="#D88A18" />
            <Text className="flex-1 text-[10px] leading-5 text-[#946321] dark:text-[#FFD66B]">YAML 可能包含 API Key、Token 与代理密码。不要截图或复制到不可信位置；保存前服务端会解析并校验配置。</Text>
          </View>
          <AdminButton label={yamlLoaded ? '重新从服务端加载 YAML' : '加载完整 YAML'} pending={yamlLoadMutation.isPending} tone="muted" onPress={() => yamlLoadMutation.mutate()} />
          {yamlLoaded ? (
            <View className="gap-2">
              <View className="flex-row items-center gap-2"><FileCode2 size={16} color="#2F6DF6" /><Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">config.yaml 源码</Text></View>
              <TextInput
                value={yaml}
                onChangeText={setYaml}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                textAlignVertical="top"
                className="min-h-[360px] rounded-2xl border border-[#E2E9F3] bg-[#0F1726] p-3 font-mono text-[10px] leading-5 text-[#D8E3F4] dark:border-[#273449]"
              />
              <AdminButton label="校验并保存完整 YAML" pending={yamlSaveMutation.isPending} disabled={!yaml.trim()} onPress={() => localizedAlert('覆盖 CLIProxyAPI 完整配置？', '服务端会校验 YAML 后整体替换 config.yaml。请确认已保留当前 Management Key、插件与分组配置。', [{ text: '取消', style: 'cancel' }, { text: '确认保存', onPress: () => yamlSaveMutation.mutate() }])} />
            </View>
          ) : null}
          <AdminMessage error={yamlLoadMutation.error || yamlSaveMutation.error} />
        </AdminSection>
      </ScreenShell>
    </>
  );
}
