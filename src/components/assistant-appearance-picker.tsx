import { useEffect } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/src/components/localized-text';
import {
  assistantPetOptions,
  assistantPreferencesState,
  hydrateAssistantPreferences,
  setAssistantPet,
  setFloatingAssistantEnabled,
} from '@/src/store/assistant-preferences';

const { useSnapshot } = require('valtio/react');

export function AssistantAppearancePicker() {
  const preferences = useSnapshot(assistantPreferencesState);

  useEffect(() => {
    void hydrateAssistantPreferences();
  }, []);

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3 rounded-2xl bg-[#F4F7FC] p-3 dark:bg-[#182235]">
        <View className="flex-1">
          <Text className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">显示悬浮助手</Text>
          <Text className="mt-1 text-[10px] leading-4 text-[#6B778C] dark:text-[#9EABC0]">关闭后可在这里重新打开。</Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: preferences.floatingEnabled }}
          onPress={() => void setFloatingAssistantEnabled(!preferences.floatingEnabled)}
          className={`h-7 w-12 justify-center rounded-full p-1 ${preferences.floatingEnabled ? 'bg-[#2F6DF6]' : 'bg-[#CBD5E1] dark:bg-[#526074]'}`}
        >
          <View className={`h-5 w-5 rounded-full bg-white ${preferences.floatingEnabled ? 'self-end' : 'self-start'}`} />
        </Pressable>
      </View>
      <Text className="text-[11px] font-bold text-[#344054] dark:text-[#D5DDEA]">选择助手外观</Text>
      <View className="flex-row flex-wrap gap-2">
        {assistantPetOptions.map((option) => {
          const selected = preferences.pet === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => void setAssistantPet(option.value)}
              className={`min-w-[82px] flex-1 items-center rounded-2xl border px-3 py-2 ${selected ? 'border-[#8FB2FF] bg-[#EAF2FF] dark:bg-[#172C55]' : 'border-[#E2E9F3] bg-[#F4F7FC] dark:border-[#273449] dark:bg-[#182235]'}`}
            >
              <Text style={{ fontSize: 23 }}>{option.emoji}</Text>
              <Text numberOfLines={1} className={`mt-1 text-[9px] font-bold ${selected ? 'text-[#2F6DF6]' : 'text-[#667085] dark:text-[#AAB6C8]'}`}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
