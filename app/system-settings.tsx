import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAdminSettings, updateAdminSettings } from '@/src/services/admin';
import type { AdminSettings } from '@/src/types/admin';
import { Text, TextInput } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

const fieldClass = 'rounded-2xl bg-[#F1F5FA] dark:bg-[#182235] px-4 py-3.5 text-sm text-[#172033] dark:text-[#F4F7FB]';
const switches: Array<{ key: keyof AdminSettings; label: string }> = [
  { key: 'registration_enabled', label: '开放注册' },
  { key: 'email_verify_enabled', label: '邮箱验证' },
  { key: 'password_reset_enabled', label: '密码重置' },
  { key: 'invitation_code_enabled', label: '邀请码' },
  { key: 'promo_code_enabled', label: '优惠码' },
  { key: 'payment_enabled', label: '在线支付' },
  { key: 'risk_control_enabled', label: '全局风控' },
  { key: 'available_channels_enabled', label: '可用渠道' },
  { key: 'allow_user_view_error_requests', label: '用户查看错误' },
];

export default function SystemSettingsScreen() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ['admin-settings'], queryFn: getAdminSettings });
  const [form, setForm] = useState<Partial<AdminSettings>>({});
  useEffect(() => {
    if (!settingsQuery.data) return;
    const source = settingsQuery.data;
    setForm({
      site_name: source.site_name ?? '', site_subtitle: source.site_subtitle ?? '',
      default_balance: source.default_balance ?? 0, default_concurrency: source.default_concurrency ?? 5,
      default_user_rpm_limit: source.default_user_rpm_limit ?? 0,
      ...Object.fromEntries(switches.map(({ key }) => [key, source[key] === true])),
    });
  }, [settingsQuery.data]);
  const saveMutation = useMutation({ mutationFn: () => updateAdminSettings(form), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin-settings'] }); } });
  const toggle = (key: keyof AdminSettings) => setForm((current) => ({ ...current, [key]: current[key] !== true }));
  const numberField = (key: keyof AdminSettings, value: string) => setForm((current) => ({ ...current, [key]: Number(value) || 0 }));
  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-[#F4F7FC] dark:bg-[#0B1220]">
      <LocalizedStackScreen options={{ title: '系统设置', headerShown: true }} />
      <ScrollView contentContainerClassName="gap-4 px-5 pb-10 pt-4" keyboardShouldPersistTaps="handled">
        <View className="gap-3 rounded-[20px] border border-[#E2E9F3] dark:border-[#273449] bg-[#FFFFFF] dark:bg-[#111827] p-4"><Text className="text-lg font-bold text-[#172033] dark:text-[#F4F7FB]">站点信息</Text><TextInput value={String(form.site_name ?? '')} onChangeText={(site_name) => setForm((v) => ({ ...v, site_name }))} placeholder="站点名称" placeholderTextColor="#98A2B3" className={fieldClass} /><TextInput value={String(form.site_subtitle ?? '')} onChangeText={(site_subtitle) => setForm((v) => ({ ...v, site_subtitle }))} placeholder="站点副标题" placeholderTextColor="#98A2B3" className={fieldClass} /></View>
        <View className="gap-3 rounded-[20px] border border-[#E2E9F3] dark:border-[#273449] bg-[#FFFFFF] dark:bg-[#111827] p-4"><Text className="text-lg font-bold text-[#172033] dark:text-[#F4F7FB]">新用户默认值</Text><TextInput value={String(form.default_balance ?? '')} onChangeText={(v) => numberField('default_balance', v)} placeholder="默认余额" placeholderTextColor="#98A2B3" keyboardType="decimal-pad" className={fieldClass} /><TextInput value={String(form.default_concurrency ?? '')} onChangeText={(v) => numberField('default_concurrency', v)} placeholder="默认并发" placeholderTextColor="#98A2B3" keyboardType="number-pad" className={fieldClass} /><TextInput value={String(form.default_user_rpm_limit ?? '')} onChangeText={(v) => numberField('default_user_rpm_limit', v)} placeholder="默认 RPM，0 为无限" placeholderTextColor="#98A2B3" keyboardType="number-pad" className={fieldClass} /></View>
        <View className="gap-3 rounded-[20px] border border-[#E2E9F3] dark:border-[#273449] bg-[#FFFFFF] dark:bg-[#111827] p-4"><Text className="text-lg font-bold text-[#172033] dark:text-[#F4F7FB]">功能开关</Text><View className="flex-row flex-wrap gap-2">{switches.map(({ key, label }) => <Pressable key={String(key)} onPress={() => toggle(key)} className={`rounded-xl px-3 py-3 ${form[key] === true ? 'bg-[#EAF2FF] dark:bg-[#172C55]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}><Text className={`text-xs font-bold ${form[key] === true ? 'text-[#2F6DF6]' : 'text-[#475467] dark:text-[#C2CCDB]'}`}>{form[key] === true ? '✓ ' : ''}{label}</Text></Pressable>)}</View></View>
        {saveMutation.error ? <Text className="text-sm text-[#D9475C]">{(saveMutation.error as Error).message}</Text> : null}
        {saveMutation.isSuccess ? <Text className="text-sm text-[#2F6DF6]">设置已保存</Text> : null}
        <Pressable disabled={saveMutation.isPending} onPress={() => saveMutation.mutate()} className="rounded-2xl bg-[#2F6DF6] py-4 disabled:opacity-50"><Text className="text-center text-sm font-bold text-white">{saveMutation.isPending ? '保存中...' : '保存系统设置'}</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
