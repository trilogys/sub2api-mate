import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { ListCard } from '@/src/components/list-card';
import { ScreenShell } from '@/src/components/screen-shell';
import { createBackup, createBackupJob, deleteBackup, getBackupAgentHealth, getBackupSchedule, listBackupJobs, listBackups, restoreBackup, updateBackupSchedule } from '@/src/services/admin';
import type { BackupSchedule } from '@/src/types/admin';
import { Text, localizedAlert } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

export default function BackupsScreen() {
  const client = useQueryClient();
  const backups = useQuery({ queryKey: ['backups'], queryFn: listBackups, refetchInterval: 15000 });
  const scheduleQuery = useQuery({ queryKey: ['backup-schedule'], queryFn: getBackupSchedule });
  const agent = useQuery({ queryKey: ['backup-agent-health'], queryFn: getBackupAgentHealth });
  const jobs = useQuery({ queryKey: ['backup-jobs'], queryFn: listBackupJobs, refetchInterval: 15000 });
  const [schedule, setSchedule] = useState<BackupSchedule | null>(null);
  const [restorePassword, setRestorePassword] = useState('');
  useEffect(() => { if (scheduleQuery.data) setSchedule(scheduleQuery.data); }, [scheduleQuery.data]);
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ['backups'] }), client.invalidateQueries({ queryKey: ['backup-jobs'] })]); };
  const create = useMutation({ mutationFn: () => createBackup(30), onSuccess: refresh });
  const createJob = useMutation({ mutationFn: (type: 'postgres' | 'redis' | 'full') => createBackupJob(type), onSuccess: refresh });
  const saveSchedule = useMutation({ mutationFn: () => updateBackupSchedule(schedule!), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['backup-schedule'] }); } });
  const remove = useMutation({ mutationFn: deleteBackup, onSuccess: refresh });
  const restore = useMutation({ mutationFn: (id: string) => restoreBackup(id, restorePassword), onSuccess: refresh });
  const sensitiveError = create.error || createJob.error || restore.error;

  return (
    <>
      <LocalizedStackScreen options={{ title: '备份与数据管理', headerShown: true }} />
      <ScreenShell title="备份与数据管理" subtitle="数据库备份、恢复、计划任务和备份代理" safeAreaEdges={['bottom']} bottomInsetClassName="pb-8" refreshing={backups.isRefetching || jobs.isRefetching} onRefresh={async () => { await Promise.all([backups.refetch(), jobs.refetch(), agent.refetch(), scheduleQuery.refetch()]); }}>
        <AdminSection title="备份代理" detail={agent.data?.reason || '用于 PostgreSQL / Redis / 全量备份任务'}>
          <View className="flex-row flex-wrap gap-2"><Text className={`rounded-xl px-3 py-2 text-xs font-bold ${agent.data?.enabled ? 'bg-[#EAF2FF] dark:bg-[#172C55] text-[#2F6DF6]' : 'bg-[#FFF0F2] dark:bg-[#3A1720] text-[#D9475C]'}`}>{agent.data?.enabled ? '已启用' : '未启用'}</Text><Text className="rounded-xl bg-[#E2E9F3] dark:bg-[#273449] px-3 py-2 text-xs text-[#344054] dark:text-[#D5DDEA]">{agent.data?.agent?.version || '无版本信息'}</Text></View>
          <View className="flex-row flex-wrap gap-2"><AdminButton label="PostgreSQL 备份" pending={createJob.isPending} onPress={() => createJob.mutate('postgres')} /><AdminButton label="Redis 备份" pending={createJob.isPending} onPress={() => createJob.mutate('redis')} /><AdminButton label="全量备份" pending={createJob.isPending} onPress={() => createJob.mutate('full')} /></View>
        </AdminSection>

        {schedule ? (
          <AdminSection title="定时备份" detail="Cron 使用服务端时区；保留天数和份数同时生效。">
            <AdminChip label="启用定时备份" selected={schedule.enabled} onPress={() => setSchedule({ ...schedule, enabled: !schedule.enabled })} />
            <AdminField label="Cron 表达式" value={schedule.cron_expr} onChangeText={(v) => setSchedule({ ...schedule, cron_expr: v })} placeholder="0 2 * * *" autoCapitalize="none" />
            <View className="flex-row gap-3"><View className="flex-1"><AdminField label="保留天数" value={String(schedule.retain_days)} onChangeText={(v) => setSchedule({ ...schedule, retain_days: Number(v) || 1 })} keyboardType="number-pad" /></View><View className="flex-1"><AdminField label="保留份数" value={String(schedule.retain_count)} onChangeText={(v) => setSchedule({ ...schedule, retain_count: Number(v) || 1 })} keyboardType="number-pad" /></View></View>
            <AdminButton label="保存备份计划" pending={saveSchedule.isPending} onPress={() => saveSchedule.mutate()} />
          </AdminSection>
        ) : null}

        <AdminSection title="数据库快照" detail="创建和恢复属于敏感操作；启用 step-up 的实例会拒绝 Admin API Key，请在 Web 管理端完成二次验证。">
          <AdminField label="恢复时的管理员密码" value={restorePassword} onChangeText={setRestorePassword} placeholder="仅恢复时使用" secureTextEntry />
          <AdminButton label="立即创建数据库快照" pending={create.isPending} onPress={() => create.mutate()} />
          <AdminMessage error={sensitiveError || scheduleQuery.error || agent.error} success={create.isSuccess ? '备份任务已创建' : undefined} />
          {backups.data?.items.map((item) => (
            <ListCard key={item.id} title={item.file_name || item.id} meta={`${item.backup_type} · ${Math.round((item.size_bytes || 0) / 1024 / 1024 * 10) / 10} MB · ${item.started_at}`} badge={item.status} badgeTone={item.status === 'completed' ? 'success' : item.status === 'failed' ? 'danger' : 'muted'}>
              <View className="mt-2 flex-row gap-3"><Pressable disabled={!restorePassword} onPress={() => localizedAlert('恢复数据库', '恢复会覆盖当前数据库，确定继续？', [{ text: '取消', style: 'cancel' }, { text: '恢复', style: 'destructive', onPress: () => restore.mutate(item.id) }])}><Text className={`text-xs font-bold ${restorePassword ? 'text-[#D9475C]' : 'text-[#98A2B3] dark:text-[#8391A6]'}`}>恢复</Text></Pressable><Pressable onPress={() => localizedAlert('删除备份', '确定删除该备份吗？', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => remove.mutate(item.id) }])}><Text className="text-xs font-bold text-[#D9475C]">删除</Text></Pressable></View>
            </ListCard>
          ))}
          {!backups.isLoading && !backups.data?.items.length ? <EmptyState label="暂无数据库快照" /> : null}
        </AdminSection>

        <AdminSection title="备份代理任务" detail={`${jobs.data?.items.length ?? 0} 个最近任务`}>
          {jobs.data?.items.map((item) => <ListCard key={item.job_id} title={`${item.backup_type} · ${item.job_id}`} meta={item.error_message || item.started_at || '等待执行'} badge={item.status} badgeTone={item.status === 'succeeded' ? 'success' : item.status === 'failed' ? 'danger' : 'muted'} />)}
          {!jobs.isLoading && !jobs.data?.items.length ? <EmptyState label="暂无代理备份任务" /> : null}
          <AdminMessage error={jobs.error || backups.error || remove.error} />
        </AdminSection>
      </ScreenShell>
    </>
  );
}
