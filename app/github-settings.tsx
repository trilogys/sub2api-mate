import { useMutation } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { AdminButton, AdminField, AdminMessage, AdminSection } from '@/src/components/admin-ui';
import { ScreenShell } from '@/src/components/screen-shell';
import {
  clearGitHubConfig,
  defaultGitHubConfig,
  getGitHubRepository,
  loadGitHubConfig,
  normalizeGitHubRepository,
  saveGitHubConfig,
} from '@/src/services/github';
import type { GitHubConfig } from '@/src/services/github';
import { Text } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

export default function GitHubSettingsScreen() {
  const [config, setConfig] = useState<GitHubConfig>(defaultGitHubConfig);
  const [saved, setSaved] = useState(false);
  useEffect(() => { loadGitHubConfig().then((value) => { setConfig(value); setSaved(Boolean(value.token)); }); }, []);
  const test = useMutation({ mutationFn: () => getGitHubRepository(config) });
  const update = <K extends keyof GitHubConfig>(key: K, value: GitHubConfig[K]) => { setConfig((current) => ({ ...current, [key]: value })); setSaved(false); test.reset(); };
  const save = async () => { await saveGitHubConfig(config); setConfig((current) => ({ ...current, repository: normalizeGitHubRepository(current.repository) })); setSaved(true); };
  const clear = async () => { await clearGitHubConfig(); setConfig(defaultGitHubConfig); setSaved(false); test.reset(); };
  const valid = Boolean(normalizeGitHubRepository(config.repository) && config.token.trim() && config.baseBranch.trim());

  return (
    <>
      <LocalizedStackScreen options={{ title: 'GitHub 配置', headerShown: true }} />
      <ScreenShell title="GitHub 配置" subtitle="供 AI 创建修复分支和 Draft PR" safeAreaEdges={['bottom']} bottomInsetClassName="pb-8">
        <AdminSection title="仓库" detail="默认使用你的 trilogys/sub2api-mobile，也可填写其他 owner/repository 或 GitHub URL。">
          <AdminField label="仓库地址" value={config.repository} onChangeText={(value) => update('repository', value)} placeholder="trilogys/sub2api-mobile" autoCapitalize="none" autoCorrect={false} />
          <AdminField label="基础分支" value={config.baseBranch} onChangeText={(value) => update('baseBranch', value)} placeholder="main" autoCapitalize="none" autoCorrect={false} />
        </AdminSection>

        <AdminSection title="GitHub Token" detail="建议使用 Fine-grained token，仅授权目标仓库。AI 修复需要 Contents、Pull requests 读写；App 内触发原生 APK 构建还需要 Actions: Read and write。Token 只保存在当前 Android 设备 SecureStore。">
          <AdminField label="Token" value={config.token} onChangeText={(value) => update('token', value)} placeholder="github_pat_..." secureTextEntry autoCapitalize="none" autoCorrect={false} />
          {Platform.OS === 'web' ? <Text className="text-xs leading-5 text-[#D9475C]">Web 端不保存 GitHub Token，请在 Android App 中配置。</Text> : null}
          <AdminButton label="测试仓库权限" pending={test.isPending} disabled={!valid} onPress={() => test.mutate()} />
          <AdminMessage error={test.error} success={test.data ? `已连接 ${test.data.full_name} · 默认分支 ${test.data.default_branch} · ${test.data.permissions?.push ? '可推送' : '只读或权限未知'}` : undefined} />
        </AdminSection>

        <AdminSection title="保存" detail="创建 PR 前仍会展示修改并要求再次确认。">
          <View className="flex-row gap-2"><View className="flex-1"><AdminButton label={saved ? '配置已保存' : '安全保存配置'} disabled={!valid || Platform.OS === 'web'} onPress={save} /></View><AdminButton label="清除" tone="muted" onPress={clear} /></View>
        </AdminSection>
      </ScreenShell>
    </>
  );
}
