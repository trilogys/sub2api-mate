# GateNest Expo and Android Release Guide

[English README](../README.md) | [中文 README](../README.zh-CN.md)

## Project binding

The application is currently bound to:

- Expo owner: `trilogys`
- Expo slug: `sub2api-mobile`
- Expo project ID: `13df808b-fe18-475e-b188-f4dd64e90e7e`
- Android package: `com.ppx.sub2apimate` (preserved for upgrade compatibility)
- iOS bundle identifier: `com.ppx.sub2apimate` (preserved for upgrade compatibility)
- Runtime version policy: `appVersion`

The public application name is `GateNest`. The existing Expo slug and native package identifiers remain unchanged so installed users can upgrade in place.

## Choose a build method

The in-app Build Center defaults to the GitHub native workflow. Use EAS when managed Expo credentials, EAS Update, or Expo-hosted build history is preferred.

| Method | Queue | Required secret | Output | Best use |
| --- | --- | --- | --- | --- |
| GitHub native | GitHub Actions | None on the website; an Actions-capable GitHub token when triggered from the app | Android APK artifact | Default release/debug APK builds |
| EAS CLI | EAS Build | Interactive Expo login or local Expo token | APK for `preview` | First-time setup and managed credentials |
| EAS through GitHub | EAS Build | `EXPO_TOKEN` repository secret | APK and build URL | Automated Expo-hosted builds |

## GitHub native APK

The workflow is `.github/workflows/android-native-build.yml` and is named **GateNest Android APK**.

1. Open the repository's **Actions** page.
2. Select **GateNest Android APK**.
3. Select **Run workflow**.
4. Choose `release` or `debug`.
5. Follow the job steps until **Upload APK** completes.
6. Download the APK from **Artifacts**.

The release artifact is retained for 14 days. Debug artifacts and reports may use a shorter retention period.

The workflow runs Node setup, dependency installation, Expo Prebuild, Java/Gradle setup, Gradle APK compilation, and artifact upload. It does not use the EAS free-tier queue and does not require `EXPO_TOKEN`.

When triggered from the app, GitHub Jobs API data is used to show each step's waiting, running, successful, or failed state, an approximate completion percentage, and APK availability.

## First EAS preview APK

Run the first EAS build on a computer so project ownership and Android signing credentials can be confirmed:

```powershell
cd sub2api-mate
npm ci
npx eas-cli@latest login
npx eas-cli@latest whoami
npx eas-cli@latest build --platform android --profile preview
```

The `preview` profile uses internal distribution and produces an installable APK. When EAS asks about Android credentials, allowing EAS to generate and manage a keystore is the simplest option for a new project.

After the initial project setup, a phone can trigger the configured EAS workflow. The phone only submits and monitors the job; compilation runs in the EAS cloud.

## EAS Build from GitHub Actions

Add the following repository secret under **Settings → Secrets and variables → Actions**:

```text
EXPO_TOKEN
```

Then run the **GateNest EAS Android Build** workflow from `.github/workflows/eas-build.yml` and choose:

- `profile`: `preview` or `production`
- `platform`: `android`, `ios`, or `all`

The workflow waits for EAS and uploads a preview Android APK when a direct build URL is available. Preview APK artifacts are retained for 30 days.

## Release naming

- Release title: `GateNest vX.Y.Z`
- Android APKs: `gatenest-vX.Y.Z-arm64-v8a.apk`, `gatenest-vX.Y.Z-armeabi-v7a.apk`, and `gatenest-vX.Y.Z-x86_64.apk`
- GitHub Actions artifacts: `gatenest-<variant>-<architecture>-apk-<run-number>`
- CLIProxy Group Router keeps its independent plugin name and asset naming.

## Local development and debugging

Start Metro:

```bash
npm ci
npm run start
```

Open an Android emulator or connected device:

```bash
npm run android
```

For native-module debugging, build a development client once, install it, and then start Metro in dev-client mode:

```bash
npx eas-cli@latest build --platform android --profile development
npm run start:dev-client
```

Expo Go is useful for quick JavaScript and layout checks, but it is not a substitute for a development build when native modules or EAS Update runtime matching matters.

## EAS Update

Publish to the preview branch:

```bash
npx eas-cli@latest update --branch preview --message "Preview update"
```

Publish to the production branch:

```bash
npx eas-cli@latest update --branch production --message "Production update"
```

The installed build and update must use compatible runtime versions. A custom scheme, `expo-updates`, and a native development or release build are already configured.

## Release validation

Run these checks before publishing:

```bash
npx tsc --noEmit
npm run audit:api-coverage
npx expo config --type public
npx expo export --platform android
```

Also confirm that:

- The icon, splash, name, package identifiers, and Expo owner are correct.
- No token is committed to the repository.
- Both login modes reach the intended server.
- A release APK installs and opens on a physical Android device.
- The APK download link is visible after a successful GitHub or EAS build.

## Troubleshooting

### EAS build remains queued

Free-tier EAS builds can wait for an available worker. Use the GitHub native workflow when a standard APK is sufficient and the EAS queue is long.

### Update was published but the device does not change

Confirm the Expo project, update branch/channel, runtime version, and that the installed application is a development or release build rather than Expo Go.

### `No custom scheme defined`

The current configuration defines `sub2apimobile`. If an older installed build was generated before that setting existed, rebuild and reinstall it.

### Native Gradle build fails

Open the failed **Build APK with Gradle** step in GitHub Actions. Fix the first actionable compiler or Gradle error, then rerun the workflow. The app's build page can also display the failed step and send a sanitized error summary to the optional AI assistant.
