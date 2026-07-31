import { Redirect } from 'expo-router';

import { adminConfigState, hasAuthenticatedAdminSession } from '@/src/store/admin-config';

const { useSnapshot } = require('valtio/react');

export default function IndexScreen() {
  const config = useSnapshot(adminConfigState);
  const hasAccount = hasAuthenticatedAdminSession(config);

  return <Redirect href={hasAccount ? '/monitor' : '/login'} />;
}
