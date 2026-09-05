import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { AppReleaseAsset } from './app-release';

export type IOSAppUpdateProgress = { downloadedBytes: number; totalBytes: number };

function cannotCreateDownloadFile(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /Code\s*=\s*-3000\b|Cannot create file/i.test(message);
}

export function formatIOSUpdateError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (cannotCreateDownloadFile(error)) return '无法创建下载文件，请检查设备剩余空间后重试，或使用 Safari 下载。';
  if (/^IPA 下载(?:失败（HTTP [\d-]+）|不完整，请重试)$/.test(message)) return message;
  if (/无法创建下载文件|无法访问下载目录|IPA 下载地址无效|当前设备不支持系统文件分享|IPA 缓存已清理/.test(message) && !/https?:\/\//.test(message)) return message;
  return '操作未完成，请保持应用在前台并检查网络和剩余空间后重试。';
}

async function downloadWithStream(asset: AppReleaseAsset, destination: string, onProgress: (progress: IOSAppUpdateProgress) => void) {
  const file = new File(destination);
  file.create({ overwrite: true, intermediates: true });
  const handle = file.open();
  const controller = new AbortController();
  try {
    // Data streaming avoids URLSessionDownloadTask's system-managed temporary file.
    const response = await expoFetch(asset.browser_download_url, { signal: controller.signal });
    if (response.status !== 200) throw new Error(`IPA 下载失败（HTTP ${response.status}）`);
    if (!response.body) throw new Error('IPA 下载不完整，请重试');
    const reader = response.body.getReader();
    let downloadedBytes = 0;
    onProgress({ downloadedBytes, totalBytes: asset.size });
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        handle.writeBytes(value);
        downloadedBytes += value.byteLength;
        onProgress({ downloadedBytes, totalBytes: asset.size });
      }
    } finally {
      reader.releaseLock();
    }
    return { uri: destination, status: response.status };
  } finally {
    controller.abort();
    handle.close();
  }
}

export async function downloadIOSIpa(asset: AppReleaseAsset, onProgress: (progress: IOSAppUpdateProgress) => void) {
  if (Platform.OS !== 'ios') throw new Error('IPA 下载仅支持 iOS');
  if (!FileSystem.cacheDirectory) throw new Error('无法访问下载目录');
  if (!asset.name.toLowerCase().endsWith('.ipa') || !asset.browser_download_url.startsWith('https://')) {
    throw new Error('IPA 下载地址无效');
  }
  const directory = `${FileSystem.cacheDirectory}gatenest-updates/${asset.id}/`;
  const destination = `${directory}${asset.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  onProgress({ downloadedBytes: 0, totalBytes: asset.size });
  try {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    await FileSystem.deleteAsync(destination, { idempotent: true });
    const download = FileSystem.createDownloadResumable(asset.browser_download_url, destination, { sessionType: FileSystem.FileSystemSessionType.FOREGROUND },
      ({ totalBytesWritten, totalBytesExpectedToWrite }) => onProgress({
        downloadedBytes: totalBytesWritten,
        totalBytes: totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : asset.size,
      }));
    let result;
    try {
      result = await download.downloadAsync();
    } catch (error) {
      if (!cannotCreateDownloadFile(error)) throw error;
      result = await downloadWithStream(asset, destination, onProgress);
    }
    if (!result?.uri || result.status !== 200) throw new Error(`IPA 下载失败（HTTP ${result?.status ?? '-'}）`);
    const file = await FileSystem.getInfoAsync(result.uri);
    if (!file.exists || file.isDirectory || !file.size || (asset.size > 0 && file.size !== asset.size)) {
      throw new Error('IPA 下载不完整，请重试');
    }
    onProgress({ downloadedBytes: file.size, totalBytes: file.size });
    return result.uri;
  } catch (error) {
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
    throw new Error(formatIOSUpdateError(error));
  }
}

export async function shareIOSIpa(uri: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('当前设备不支持系统文件分享');
  const file = await FileSystem.getInfoAsync(uri);
  if (!file.exists) throw new Error('IPA 缓存已清理，请重新下载');
  await Sharing.shareAsync(uri, { UTI: 'com.apple.itunes.ipa', mimeType: 'application/octet-stream' });
}
