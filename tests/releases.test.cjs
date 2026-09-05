const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTypeScript } = require('./load-typescript.cjs');
const { getSub2APIReleaseUrl } = loadTypeScript('src/lib/sub2api-release.ts');
const { findIOSIpa, findAndroidApk } = loadTypeScript('src/services/app-release.ts');

test('Sub2API uses the exact release URL and supports older version-only responses', () => {
  const base = 'https://github.com/Wei-Shaw/sub2api/releases/tag/';
  assert.equal(getSub2APIReleaseUrl({ latest_version: '1.2.3', release_info: { html_url: `${base}v1.2.3-rc.1` } }), `${base}v1.2.3-rc.1`);
  for (const version of ['v1.2.3', '1.2.3']) assert.equal(getSub2APIReleaseUrl({ latest_version: version }), `${base}v1.2.3`);
  assert.equal(getSub2APIReleaseUrl({ latest_version: '1.2.3-rc.1+build.2' }), `${base}v1.2.3-rc.1%2Bbuild.2`);
  assert.equal(getSub2APIReleaseUrl({ latest_version: '1.2.3', release_info: { html_url: 'javascript:alert(1)' } }), `${base}v1.2.3`);
  for (const version of [undefined, { latest_version: '-' }, { latest_version: 'dev' }, { latest_version: '../main' }]) assert.equal(getSub2APIReleaseUrl(version), null);
});

test('iOS selects IPA assets and Android still selects its matching APK', () => {
  const release = { assets: [{ name: 'source.zip' }, { name: 'gatenest-v1.8.2.ipa.sha256' }, { name: 'gatenest-v1.8.2.ipa' }, { name: 'gatenest-v1.8.2-arm64-v8a.apk' }] };
  assert.equal(findIOSIpa(release), release.assets[2]);
  assert.equal(findAndroidApk(release, ['arm64']), release.assets[3]);
  assert.equal(findIOSIpa({ assets: [{ name: 'source.zip' }] }), null);
  assert.equal(findIOSIpa(null), null);
});

function downloadMocks({ status = 200, size = 100, available = true, nativeError } = {}) {
  const deleted = [];
  const shared = [];
  const sessions = [];
  const streamed = [];
  let handleClosed = false;
  const service = loadTypeScript('src/services/ios-app-update.ts', {
    'react-native': { Platform: { OS: 'ios' } },
    'expo-file-system': { File: class {
      create() {}
      open() { return { writeBytes: bytes => streamed.push(bytes), close: () => { handleClosed = true; } }; }
    } },
    'expo/fetch': { fetch: async () => ({ status, body: new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(size));
      controller.close();
    } }) }) },
    'expo-file-system/legacy': {
      cacheDirectory: 'file:///cache/',
      FileSystemSessionType: { FOREGROUND: 1, BACKGROUND: 0 },
      makeDirectoryAsync: async () => {},
      createDownloadResumable: (_, uri, options, progress) => {
        sessions.push(options.sessionType);
        return { downloadAsync: async () => {
          if (nativeError) throw nativeError;
          progress({ totalBytesWritten: size, totalBytesExpectedToWrite: 100 });
          return { uri, status };
        } };
      },
      getInfoAsync: async () => ({ exists: true, isDirectory: false, size }),
      deleteAsync: async (uri) => deleted.push(uri),
    },
    'expo-sharing': { isAvailableAsync: async () => available, shareAsync: async (...args) => shared.push(args) },
  });
  return { ...service, deleted, shared, sessions, streamed, isHandleClosed: () => handleClosed };
}

const asset = { id: 12, name: 'gatenest-v1.8.2.ipa', browser_download_url: 'https://github.com/trilogys/GateNest/releases/download/v1.8.2/gatenest-v1.8.2.ipa', size: 100 };

test('iOS downloads the actual IPA and shares it with the IPA file type', async () => {
  const service = downloadMocks();
  const progress = [];
  const uri = await service.downloadIOSIpa(asset, (value) => progress.push(value));
  assert(uri.endsWith('/12/gatenest-v1.8.2.ipa'));
  assert.deepEqual(progress.at(-1), { downloadedBytes: 100, totalBytes: 100 });
  await service.shareIOSIpa(uri);
  assert.equal(service.shared[0][0], uri);
  assert.equal(service.shared[0][1].UTI, 'com.apple.itunes.ipa');
  assert.equal(service.deleted.length, 1, 'Old destination is removed before download');
  assert.deepEqual(service.sessions, [1], 'Re-signed iOS apps use a foreground session');
});

test('HTTP errors and truncated IPA downloads are removed and never shared', async () => {
  for (const options of [{ status: 404 }, { size: 40 }, { size: 0 }]) {
    const service = downloadMocks(options);
    await assert.rejects(service.downloadIOSIpa(asset, () => {}));
    assert.equal(service.deleted.length, 2);
    assert.equal(service.shared.length, 0);
  }
});

test('unavailable sharing reports a recoverable error', async () => {
  const service = downloadMocks({ available: false });
  await assert.rejects(service.shareIOSIpa('file:///cache/app.ipa'), /系统文件分享/);
  assert.equal(service.shared.length, 0);
});

test('iOS cannot-create-file error falls back to direct byte streaming and closes the file', async () => {
  const service = downloadMocks({ nativeError: new Error('NSURLErrorDomain Code=-3000 Cannot create file https://example.com/?signature=private') });
  const progress = [];
  const uri = await service.downloadIOSIpa(asset, value => progress.push(value));
  assert(uri.endsWith('gatenest-v1.8.2.ipa'));
  assert.deepEqual(service.sessions, [1]);
  assert.equal(service.streamed.reduce((sum, bytes) => sum + bytes.byteLength, 0), 100);
  assert(service.isHandleClosed());
  assert.deepEqual(progress.at(-1), { downloadedBytes: 100, totalBytes: 100 });
});

test('native download errors do not expose signed URLs or overflow the error view', async () => {
  const service = downloadMocks({ nativeError: new Error('NSURLErrorDomain Code=-1009 UserInfo=https://example.com/?signature=private') });
  await assert.rejects(service.downloadIOSIpa(asset, () => {}), error => {
    assert(error.message.length < 100);
    assert(!/https:|signature|UserInfo/.test(error.message));
    return true;
  });
  assert.equal(service.streamed.length, 0);
  const formatted = service.formatIOSUpdateError(new Error('NSURLErrorDomain Code=-3000 Cannot create file https://example.com'));
  assert(formatted.includes('Safari'));
  assert.equal(service.formatIOSUpdateError(formatted), formatted);
});
