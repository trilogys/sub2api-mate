import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { ListCard } from '@/src/components/list-card';
import { PaginationControls } from '@/src/components/pagination-controls';
import { ScreenShell } from '@/src/components/screen-shell';
import { createAnnouncement, deleteAnnouncement, listAnnouncements, updateAnnouncement } from '@/src/services/admin';
import type { AnnouncementStatus } from '@/src/types/admin';
import { Text, localizedAlert } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

export default function AnnouncementsScreen() {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<AnnouncementStatus>('active');
  const query = useQuery({ queryKey: ['announcements', page], queryFn: () => listAnnouncements('', page) });
  const refresh = async () => { await client.invalidateQueries({ queryKey: ['announcements'] }); };
  const create = useMutation({
    mutationFn: () => createAnnouncement({ title: title.trim(), content: content.trim(), status, notify_mode: 'popup', targeting: {} }),
    onSuccess: async () => { setTitle(''); setContent(''); await refresh(); },
  });
  const update = useMutation({ mutationFn: ({ id, next }: { id: number; next: AnnouncementStatus }) => updateAnnouncement(id, { status: next }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: deleteAnnouncement, onSuccess: refresh });

  return (
    <>
      <LocalizedStackScreen options={{ title: '公告管理', headerShown: true }} />
      <ScreenShell title="公告管理" subtitle={`${query.data?.total ?? 0} 条公告`} safeAreaEdges={['bottom']} bottomInsetClassName="pb-8" refreshing={query.isRefetching} onRefresh={() => query.refetch().then(() => undefined)}>
        <AdminSection title="发布公告" detail="默认面向全部用户，创建后仍可切换草稿、发布和归档状态。">
          <AdminField label="标题" value={title} onChangeText={setTitle} placeholder="公告标题" />
          <AdminField label="内容" value={content} onChangeText={setContent} placeholder="公告正文" multiline numberOfLines={4} textAlignVertical="top" />
          <View className="flex-row gap-2">{(['draft', 'active', 'archived'] as const).map((item) => <AdminChip key={item} label={{ draft: '草稿', active: '发布', archived: '归档' }[item]} selected={status === item} onPress={() => setStatus(item)} />)}</View>
          <AdminMessage error={create.error} success={create.isSuccess ? '公告已创建' : undefined} />
          <AdminButton label="创建公告" pending={create.isPending} disabled={!title.trim() || !content.trim()} onPress={() => create.mutate()} />
        </AdminSection>

        {query.data?.items.map((item) => (
          <ListCard key={item.id} title={item.title} meta={item.content} badge={item.status} badgeTone={item.status === 'active' ? 'success' : 'muted'}>
            <View className="mt-2 flex-row flex-wrap gap-2">
              <Pressable onPress={() => update.mutate({ id: item.id, next: item.status === 'active' ? 'archived' : 'active' })} className="rounded-xl bg-[#E2E9F3] dark:bg-[#273449] px-3 py-2"><Text className="text-xs font-bold text-[#344054] dark:text-[#D5DDEA]">{item.status === 'active' ? '归档' : '发布'}</Text></Pressable>
              <Pressable onPress={() => localizedAlert('删除公告', `确定删除“${item.title}”吗？`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => remove.mutate(item.id) }])} className="rounded-xl bg-[#FFF0F2] dark:bg-[#3A1720] px-3 py-2"><Text className="text-xs font-bold text-[#D9475C]">删除</Text></Pressable>
            </View>
          </ListCard>
        ))}
        {!query.isLoading && !query.data?.items.length ? <EmptyState /> : null}
        <AdminMessage error={query.error || update.error || remove.error} />
        <PaginationControls page={page} pages={query.data?.pages ?? 1} total={query.data?.total} onChange={setPage} />
      </ScreenShell>
    </>
  );
}
