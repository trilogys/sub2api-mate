import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { AdminButton, AdminField, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { ListCard } from '@/src/components/list-card';
import { PaginationControls } from '@/src/components/pagination-controls';
import { ScreenShell } from '@/src/components/screen-shell';
import { createPromoCode, deletePromoCode, listPromoCodes, updatePromoCode } from '@/src/services/admin';
import { Text, localizedAlert } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

export default function PromoCodesScreen() {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [code, setCode] = useState('');
  const [bonus, setBonus] = useState('10');
  const [maxUses, setMaxUses] = useState('1');
  const [notes, setNotes] = useState('');
  const query = useQuery({ queryKey: ['promo-codes', page], queryFn: () => listPromoCodes('', page) });
  const refresh = async () => { await client.invalidateQueries({ queryKey: ['promo-codes'] }); };
  const create = useMutation({
    mutationFn: () => createPromoCode({ code: code.trim() || undefined, bonus_amount: Number(bonus), max_uses: Number(maxUses), notes: notes.trim() || undefined }),
    onSuccess: async () => { setCode(''); setNotes(''); await refresh(); },
  });
  const toggle = useMutation({ mutationFn: ({ id, status }: { id: number; status: 'active' | 'disabled' }) => updatePromoCode(id, { status }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: deletePromoCode, onSuccess: refresh });

  return (
    <>
      <LocalizedStackScreen options={{ title: '优惠码', headerShown: true }} />
      <ScreenShell title="优惠码" subtitle={`${query.data?.total ?? 0} 个优惠码`} safeAreaEdges={['bottom']} bottomInsetClassName="pb-8" refreshing={query.isRefetching} onRefresh={() => query.refetch().then(() => undefined)}>
        <AdminSection title="创建优惠码" detail="代码留空时由服务端自动生成；奖励金额按系统余额单位填写。">
          <AdminField label="代码（可选）" value={code} onChangeText={setCode} placeholder="SUMMER2026" autoCapitalize="characters" />
          <View className="flex-row gap-3"><View className="flex-1"><AdminField label="奖励金额" value={bonus} onChangeText={setBonus} keyboardType="decimal-pad" /></View><View className="flex-1"><AdminField label="最大使用次数" value={maxUses} onChangeText={setMaxUses} keyboardType="number-pad" /></View></View>
          <AdminField label="备注" value={notes} onChangeText={setNotes} placeholder="内部备注" />
          <AdminMessage error={create.error} success={create.isSuccess ? '优惠码已创建' : undefined} />
          <AdminButton label="创建优惠码" pending={create.isPending} disabled={Number(bonus) <= 0 || Number(maxUses) <= 0} onPress={() => create.mutate()} />
        </AdminSection>

        {query.data?.items.map((item) => (
          <ListCard key={item.id} title={item.code} meta={`奖励 ${item.bonus_amount} · 已用 ${item.used_count}/${item.max_uses}${item.notes ? ` · ${item.notes}` : ''}`} badge={item.status} badgeTone={item.status === 'active' ? 'success' : 'muted'}>
            <View className="mt-2 flex-row gap-2">
              <Pressable onPress={() => toggle.mutate({ id: item.id, status: item.status === 'active' ? 'disabled' : 'active' })} className="rounded-xl bg-[#E2E9F3] dark:bg-[#273449] px-3 py-2"><Text className="text-xs font-bold text-[#344054] dark:text-[#D5DDEA]">{item.status === 'active' ? '停用' : '启用'}</Text></Pressable>
              <Pressable onPress={() => localizedAlert('删除优惠码', `确定删除 ${item.code} 吗？`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => remove.mutate(item.id) }])} className="rounded-xl bg-[#FFF0F2] dark:bg-[#3A1720] px-3 py-2"><Text className="text-xs font-bold text-[#D9475C]">删除</Text></Pressable>
            </View>
          </ListCard>
        ))}
        {!query.isLoading && !query.data?.items.length ? <EmptyState /> : null}
        <AdminMessage error={query.error || toggle.error || remove.error} />
        <PaginationControls page={page} pages={query.data?.pages ?? 1} total={query.data?.total} onChange={setPage} />
      </ScreenShell>
    </>
  );
}
