import { useLocalSearchParams } from 'expo-router';

import { GroupFormScreen } from '@/src/screens/group-form-screen';

export default function EditGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupFormScreen groupId={Number(id)} />;
}
