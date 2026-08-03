import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/src/components/localized-text';

type ListCardProps = {
  title: string;
  meta?: string;
  badge?: string;
  badgeTone?: 'default' | 'success' | 'warning' | 'muted' | 'danger';
  children?: ReactNode;
  icon?: LucideIcon;
  titleNumberOfLines?: number;
};

const badgeClassMap: Record<NonNullable<ListCardProps['badgeTone']>, { wrap: string; text: string }> = {
  default: {
    wrap: 'rounded-full bg-[#E2E9F3] dark:bg-[#273449] px-2.5 py-1',
    text: 'text-[10px] font-semibold uppercase tracking-[1px] text-[#475467] dark:text-[#C2CCDB]',
  },
  success: {
    wrap: 'rounded-full bg-[#EAF2FF] dark:bg-[#172C55] px-2.5 py-1',
    text: 'text-[10px] font-semibold uppercase tracking-[1px] text-[#2F6DF6]',
  },
  warning: {
    wrap: 'rounded-full bg-[#FFF4D6] dark:bg-[#422F12] px-2.5 py-1',
    text: 'text-[10px] font-semibold uppercase tracking-[1px] text-[#B7791F] dark:text-[#F4C15D]',
  },
  muted: {
    wrap: 'rounded-full bg-[#ece7dc] px-2.5 py-1',
    text: 'text-[10px] font-semibold uppercase tracking-[1px] text-[#6B778C] dark:text-[#9EABC0]',
  },
  danger: {
    wrap: 'rounded-full bg-[#FFF0F2] dark:bg-[#3A1720] px-2.5 py-1',
    text: 'text-[10px] font-semibold uppercase tracking-[1px] text-[#D9475C]',
  },
};

export function ListCard({ title, meta, badge, badgeTone = 'default', children, icon: Icon, titleNumberOfLines }: ListCardProps) {
  const badgeClass = badgeClassMap[badgeTone];

  return (
    <View
      className="rounded-[22px] border border-[#E6ECF5] dark:border-[#273449] bg-[#FFFFFF] dark:bg-[#111827] p-4"
      style={{ shadowColor: '#24446F', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.055, shadowRadius: 14, elevation: 2 }}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            {Icon ? <Icon color="#6B778C" size={16} /> : null}
            <Text numberOfLines={titleNumberOfLines} className="text-base font-semibold text-[#172033] dark:text-[#F4F7FB]">{title}</Text>
          </View>
          {meta ? <Text numberOfLines={1} className="mt-1 text-xs text-[#6B778C] dark:text-[#9EABC0]">{meta}</Text> : null}
        </View>
        {badge ? (
          <View className={badgeClass.wrap}>
            <Text className={badgeClass.text}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {children ? <View className="mt-3">{children}</View> : null}
    </View>
  );
}
