import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { ListCard } from '@/src/components/list-card';
import { PaginationControls } from '@/src/components/pagination-controls';
import { ScreenShell } from '@/src/components/screen-shell';
import { assignSubscription, extendSubscription, listAllGroups, listSubscriptions, resetSubscriptionQuota, restoreSubscription, revokeSubscription } from '@/src/services/admin';
import { Text, TextInput, localizedAlert } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

const statuses = ['all', 'active', 'expired', 'revoked', 'suspended'] as const;
const fieldClass = 'rounded-2xl bg-[#F1F5FA] dark:bg-[#182235] px-4 py-3 text-sm text-[#172033] dark:text-[#F4F7FB]';

export default function SubscriptionsScreen() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<(typeof statuses)[number]>('all');
  const [page, setPage] = useState(1);
  const [showAssign, setShowAssign] = useState(false);
  const [userId, setUserId] = useState('');
  const [groupId, setGroupId] = useState<number | null>(null);
  const [days, setDays] = useState('30');
  const subscriptionsQuery = useQuery({ queryKey: ['subscriptions', status, page], queryFn: () => listSubscriptions(status === 'all' ? undefined : status, page) });
  const groupsQuery = useQuery({ queryKey: ['groups', 'all'], queryFn: listAllGroups });

  const assignMutation = useMutation({
    mutationFn: () => assignSubscription({ user_id: Number(userId), group_id: groupId!, validity_days: Number(days) || undefined }),
    onSuccess: async () => {
      setShowAssign(false);
      setUserId('');
      await queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });
  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: 'extend' | 'reset' | 'revoke' | 'restore' }) => {
      if (action === 'extend') await extendSubscription(id, 30);
      else if (action === 'reset') await resetSubscriptionQuota(id);
      else if (action === 'restore') await restoreSubscription(id);
      else await revokeSubscription(id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subscriptions'] }),
  });

  return (
    <>
      <LocalizedStackScreen options={{ title: '订阅管理', headerShown: true }} />
      <ScreenShell title="订阅管理" subtitle={`${subscriptionsQuery.data?.total ?? 0} 条订阅`} bottomInsetClassName="pb-8" safeAreaEdges={['bottom']} refreshing={subscriptionsQuery.isRefetching} onRefresh={() => subscriptionsQuery.refetch().then(() => undefined)} right={<Pressable onPress={() => setShowAssign((v) => !v)} className="h-10 w-10 items-center justify-center rounded-full bg-[#2F6DF6]"><Plus size={21} color="#fff" /></Pressable>}>
        <View className="flex-row flex-wrap gap-2">
          {statuses.map((item) => <Pressable key={item} onPress={() => { setStatus(item); setPage(1); }} className={`rounded-full px-3 py-2 ${status === item ? 'bg-[#2F6DF6]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}><Text className={`text-xs font-bold ${status === item ? 'text-white' : 'text-[#475467] dark:text-[#C2CCDB]'}`}>{item === 'all' ? '全部' : item}</Text></Pressable>)}
        </View>
        {showAssign ? (
          <View className="gap-3 rounded-[20px] border border-[#E2E9F3] dark:border-[#273449] bg-[#FFFFFF] dark:bg-[#111827] p-4">
            <Text className="text-lg font-bold text-[#172033] dark:text-[#F4F7FB]">分配订阅</Text>
            <View className="flex-row gap-3">
              <TextInput value={userId} onChangeText={setUserId} placeholder="用户 ID" placeholderTextColor="#98A2B3" keyboardType="number-pad" className={`${fieldClass} flex-1`} />
              <TextInput value={days} onChangeText={setDays} placeholder="有效天数" placeholderTextColor="#98A2B3" keyboardType="number-pad" className={`${fieldClass} flex-1`} />
            </View>
            <View className="flex-row flex-wrap gap-2">{groupsQuery.data?.filter((g) => g.subscription_type === 'subscription').map((group) => <Pressable key={group.id} onPress={() => setGroupId(group.id)} className={`rounded-full px-3 py-2 ${groupId === group.id ? 'bg-[#2F6DF6]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}><Text className={`text-xs ${groupId === group.id ? 'text-white' : 'text-[#475467] dark:text-[#C2CCDB]'}`}>{group.name}</Text></Pressable>)}</View>
            {assignMutation.error ? <Text className="text-xs text-[#D9475C]">{(assignMutation.error as Error).message}</Text> : null}
            <Pressable disabled={!Number(userId) || !groupId || assignMutation.isPending} onPress={() => assignMutation.mutate()} className="rounded-2xl bg-[#2F6DF6] py-3.5 disabled:opacity-50"><Text className="text-center text-sm font-bold text-white">确认分配</Text></Pressable>
          </View>
        ) : null}
        {subscriptionsQuery.data?.items.map((item) => (
          <ListCard key={item.id} title={item.user?.email || `用户 #${item.user_id}`} meta={`${item.group?.name || `分组 #${item.group_id}`} · ${item.expires_at ? new Date(item.expires_at).toLocaleDateString() + ' 到期' : '永久'}`} badge={item.status} badgeTone={item.status === 'active' ? 'success' : item.status === 'revoked' ? 'danger' : 'muted'}>
            <Text className="text-xs text-[#6B778C] dark:text-[#9EABC0]">日 ${item.daily_usage_usd.toFixed(2)} · 周 ${item.weekly_usage_usd.toFixed(2)} · 月 ${item.monthly_usage_usd.toFixed(2)} USD</Text>
            <View className="mt-3 flex-row flex-wrap gap-2">
              {item.status === 'revoked' ? <Pressable onPress={() => actionMutation.mutate({ id: item.id, action: 'restore' })} className="rounded-xl bg-[#EAF2FF] dark:bg-[#172C55] px-3 py-2"><Text className="text-xs font-bold text-[#2F6DF6]">恢复</Text></Pressable> : <><Pressable onPress={() => actionMutation.mutate({ id: item.id, action: 'extend' })} className="rounded-xl bg-[#EAF2FF] dark:bg-[#172C55] px-3 py-2"><Text className="text-xs font-bold text-[#2F6DF6]">延期 30 天</Text></Pressable><Pressable onPress={() => actionMutation.mutate({ id: item.id, action: 'reset' })} className="rounded-xl bg-[#E2E9F3] dark:bg-[#273449] px-3 py-2"><Text className="text-xs font-bold text-[#475467] dark:text-[#C2CCDB]">重置额度</Text></Pressable><Pressable onPress={() => localizedAlert('撤销订阅', '确认撤销该用户订阅？', [{ text: '取消', style: 'cancel' }, { text: '撤销', style: 'destructive', onPress: () => actionMutation.mutate({ id: item.id, action: 'revoke' }) }])} className="rounded-xl bg-[#FFF0F2] dark:bg-[#3A1720] px-3 py-2"><Text className="text-xs font-bold text-[#D9475C]">撤销</Text></Pressable></>}
            </View>
          </ListCard>
        ))}
        <PaginationControls page={page} pages={subscriptionsQuery.data?.pages ?? 1} total={subscriptionsQuery.data?.total} onChange={setPage} />
      </ScreenShell>
    </>
  );
}
