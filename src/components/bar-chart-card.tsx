import { CircleHelp } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/src/components/localized-text';

type BarChartItem = {
  label: string;
  value: number;
  color?: string;
  meta?: string;
  hint?: string;
};

type BarChartCardProps = {
  title: string;
  subtitle: string;
  items: BarChartItem[];
  formatValue?: (value: number) => string;
};

export function BarChartCard({
  title,
  subtitle,
  items,
  formatValue = (value) => `${value}`,
}: BarChartCardProps) {
  const [activeHint, setActiveHint] = useState<string | null>(null);
  const maxValue = Math.max(...items.map((item) => item.value), 1);

  return (
    <View className="rounded-[18px] bg-[#FFFFFF] dark:bg-[#111827] p-4">
      <Text className="text-xs uppercase tracking-[1.6px] text-[#6B778C] dark:text-[#9EABC0]">{title}</Text>
      <Text numberOfLines={1} className="mt-1 text-xs text-[#7C8AA0] dark:text-[#9EABC0]">{subtitle}</Text>

      <View className="mt-4 gap-3">
        {items.map((item) => {
          const barWidth = `${Math.max((item.value / maxValue) * 100, item.value > 0 ? 8 : 0)}%` as `${number}%`;

          return (
            <View key={item.label} className="w-full">
              <View className="w-full flex-row items-center justify-between gap-3">
                <View className="flex-1 flex-row items-center gap-1.5 pr-3">
                  <Text numberOfLines={1} className="text-sm font-semibold text-[#172033] dark:text-[#F4F7FB]">
                    {item.label}
                  </Text>
                  {item.hint ? (
                    <Pressable
                      className="h-4 w-4 items-center justify-center rounded-full bg-[#E6ECF5]"
                      onPress={() => setActiveHint(activeHint === item.label ? null : item.label)}
                    >
                      <CircleHelp color="#6B778C" size={11} />
                    </Pressable>
                  ) : null}
                </View>
                <Text className="text-sm font-semibold text-[#344054] dark:text-[#D5DDEA]">{formatValue(item.value)}</Text>
              </View>

              {item.hint && activeHint === item.label ? (
                <View className="mt-2 rounded-[10px] bg-[#F1F5FA] dark:bg-[#182235] px-3 py-2">
                  <Text className="text-[11px] leading-4 text-[#667085] dark:text-[#9EABC0]">{item.hint}</Text>
                </View>
              ) : null}

              <View className="mt-1 flex-row items-end justify-between gap-3">
                <View className="flex-1 pr-3">
                  {item.meta ? <Text numberOfLines={1} className="text-[11px] text-[#6B778C] dark:text-[#9EABC0]">{item.meta}</Text> : null}
                </View>
              </View>

              <View className="mt-2 h-[10px] overflow-hidden rounded-full bg-[#ece4d6]">
                <View
                  className="h-full rounded-full"
                  style={{
                    width: barWidth,
                    backgroundColor: item.color || '#2F6DF6',
                  }}
                />
              </View>
            </View>
          );
        })}

        {items.length === 0 ? <Text className="text-sm text-[#6B778C] dark:text-[#9EABC0]">暂无可视化数据</Text> : null}
      </View>
    </View>
  );
}
