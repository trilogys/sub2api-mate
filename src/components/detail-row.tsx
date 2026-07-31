import { View } from 'react-native';
import { Text } from '@/src/components/localized-text';

type DetailRowProps = {
  label: string;
  value: string;
};

export function DetailRow({ label, value }: DetailRowProps) {
  return (
    <View className="flex-row items-start justify-between gap-4 border-b border-[#eee6d7] py-3 last:border-b-0">
      <Text className="text-sm text-[#6B778C] dark:text-[#9EABC0]">{label}</Text>
      <Text className="max-w-[62%] text-right text-sm font-medium text-[#172033] dark:text-[#F4F7FB]">{value}</Text>
    </View>
  );
}
