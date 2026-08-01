import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { View } from 'react-native';

import { AdminButton, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { ListCard } from '@/src/components/list-card';
import { ScreenShell } from '@/src/components/screen-shell';
import { checkSystemUpdates, getRollbackVersions, performSystemUpdate, restartSystem, rollbackSystem } from '@/src/services/admin';
import { Text, localizedAlert } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

export default function SystemMaintenanceScreen() {
  const client = useQueryClient();
  const version = useQuery({ queryKey: ['system-version'], queryFn: () => checkSystemUpdates(false) });
  const rollbacks = useQuery({ queryKey: ['rollback-versions'], queryFn: getRollbackVersions });
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ['system-version'] }), client.invalidateQueries({ queryKey: ['rollback-versions'] })]); };
  const update = useMutation({ mutationFn: performSystemUpdate, onSuccess: refresh });
  const rollback = useMutation({ mutationFn: (target?: string) => rollbackSystem(target), onSuccess: refresh });
  const restart = useMutation({ mutationFn: restartSystem });
  const mutationError = update.error || rollback.error || restart.error;

  return (
    <>
      <LocalizedStackScreen options={{ title: '系统维护', headerShown: true }} />
      <ScreenShell title="系统维护" subtitle={`当前 ${version.data?.current_version ?? '-'}`} safeAreaEdges={['bottom']} bottomInsetClassName="pb-8" refreshing={version.isRefetching} onRefresh={() => version.refetch().then(() => undefined)}>
        <AdminSection title="版本状态" detail={version.data?.warning || `构建类型：${version.data?.build_type ?? '-'}`}>
          <View className="flex-row flex-wrap gap-2"><Text className="rounded-xl bg-[#E2E9F3] dark:bg-[#273449] px-3 py-2 text-xs text-[#344054] dark:text-[#D5DDEA]">当前 {version.data?.current_version ?? '-'}</Text><Text className={`rounded-xl px-3 py-2 text-xs font-bold ${version.data?.has_update ? 'bg-[#fff0db] text-[#946321]' : 'bg-[#EAF2FF] dark:bg-[#172C55] text-[#2F6DF6]'}`}>最新 {version.data?.latest_version ?? '-'}</Text></View>
          <AdminButton label="强制检查更新" tone="muted" onPress={() => checkSystemUpdates(true).then(refresh)} />
          <AdminButton label="下载并应用最新版" pending={update.isPending} disabled={!version.data?.has_update} onPress={() => localizedAlert('系统升级', '升级可能耗时数分钟，期间请勿关闭服务。确定继续？', [{ text: '取消', style: 'cancel' }, { text: '升级', onPress: () => update.mutate() }])} />
          <AdminButton label="重启服务" tone="danger" pending={restart.isPending} onPress={() => localizedAlert('重启服务', '连接会短暂中断，确定重启？', [{ text: '取消', style: 'cancel' }, { text: '重启', style: 'destructive', onPress: () => restart.mutate() }])} />
          <AdminMessage error={mutationError || version.error} success={update.data?.message || restart.data?.message} />
        </AdminSection>

        <AdminSection title="可回滚版本" detail="选择目标版本后服务端会下载并替换当前程序。">
          {rollbacks.data?.versions.map((item) => <ListCard key={item.version} title={item.version} meta={item.published_at} badge="可回滚" badgeTone="muted"><AdminButton label={`回滚到 ${item.version}`} tone="danger" pending={rollback.isPending} onPress={() => localizedAlert('版本回滚', `确定回滚到 ${item.version}？`, [{ text: '取消', style: 'cancel' }, { text: '回滚', style: 'destructive', onPress: () => rollback.mutate(item.version) }])} /></ListCard>)}
          {!rollbacks.isLoading && !rollbacks.data?.versions.length ? <EmptyState label="没有可用回滚版本" /> : null}
          <AdminMessage error={rollbacks.error || rollback.error} success={rollback.data?.message} />
        </AdminSection>
      </ScreenShell>
    </>
  );
}
