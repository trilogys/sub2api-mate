[**English**](README.md) | [简体中文](README.zh-CN.md)

<p align="center">
  <img src="assets/icon.png" alt="sub2api app icon" width="120" />
</p>

<h1 align="center">sub2api</h1>

<p align="center">
  A mobile administration console for Sub2API, built with Expo SDK 54 and React Native.
</p>

> [!IMPORTANT]
> **Inspiration and thanks.** This project was inspired by [ckken/sub2api-mobile](https://github.com/ckken/sub2api-mobile). We sincerely thank ckken for publishing the original open-source work. The upstream project is licensed under the MIT License, and this repository preserves its original copyright and complete license text in [LICENSES/MIT-ckken.txt](LICENSES/MIT-ckken.txt). The extensive mobile UI, administration coverage, AI assistant, build center, and automation in this repository are independently maintained by the trilogys contributors. No endorsement by the upstream author is implied.

The maintained repository is [trilogys/sub2api-mobile](https://github.com/trilogys/sub2api-mobile). It does not automatically merge or synchronize source code from other Sub2API Mobile forks. Its scheduled synchronization reads API metadata from the Sub2API server project only.

## Overview

sub2api brings the day-to-day administration, diagnostics, and build workflows of a Sub2API deployment to Android, iOS, and the web. It provides role-aware access, a responsive blue-and-white card interface, full access to generated administration routes, mobile-friendly dedicated pages, an optional AI assistant, and cloud APK builds that can be started from a phone.

> [!NOTE]
> **Testing scope:** The current release has only been tested on Android. Expo includes iOS and Web targets, but those targets have not yet been fully verified.

Generated API coverage currently contains **382 administration routes**:

- **132** routes have dedicated mobile service wrappers.
- **250** additional routes are available through the universal API console.
- **0** discovered routes are uncovered.

## Screenshots

The following screens are only a selection of the implemented application.

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/navigation.jpg" alt="Customizable navigation" width="280" /><br /><sub>Customizable navigation and account actions</sub></td>
    <td align="center"><img src="docs/screenshots/operations-monitor.jpg" alt="Operations monitor" width="280" /><br /><sub>Operations monitoring and request trends</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/accounts.jpg" alt="Account management" width="280" /><br /><sub>Account management, quotas, and refresh controls</sub></td>
    <td align="center"><img src="docs/screenshots/dashboard.jpg" alt="Dashboard" width="280" /><br /><sub>Dashboard metrics and time-range charts</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/api-keys.jpg" alt="API key management" width="280" /><br /><sub>Personal API key management</sub></td>
    <td align="center"><img src="docs/screenshots/ai-assistant.jpg" alt="AI assistant" width="280" /><br /><sub>Contextual AI assistant and conversation history</sub></td>
  </tr>
</table>

## Feature set

### Authentication and roles

- Sign in with a server URL plus email and password using the official `/api/v1/auth/login` flow.
- Sign in with a server URL plus Admin Key using the `x-api-key` administration flow.
- Normalize server addresses ending in `/api/v1`, `/v1`, or a root URL without duplicating path segments.
- Remember multiple login profiles, select a saved account from the login screen, and delete saved credentials when they are no longer needed.
- Store active credentials in the system SecureStore on Android and iOS; secrets are not persisted on the web.
- Automatically refresh expiring email-account sessions.
- Show the full administration menu for administrators and an intentionally limited self-service interface for regular users.
- Log out, switch accounts, and return to the login page from the navigation drawer or More Management.

Admin Key authentication does not carry a current-user identity. Personal key CRUD therefore requires an email-account login, or an administrator must open a specific user from User Management.

### Navigation, appearance, and accessibility

- Blue-and-white responsive card design optimized for narrow mobile screens.
- Collapsible left navigation: icon-only when collapsed and labeled when expanded.
- Scrollable menu items with fixed account and expand/collapse controls at the bottom.
- Long-press drag-and-drop menu ordering with live reflow, hidden-item controls, and persistent preferences.
- Choose a default start page; its menu item receives a `DEFAULT` tag and opens after the next application launch.
- Close the drawer to automatically leave menu customization mode.
- Light mode by default, optional dark mode, and persistent appearance preferences.
- Simplified Chinese by default with an English interface option.
- Open the currently connected server in the browser with the Website action.
- Consistent success, failure, copy, create, edit, enable, disable, and delete feedback.

### Dashboard and operations monitoring

- 24-hour, 7-day, and 30-day dashboard ranges.
- Users, API keys, upstream accounts, unhealthy accounts, tokens, cost, RPM, TPM, and request totals.
- Responsive metric cards that remain in two columns on compact content widths where appropriate.
- Request, throughput, token, cost, latency, and account-switching trend visualizations.
- Real-time operations overview with health state, alerts, service logs, request rate, active keys, account state, and recent trends.
- Dedicated error center and structured operations diagnostics.

### Account management

- Account creation flows aligned with the official Sub2API account types and fields.
- Search by account name or platform, filter by state, and sort request volume high-to-low or low-to-high.
- Green, yellow, and red state indicators for available, disabled, and unavailable accounts.
- Account detail pages for groups, priority, rate multiplier, concurrency limit, state, credentials, and maintenance actions.
- Quota cards shown as percentages, including 5-hour and 7-day windows when provided by the server.
- Query reset availability before attempting a quota reset.
- Model tests with explicit model selection and clearer invalid-response diagnostics.
- Optional scheduled account refresh with selectable intervals and a manual refresh action; controls are hidden by default until enabled.

### API keys, proxies, IP rules, users, and groups

- Display the OpenAI-compatible Base URL and the API keys created by the current user.
- View, reveal, copy, create, edit, enable, disable, and delete personal API keys.
- Confirmation before destructive key deletion and visible feedback for clipboard and state-changing actions.
- Display key status, group, limits, validity windows, and compatible endpoint information returned by the server.
- User and group CRUD, user key inspection, account grouping, and role-aware administration.
- Proxy CRUD with connectivity and quality-test actions available directly from the proxy list.
- IP allow-list and block-list management; IP Management is hidden from the default menu but remains available for administrators.

### Usage records

- Compact usage cards with configurable status fields.
- Request details include endpoint, client IP, group, user, key, upstream account, model, and response state when available.
- Token breakdown includes input, output, cached, and total tokens.
- Cost, latency, TTFT, service tier, billing mode, and timestamps are available in the detail view.
- English metric labels keep request cards concise even when the surrounding interface is Chinese.

### More administration

The More Management section consolidates the current server/session information, language, appearance, account switching, and advanced administration entry points. It intentionally does not add arbitrary server records; use logout and the remembered-account selector to switch deployments.

Advanced pages include redeem codes, subscriptions, channels, risk control, compliance, audit logs, announcements, promotion codes, prompt audits, backups, system maintenance, user attributes, traffic policies, scheduled tests, channel monitors, affiliates, the operations center, OAuth, the universal API console, GitHub settings, and build controls.

### API discovery and coverage

Two complementary mechanisms keep route information current:

1. **Runtime discovery.** The universal API console can fetch the latest administration-route metadata from [Wei-Shaw/sub2api](https://github.com/Wei-Shaw/sub2api), reuse the result for six hours, refresh it manually, and fall back to the metadata bundled with the APK.
2. **Repository automation.** `.github/workflows/sync-sub2api-api.yml` runs daily or manually, extracts upstream route and type metadata, regenerates the in-app API knowledge base and coverage report, and opens or updates a reviewable pull request when metadata changes.

Runtime discovery updates route metadata only. It cannot rewrite an installed APK or silently replace application source code. This repository does not synchronize source code from `ckken/sub2api-mobile` or any other mobile fork.

### AI assistant

AI provider configuration is integrated directly into the assistant:

- OpenAI Responses API-compatible Base URL and API key.
- Fetchable model list, per-conversation model selection, reasoning strength, and connection testing.
- Multiple persistent conversations, new conversation creation, history switching, and batch deletion.
- Context-aware follow-up messages and Markdown rendering.
- Edit an earlier message and remove subsequent messages so the conversation can restart from that point.
- Search the app's page, route, service, type, parameter, and generated Sub2API API knowledge to answer “where is this setting?” questions.
- Diagnose captured API errors and produce a controlled GitHub Draft PR proposal after explicit authorization.

The optional floating assistant can be enabled from the AI Assistant page. Long-press to move it, dock it partially at a screen edge, or use the small close control that hides after three seconds. The appearance can be changed; the default companion is the dog. Opening the floating assistant also supports new conversations and history switching.

### Controlled GitHub repair workflow

GitHub settings default to `trilogys/sub2api-mobile` but can be changed and saved. A fine-grained token should be restricted to the selected repository and only the required permissions:

- Contents: read and write
- Pull requests: read and write
- Actions: read and write, only when triggering native builds from the app

For a repair request, the app searches relevant `app/` and `src/` files, removes common secret patterns before sending context to the configured AI service, displays the proposed edits, and requires another confirmation before creating a branch, commit, and Draft PR. It limits automated changes to existing application source files and does not allow the AI flow to modify workflows, dependency manifests, generated files, or secret files.

AI-generated fixes are proposals, not verified releases. Review the diff and run CI before merging.

## Android APK builds

The Build Center defaults to **GitHub Native Build**. EAS Build remains available as an alternative.

### GitHub native build (default)

`.github/workflows/android-native-build.yml` runs Expo Prebuild and Gradle on a GitHub-hosted runner without entering the EAS queue and without requiring `EXPO_TOKEN`.

From GitHub:

1. Open **Actions**.
2. Select **Native Android APK**.
3. Select **Run workflow**.
4. Choose `release` for a standalone APK or `debug` for development diagnostics.
5. Download the APK from the run's **Artifacts** section after the workflow completes.

From the app, configure a GitHub token with Actions permission, choose the repository and branch, and start the workflow. The Build Center uses the GitHub Jobs API to display:

- Setup Node.js
- Install dependencies
- Expo Prebuild
- Setup Gradle
- Build APK with Gradle
- Upload APK
- Waiting, running, successful, or failed state for every step
- Approximate progress calculated from completed steps
- APK artifact availability, size, expiration, and download entry point

The target repository can be changed in the app; `trilogys/sub2api-mobile` is the default.

### EAS preview APK

The `preview` profile in `eas.json` uses internal distribution and `android.buildType: apk`.

```powershell
cd D:\Project\node\sub2api-mobile
npm ci
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

The first build is best completed on a computer so the Expo project and Android signing credentials can be confirmed. After the initial setup, the app can securely store an Expo access token, start an EAS workflow from a phone, poll its status, and open the resulting download page. The Android build itself always runs in the EAS cloud.

To start EAS through GitHub Actions, add `EXPO_TOKEN` under **Settings → Secrets and variables → Actions**, then run `.github/workflows/eas-build.yml`. The native GitHub workflow does not use this secret.

See [docs/EXPO_RELEASE.md](docs/EXPO_RELEASE.md) for the detailed release guide.

## Local development

Requirements:

- Node.js 20 or newer
- npm 10 or newer
- Android Studio and an Android SDK for emulator or native debugging

Install and start Expo:

```bash
npm ci
npm run start
```

Common targets:

```bash
npm run android
npm run ios
npm run web
```

Useful validation commands:

```bash
npx tsc --noEmit
npm run audit:api-coverage
npx expo config --type public
npx expo export --platform android
```

## API metadata maintenance

```bash
# Regenerate the in-app page/API search knowledge base
npm run generate:api-knowledge

# Extract route, parameter, and type metadata from a checked-out Sub2API server
npm run extract:upstream-api -- /path/to/sub2api

# Verify that every discovered route has a dedicated wrapper or console access
npm run audit:api-coverage
```

## Project structure

```text
app/                    Expo Router screens
src/components/         Shared UI, navigation, charts, and AI assistant
src/screens/            Reusable mobile administration screens
src/services/           Sub2API, AI, GitHub, and EAS service clients
src/generated/          Routes, upstream metadata, UI copy, knowledge, and coverage
src/store/              Persisted application and session preferences
src/lib/                Request, authentication, and utility modules
.github/scripts/        API extraction, generation, and coverage tools
.github/workflows/      Native/EAS builds and API metadata synchronization
.eas/workflows/         EAS workflows that can be triggered from the app
docs/                   Release documentation and screenshots
server/                 Local Express proxy used for web development
```

## Security

- Android and iOS secrets use the operating system SecureStore.
- The web build does not persist Admin Keys, AI keys, Expo tokens, or GitHub tokens.
- Tokens are not written into generated route metadata, logs, or the local AI knowledge base.
- Write operations, builds, and GitHub PR creation require explicit user actions.
- Use separate, revocable, least-privilege tokens for AI, Expo, and GitHub.
- Report vulnerabilities according to [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before opening a change. Please keep PR descriptions and review context clear, identify upstream-derived work, and preserve applicable copyright notices.

## License and attribution

This repository is distributed under the [Apache License 2.0](LICENSE). Work derived from [ckken/sub2api-mobile](https://github.com/ckken/sub2api-mobile) remains subject to its preserved [MIT License and copyright notice](LICENSES/MIT-ckken.txt). See [NOTICE.md](NOTICE.md) for the explicit attribution statement. License notices must be retained when redistributing the applicable work.
