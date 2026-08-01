import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { ListCard } from '@/src/components/list-card';
import { ScreenShell } from '@/src/components/screen-shell';
import { createUserAttribute, deleteUserAttribute, listUserAttributes, reorderUserAttributes, updateUserAttribute } from '@/src/services/admin';
import { Text, localizedAlert } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

export default function UserAttributesScreen() {
  const client = useQueryClient();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('text');
  const query = useQuery({ queryKey: ['user-attributes'], queryFn: listUserAttributes });
  const refresh = async () => { await client.invalidateQueries({ queryKey: ['user-attributes'] }); };
  const create = useMutation({ mutationFn: () => createUserAttribute({ key: key.trim(), name: name.trim(), type, enabled: true, display_order: (query.data?.length ?? 0) + 1 }), onSuccess: async () => { setKey(''); setName(''); await refresh(); } });
  const toggle = useMutation({ mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => updateUserAttribute(id, { enabled }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: deleteUserAttribute, onSuccess: refresh });
  const reorder = useMutation({ mutationFn: reorderUserAttributes, onSuccess: refresh });
  const move = (index: number, direction: -1 | 1) => {
    const items = [...(query.data ?? [])];
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    reorder.mutate(items.map((item) => item.id));
  };

  return (
    <>
      <LocalizedStackScreen options={{ title: '用户属性', headerShown: true }} />
      <ScreenShell title="用户属性" subtitle={`${query.data?.length ?? 0} 个自定义字段`} safeAreaEdges={['bottom']} bottomInsetClassName="pb-8" refreshing={query.isRefetching} onRefresh={() => query.refetch().then(() => undefined)}>
        <AdminSection title="新建属性" detail="属性键创建后应保持稳定；字段会出现在用户资料和管理表单中。">
          <AdminField label="属性键" value={key} onChangeText={setKey} placeholder="company_name" autoCapitalize="none" />
          <AdminField label="显示名称" value={name} onChangeText={setName} placeholder="公司名称" />
          <View className="flex-row flex-wrap gap-2">{['text', 'number', 'select', 'boolean'].map((item) => <AdminChip key={item} label={item} selected={type === item} onPress={() => setType(item)} />)}</View>
          <AdminMessage error={create.error} success={create.isSuccess ? '属性已创建' : undefined} />
          <AdminButton label="创建属性" pending={create.isPending} disabled={!key.trim() || !name.trim()} onPress={() => create.mutate()} />
        </AdminSection>

        {query.data?.map((item, index) => (
          <ListCard key={item.id} title={item.name} meta={`${item.key} · ${item.type}${item.required ? ' · 必填' : ''}`} badge={item.enabled ? '启用' : '停用'} badgeTone={item.enabled ? 'success' : 'muted'}>
            <View className="mt-2 flex-row flex-wrap gap-3">
              <Pressable onPress={() => toggle.mutate({ id: item.id, enabled: !item.enabled })}><Text className="text-xs font-bold text-[#2F6DF6]">{item.enabled ? '停用' : '启用'}</Text></Pressable>
              <Pressable disabled={index === 0} onPress={() => move(index, -1)}><Text className={`text-xs font-bold ${index === 0 ? 'text-[#bcb4a7]' : 'text-[#344054] dark:text-[#D5DDEA]'}`}>上移</Text></Pressable>
              <Pressable disabled={index === (query.data?.length ?? 0) - 1} onPress={() => move(index, 1)}><Text className={`text-xs font-bold ${index === (query.data?.length ?? 0) - 1 ? 'text-[#bcb4a7]' : 'text-[#344054] dark:text-[#D5DDEA]'}`}>下移</Text></Pressable>
              <Pressable onPress={() => localizedAlert('删除属性', `确定删除“${item.name}”及其用户值吗？`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => remove.mutate(item.id) }])}><Text className="text-xs font-bold text-[#D9475C]">删除</Text></Pressable>
            </View>
          </ListCard>
        ))}
        {!query.isLoading && !query.data?.length ? <EmptyState /> : null}
        <AdminMessage error={query.error || toggle.error || remove.error || reorder.error} />
      </ScreenShell>
    </>
  );
}
