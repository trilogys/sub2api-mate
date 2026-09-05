import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [appPath, reportPath] = process.argv.slice(2);
assert(appPath && reportPath, 'Usage: node verify-ios-app.mjs <app> <report.json>');
const appConfig = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;
const readPlist = (file) => JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' }));
const info = readPlist(path.join(appPath, 'Info.plist'));
const binary = path.join(appPath, info.CFBundleExecutable);
const architectures = execFileSync('xcrun', ['lipo', '-archs', binary], { encoding: 'utf8' }).trim().split(/\s+/);
const buildVersion = execFileSync('xcrun', ['vtool', '-show-build', binary], { encoding: 'utf8' });

assert.equal(info.CFBundleDisplayName, 'GateNest');
assert.equal(info.CFBundleIdentifier, appConfig.ios.bundleIdentifier);
assert.equal(info.CFBundleShortVersionString, appConfig.version);
assert.equal(info.CFBundleVersion, appConfig.ios.buildNumber);
assert.equal(Number(info.MinimumOSVersion), 16, 'MinimumOSVersion must be iOS 16.0');
assert.equal(info.DTPlatformName, 'iphoneos', 'Simulator bundles cannot be installed on devices');
assert(info.UIDeviceFamily.includes(1) && info.UIDeviceFamily.includes(2), 'Both iPhone and iPad must be supported');
assert(architectures.includes('arm64'), 'Missing arm64 device executable');
assert(/platform IOS\s/.test(buildVersion), 'Expected an iOS device Mach-O binary');
assert(/minos 16\.0(?:\.0)?\s/.test(buildVersion), 'Executable must target iOS 16.0');
assert(fs.statSync(path.join(appPath, 'main.jsbundle')).size > 0, 'Missing offline JavaScript bundle');
assert.equal(info.NSAppTransportSecurity?.NSAllowsArbitraryLoads, true, 'User-configured HTTP servers must remain accessible');
assert(info.NSLocalNetworkUsageDescription, 'Missing local network permission description');
assert(!fs.existsSync(path.join(appPath, 'embedded.mobileprovision')), 'The re-signing IPA must not embed a provisioning profile');

const report = {
  name: info.CFBundleDisplayName,
  bundleIdentifier: info.CFBundleIdentifier,
  version: info.CFBundleShortVersionString,
  buildNumber: info.CFBundleVersion,
  minimumOSVersion: info.MinimumOSVersion,
  platform: info.DTPlatformName,
  architectures,
  deviceFamilies: info.UIDeviceFamily,
  embeddedJavaScript: true,
  signing: 'unsigned; requires P12 and matching provisioning profile',
  sourceCommit: process.env.GITHUB_SHA || null,
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
