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

function downloadMocks({ status = 200, size = 100, available = true } = {}) {
  const deleted = [];
  const shared = [];
  const service = loadTypeScript('src/services/ios-app-update.ts', {
    'react-native': { Platform: { OS: 'ios' } },
    'expo-file-system/legacy': {
      cacheDirectory: 'file:///cache/',
      makeDirectoryAsync: async () => {},
      createDownloadResumable: (_, uri, options, progress) => ({ downloadAsync: async () => { progress({ totalBytesWritten: size, totalBytesExpectedToWrite: 100 }); return { uri, status }; } }),
      getInfoAsync: async () => ({ exists: true, isDirectory: false, size }),
      deleteAsync: async (uri) => deleted.push(uri),
    },
    'expo-sharing': { isAvailableAsync: async () => available, shareAsync: async (...args) => shared.push(args) },
  });
  return { ...service, deleted, shared };
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
  assert.equal(service.deleted.length, 0);
});

test('HTTP errors and truncated IPA downloads are removed and never shared', async () => {
  for (const options of [{ status: 404 }, { size: 40 }, { size: 0 }]) {
    const service = downloadMocks(options);
    await assert.rejects(service.downloadIOSIpa(asset, () => {}));
    assert.equal(service.deleted.length, 1);
    assert.equal(service.shared.length, 0);
  }
});

test('unavailable sharing reports a recoverable error', async () => {
  const service = downloadMocks({ available: false });
  await assert.rejects(service.shareIOSIpa('file:///cache/app.ipa'), /系统文件分享/);
  assert.equal(service.shared.length, 0);
});
