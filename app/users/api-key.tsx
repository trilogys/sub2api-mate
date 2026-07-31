import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listAllGroups, listUserApiKeys, updateApiKeyGroup } from '@/src/services/admin';
import { Text } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

const colors = {
  page: '#F4F7FC',
  card: '#FFFFFF',
  muted: '#F1F5FA',
  border: '#E2E9F3',
  primary: '#2F6DF6',
  text: '#172033',
  subtext: '#667085',
  danger: '#D9475C',
};

export default function ApiKeyGroupScreen() {
  const params = useLocalSearchParams<{ id: string; userId: string }>();
  const apiKeyId = Number(params.id);
  const userId = Number(params.userId);
  const queryClient = useQueryClient();
  const [groupId, setGroupId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const keysQuery = useQuery({
    queryKey: ['user-api-keys', userId],
    queryFn: () => listUserApiKeys(userId),
    enabled: Number.isFinite(userId),
  });
  const groupsQuery = useQuery({ queryKey: ['groups', 'all'], queryFn: listAllGroups });
  const apiKey = keysQuery.data?.items.find((item) => item.id === apiKeyId);

  useEffect(() => {
    if (apiKey) setGroupId(apiKey.group_id ?? null);
  }, [apiKey]);

  const saveMutation = useMutation({
    mutationFn: () => updateApiKeyGroup(apiKeyId, groupId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['user-api-keys', userId] });
      router.replace(`/users/${userId}`);
    },
    onError: (value) => setError(value instanceof Error ? value.message : '修改 API Key 分组失败'),
  });

  return (
    <>
      <LocalizedStackScreen options={{ title: 'API Key 分组', headerShown: true }} />
      <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.page }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{apiKey?.name || `Key #${apiKeyId}`}</Text>
            <Text numberOfLines={1} style={{ marginTop: 5, fontSize: 12, color: colors.subtext }}>{apiKey?.key || '正在加载…'}</Text>
            <Text style={{ marginTop: 18, marginBottom: 8, fontSize: 12, color: colors.subtext }}>所属分组</Text>
            <View style={{ gap: 8 }}>
              <Pressable onPress={() => setGroupId(null)} style={{ borderRadius: 12, borderWidth: 1, borderColor: groupId === null ? colors.primary : colors.border, backgroundColor: groupId === null ? colors.primary : colors.muted, padding: 12 }}>
                <Text style={{ color: groupId === null ? '#fff' : colors.text, fontWeight: '700' }}>不绑定分组</Text>
              </Pressable>
              {(groupsQuery.data ?? []).map((group) => {
                const active = group.id === groupId;
                return (
                  <Pressable key={group.id} onPress={() => setGroupId(group.id)} style={{ borderRadius: 12, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.muted, padding: 12 }}>
                    <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '700' }}>{group.name}</Text>
                    <Text style={{ marginTop: 3, color: active ? '#e7f4ef' : colors.subtext, fontSize: 11 }}>{group.platform} · {group.status || 'active'}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {error || keysQuery.error || groupsQuery.error ? (
            <View style={{ marginTop: 12, borderRadius: 12, backgroundColor: '#FFF0F2', padding: 12 }}>
              <Text style={{ color: colors.danger }}>{error || (keysQuery.error as Error)?.message || (groupsQuery.error as Error)?.message}</Text>
            </View>
          ) : null}

          <Pressable disabled={!apiKey || saveMutation.isPending} onPress={() => { setError(''); saveMutation.mutate(); }} style={{ marginTop: 14, borderRadius: 12, backgroundColor: !apiKey || saveMutation.isPending ? '#7C8AA0' : colors.primary, paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{saveMutation.isPending ? '保存中…' : '保存分组'}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
