import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

import type { AppReleaseAsset } from '@/src/services/app-release';

export type AndroidAppUpdateProgress = {
  phase: 'downloading' | 'installing';
  downloadedBytes: number;
  totalBytes: number;
};

export async function downloadAndInstallAndroidApk(
  asset: AppReleaseAsset,
  onProgress: (progress: AndroidAppUpdateProgress) => void,
) {
  if (Platform.OS !== 'android') throw new Error('App 内安装仅支持 Android');
  if (!FileSystem.cacheDirectory) throw new Error('无法访问下载目录');

  const fileName = asset.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const destination = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.deleteAsync(destination, { idempotent: true });

  onProgress({ phase: 'downloading', downloadedBytes: 0, totalBytes: asset.size });
  const download = FileSystem.createDownloadResumable(
    asset.browser_download_url,
    destination,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      onProgress({
        phase: 'downloading',
        downloadedBytes: totalBytesWritten,
        totalBytes: totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : asset.size,
      });
    },
  );
  const result = await download.downloadAsync();
  if (!result?.uri) throw new Error('APK 下载未完成，请重试');

  onProgress({ phase: 'installing', downloadedBytes: asset.size, totalBytes: asset.size });
  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1 | 0x10000000,
    type: 'application/vnd.android.package-archive',
  });
}
