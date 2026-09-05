import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}

function only(files, suffix) {
  const matches = files.filter(file => file.endsWith(suffix));
  assert.equal(matches.length, 1, `Expected exactly one ${suffix}, got ${matches.length}`);
  return matches[0];
}

export function prepareMobileRelease({ input, output, app, sourceCommit, changelog }) {
  assert(/^[0-9a-f]{40}$/.test(sourceCommit), 'Missing source commit');
  const files = filesUnder(input);
  const packages = [];
  for (const architecture of ['arm64-v8a', 'armeabi-v7a', 'x86_64']) {
    const androidFiles = files.filter(file => path.relative(input, file).split(path.sep)
      .some(part => part.startsWith(`gatenest-release-${architecture}-apk-`)));
    const metadataFile = only(androidFiles, 'output-metadata.json');
    const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
    assert.equal(metadata.applicationId, app.android.package);
    assert.equal(metadata.variantName, 'release');
    assert.equal(metadata.elements.length, 1);
    const element = metadata.elements[0];
    assert.equal(element.versionName, app.version);
    assert.equal(element.versionCode, app.android.versionCode);
    const apk = only(androidFiles, '.apk');
    assert.equal(path.basename(apk), element.outputFile);
    packages.push({ source: apk, name: `gatenest-v${app.version}-${architecture}.apk` });
  }

  const iosFiles = filesUnder(path.join(input, 'ios'));
  const ipa = only(iosFiles, '.ipa');
  const name = `gatenest-v${app.version}-unsigned.ipa`;
  assert.equal(path.basename(ipa), name);
  const report = JSON.parse(fs.readFileSync(only(iosFiles, 'ios-verification.json'), 'utf8'));
  assert.equal(report.version, app.version);
  assert.equal(report.buildNumber, app.ios.buildNumber);
  assert.equal(report.bundleIdentifier, app.ios.bundleIdentifier);
  assert.equal(report.sourceCommit, sourceCommit);
  assert.equal(report.platform, 'iphoneos');
  assert.deepEqual(report.architectures, ['arm64']);
  const expectedHash = fs.readFileSync(only(iosFiles, '.ipa.sha256'), 'utf8').trim().split(/\s+/)[0];
  assert.equal(createHash('sha256').update(fs.readFileSync(ipa)).digest('hex'), expectedHash);
  packages.push({ source: ipa, name });
  for (const file of packages) assert(fs.statSync(file.source).size > 0, `Empty package: ${file.name}`);

  // Validate every platform before writing any file that could be uploaded to a Release.
  assert(!fs.existsSync(output) || fs.readdirSync(output).length === 0, 'Release staging directory must be empty');
  fs.mkdirSync(output, { recursive: true });
  for (const file of packages) {
    const bytes = fs.readFileSync(file.source);
    fs.writeFileSync(path.join(output, file.name), bytes);
    fs.writeFileSync(path.join(output, `${file.name}.sha256`), `${createHash('sha256').update(bytes).digest('hex')}  ${file.name}\n`);
  }
  const heading = `## [${app.version}]`;
  const start = changelog.indexOf(heading);
  const end = start < 0 ? -1 : changelog.indexOf('\n## [', start + heading.length);
  const changes = start < 0 ? '' : changelog.slice(start, end < 0 ? undefined : end).trim();
  const notes = [
    `GateNest v${app.version} includes Android APKs and the iOS IPA built from the same source commit.`,
    changes,
    'Android: arm64-v8a, armeabi-v7a, x86_64. iOS: iPhone and iPad, iOS 16.0 or later. The IPA requires re-signing with a P12 certificate and matching provisioning profile.',
    `Source commit: ${sourceCommit}`,
  ].filter(Boolean).join('\n\n');
  fs.writeFileSync(path.join(output, 'release-notes.md'), `${notes}\n`);
  return packages.map(file => file.name);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [input, output] = process.argv.slice(2);
  assert(input && output, 'Usage: node prepare-mobile-release.mjs <artifacts> <output>');
  console.log(prepareMobileRelease({
    input, output,
    app: JSON.parse(fs.readFileSync('app.json', 'utf8')).expo,
    sourceCommit: process.env.SOURCE_SHA,
    changelog: fs.readFileSync('CHANGELOG.md', 'utf8'),
  }).join('\n'));
}
