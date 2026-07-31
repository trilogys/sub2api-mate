import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { ListCard } from '@/src/components/list-card';
import { PaginationControls } from '@/src/components/pagination-controls';
import { ScreenShell } from '@/src/components/screen-shell';
import { listAffiliateRecords, listAffiliateUsers, updateAffiliateUser } from '@/src/services/admin';
import { Text } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

type Tab = 'users' | 'invites' | 'rebates' | 'transfers';

export default function AffiliatesScreen() {
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>('users');
  const [page, setPage] = useState(1);
  const [userId, setUserId] = useState('');
  const [code, setCode] = useState('');
  const [rate, setRate] = useState('');
  const users = useQuery({ queryKey: ['affiliate-users', page], queryFn: () => listAffiliateUsers('', page), enabled: tab === 'users' });
  const records = useQuery({ queryKey: ['affiliate-records', tab, page], queryFn: () => listAffiliateRecords(tab as Exclude<Tab, 'users'>, page), enabled: tab !== 'users' });
  const save = useMutation({ mutationFn: () => updateAffiliateUser(Number(userId), { aff_code: code.trim() || undefined, aff_rebate_rate_percent: rate.trim() ? Number(rate) : undefined }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['affiliate-users'] }); } });
  const changeTab = (next: Tab) => { setTab(next); setPage(1); };
  const data = tab === 'users' ? users.data : records.data;

  return (
    <>
      <LocalizedStackScreen options={{ title: '推广返利', headerShown: true }} />
      <ScreenShell title="推广返利" subtitle="推广用户、邀请、返利与划转记录" safeAreaEdges={['bottom']} bottomInsetClassName="pb-8" refreshing={users.isRefetching || records.isRefetching} onRefresh={() => (tab === 'users' ? users.refetch() : records.refetch()).then(() => undefined)}>
        <View className="flex-row flex-wrap gap-2">{(['users', 'invites', 'rebates', 'transfers'] as const).map((item) => <AdminChip key={item} label={{ users: '推广用户', invites: '邀请记录', rebates: '返利记录', transfers: '划转记录' }[item]} selected={tab === item} onPress={() => changeTab(item)} />)}</View>
        {tab === 'users' ? <AdminSection title="设置专属推广参数" detail="可只改邀请码或返利比例；用户 ID 在下方列表中可见。"><View className="flex-row gap-3"><View className="w-24"><AdminField label="用户 ID" value={userId} onChangeText={setUserId} keyboardType="number-pad" /></View><View className="flex-1"><AdminField label="专属邀请码" value={code} onChangeText={setCode} autoCapitalize="characters" /></View></View><AdminField label="返利比例（%）" value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="留空不修改" /><AdminButton label="保存推广设置" pending={save.isPending} disabled={Number(userId) <= 0 || (!code.trim() && !rate.trim())} onPress={() => save.mutate()} /><AdminMessage error={save.error} success={save.isSuccess ? '推广设置已保存' : undefined} /></AdminSection> : null}
        {tab === 'users' ? users.data?.items.map((item) => <ListCard key={item.user_id} title={item.email} meta={`ID ${item.user_id} · ${item.username || '-'} · 邀请 ${item.aff_count} 人`} badge={item.aff_code || '无邀请码'} badgeTone={item.aff_code_custom ? 'success' : 'muted'}><Text className="mt-2 text-xs text-[#6B778C] dark:text-[#9EABC0]">专属返利率：{item.aff_rebate_rate_percent ?? '默认'}%</Text></ListCard>) : records.data?.items.map((item, index) => <ListCard key={`${item.created_at}-${item.order_id ?? item.user_id ?? index}`} title={item.invitee_email || item.user_email || `记录 #${item.order_id ?? index + 1}`} meta={`${item.inviter_email ? `邀请人 ${item.inviter_email} · ` : ''}${item.rebate_amount ?? item.total_rebate ?? item.amount ?? 0} · ${item.created_at}`} badge={tab} badgeTone="muted" />)}
        {!data?.items.length && !(tab === 'users' ? users.isLoading : records.isLoading) ? <EmptyState /> : null}
        <AdminMessage error={users.error || records.error} />
        <PaginationControls page={page} pages={data?.pages ?? 1} total={data?.total} onChange={setPage} />
      </ScreenShell>
    </>
  );
}
