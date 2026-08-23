# CLIProxy Group Router

`CLIProxy Group Router` is an independent CLIProxyAPI scheduler plugin used by Sub2API Mate. It adds a real single-instance grouping boundary:

```text
Client API Key -> CLIProxy Group -> allowed auth IDs -> group-local scheduler
```

The plugin reads CLIProxyAPI's irreversible `caller_scope` from scheduler metadata. It never selects a credential outside the matched group. Unknown keys, disabled groups, and groups without an available credential are rejected instead of falling back to the global pool.

## Configuration

The Mate group screen writes the following object to `plugins.configs.cliproxy-group-router` and keeps every group key in CLIProxyAPI's top-level `api-keys` list:

```yaml
plugins:
  enabled: true
  dir: "/CLIProxyAPI/plugins"
  configs:
    cliproxy-group-router:
      enabled: true
      deny_unmapped: true
      allow_shared_auths: false
      groups:
        - id: team-a
          name: Team A
          enabled: true
          strategy: round-robin
          api_keys:
            - cpa-team-a-secret
          auth_ids:
            - codex-user-a.json
            - codex-user-b.json
```

For strict isolation, `allow_shared_auths` stays `false`. A credential then belongs to exactly one group.

## Build

Linux (recommended for the official Docker deployment):

```bash
docker build --output type=local,dest=./dist integrations/cliproxy-group-router
```

Copy `dist/cliproxy-group-router.so` into the configured CLIProxyAPI plugin directory, enable `plugins.enabled`, restart CLIProxyAPI once, then manage groups from Mate.

The repository workflow also builds and uploads a Linux AMD64 artifact.

## Compatibility contract

- CLIProxy native ABI version: `1`
- CLIProxy RPC schema version: `3`
- Scheduler metadata: `caller_scope`
- Credential selection: scheduler candidates by `auth_id`

Tests cover key scoping, round-robin and fill-first behavior, cross-group fallback prevention, duplicate assignment rejection, disabled groups, YAML reconfiguration, RPC registration, caller-scope adaptation, and 403 responses for unknown groups.
