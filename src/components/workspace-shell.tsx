import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';

import { AppSidebar } from '@/src/components/app-sidebar';
import { CLIProxySidebar } from '@/src/components/cliproxy-sidebar';
import { adminConfigState, hasAuthenticatedAdminSession } from '@/src/store/admin-config';
import { cliProxyConfigState } from '@/src/store/cliproxy-config';
import { workspaceModeState } from '@/src/store/workspace-mode';

const { useSnapshot } = require('valtio/react');

const cliProxyRoutes = new Set([
  '/cliproxy',
  '/cliproxy-groups',
  '/cliproxy-auth-files',
  '/cliproxy-observability',
  '/cliproxy-system',
  '/about',
]);

export function WorkspaceSidebar() {
  const workspace = useSnapshot(workspaceModeState);
  return workspace.mode === 'cliproxy' ? <CLIProxySidebar /> : <AppSidebar />;
}

export function WorkspaceRouteGuard() {
  const path = usePathname();
  const workspace = useSnapshot(workspaceModeState);
  const cliProxy = useSnapshot(cliProxyConfigState);
  useSnapshot(adminConfigState);

  useEffect(() => {
    if (!workspace.hydrated || !cliProxy.hydrated || path === '/login') return;
    if (workspace.mode === 'cliproxy') {
      const configured = Boolean(cliProxy.baseUrl && cliProxy.managementKey);
      if (!configured) {
        router.replace('/login');
        return;
      }
      if (!cliProxyRoutes.has(path)) router.replace('/cliproxy');
      return;
    }
    if (path.startsWith('/cliproxy')) {
      if (!hasAuthenticatedAdminSession(adminConfigState)) {
        router.replace('/login');
        return;
      }
      router.replace(adminConfigState.user?.role === 'user' ? '/api-keys' : '/monitor');
    }
  }, [cliProxy.baseUrl, cliProxy.hydrated, cliProxy.managementKey, path, workspace.hydrated, workspace.mode]);

  return null;
}
