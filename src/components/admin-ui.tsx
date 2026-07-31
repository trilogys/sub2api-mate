import type { PropsWithChildren } from 'react';
import type { TextInputProps } from 'react-native';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Text, TextInput } from '@/src/components/localized-text';

export function AdminSection({ title, detail, children }: PropsWithChildren<{ title: string; detail?: string }>) {
  return (
    <View
      className="gap-3 rounded-[22px] border border-[#E2E9F3] dark:border-[#273449] bg-[#FFFFFF] dark:bg-[#111827] p-4"
      style={{ shadowColor: '#24446F', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 2 }}
    >
      <View>
        <Text className="text-base font-bold text-[#172033] dark:text-[#F4F7FB]">{title}</Text>
        {detail ? <Text className="mt-1 text-xs leading-5 text-[#6B778C] dark:text-[#9EABC0]">{detail}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function AdminField({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs font-medium text-[#667085] dark:text-[#9EABC0]">{label}</Text>
      <TextInput
        placeholderTextColor="#98A2B3"
        className="rounded-2xl border border-[#E8EDF5] dark:border-[#273449] bg-[#F6F8FC] dark:bg-[#152033] px-4 py-3 text-sm text-[#172033] dark:text-[#F4F7FB]"
        {...props}
      />
    </View>
  );
}

export function AdminButton({
  label,
  onPress,
  pending,
  tone = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  pending?: boolean;
  tone?: 'primary' | 'danger' | 'muted';
  disabled?: boolean;
}) {
  const color = tone === 'danger' ? 'bg-[#D9475C]' : tone === 'muted' ? 'bg-[#E2E9F3] dark:bg-[#273449]' : 'bg-[#2F6DF6]';
  const textColor = tone === 'muted' ? 'text-[#344054] dark:text-[#D5DDEA]' : 'text-white';
  return (
    <Pressable disabled={disabled || pending} onPress={onPress} className={`min-h-11 items-center justify-center rounded-2xl px-4 py-3 ${color} disabled:opacity-50`}>
      {pending ? <ActivityIndicator color={tone === 'muted' ? '#344054' : '#fff'} /> : <Text className={`text-sm font-bold ${textColor}`}>{label}</Text>}
    </Pressable>
  );
}

export function AdminChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className={`rounded-xl px-3 py-2.5 ${selected ? 'bg-[#EAF2FF] dark:bg-[#172C55]' : 'bg-[#E2E9F3] dark:bg-[#273449]'}`}>
      <Text className={`text-xs font-bold ${selected ? 'text-[#2F6DF6]' : 'text-[#475467] dark:text-[#C2CCDB]'}`}>{selected ? '✓ ' : ''}{label}</Text>
    </Pressable>
  );
}

export function AdminMessage({ error, success }: { error?: unknown; success?: string }) {
  if (error) return <Text className="text-sm leading-5 text-[#D9475C]">{error instanceof Error ? error.message : String(error)}</Text>;
  if (success) return <Text className="text-sm leading-5 text-[#2F6DF6]">{success}</Text>;
  return null;
}

export function EmptyState({ label = '暂无数据' }: { label?: string }) {
  return <Text className="py-5 text-center text-sm text-[#98A2B3] dark:text-[#8391A6]">{label}</Text>;
}
