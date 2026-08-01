import type { PropsWithChildren, ReactNode } from 'react';
import { usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Edge } from 'react-native-safe-area-context';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useUniwind } from 'uniwind';
import { Text } from '@/src/components/localized-text';
import { primaryMenuPaths } from '@/src/components/localized-navigation';

type ScreenShellProps = PropsWithChildren<{
  title: string;
  subtitle: string;
  titleAside?: ReactNode;
  right?: ReactNode;
  variant?: 'card' | 'minimal';
  scroll?: boolean;
  bottomInsetClassName?: string;
  horizontalInsetClassName?: string;
  contentGapClassName?: string;
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
  safeAreaEdges?: Edge[];
}>;

function ScreenHeader({
  title,
  subtitle,
  titleAside,
  right,
  variant,
}: Pick<ScreenShellProps, 'title' | 'subtitle' | 'titleAside' | 'right' | 'variant'>) {
  if (variant === 'minimal') {
    return (
      <View className="mt-4 flex-row items-start justify-between gap-4 px-1 py-1">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-[22px] font-bold tracking-tight text-[#172033] dark:text-[#F4F7FB]">{title}</Text>
            {titleAside}
          </View>
          {subtitle ? (
            <Text numberOfLines={1} className="mt-1 text-[11px] leading-4 text-[#6B778C] dark:text-[#9EABC0]">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View className="items-end justify-start">{right}</View> : null}
      </View>
    );
  }

  return (
    <View
      className="mt-4 rounded-[24px] border border-[#E4EAF2] dark:border-[#273449] bg-[#FFFFFF] dark:bg-[#111827] px-4 py-4"
      style={{ shadowColor: '#24446F', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 14, elevation: 2 }}
    >
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <Text className="text-[24px] font-bold tracking-tight text-[#172033] dark:text-[#F4F7FB]">{title}</Text>
          <Text numberOfLines={1} className="mt-1 text-xs leading-4 text-[#98A2B3] dark:text-[#8391A6]">
            {subtitle}
          </Text>
        </View>
        {right}
      </View>
    </View>
  );
}

export function ScreenShell({
  title,
  subtitle,
  titleAside,
  right,
  children,
  variant = 'card',
  scroll = true,
  bottomInsetClassName = 'pb-24',
  horizontalInsetClassName = 'px-5',
  contentGapClassName = 'mt-4 gap-4',
  refreshing = false,
  onRefresh,
  safeAreaEdges = ['top', 'bottom'],
}: ScreenShellProps) {
  const path = usePathname();
  const { theme } = useUniwind();
  const pageColor = theme === 'dark' ? '#0B1220' : '#F4F7FC';
  const primaryMenu = primaryMenuPaths.has(path);
  const resolvedSafeAreaEdges: Edge[] = primaryMenu ? ['top', 'bottom'] : safeAreaEdges;
  const resolvedVariant = primaryMenu ? 'minimal' : variant;
  if (!scroll) {
    return (
      <SafeAreaView edges={resolvedSafeAreaEdges} style={{ flex: 1, backgroundColor: pageColor }}>
        <View className={`flex-1 ${horizontalInsetClassName} ${bottomInsetClassName}`}>
          <ScreenHeader title={title} subtitle={subtitle} titleAside={titleAside} right={right} variant={resolvedVariant} />
          <View className={`flex-1 ${contentGapClassName}`}>{children}</View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={resolvedSafeAreaEdges} style={{ flex: 1, backgroundColor: pageColor }}>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2F6DF6" /> : undefined}
      >
        <View className={`${horizontalInsetClassName} ${bottomInsetClassName}`}>
          <ScreenHeader title={title} subtitle={subtitle} titleAside={titleAside} right={right} variant={resolvedVariant} />
          <View className={contentGapClassName}>{children}</View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
