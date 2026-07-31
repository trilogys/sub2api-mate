import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FolderKanban, Layers3, Search } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import { ListCard } from '@/src/components/list-card';
import { PaginationControls } from '@/src/components/pagination-controls';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { listGroups } from '@/src/services/admin';
import { Text, TextInput } from '@/src/components/localized-text';

export default function GroupsScreen() {
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const keyword = useDebouncedValue(searchText.trim(), 300);

  const groupsQuery = useQuery({
    queryKey: ['groups', keyword, page],
    queryFn: () => listGroups(keyword, page),
  });

  const items = groupsQuery.data?.items ?? [];
  const errorMessage = groupsQuery.error instanceof Error ? groupsQuery.error.message : '';
  const listHeader = useMemo(
    () => (
      <View className="pb-4">
        <View className="flex-row items-center rounded-[24px] bg-[#FFFFFF] dark:bg-[#111827] px-4 py-3">
          <Search color="#6B778C" size={18} />
          <TextInput
            defaultValue=""
            onChangeText={(value) => { setSearchText(value); setPage(1); }}
            placeholder="搜索分组名称"
            placeholderTextColor="#98A2B3"
            className="ml-3 flex-1 text-base text-[#172033] dark:text-[#F4F7FB]"
          />
        </View>
      </View>
    ),
    []
  );
  const renderItem = useCallback(
    ({ item: group }: { item: (typeof items)[number] }) => (
      <Pressable onPress={() => router.push(`/groups/${group.id}`)}>
        <ListCard
        title={group.name}
        meta={`${group.platform} · 倍率 ${group.rate_multiplier ?? 1} · ${group.subscription_type || 'standard'}`}
        badge={group.status || 'active'}
        icon={FolderKanban}
      >
        <View className="flex-row items-center gap-2">
          <Layers3 color="#6B778C" size={14} />
          <Text className="text-sm text-[#6B778C] dark:text-[#9EABC0]">
            账号数 {group.account_count ?? 0} · {group.is_exclusive ? '独占分组' : '共享分组'}
          </Text>
        </View>
        </ListCard>
      </Pressable>
    ),
    []
  );
  const emptyState = useMemo(
    () => <ListCard title="暂无分组" meta={errorMessage || '连上 Sub2API 后，这里会展示分组列表。'} icon={FolderKanban} />,
    [errorMessage]
  );

  return (
    <ScreenShell
      title="分组管理"
      subtitle=""
      titleAside={(
        <Pressable onPress={() => router.push('/groups/create')} className="rounded-full bg-[#2F6DF6] px-4 py-2">
          <Text className="text-xs font-semibold text-white">新增分组</Text>
        </Pressable>
      )}
      variant="minimal"
      scroll={false}
    >
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.id}`}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={groupsQuery.isRefetching} onRefresh={() => void groupsQuery.refetch()} tintColor="#2F6DF6" />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyState}
        ListFooterComponent={<View className="pt-4"><PaginationControls page={page} pages={groupsQuery.data?.pages ?? 1} total={groupsQuery.data?.total} onChange={setPage} /></View>}
        ItemSeparatorComponent={() => <View className="h-4" />}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
      />
    </ScreenShell>
  );
}
