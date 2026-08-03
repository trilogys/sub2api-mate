import { Clock3, Play, Power } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { runConfiguredAccountRefresh } from '@/src/components/account-refresh-coordinator';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
import { Text, localizedAlert } from '@/src/components/localized-text';
import { ScreenShell } from '@/src/components/screen-shell';
import { accountRefreshState, updateAccountRefresh } from '@/src/store/account-refresh';

const { useSnapshot } = require('valtio/react');

export default function AccountRefreshScreen() {
  const state = useSnapshot(accountRefreshState);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      await runConfiguredAccountRefresh();
      localizedAlert('刷新成功', '账号状态、今日统计和实时额度已刷新。');
    } catch (reason) {
      localizedAlert('刷新失败', reason instanceof Error ? reason.message : '请稍后重试。');
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <LocalizedStackScreen options={{ title: '账号定时刷新', headerShown: true }} />
      <ScreenShell
        title="账号定时刷新"
        subtitle="与 Sub2API Web 保持一致"
        bottomInsetClassName="pb-10"
        safeAreaEdges={['bottom']}
      >
        <View className="rounded-[22px] border border-[#DDE6F2] bg-white p-4 dark:border-[#273449] dark:bg-[#111827]">
          <View className="flex-row items-center">
            <View className="h-10 w-10 items-center justify-center rounded-2xl bg-[#EAF2FF] dark:bg-[#172C55]">
              <Power size={19} color="#2F6DF6" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-sm font-bold text-[#172033] dark:text-[#F4F7FB]">自动刷新</Text>
              <Text className="mt-1 text-[11px] text-[#667085] dark:text-[#9EABC0]">{state.enabled ? '已开启' : '已关闭'}</Text>
            </View>
            <Pressable
              onPress={() => updateAccountRefresh({ enabled: !state.enabled })}
              className={`h-7 w-12 justify-center rounded-full px-1 ${state.enabled ? 'bg-[#2F6DF6]' : 'bg-[#CBD5E1]'}`}
            >
              <View className={`h-5 w-5 rounded-full bg-white ${state.enabled ? 'self-end' : 'self-start'}`} />
            </Pressable>
          </View>
          <Text className="mt-4 text-[11px] leading-5 text-[#7B8798] dark:text-[#9EABC0]">
            仅在账号清单位于前台时，静默刷新账号状态、今日统计与当前页面账号的实时额度；检测到 7d 剩余 0% 时自动停用该账号，不会批量刷新账号凭据。
          </Text>
        </View>

        <View className="rounded-[22px] border border-[#DDE6F2] bg-white p-4 dark:border-[#273449] dark:bg-[#111827]">
          <View className="flex-row items-center gap-2">
            <Clock3 size={17} color="#2F6DF6" />
            <Text className="text-sm font-bold text-[#172033] dark:text-[#F4F7FB]">刷新间隔</Text>
          </View>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {[10, 15, 30, 60].map((seconds) => (
              <Pressable
                key={seconds}
                onPress={() => updateAccountRefresh({ intervalSeconds: seconds })}
                className={`rounded-full px-3 py-2 ${state.intervalSeconds === seconds ? 'bg-[#2F6DF6]' : 'bg-[#EEF3F9] dark:bg-[#1A2638]'}`}
              >
                <Text className={`text-[11px] font-bold ${state.intervalSeconds === seconds ? 'text-white' : 'text-[#607086] dark:text-[#AAB6C8]'}`}>
                  {seconds} 秒
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View className="rounded-[22px] border border-[#DDE6F2] bg-white p-4 dark:border-[#273449] dark:bg-[#111827]">
          <Text className="text-[11px] text-[#7B8798] dark:text-[#9EABC0]">上次执行</Text>
          <Text className="mt-2 text-xs font-semibold text-[#172033] dark:text-[#F4F7FB]">
            {state.lastRunAt ? new Date(state.lastRunAt).toLocaleString() : '尚未执行'}
          </Text>
          <Text className="mt-1 text-[11px] text-[#667085] dark:text-[#9EABC0]">{state.lastMessage || '—'}</Text>
          <Pressable disabled={running} onPress={() => void run()} className="mt-4 flex-row items-center justify-center gap-2 rounded-2xl bg-[#2F6DF6] py-3">
            <Play size={16} color="#fff" />
            <Text className="font-bold text-white">{running ? '刷新中…' : '立即刷新'}</Text>
          </Pressable>
          <Text className="mt-3 text-[10px] leading-4 text-[#7B8798] dark:text-[#9EABC0]">
            自动刷新不会弹窗；用户点击“立即刷新”或账号卡片中的“刷新额度”时才显示结果提示。
          </Text>
        </View>
      </ScreenShell>
    </>
  );
}
