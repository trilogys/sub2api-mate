import * as SecureStore from 'expo-secure-store';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { CheckCircle2, CircleDashed, ExternalLink, PackageCheck, XCircle } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, View } from 'react-native';

import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection } from '@/src/components/admin-ui';
import { ScreenShell } from '@/src/components/screen-shell';
import { dispatchAPKWorkflow, EAS_DEFAULT_GIT_REF, EAS_PROJECT_ID, EXPO_TOKEN_STORAGE_KEY, getEASWorkflowRun } from '@/src/services/eas';
import { dispatchGitHubWorkflow, getGitHubWorkflowRunDetails, getLatestGitHubWorkflowRun, loadGitHubConfig, normalizeGitHubRepository, saveGitHubConfig } from '@/src/services/github';
import type { GitHubConfig, GitHubWorkflowStep } from '@/src/services/github';
import { Text } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

const repository = 'https://github.com/trilogys/GateNest';
const buildWorkflow = `${repository}/actions/workflows/eas-build.yml`;
const nativeBuildWorkflow = 'android-native-build.yml';
const apiSyncWorkflow = `${repository}/actions/workflows/sync-sub2api-api.yml`;
const actions = `${repository}/actions`;
const easBuilds = 'https://expo.dev/accounts/trilogys/projects/sub2api-mobile/builds';

function open(url: string) {
  return Linking.openURL(url);
}

function stepTitle(name: string) {
  const labels: Record<string, string> = {
    'Install dependencies': '安装依赖',
    'Generate Android project': 'Expo Prebuild',
  };
  return labels[name] || name;
}

