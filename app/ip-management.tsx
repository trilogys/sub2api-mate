import { useQuery } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { Pencil, ShieldCheck, ShieldX } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { ScreenShell } from '@/src/components/screen-shell';
import { listMyApiKeys } from '@/src/services/admin';
import { adminConfigState } from '@/src/store/admin-config';
import { Text } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
const { useSnapshot } = require('valtio/react');

export default function IpManagementScreen() {
  const config = useSnapshot(adminConfigState);
  const query = useQuery({ queryKey: ['ip-management'], queryFn: () => listMyApiKeys('', 1, 100), enabled: config.authMode === 'password' });
  return <><LocalizedStackScreen options={{ title: 'IP 管理', headerShown: true }} /><ScreenShell title="IP 管理" subtitle="集中查看所有密钥的访问白名单与黑名单" bottomInsetClassName="pb-10" safeAreaEdges={['bottom']} refreshing={query.isRefetching} onRefresh={() => query.refetch().then(() => undefined)}>
    {config.authMode !== 'password' ? <View className="rounded-[22px] bg-white dark:bg-[#111827] p-4"><Text className="text-sm font-bold text-[#172033] dark:text-[#F4F7FB]">需要邮箱登录</Text><Text className="mt-2 text-xs leading-5 text-[#667085] dark:text-[#9EABC0]">IP 规则属于用户 API 密钥。Admin Key 模式请从用户详情查看密钥，或改用管理员邮箱登录。</Text></View> : query.data?.items.map((key) => <View key={key.id} className="rounded-[22px] border border-[#DDE6F2] dark:border-[#273449] bg-white dark:bg-[#111827] p-4"><View className="flex-row items-center"><Text className="flex-1 text-sm font-bold text-[#172033] dark:text-[#F4F7FB]">{key.name}</Text><Pressable onPress={() => router.push('/api-keys')} className="flex-row items-center gap-1 rounded-xl bg-[#EEF4FF] dark:bg-[#172C55] px-3 py-2"><Pencil size={14} color="#2F6DF6" /><Text className="text-[11px] font-bold text-[#2F6DF6]">编辑</Text></Pressable></View><IpRow icon={ShieldCheck} label="白名单" values={key.ip_whitelist} color="#23885A" /><IpRow icon={ShieldX} label="黑名单" values={key.ip_blacklist} color="#D9475C" /></View>)}
    {query.isError ? <Text className="text-xs text-[#D9475C]">{(query.error as Error).message}</Text> : null}
  </ScreenShell></>;
}

function IpRow({ icon: Icon, label, values, color }: { icon: typeof ShieldCheck; label: string; values?: string[]; color: string }) { return <View className="mt-3 flex-row items-start gap-2"><Icon size={16} color={color} /><View className="flex-1"><Text className="text-[11px] font-bold" style={{ color }}>{label}</Text><Text selectable className="mt-1 text-xs leading-5 text-[#667085] dark:text-[#9EABC0]">{values?.length ? values.join('\n') : '未设置'}</Text></View></View>; }
