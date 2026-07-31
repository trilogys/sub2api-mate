import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { ListCard } from '@/src/components/list-card';
import { ScreenShell } from '@/src/components/screen-shell';
import { createScheduledTest, deleteScheduledTest, listScheduledTests, updateScheduledTest } from '@/src/services/admin';
import { Text, localizedAlert } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

export default function ScheduledTestsScreen() {
  const client = useQueryClient();
  const [accountIdText, setAccountIdText] = useState('');
  const [activeAccountId, setActiveAccountId] = useState(0);
  const [model, setModel] = useState('claude-sonnet-4-5');
  const [cron, setCron] = useState('*/15 * * * *');
  const query = useQuery({ queryKey: ['scheduled-tests', activeAccountId], queryFn: () => listScheduledTests(activeAccountId), enabled: activeAccountId > 0 });
  const refresh = async () => { await client.invalidateQueries({ queryKey: ['scheduled-tests', activeAccountId] }); };
  const create = useMutation({ mutationFn: () => createScheduledTest({ account_id: activeAccountId, model_id: model.trim(), cron_expression: cron.trim(), enabled: true, max_results: 100, auto_recover: true }), onSuccess: refresh });
  const toggle = useMutation({ mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => updateScheduledTest(id, { enabled }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: deleteScheduledTest, onSuccess: refresh });

  return (
    <>
      <LocalizedStackScreen options={{ title: '定时测试', headerShown: true }} />
      <ScreenShell title="账号定时测试" subtitle={activeAccountId ? `账号 #${activeAccountId}` : '先输入账号 ID'} safeAreaEdges={['bottom']} bottomInsetClassName="pb-8" refreshing={query.isRefetching} onRefresh={() => query.refetch().then(() => undefined)}>
        <AdminSection title="选择账号" detail="定时测试计划按账号归属；账号 ID 可从账号详情页查看。">
          <View className="flex-row items-end gap-3"><View className="flex-1"><AdminField label="账号 ID" value={accountIdText} onChangeText={setAccountIdText} keyboardType="number-pad" placeholder="123" /></View><AdminButton label="加载" disabled={Number(accountIdText) <= 0} onPress={() => setActiveAccountId(Number(accountIdText))} /></View>
        </AdminSection>
        {activeAccountId > 0 ? <AdminSection title="新建计划" detail="Cron 由服务端调度，自动恢复会在测试成功后恢复账号状态。"><AdminField label="测试模型" value={model} onChangeText={setModel} autoCapitalize="none" /><AdminField label="Cron 表达式" value={cron} onChangeText={setCron} autoCapitalize="none" /><AdminButton label="创建定时测试" pending={create.isPending} disabled={!model.trim() || !cron.trim()} onPress={() => create.mutate()} /><AdminMessage error={create.error} success={create.isSuccess ? '计划已创建' : undefined} /></AdminSection> : null}
        {query.data?.map((item) => <ListCard key={item.id} title={item.model_id} meta={`${item.cron_expression} · 下次 ${item.next_run_at || '待调度'}`} badge={item.enabled ? '启用' : '停用'} badgeTone={item.enabled ? 'success' : 'muted'}><View className="mt-2 flex-row items-center gap-3"><AdminChip label="自动恢复" selected={item.auto_recover} onPress={() => updateScheduledTest(item.id, { auto_recover: !item.auto_recover }).then(refresh)} /><Pressable onPress={() => toggle.mutate({ id: item.id, enabled: !item.enabled })}><Text className="text-xs font-bold text-[#2F6DF6]">{item.enabled ? '停用' : '启用'}</Text></Pressable><Pressable onPress={() => localizedAlert('删除计划', '确定删除该定时测试计划吗？', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => remove.mutate(item.id) }])}><Text className="text-xs font-bold text-[#D9475C]">删除</Text></Pressable></View></ListCard>)}
        {activeAccountId > 0 && !query.isLoading && !query.data?.length ? <EmptyState label="该账号暂无定时测试" /> : null}
        <AdminMessage error={query.error || toggle.error || remove.error} />
      </ScreenShell>
    </>
  );
}
