import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Download, Share2 } from 'lucide-react-native';
import { Linking, View } from 'react-native';

import { AdminButton, AdminMessage } from './admin-ui';
import { Text } from './localized-text';
import type { AppReleaseAsset } from '../services/app-release';
import { downloadIOSIpa, formatIOSUpdateError, shareIOSIpa, type IOSAppUpdateProgress } from '../services/ios-app-update';

export function IOSAppUpdate({ asset }: { asset: AppReleaseAsset }) {
  const [progress, setProgress] = useState<IOSAppUpdateProgress | null>(null);
  const download = useMutation({ mutationFn: () => downloadIOSIpa(asset, setProgress), onError: () => setProgress(null) });
  const share = useMutation({ mutationFn: (uri: string) => shareIOSIpa(uri) });
  const browser = useMutation({ mutationFn: () => Linking.openURL(asset.browser_download_url) });
  const error = download.error || share.error || browser.error;
  const percent = progress?.totalBytes ? Math.min(100, Math.round(progress.downloadedBytes / progress.totalBytes * 100)) : 0;
  return <View className="gap-3">
    <View className="flex-row items-center gap-2"><Download size={17} color="#2F6DF6" /><Text className="min-w-0 flex-1 text-xs text-[#667085] dark:text-[#9EABC0]">{asset.name}</Text></View>
    {progress ? <View className="gap-2">
      <Text className="text-xs text-[#2F6DF6]">{percent}% · {(progress.downloadedBytes / 1024 / 1024).toFixed(1)} / {(progress.totalBytes / 1024 / 1024).toFixed(1)} MB</Text>
      <View className="h-2 overflow-hidden rounded-full bg-[#DCE7F8] dark:bg-[#273449]"><View className="h-full bg-[#2F6DF6]" style={{ width: `${percent}%` }} /></View>
    </View> : null}
    <AdminButton label={download.data ? '重新下载 IPA' : '下载 IPA'} tone={download.data ? 'muted' : 'primary'} pending={download.isPending} disabled={share.isPending} onPress={() => download.mutate(undefined, { onSuccess: (uri) => share.mutate(uri) })} />
    {download.data ? <View className="flex-row items-center gap-2"><Share2 size={18} color="#2F6DF6" /><View className="flex-1"><AdminButton label="选择签名 App" pending={share.isPending} disabled={download.isPending} onPress={() => share.mutate(download.data!)} /></View></View> : null}
    <AdminButton label="Safari 下载" tone="muted" pending={browser.isPending} disabled={download.isPending || share.isPending} onPress={() => browser.mutate()} />
    <AdminMessage error={error ? formatIOSUpdateError(error) : undefined} />
  </View>;
}
