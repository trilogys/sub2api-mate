import UsersScreen from '../(tabs)/users';

import { LocalizedStackScreen } from '@/src/components/localized-navigation';

export default function UserOverviewListScreen() {
  return (
    <>
      <LocalizedStackScreen options={{ title: '用户管理', headerShown: true }} />
      <UsersScreen safeAreaEdges={['bottom']} />
    </>
  );
}
