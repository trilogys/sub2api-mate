import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { Copy, Plus, Search, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { copyWithFeedback } from '@/src/lib/clipboard';
import { Pressable, View } from 'react-native';

import { ListCard } from '@/src/components/list-card';
import { PaginationControls } from '@/src/components/pagination-controls';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import {
  deleteRedeemCode,
  expireRedeemCode,
  generateRedeemCodes,
  getRedeemCodeStats,
  listAllGroups,
  listRedeemCodes,
} from '@/src/services/admin';
import type { RedeemCodeType } from '@/src/types/admin';
import { Text, TextInput, localizedAlert } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

const types: Array<{ value: RedeemCodeType; label: string }> = [
  { value: 'balance', label: '余额' },
  { value: 'concurrency', label: '并发' },
  { value: 'subscription', label: '订阅' },
  { value: 'invitation', label: '邀请' },
];
const fieldClass = 'rounded-2xl bg-[#F1F5FA] dark:bg-[#182235] px-4 py-3 text-sm text-[#172033] dark:text-[#F4F7FB]';

export default function RedeemCodesScreen() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [type, setType] = useState<RedeemCodeType>('balance');
  const [count, setCount] = useState('1');
  const [value, setValue] = useState('10');
  const [validityDays, setValidityDays] = useState('30');
  const [expiresInDays, setExpiresInDays] = useState('30');
  const [groupId, setGroupId] = useState<number | null>(null);
  const [generated, setGenerated] = useState<string[]>([]);
  const debouncedSearch = useDebouncedValue(search, 250);
  useEffect(() => setPage(1), [debouncedSearch]);

  const codesQuery = useQuery({ queryKey: ['redeem-codes', debouncedSearch, page], queryFn: () => listRedeemCodes(debouncedSearch, undefined, page) });
  const statsQuery = useQuery({ queryKey: ['redeem-code-stats'], queryFn: getRedeemCodeStats });
  const groupsQuery = useQuery({ queryKey: ['groups', 'all'], queryFn: listAllGroups });

  const generateMutation = useMutation({
    mutationFn: () => generateRedeemCodes({
      count: Number(count),
      type,
      value: Number(value),
      group_id: type === 'subscription' ? groupId : undefined,
      validity_days: type === 'subscription' ? Number(validityDays) : undefined,
      expires_in_days: Number(expiresInDays) || undefined,
    }),
    onSuccess: async (codes) => {
      setGenerated(codes.map((code) => code.code));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['redeem-codes'] }),
        queryClient.invalidateQueries({ queryKey: ['redeem-code-stats'] }),
      ]);
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: 'expire' | 'delete' }) => {
      if (action === 'expire') await expireRedeemCode(id);
      else await deleteRedeemCode(id);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['redeem-codes'] }),
        queryClient.invalidateQueries({ queryKey: ['redeem-code-stats'] }),
      ]);
    },
  });

  const stats = statsQuery.data;
  const invalid = !Number.isInteger(Number(count)) || Number(count) < 1 || Number(count) > 100 || !Number.isFinite(Number(value)) || Number(value) <= 0 || (type === 'subscription' && !groupId);

  return (
    <>
      <LocalizedStackScreen options={{ title: '兑换码', headerShown: true }} />
      <ScreenShell
        title="兑换码"
        subtitle="批量生成与生命周期管理"
        bottomInsetClassName="pb-8"
        safeAreaEdges={['bottom']}
        refreshing={codesQuery.isRefetching}
        onRefresh={() => Promise.all([codesQuery.refetch(), statsQuery.refetch()]).then(() => undefined)}
        right={
          <Pressable onPress={() => setShowCreate((current) => !current)} className="h-10 w-10 items-center justify-center rounded-full bg-[#2F6DF6]">
            <Plus size={21} color="#fff" />
          </Pressable>
        }
      >
        <View className="flex-row gap-2">
          {[
            ['总数', stats?.total_codes ?? 0],
            ['可用', stats?.active_codes ?? 0],
            ['已用', stats?.used_codes ?? 0],
            ['过期', stats?.expired_codes ?? 0],
          ].map(([label, number]) => (
            <View key={String(label)} className="flex-1 rounded-2xl bg-[#FFFFFF] dark:bg-[#111827] p-3">
              <Text className="text-[10px] text-[#6B778C] dark:text-[#9EABC0]">{label}</Text>
              <Text className="mt-1 text-lg font-bold text-[#172033] dark:text-[#F4F7FB]">{number}</Text>
            </View>
          ))}
        </View>

        {showCreate ? (
          <View className="gap-3 rounded-[20px] border border-[#E2E9F3] dark:border-[#273449] bg-[#FFFFFF] dark:bg-[#111827] p-4">
            <Text className="text-lg font-bold text-[#172033] dark:text-[#F4F7FB]">生成兑换码</Text>
            <View className="flex-row flex-wrap gap-2">
              {types.map((item) => (
                <Pressable key={item.value} onPress={() => setType(item.value)} className={`rounded-full px-3 py-2 ${type === item.value ? 'bg-[#2F6DF6]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}>
                  <Text className={`text-xs font-bold ${type === item.value ? 'text-white' : 'text-[#475467] dark:text-[#C2CCDB]'}`}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
            <View className="flex-row gap-3">
              <TextInput value={count} onChangeText={setCount} placeholder="数量 1-100" placeholderTextColor="#98A2B3" keyboardType="number-pad" className={`${fieldClass} flex-1`} />
              <TextInput value={value} onChangeText={setValue} placeholder="面值" placeholderTextColor="#98A2B3" keyboardType="decimal-pad" className={`${fieldClass} flex-1`} />
            </View>
            <TextInput value={expiresInDays} onChangeText={setExpiresInDays} placeholder="兑换码有效天数（0 为永久）" placeholderTextColor="#98A2B3" keyboardType="number-pad" className={fieldClass} />
            {type === 'subscription' ? (
              <>
                <TextInput value={validityDays} onChangeText={setValidityDays} placeholder="兑换后订阅有效天数" placeholderTextColor="#98A2B3" keyboardType="number-pad" className={fieldClass} />
                <Text className="text-xs font-semibold text-[#475467] dark:text-[#C2CCDB]">订阅分组</Text>
                <View className="flex-row flex-wrap gap-2">
                  {groupsQuery.data?.map((group) => (
                    <Pressable key={group.id} onPress={() => setGroupId(group.id)} className={`rounded-full px-3 py-2 ${groupId === group.id ? 'bg-[#2F6DF6]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}>
                      <Text className={`text-xs ${groupId === group.id ? 'text-white' : 'text-[#475467] dark:text-[#C2CCDB]'}`}>{group.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            {generateMutation.error ? <Text className="text-xs text-[#D9475C]">{(generateMutation.error as Error).message}</Text> : null}
            <Pressable disabled={invalid || generateMutation.isPending} onPress={() => generateMutation.mutate()} className={`rounded-2xl bg-[#2F6DF6] py-3.5 ${invalid || generateMutation.isPending ? 'opacity-50' : ''}`}>
              <Text className="text-center text-sm font-bold text-white">{generateMutation.isPending ? '生成中...' : '生成'}</Text>
            </Pressable>
            {generated.length ? (
              <View className="gap-2 rounded-2xl bg-[#EAF2FF] dark:bg-[#172C55] p-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-bold text-[#2F6DF6]">已生成 {generated.length} 个</Text>
                  <Pressable onPress={() => void copyWithFeedback(generated.join('\n'), '全部兑换码')} className="flex-row items-center gap-1">
                    <Copy size={14} color="#2F6DF6" /><Text className="text-xs font-bold text-[#2F6DF6]">复制全部</Text>
                  </Pressable>
                </View>
                <Text selectable className="text-xs leading-5 text-[#315f57]">{generated.join('\n')}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View className="flex-row items-center gap-2 rounded-2xl bg-[#FFFFFF] dark:bg-[#111827] px-4 py-3">
          <Search size={17} color="#6B778C" />
          <TextInput value={search} onChangeText={setSearch} placeholder="搜索兑换码" placeholderTextColor="#98A2B3" autoCapitalize="characters" className="flex-1 text-sm text-[#172033] dark:text-[#F4F7FB]" />
        </View>
        {codesQuery.isError ? <Text className="text-sm text-[#D9475C]">{(codesQuery.error as Error).message}</Text> : null}
        {codesQuery.data?.items.map((code) => (
          <ListCard key={code.id} title={code.code} meta={`${types.find((item) => item.value === code.type)?.label || code.type} · ${code.value}`} badge={code.status} badgeTone={code.status === 'active' || code.status === 'unused' ? 'success' : code.status === 'used' ? 'muted' : 'danger'}>
            <View className="flex-row items-center justify-between gap-3">
              <Text className="flex-1 text-xs text-[#6B778C] dark:text-[#9EABC0]">{code.group?.name || (code.validity_days ? `有效 ${code.validity_days} 天` : new Date(code.created_at).toLocaleDateString())}</Text>
              <Pressable onPress={() => void copyWithFeedback(code.code, '兑换码')} className="p-2"><Copy size={16} color="#2F6DF6" /></Pressable>
              {(code.status === 'active' || code.status === 'unused') ? (
                <Pressable onPress={() => actionMutation.mutate({ id: code.id, action: 'expire' })} className="rounded-xl bg-[#E2E9F3] dark:bg-[#273449] px-3 py-2"><Text className="text-xs font-bold text-[#475467] dark:text-[#C2CCDB]">失效</Text></Pressable>
              ) : null}
              <Pressable onPress={() => localizedAlert('删除兑换码', code.code, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => actionMutation.mutate({ id: code.id, action: 'delete' }) }])} className="p-2"><Trash2 size={16} color="#D9475C" /></Pressable>
            </View>
          </ListCard>
        ))}
        <PaginationControls page={page} pages={codesQuery.data?.pages ?? 1} total={codesQuery.data?.total} onChange={setPage} />
      </ScreenShell>
    </>
  );
}
