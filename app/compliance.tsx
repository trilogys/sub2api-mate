import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { ExternalLink } from 'lucide-react-native';
import { Linking, Pressable, View } from 'react-native';

import { ScreenShell } from '@/src/components/screen-shell';
import { acceptAdminCompliance, getAdminComplianceStatus } from '@/src/services/admin';
import { useState } from 'react';
import { Text, TextInput } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

export default function ComplianceScreen() {
  const queryClient = useQueryClient();
  const [phrase, setPhrase] = useState('');
  const statusQuery = useQuery({ queryKey: ['admin-compliance'], queryFn: getAdminComplianceStatus });
  const acceptMutation = useMutation({
    mutationFn: () => acceptAdminCompliance(phrase.trim()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-compliance'] });
      router.replace('/monitor');
    },
  });
  const status = statusQuery.data;
  return (
    <>
      <LocalizedStackScreen options={{ title: '合规确认', headerShown: true }} />
      <ScreenShell title="部署合规确认" subtitle={status ? `协议版本 ${status.version}` : '正在获取服务器状态'} bottomInsetClassName="pb-8" safeAreaEdges={['bottom']} refreshing={statusQuery.isRefetching} onRefresh={() => statusQuery.refetch().then(() => undefined)}>
        {status?.required ? (
          <View className="gap-4 rounded-[20px] border border-[#E2E9F3] dark:border-[#273449] bg-[#FFFFFF] dark:bg-[#111827] p-4">
            <Text className="text-sm leading-6 text-[#475467] dark:text-[#C2CCDB]">服务器要求管理员阅读部署与运营合规文件。打开文档阅读后，在下方完整输入确认短语。</Text>
            <View className="flex-row gap-2">
              {status.document_url_zh ? <Pressable onPress={() => Linking.openURL(status.document_url_zh)} className="flex-row items-center gap-2 rounded-xl bg-[#EAF2FF] dark:bg-[#172C55] px-3 py-2.5"><ExternalLink size={15} color="#2F6DF6" /><Text className="text-xs font-bold text-[#2F6DF6]">中文文档</Text></Pressable> : null}
              {status.document_url_en ? <Pressable onPress={() => Linking.openURL(status.document_url_en)} className="flex-row items-center gap-2 rounded-xl bg-[#E2E9F3] dark:bg-[#273449] px-3 py-2.5"><ExternalLink size={15} color="#475467" /><Text className="text-xs font-bold text-[#475467] dark:text-[#C2CCDB]">English</Text></Pressable> : null}
            </View>
            <View className="rounded-xl bg-[#F1F5FA] dark:bg-[#182235] p-3"><Text selectable className="text-xs leading-5 text-[#475467] dark:text-[#C2CCDB]">{status.ack_phrase_zh}</Text></View>
            <TextInput value={phrase} onChangeText={setPhrase} placeholder="输入上方确认短语" placeholderTextColor="#98A2B3" multiline className="min-h-20 rounded-2xl bg-[#F1F5FA] dark:bg-[#182235] px-4 py-3 text-sm text-[#172033] dark:text-[#F4F7FB]" />
            {acceptMutation.error ? <Text className="text-xs text-[#D9475C]">{(acceptMutation.error as Error).message}</Text> : null}
            <Pressable disabled={!phrase.trim() || acceptMutation.isPending} onPress={() => acceptMutation.mutate()} className={`rounded-2xl bg-[#2F6DF6] py-4 ${!phrase.trim() || acceptMutation.isPending ? 'opacity-50' : ''}`}><Text className="text-center text-sm font-bold text-white">{acceptMutation.isPending ? '提交中...' : '确认并继续'}</Text></Pressable>
          </View>
        ) : status ? (
          <View className="rounded-[20px] bg-[#EAF2FF] dark:bg-[#172C55] p-4"><Text className="text-lg font-bold text-[#2F6DF6]">已完成合规确认</Text><Text className="mt-2 text-xs leading-5 text-[#58736c]">{status.acknowledgement?.accepted_at ? `确认时间 ${new Date(status.acknowledgement.accepted_at).toLocaleString()}` : '当前服务器不要求再次确认。'}</Text></View>
        ) : null}
        {statusQuery.isError ? <Text className="text-sm text-[#D9475C]">{(statusQuery.error as Error).message}</Text> : null}
      </ScreenShell>
    </>
  );
}
