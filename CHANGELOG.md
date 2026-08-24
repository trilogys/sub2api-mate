# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.7.1] - 2026-08-24

### Added

- CLIProxy workspace navigation now mirrors the official management-center sections with dedicated Quick Start, AI Providers, OAuth Login, Quota Management, Plugin Management, Plugin Store, and Hub Information pages.

### Fixed

- CLIProxy live quota values now normalize both fractional and percentage upstream formats and use visible red/orange/yellow/green thresholds instead of treating most non-exhausted quotas as green.

## [1.7.0] - 2026-08-24

### Added

- Top-level Sub2API / CLIProxyAPI workspace switcher with independent connection forms, navigation, route guards, and persisted active workspace.
- CLIProxy credential-file management: multi-file JSON import, sensitive export/share, metadata editing, per-credential model inspection, and guarded deletion.
- CLIProxy system management for runtime flags, retries, proxy, logging, quota failover, global routing, complete validated `config.yaml`, update checks, and trusted plugin-store installs.
- CLIProxy observability page with filtered/auto-refreshed logs, error-log export, log clearing, and non-destructive per-provider API-key usage statistics.

## [1.6.0] - 2026-08-24

### Added

- Open-source baseline documentation:
  - `README.md` expanded for setup, architecture, release, and security notes
  - `LICENSE` (MIT)
  - `CONTRIBUTING.md`
  - `CODE_OF_CONDUCT.md`
  - `SECURITY.md`
  - `CHANGELOG.md`
- New admin creation flows:
  - `app/users/create-user.tsx` for creating users via `/api/v1/admin/users`
  - `app/accounts/create.tsx` for creating accounts via `/api/v1/admin/accounts`
- New users tab quick action to open the create-user screen.
- Independent CLIProxyAPI management with secure connection settings, OAuth account-pool controls, live quota refresh, and a native single-instance Group Router plugin enforcing client-key-to-credential-pool isolation without coupling to Sub2API groups.

### Changed

- Repository naming aligned to `sub2api-mobile` in public docs.
- Request URL composition in `src/lib/admin-fetch.ts` now handles duplicated `/api`/`/api/v1` prefixes safely.
- Better admin request error handling for invalid server responses.
- Server settings screen removed the "current compatible sub2api version" display block.
