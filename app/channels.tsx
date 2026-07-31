import { useQuery } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { Plus, Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ListCard } from '@/src/components/list-card';
import { PaginationControls } from '@/src/components/pagination-controls';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { listChannels } from '@/src/services/admin';
import { Text, TextInput } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

export default function ChannelsScreen() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search, 250);
  useEffect(() => setPage(1), [debounced]);
  const channelsQuery = useQuery({ queryKey: ['channels', debounced, page], queryFn: () => listChannels(debounced, page) });
  return (
    <>
      <LocalizedStackScreen options={{ title: '渠道管理', headerShown: true }} />
      <ScreenShell title="渠道管理" subtitle={`${channelsQuery.data?.total ?? 0} 个渠道`} bottomInsetClassName="pb-8" safeAreaEdges={['bottom']} refreshing={channelsQuery.isRefetching} onRefresh={() => channelsQuery.refetch().then(() => undefined)} right={<Pressable onPress={() => router.push('/channel')} className="h-10 w-10 items-center justify-center rounded-full bg-[#2F6DF6]"><Plus size={21} color="#fff" /></Pressable>}>
        <View className="flex-row items-center gap-2 rounded-2xl bg-[#FFFFFF] dark:bg-[#111827] px-4 py-3"><Search size={17} color="#6B778C" /><TextInput value={search} onChangeText={setSearch} placeholder="搜索渠道" placeholderTextColor="#98A2B3" className="flex-1 text-sm text-[#172033] dark:text-[#F4F7FB]" /></View>
        {channelsQuery.data?.items.map((item) => (
          <Pressable key={item.id} onPress={() => router.push({ pathname: '/channel', params: { id: String(item.id) } })}>
            <ListCard title={item.name} meta={item.description || `${item.group_ids.length} 个分组`} badge={item.status} badgeTone={item.status === 'active' ? 'success' : 'muted'}>
              <Text className="text-xs text-[#6B778C] dark:text-[#9EABC0]">计费模型：{item.billing_model_source} · {item.restrict_models ? '限制模型' : '全部模型'}</Text>
            </ListCard>
          </Pressable>
        ))}
        {channelsQuery.isError ? <Text className="text-sm text-[#D9475C]">{(channelsQuery.error as Error).message}</Text> : null}
        <PaginationControls page={page} pages={channelsQuery.data?.pages ?? 1} total={channelsQuery.data?.total} onChange={setPage} />
      </ScreenShell>
    </>
  );
}
