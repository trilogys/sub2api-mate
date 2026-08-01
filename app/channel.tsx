import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createChannel, deleteChannel, getChannel, listAllGroups, updateChannel } from '@/src/services/admin';
import { Text, TextInput, localizedAlert } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

const fieldClass = 'rounded-2xl bg-[#F1F5FA] dark:bg-[#182235] px-4 py-3.5 text-sm text-[#172033] dark:text-[#F4F7FB]';
const sources = ['requested', 'upstream', 'channel_mapped'] as const;

export default function ChannelFormScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Number(params.id);
  const editing = Number.isFinite(id) && id > 0;
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'active' | 'disabled'>('active');
  const [source, setSource] = useState<(typeof sources)[number]>('requested');
  const [restrictModels, setRestrictModels] = useState(false);
  const [groupIds, setGroupIds] = useState<number[]>([]);
  const channelQuery = useQuery({ queryKey: ['channel', id], queryFn: () => getChannel(id), enabled: editing });
  const groupsQuery = useQuery({ queryKey: ['groups', 'all'], queryFn: listAllGroups });

  useEffect(() => {
    if (!channelQuery.data) return;
    setName(channelQuery.data.name);
    setDescription(channelQuery.data.description || '');
    setStatus(channelQuery.data.status);
    setSource(channelQuery.data.billing_model_source);
    setRestrictModels(channelQuery.data.restrict_models);
    setGroupIds(channelQuery.data.group_ids || []);
  }, [channelQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim(), group_ids: groupIds, billing_model_source: source, restrict_models: restrictModels };
      return editing ? updateChannel(id, { ...body, status }) : createChannel(body);
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['channels'] }); router.back(); },
  });
  const deleteMutation = useMutation({ mutationFn: () => deleteChannel(id), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['channels'] }); router.back(); } });
  const toggleGroup = (groupId: number) => setGroupIds((current) => current.includes(groupId) ? current.filter((item) => item !== groupId) : [...current, groupId]);
  const error = (saveMutation.error || deleteMutation.error) as Error | null;

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-[#F4F7FC] dark:bg-[#0B1220]">
      <LocalizedStackScreen options={{ title: editing ? '编辑渠道' : '新增渠道', headerShown: true }} />
      <ScrollView contentContainerClassName="gap-4 px-5 pb-10 pt-4" keyboardShouldPersistTaps="handled">
        <View className="gap-3 rounded-[20px] border border-[#E2E9F3] dark:border-[#273449] bg-[#FFFFFF] dark:bg-[#111827] p-4">
          <Text className="text-lg font-bold text-[#172033] dark:text-[#F4F7FB]">渠道信息</Text>
          <TextInput value={name} onChangeText={setName} placeholder="渠道名称" placeholderTextColor="#98A2B3" className={fieldClass} />
          <TextInput value={description} onChangeText={setDescription} placeholder="说明" placeholderTextColor="#98A2B3" multiline className={`${fieldClass} min-h-20`} />
          <Text className="text-xs font-bold text-[#475467] dark:text-[#C2CCDB]">计费模型来源</Text>
          <View className="flex-row flex-wrap gap-2">{sources.map((item) => <Pressable key={item} onPress={() => setSource(item)} className={`rounded-full px-3 py-2 ${source === item ? 'bg-[#2F6DF6]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}><Text className={`text-xs ${source === item ? 'text-white' : 'text-[#475467] dark:text-[#C2CCDB]'}`}>{item}</Text></Pressable>)}</View>
          <Pressable onPress={() => setRestrictModels((v) => !v)} className={`rounded-xl px-3 py-3 ${restrictModels ? 'bg-[#EAF2FF] dark:bg-[#172C55]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}><Text className={`text-xs font-bold ${restrictModels ? 'text-[#2F6DF6]' : 'text-[#475467] dark:text-[#C2CCDB]'}`}>{restrictModels ? '✓ 仅允许已配置模型' : '允许全部模型'}</Text></Pressable>
          {editing ? <View className="flex-row gap-2">{(['active', 'disabled'] as const).map((item) => <Pressable key={item} onPress={() => setStatus(item)} className={`flex-1 rounded-xl py-3 ${status === item ? 'bg-[#2F6DF6]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}><Text className={`text-center text-xs font-bold ${status === item ? 'text-white' : 'text-[#475467] dark:text-[#C2CCDB]'}`}>{item === 'active' ? '启用' : '停用'}</Text></Pressable>)}</View> : null}
        </View>
        <View className="gap-3 rounded-[20px] border border-[#E2E9F3] dark:border-[#273449] bg-[#FFFFFF] dark:bg-[#111827] p-4"><Text className="text-lg font-bold text-[#172033] dark:text-[#F4F7FB]">绑定分组</Text><View className="flex-row flex-wrap gap-2">{groupsQuery.data?.map((group) => <Pressable key={group.id} onPress={() => toggleGroup(group.id)} className={`rounded-full px-3 py-2 ${groupIds.includes(group.id) ? 'bg-[#2F6DF6]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}><Text className={`text-xs ${groupIds.includes(group.id) ? 'text-white' : 'text-[#475467] dark:text-[#C2CCDB]'}`}>{group.name}</Text></Pressable>)}</View></View>
        {error ? <Text className="text-sm text-[#D9475C]">{error.message}</Text> : null}
        <Pressable disabled={!name.trim() || saveMutation.isPending} onPress={() => saveMutation.mutate()} className="rounded-2xl bg-[#2F6DF6] py-4 disabled:opacity-50"><Text className="text-center text-sm font-bold text-white">保存渠道</Text></Pressable>
        {editing ? <Pressable onPress={() => localizedAlert('删除渠道', '确认删除该渠道？', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => deleteMutation.mutate() }])} className="rounded-2xl bg-[#FFF0F2] dark:bg-[#3A1720] py-4"><Text className="text-center text-sm font-bold text-[#D9475C]">删除渠道</Text></Pressable> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
