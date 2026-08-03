import { useMutation, useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { useState } from 'react';
import { Linking, Platform, Pressable, View, Image } from 'react-native';
import * as Updates from 'expo-updates';
import { CheckCircle2, ChevronRight, CircleAlert, Code2, Download, ExternalLink, FileText, Github, Info, RefreshCw, ShieldCheck } from 'lucide-react-native';

import { AdminButton, AdminMessage, AdminSection } from '@/src/components/admin-ui';
import { Text, localizedAlert } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
import { ScreenShell } from '@/src/components/screen-shell';
import { downloadAndInstallAndroidApk, type AndroidAppUpdateProgress } from '@/src/services/android-app-update';
import { APP_REPOSITORY_URL, findAndroidApk, getLatestAppRelease, isNewerAppVersion } from '@/src/services/app-release';

const currentVersion = Constants.expoConfig?.version ?? '1.3.0';

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ExternalRow({ icon: Icon, title, detail, url }: { icon: typeof Github; title: string; detail: string; url: string }) {
  return (
    <Pressable onPress={() => void Linking.openURL(url).catch(() => localizedAlert('无法打开链接', url))} className="flex-row items-center gap-3 rounded-2xl bg-[#F4F7FC] p-3 dark:bg-[#182235]">
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-[#EAF2FF] dark:bg-[#172C55]">
        <Icon size={18} color="#2F6DF6" />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-[#172033] dark:text-[#F4F7FB]">{title}</Text>
        <Text className="mt-0.5 text-[10px] leading-4 text-[#6B778C] dark:text-[#9EABC0]">{detail}</Text>
      </View>
      <ChevronRight size={17} color="#98A2B3" />
    </Pressable>
  );
}

export default function AboutScreen() {
  const [apkProgress, setApkProgress] = useState<AndroidAppUpdateProgress | null>(null);
  const releaseQuery = useQuery({ queryKey: ['app-release', 'latest'], queryFn: getLatestAppRelease, staleTime: 15 * 60_000 });
  const release = releaseQuery.data;
  const hasUpdate = Boolean(release?.tag_name && isNewerAppVersion(release.tag_name, currentVersion));
  const apk = findAndroidApk(release, Device.supportedCpuArchitectures);
  const apkProgressPercent = apkProgress?.totalBytes
    ? Math.min(100, Math.round((apkProgress.downloadedBytes / apkProgress.totalBytes) * 100))
    : 0;

  const apkMutation = useMutation({
    mutationFn: async () => {
      if (!apk) throw new Error('当前版本没有可用的 Android APK');
      await downloadAndInstallAndroidApk(apk, setApkProgress);
    },
    onError: () => setApkProgress(null),
  });

  const otaMutation = useMutation({
    mutationFn: async () => {
      if (__DEV__ || !Updates.isEnabled) throw new Error('当前开发环境未启用 Expo 在线更新');
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) return false;
      await Updates.fetchUpdateAsync();
      return true;
    },
    onSuccess: (downloaded) => {
      if (!downloaded) {
        localizedAlert('已是最新版本', '没有可用的 Expo 在线更新。');
        return;
      }
      localizedAlert('更新已下载', '是否立即重新启动并应用更新？', [
        { text: '稍后', style: 'cancel' },
        { text: '立即重启', onPress: () => void Updates.reloadAsync() },
      ]);
    },
  });

  const open = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      localizedAlert('无法打开链接', url);
    }
  };

  const releaseStatus = releaseQuery.isLoading
    ? '正在检查 GitHub Release…'
    : releaseQuery.error
      ? '暂时无法检查新版本'
      : !release
        ? '仓库尚未发布正式版本'
        : hasUpdate
          ? `发现新版本 ${release.tag_name}`
          : '当前已是最新版本';

  return (
    <>
      <LocalizedStackScreen options={{ title: '关于应用', headerShown: false, animation: 'none' }} />
      <ScreenShell title="关于应用" subtitle="版本、在线更新与开源信息" bottomInsetClassName="pb-8" refreshing={releaseQuery.isRefetching} onRefresh={() => releaseQuery.refetch().then(() => undefined)}>
        <View className="items-center rounded-[24px] border border-[#E2E9F3] bg-white px-5 py-6 dark:border-[#273449] dark:bg-[#111827]">
          <Image source={require('../assets/icon.png')} style={{ width: 80, height: 80, borderRadius: 22 }} resizeMode="cover" />
          <Text className="mt-3 text-xl font-bold text-[#172033] dark:text-[#F4F7FB]">sub2api</Text>
          <Text className="mt-1 text-xs text-[#6B778C] dark:text-[#9EABC0]">版本 {currentVersion} · Expo SDK 54 · {Platform.OS === 'android' ? 'Android' : Platform.OS === 'ios' ? 'iOS' : 'Web'}</Text>
        </View>

        <AdminSection title="升级提示" detail="自动检查 GitHub Release；下拉页面也可以重新检查。">
          <View className={`flex-row items-center gap-3 rounded-2xl p-3 ${hasUpdate ? 'bg-[#FFF6E7] dark:bg-[#3B2B16]' : 'bg-[#EFFAF4] dark:bg-[#153326]'}`}>
            {hasUpdate ? <CircleAlert size={20} color="#D88A18" /> : <CheckCircle2 size={20} color="#20A66A" />}
            <View className="flex-1">
              <Text className={`text-sm font-bold ${hasUpdate ? 'text-[#9B6418]' : 'text-[#16794B]'}`}>{releaseStatus}</Text>
              {release?.published_at ? <Text className="mt-1 text-[10px] text-[#6B778C] dark:text-[#9EABC0]">发布时间 {new Date(release.published_at).toLocaleDateString()}</Text> : null}
            </View>
          </View>
          {hasUpdate && release?.body ? <Text numberOfLines={6} className="rounded-2xl bg-[#F6F8FC] p-3 text-xs leading-5 text-[#475467] dark:bg-[#182235] dark:text-[#C2CCDB]">{release.body}</Text> : null}
          <AdminButton label={releaseQuery.isRefetching ? '正在检查…' : '重新检查版本'} pending={releaseQuery.isRefetching} tone="muted" onPress={() => void releaseQuery.refetch()} />
          {hasUpdate ? (
            Platform.OS === 'android' && apk ? (
              <>
                <AdminButton
                  label={apkProgress?.phase === 'installing' ? '正在打开安装程序…' : '在 App 内下载并安装'}
                  pending={apkMutation.isPending}
                  onPress={() => apkMutation.mutate()}
                />
                {!apkProgress ? <Text className="text-[10px] text-[#6B778C] dark:text-[#9EABC0]">将下载：{apk.name}</Text> : null}
                {apkProgress ? (
                  <View className="gap-2 rounded-2xl bg-[#F4F7FC] p-3 dark:bg-[#182235]">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-bold text-[#315B9C] dark:text-[#AFC9F7]">
                        {apkProgress.phase === 'installing' ? '下载完成，正在打开系统安装程序' : '正在下载更新'}
                      </Text>
                      <Text className="text-xs font-bold text-[#2F6DF6]">{apkProgressPercent}%</Text>
                    </View>
                    <View className="h-2 overflow-hidden rounded-full bg-[#DCE7F8] dark:bg-[#273449]">
                      <View className="h-full rounded-full bg-[#2F6DF6]" style={{ width: `${apkProgressPercent}%` }} />
                    </View>
                    <Text className="text-[10px] text-[#6B778C] dark:text-[#9EABC0]">
                      {formatBytes(apkProgress.downloadedBytes)} / {formatBytes(apkProgress.totalBytes)}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <AdminButton label="打开 Release 页面" onPress={() => void open(release!.html_url)} />
            )
          ) : null}
          <AdminMessage error={releaseQuery.error} />
          <AdminMessage error={apkMutation.error} />
          <Text className="text-[10px] leading-4 text-[#7B8798] dark:text-[#9EABC0]">Android 会在 App 内下载 APK 并显示进度，完成后由系统安装程序确认安装；签名不一致时需要先卸载旧版。App 无法静默覆盖安装。</Text>
        </AdminSection>

        <AdminSection title="Expo 在线更新" detail="仅更新 JavaScript 与资源；原生依赖、权限或 Expo SDK 变化仍需安装新 APK。">
          <View className="flex-row items-start gap-3 rounded-2xl bg-[#EAF2FF] p-3 dark:bg-[#172C55]">
            <RefreshCw size={19} color="#2F6DF6" />
            <Text className="flex-1 text-xs leading-5 text-[#315B9C] dark:text-[#AFC9F7]">正式包启用 EAS Update 后，可以在这里下载在线更新并重启应用完成升级。</Text>
          </View>
          <AdminButton label="检查 Expo 在线更新" pending={otaMutation.isPending} onPress={() => otaMutation.mutate()} />
          <AdminMessage error={otaMutation.error} />
        </AdminSection>

        <AdminSection title="开源项目" detail="代码、发布版本、问题反馈与许可证信息。">
          <ExternalRow icon={Github} title="开源仓库" detail="trilogys/sub2api-mobile" url={APP_REPOSITORY_URL} />
          <ExternalRow icon={Download} title="版本与 APK" detail="查看全部 GitHub Releases" url={`${APP_REPOSITORY_URL}/releases`} />
          <ExternalRow icon={CircleAlert} title="问题反馈" detail="提交 Bug、建议或兼容性问题" url={`${APP_REPOSITORY_URL}/issues`} />
          <ExternalRow icon={FileText} title="Apache License 2.0" detail="查看本项目开源许可证" url={`${APP_REPOSITORY_URL}/blob/main/LICENSE`} />
          <ExternalRow icon={Code2} title="灵感来源" detail="感谢 ckken/sub2api-mobile 的开源成果" url="https://github.com/ckken/sub2api-mobile" />
        </AdminSection>

        <AdminSection title="更新与安全说明">
          <View className="flex-row items-start gap-3">
            <ShieldCheck size={19} color="#20A66A" />
            <Text className="flex-1 text-xs leading-5 text-[#5F6C80] dark:text-[#AAB6C8]">请只从本项目 GitHub Releases 或你信任的构建渠道安装 APK。更新前建议保留服务器地址与登录信息。</Text>
          </View>
          <Pressable onPress={() => void open(`${APP_REPOSITORY_URL}/blob/main/SECURITY.md`)} className="flex-row items-center justify-center gap-2 rounded-2xl bg-[#F1F5FA] py-3 dark:bg-[#182235]">
            <Info size={16} color="#2F6DF6" />
            <Text className="text-xs font-bold text-[#2F6DF6]">查看安全策略</Text>
            <ExternalLink size={14} color="#2F6DF6" />
          </Pressable>
        </AdminSection>
      </ScreenShell>
    </>
  );
}