function stepState(step: GitHubWorkflowStep) {
  if (step.status === 'in_progress') return '执行中';
  if (step.status === 'queued') return '等待中';
  if (step.conclusion === 'success') return '成功';
  if (step.conclusion === 'failure') return '失败';
  if (step.conclusion === 'cancelled') return '已取消';
  if (step.conclusion === 'skipped') return '已跳过';
  return step.status === 'completed' ? '已完成' : '等待中';
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default function BuildCenterScreen() {
  const [buildProvider, setBuildProvider] = useState<'eas' | 'github'>('github');
  const [token, setToken] = useState('');
  const [gitRef, setGitRef] = useState(EAS_DEFAULT_GIT_REF);
  const [nativeVariant, setNativeVariant] = useState<'release' | 'debug'>('release');
  const [githubConfig, setGitHubConfig] = useState<GitHubConfig>();
  const [githubRequestedAt, setGitHubRequestedAt] = useState(0);
  const [runId, setRunId] = useState('');
  const [runUrl, setRunUrl] = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);
  const [repositorySaved, setRepositorySaved] = useState(false);

  useEffect(() => {
    loadGitHubConfig().then(setGitHubConfig);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    SecureStore.getItemAsync(EXPO_TOKEN_STORAGE_KEY).then((saved) => {
      if (saved) {
        setToken(saved);
        setTokenSaved(true);
      }
    });
  }, []);

  const runQuery = useQuery({
    queryKey: ['eas-workflow-run', runId],
    queryFn: () => getEASWorkflowRun(token, runId),
    enabled: Boolean(runId && token),
    refetchInterval: (query) => ['success', 'failure', 'canceled'].includes(query.state.data?.status ?? '') ? false : 5000,
  });
  const dispatch = useMutation({
    mutationFn: () => dispatchAPKWorkflow({ token, appId: EAS_PROJECT_ID, gitRef: gitRef.trim(), profile: 'preview' }),
    onSuccess: (result) => { setRunId(result.id); setRunUrl(result.url); },
  });
  const nativeDispatch = useMutation({
    mutationFn: async () => {
      if (!githubConfig) throw new Error('请先保存 GitHub 配置');
      const requestedAt = Date.now();
      await dispatchGitHubWorkflow(githubConfig, nativeBuildWorkflow, gitRef.trim(), { variant: nativeVariant });
      return requestedAt;
    },
    onSuccess: setGitHubRequestedAt,
  });
  const nativeRunQuery = useQuery({
    queryKey: ['github-native-apk-run', githubRequestedAt, gitRef, githubConfig?.repository],
    queryFn: () => getLatestGitHubWorkflowRun(githubConfig!, nativeBuildWorkflow, gitRef.trim(), githubRequestedAt),
    enabled: Boolean(githubRequestedAt && githubConfig?.token && gitRef.trim()),
    refetchInterval: (query) => query.state.data?.status === 'completed' ? false : 5000,
  });
  const nativeDetailsQuery = useQuery({
    queryKey: ['github-native-apk-run-details', nativeRunQuery.data?.id, githubConfig?.repository],
    queryFn: () => getGitHubWorkflowRunDetails(githubConfig!, nativeRunQuery.data!.id),
    enabled: Boolean(nativeRunQuery.data?.id && githubConfig?.token),
    refetchInterval: (query) => {
      const run = nativeRunQuery.data;
      if (run?.status === 'completed' && (run.conclusion !== 'success' || query.state.data?.artifacts.some((artifact) => artifact.name.toLowerCase().includes('apk')))) return false;
      return 5000;
    },
  });
  const saveToken = async () => {
    if (Platform.OS === 'web') return;
    await SecureStore.setItemAsync(EXPO_TOKEN_STORAGE_KEY, token.trim());
    setTokenSaved(true);
  };
  const clearToken = async () => {
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(EXPO_TOKEN_STORAGE_KEY);
    setToken('');
    setTokenSaved(false);
    setRunId('');
    setRunUrl('');
  };
  const saveRepository = async () => {
    if (!githubConfig) return;
    const repository = normalizeGitHubRepository(githubConfig.repository);
    if (!/^[^/]+\/[^/]+$/.test(repository)) return;
    const next = { ...githubConfig, repository };
    await saveGitHubConfig(next);
    setGitHubConfig(next);
    setRepositorySaved(true);
  };
  const status = runQuery.data?.status;
  const nativeRun = nativeRunQuery.data;
  const nativeDetails = nativeDetailsQuery.data;
  const nativeSteps = (nativeDetails?.jobs.flatMap((job) => job.steps ?? []) ?? []).filter((step) => !/^(Set up job|Complete job|Post )/i.test(step.name) && !(step.name === 'Upload Gradle reports on failure' && step.conclusion === 'skipped'));
  const completedSteps = nativeSteps.filter((step) => step.status === 'completed').length;
  const nativeProgress = nativeSteps.length ? Math.round((completedSteps / nativeSteps.length) * 100) : nativeRun?.status === 'completed' ? 100 : 0;
  const apkArtifacts = (nativeDetails?.artifacts ?? []).filter((artifact) => artifact.name.toLowerCase().includes('apk'));
  const nativeRepository = normalizeGitHubRepository(githubConfig?.repository || 'trilogys/GateNest');
  const nativeWorkflowUrl = `https://github.com/${nativeRepository}/actions/workflows/${nativeBuildWorkflow}`;
  const nativeStatus = !githubRequestedAt
    ? undefined
    : !nativeRun
      ? '已提交，等待 GitHub 创建任务'
      : nativeRun.status === 'completed'
        ? `已完成：${nativeRun.conclusion || '未知结果'}`
        : nativeRun.status === 'in_progress'
          ? '构建中'
          : '排队中';

  return (
    <>
      <LocalizedStackScreen options={{ title: '构建与同步', headerShown: true }} />
      <ScreenShell title="构建与同步" subtitle="根据队列和环境选择 EAS 或 GitHub 原生 APK 构建" safeAreaEdges={['bottom']} bottomInsetClassName="pb-8">
        <AdminSection title="构建方式" detail="两种方式都在云端执行；EAS 环境更接近 Expo 官方构建，GitHub 原生构建不经过 EAS 队列。">
          <View className="flex-row gap-2">
            <AdminChip label="EAS 云构建" selected={buildProvider === 'eas'} onPress={() => setBuildProvider('eas')} />
            <AdminChip label="GitHub 原生 APK" selected={buildProvider === 'github'} onPress={() => setBuildProvider('github')} />
          </View>
        </AdminSection>

        {buildProvider === 'eas' ? <AdminSection title="Expo Token" detail="Token 仅保存在当前手机的系统安全存储，不写入仓库、日志或服务器配置。建议使用具有限定角色的 Expo Robot User Token。">
          <AdminField label="Expo Access Token" value={token} onChangeText={(value) => { setToken(value); setTokenSaved(false); }} placeholder="Expo access token" secureTextEntry autoCapitalize="none" autoCorrect={false} />
          {Platform.OS === 'web' ? <Text className="text-xs leading-5 text-[#D9475C]">Web 版不持久化 Token，请在安装后的 Android App 中使用。</Text> : null}
          <View className="flex-row gap-2"><View className="flex-1"><AdminButton label={tokenSaved ? 'Token 已保存' : '安全保存 Token'} disabled={!token.trim() || Platform.OS === 'web'} onPress={saveToken} /></View><AdminButton label="清除" tone="muted" disabled={!token} onPress={clearToken} /></View>
        </AdminSection> : null}

        {buildProvider === 'eas' ? <AdminSection title="EAS Android APK" detail="直接调用 EAS Workflows REST API，使用 Expo SDK 54 和 preview 配置构建可安装 APK。">
          <View className="flex-row items-start gap-3 rounded-2xl bg-[#EAF2FF] dark:bg-[#172C55] p-3">
            <ExternalLink size={18} color="#2F6DF6" />
            <Text className="flex-1 text-xs leading-5 text-[#2F6DF6]">构建由 EAS 云端执行；App 只提交构建请求并轮询状态。</Text>
          </View>
          <AdminField label="Git 分支或标签" value={gitRef} onChangeText={setGitRef} placeholder="main" autoCapitalize="none" autoCorrect={false} />
          <AdminButton label="直接调用 EAS 构建" pending={dispatch.isPending} disabled={!token.trim() || !gitRef.trim()} onPress={() => dispatch.mutate()} />
          <AdminMessage error={dispatch.error || runQuery.error} success={runId ? `EAS 状态：${status ?? '已排队'}` : undefined} />
          {runUrl ? <AdminButton label="打开本次 EAS 任务" onPress={() => open(runUrl)} /> : null}
          <AdminButton label="GitHub Actions 备用入口" tone="muted" onPress={() => open(buildWorkflow)} />
          <AdminButton label="查看并下载最新 APK" tone="muted" onPress={() => open(actions)} />
          <AdminButton label="查看 EAS 构建记录" tone="muted" onPress={() => open(easBuilds)} />
        </AdminSection> : <AdminSection title="GitHub Actions 原生 APK" detail="GitHub Runner 执行 Expo Prebuild 和 Gradle，APK 作为 Actions Artifact 保存 14 天，不使用 EAS 构建队列。">
          <View className="flex-row items-start gap-3 rounded-2xl bg-[#EAF2FF] dark:bg-[#172C55] p-3">
            <ExternalLink size={18} color="#2F6DF6" />
            <Text className="flex-1 text-xs leading-5 text-[#2F6DF6]">Release 用于独立安装测试；Debug 适合排错，通常需要 Metro 开发服务器。</Text>
          </View>
          <AdminField label="构建仓库" value={githubConfig?.repository ?? 'trilogys/GateNest'} onChangeText={(repository) => { setGitHubConfig((current) => ({ ...(current ?? { repository: 'trilogys/GateNest', token: '', baseBranch: 'main' }), repository })); setRepositorySaved(false); }} placeholder="trilogys/GateNest" autoCapitalize="none" autoCorrect={false} />
          <Text className="text-[11px] leading-5 text-[#6B778C] dark:text-[#9EABC0]">默认使用 trilogys/GateNest。目标仓库必须包含 {nativeBuildWorkflow} 工作流。</Text>
          <AdminButton label={repositorySaved ? '仓库已保存' : '保存并切换构建仓库'} tone="muted" disabled={!githubConfig?.repository || Platform.OS === 'web'} onPress={saveRepository} />
          <AdminField label="Git 分支或标签" value={gitRef} onChangeText={setGitRef} placeholder="main" autoCapitalize="none" autoCorrect={false} />
          <View className="flex-row gap-2">
            <AdminChip label="Release APK" selected={nativeVariant === 'release'} onPress={() => setNativeVariant('release')} />
            <AdminChip label="Debug APK" selected={nativeVariant === 'debug'} onPress={() => setNativeVariant('debug')} />
          </View>
          <Text className="text-xs leading-5 text-[#6B778C] dark:text-[#9EABC0]">App 内直接触发需要 GitHub Fine-grained Token 的 Actions: Read and write 权限。也可以不保存 Token，直接打开工作流网页手动运行。</Text>
          <AdminButton label="配置 GitHub Token" tone="muted" onPress={() => router.push('/github-settings')} />
          <AdminButton label="直接调用 GitHub 原生构建" pending={nativeDispatch.isPending} disabled={!githubConfig?.token || !gitRef.trim()} onPress={() => nativeDispatch.mutate()} />
          <AdminMessage error={nativeDispatch.error || nativeRunQuery.error || nativeDetailsQuery.error} success={nativeStatus ? `GitHub Actions：${nativeStatus}` : undefined} />
          {nativeRun ? <View className="rounded-[20px] border border-[#DDE6F2] dark:border-[#273449] bg-[#F7F9FD] dark:bg-[#0F1726] p-4">
            <View className="flex-row items-center"><View className="flex-1"><Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">构建进度</Text><Text className="mt-1 text-[10px] text-[#667085] dark:text-[#9EABC0]">{nativeSteps.length ? `${completedSteps}/${nativeSteps.length} 个步骤完成` : nativeDetailsQuery.isLoading ? '正在读取 GitHub Jobs…' : '等待 Runner 分配任务'}</Text></View><Text className="text-xl font-extrabold text-[#2F6DF6]">{nativeProgress}%</Text></View>
            <View className="mt-3 h-2 overflow-hidden rounded-full bg-[#DDE6F2] dark:bg-[#273449]"><View className="h-full rounded-full bg-[#2F6DF6]" style={{ width: `${nativeProgress}%` }} /></View>
            <View className="mt-4 gap-2">{nativeSteps.map((step) => <GitHubStepRow key={`${step.number}-${step.name}`} step={step} />)}{nativeDetailsQuery.isLoading && !nativeSteps.length ? <ActivityIndicator color="#2F6DF6" /> : null}</View>
            <View className={`mt-4 rounded-2xl p-3 ${apkArtifacts.length ? 'bg-[#EAF9F0] dark:bg-[#123326]' : 'bg-[#EEF3F9] dark:bg-[#1A2638]'}`}><View className="flex-row items-center gap-2"><PackageCheck size={17} color={apkArtifacts.length ? '#23885A' : '#7B8798'} /><Text className={`flex-1 text-xs font-bold ${apkArtifacts.length ? 'text-[#23885A]' : 'text-[#667085] dark:text-[#9EABC0]'}`}>{apkArtifacts.length ? 'APK Artifact 已可下载' : nativeRun.status === 'completed' ? '本次任务未生成 APK Artifact' : '等待 Upload APK 完成'}</Text></View>{apkArtifacts.map((artifact) => <Text key={artifact.id} className="mt-2 text-[10px] leading-4 text-[#667085] dark:text-[#9EABC0]">{artifact.name} · {formatBytes(artifact.size_in_bytes)} · 保存至 {new Date(artifact.expires_at).toLocaleDateString()}</Text>)}</View>
          </View> : null}
          {nativeRun?.html_url ? <AdminButton label={apkArtifacts.length ? '打开 GitHub 下载 APK' : nativeRun.status === 'completed' ? '打开任务查看日志' : '打开本次 GitHub Actions 任务'} onPress={() => open(nativeRun.html_url)} /> : null}
          <AdminButton label="在 GitHub 网页手动运行" tone="muted" onPress={() => open(nativeWorkflowUrl)} />
        </AdminSection>}

        <AdminSection title="最新 API 检索" detail="GitHub 每天自动提取 Wei-Shaw/sub2api 的管理端路由与参数元数据；发现变化时创建或更新 API 清单 PR。">
          <Text className="text-xs leading-5 text-[#6B778C] dark:text-[#9EABC0]">App 的“全部 API”页面也会自动检索最新路由，并支持手动立即刷新；网络失败时继续使用 APK 内置清单。</Text>
          <AdminButton label="在 App 内检索最新 API" onPress={() => router.push('/api-console')} />
          <AdminButton label="打开 GitHub API 同步工作流" tone="muted" onPress={() => open(apiSyncWorkflow)} />
        </AdminSection>

        <AdminSection title="权限与密钥" detail="EAS 与 GitHub 原生构建相互独立，可以按队列和当前配置选择。">
          <Text className="text-xs leading-5 text-[#344054] dark:text-[#D5DDEA]">EAS GitHub 工作流需要仓库 Secret：EXPO_TOKEN。GitHub 原生构建本身不需要 Expo Token；从 App 直接触发时，设备中保存的 GitHub Token 需要 Actions: Read and write。</Text>
        </AdminSection>
      </ScreenShell>
    </>
  );
}

function GitHubStepRow({ step }: { step: GitHubWorkflowStep }) {
  const failed = step.conclusion === 'failure' || step.conclusion === 'cancelled';
  const success = step.conclusion === 'success';
  const running = step.status === 'in_progress';
  return <View className="flex-row items-center rounded-xl bg-white dark:bg-[#111827] px-3 py-2.5">{running ? <ActivityIndicator size="small" color="#2F6DF6" /> : failed ? <XCircle size={17} color="#D9475C" /> : success ? <CheckCircle2 size={17} color="#23885A" /> : <CircleDashed size={17} color="#8B97A8" />}<Text numberOfLines={1} className="ml-2 flex-1 text-[11px] font-semibold text-[#344054] dark:text-[#D5DDEA]">{stepTitle(step.name)}</Text><Text className={`text-[10px] font-bold ${failed ? 'text-[#D9475C]' : success ? 'text-[#23885A]' : running ? 'text-[#2F6DF6]' : 'text-[#8B97A8] dark:text-[#9EABC0]'}`}>{stepState(step)}</Text></View>;
}
