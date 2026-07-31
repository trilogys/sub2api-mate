import type { LucideIcon } from 'lucide-react-native';
import { TrendingDown, TrendingUp } from 'lucide-react-native';
import { View } from 'react-native';
import { Text } from '@/src/components/localized-text';

type StatCardProps = {
  label: string;
  value: string;
  tone?: 'light' | 'dark';
  trend?: 'up' | 'down';
  icon?: LucideIcon;
};

export function StatCard({ label, value, tone = 'light', trend, icon: Icon }: StatCardProps) {
  const dark = tone === 'dark';
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : null;

  return (
    <View className={dark ? 'rounded-[24px] bg-[#2F6DF6] p-4' : 'rounded-[24px] bg-[#FFFFFF] dark:bg-[#111827] p-4'}>
      <View className="flex-row items-center justify-between gap-3">
        <Text className={dark ? 'text-xs uppercase tracking-[1.5px] text-[#DCE8FF]' : 'text-xs uppercase tracking-[1.5px] text-[#6B778C] dark:text-[#9EABC0]'}>
          {label}
        </Text>
        <View className="flex-row items-center gap-2">
          {TrendIcon ? <TrendIcon color={dark ? '#DCE8FF' : '#6B778C'} size={14} /> : null}
          {Icon ? <Icon color={dark ? '#DCE8FF' : '#6B778C'} size={14} /> : null}
        </View>
      </View>
      <Text className={dark ? 'mt-3 text-3xl font-bold text-white' : 'mt-3 text-3xl font-bold text-[#172033] dark:text-[#F4F7FB]'}>
        {value}
      </Text>
    </View>
  );
}
