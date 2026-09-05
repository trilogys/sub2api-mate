const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gatenest-release-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const input = path.join(directory, 'artifacts');
  const output = path.join(directory, 'release');
  const app = { version: '1.8.3', android: { package: 'com.ppx.sub2apimate', versionCode: 16 }, ios: { bundleIdentifier: 'com.ppx.sub2apimate', buildNumber: '16' } };
  const sourceCommit = 'a'.repeat(40);
  const write = (file, value) => {
    const destination = path.join(input, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, value);
    return destination;
  };
  const androidMetadata = { applicationId: app.android.package, variantName: 'release', elements: [{ versionName: app.version, versionCode: app.android.versionCode, outputFile: 'app-release.apk' }] };
  const metadataFiles = [];
  for (const arch of ['arm64-v8a', 'armeabi-v7a', 'x86_64']) {
    const prefix = `android/gatenest-release-${arch}-apk-1/release`;
    write(`${prefix}/app-release.apk`, `APK fixture ${arch}`);
    metadataFiles.push(write(`${prefix}/output-metadata.json`, JSON.stringify(androidMetadata)));
  }
  const ipa = Buffer.from('IPA fixture');
  write('ios/build/ios/gatenest-v1.8.3-unsigned.ipa', ipa);
  write('ios/build/ios/gatenest-v1.8.3-unsigned.ipa.sha256', `${createHash('sha256').update(ipa).digest('hex')}  gatenest-v1.8.3-unsigned.ipa\n`);
  const report = { version: app.version, buildNumber: app.ios.buildNumber, bundleIdentifier: app.ios.bundleIdentifier, sourceCommit, platform: 'iphoneos', architectures: ['arm64'] };
  const reportFile = write('ios/build/ios/ios-verification.json', JSON.stringify(report));
  return { input, output, app, sourceCommit, changelog: '## [1.8.3] - 2026-09-06\n\nSafe area fix.\n\n## [1.8.2]\nOld notes.', write, metadataFiles, report, reportFile, androidMetadata };
}

test('combined release stages exactly three APKs and one IPA with checksums', async t => {
  const { prepareMobileRelease } = await import('../.github/scripts/prepare-mobile-release.mjs');
  const data = fixture(t);
  const names = prepareMobileRelease(data);
  assert.equal(names.length, 4);
  assert(names.includes('gatenest-v1.8.3-unsigned.ipa'));
  for (const name of names) {
    const bytes = fs.readFileSync(path.join(data.output, name));
    const checksum = fs.readFileSync(path.join(data.output, `${name}.sha256`), 'utf8');
    assert.equal(checksum, `${createHash('sha256').update(bytes).digest('hex')}  ${name}\n`);
  }
  const notes = fs.readFileSync(path.join(data.output, 'release-notes.md'), 'utf8');
  assert(notes.includes('Safe area fix.'));
  assert(!notes.includes('Old notes.'));
});

test('missing Android architecture prevents any release output', async t => {
  const { prepareMobileRelease } = await import('../.github/scripts/prepare-mobile-release.mjs');
  const data = fixture(t);
  fs.unlinkSync(path.join(path.dirname(data.metadataFiles[1]), 'app-release.apk'));
  assert.throws(() => prepareMobileRelease(data), /exactly one .apk/);
  assert(!fs.existsSync(data.output));
});

test('mismatched Android version prevents any release output', async t => {
  const { prepareMobileRelease } = await import('../.github/scripts/prepare-mobile-release.mjs');
  const data = fixture(t);
  data.androidMetadata.elements[0].versionName = '1.8.2';
  fs.writeFileSync(data.metadataFiles[0], JSON.stringify(data.androidMetadata));
  assert.throws(() => prepareMobileRelease(data));
  assert(!fs.existsSync(data.output));
});

test('IPA from a different commit prevents any release output', async t => {
  const { prepareMobileRelease } = await import('../.github/scripts/prepare-mobile-release.mjs');
  const data = fixture(t);
  data.report.sourceCommit = 'b'.repeat(40);
  fs.writeFileSync(data.reportFile, JSON.stringify(data.report));
  assert.throws(() => prepareMobileRelease(data));
  assert(!fs.existsSync(data.output));
});

test('damaged IPA prevents any release output', async t => {
  const { prepareMobileRelease } = await import('../.github/scripts/prepare-mobile-release.mjs');
  const data = fixture(t);
  data.write('ios/build/ios/gatenest-v1.8.3-unsigned.ipa', 'truncated');
  assert.throws(() => prepareMobileRelease(data));
  assert(!fs.existsSync(data.output));
});
