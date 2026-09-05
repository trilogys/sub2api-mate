import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { AppReleaseAsset } from './app-release';

export type IOSAppUpdateProgress = { downloadedBytes: number; totalBytes: number };

export async function downloadIOSIpa(asset: AppReleaseAsset, onProgress: (progress: IOSAppUpdateProgress) => void) {
  if (Platform.OS !== 'ios') throw new Error('IPA 下载仅支持 iOS');
  if (!FileSystem.cacheDirectory) throw new Error('无法访问下载目录');
  if (!asset.name.toLowerCase().endsWith('.ipa') || !asset.browser_download_url.startsWith('https://')) {
    throw new Error('IPA 下载地址无效');
  }
  const directory = `${FileSystem.cacheDirectory}gatenest-updates/${asset.id}/`;
  const destination = `${directory}${asset.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  onProgress({ downloadedBytes: 0, totalBytes: asset.size });
  try {
    const download = FileSystem.createDownloadResumable(asset.browser_download_url, destination, {},
      ({ totalBytesWritten, totalBytesExpectedToWrite }) => onProgress({
        downloadedBytes: totalBytesWritten,
        totalBytes: totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : asset.size,
      }));
    const result = await download.downloadAsync();
    if (!result?.uri || result.status !== 200) throw new Error(`IPA 下载失败（HTTP ${result?.status ?? '-'}）`);
    const file = await FileSystem.getInfoAsync(result.uri);
    if (!file.exists || file.isDirectory || !file.size || (asset.size > 0 && file.size !== asset.size)) {
      throw new Error('IPA 下载不完整，请重试');
    }
    onProgress({ downloadedBytes: file.size, totalBytes: file.size });
    return result.uri;
  } catch (error) {
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
    throw error;
  }
}

export async function shareIOSIpa(uri: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('当前设备不支持系统文件分享');
  const file = await FileSystem.getInfoAsync(uri);
  if (!file.exists) throw new Error('IPA 缓存已清理，请重新下载');
  await Sharing.shareAsync(uri, { UTI: 'com.apple.itunes.ipa', mimeType: 'application/octet-stream' });
}
