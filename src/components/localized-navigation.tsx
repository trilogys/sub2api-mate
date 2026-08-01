import { Stack, usePathname } from 'expo-router';
import type { ComponentProps } from 'react';

import { translateText } from '@/src/components/localized-text';
import { languageState } from '@/src/store/ui-preferences';

const { useSnapshot } = require('valtio/react');

type StackScreenProps = ComponentProps<typeof Stack.Screen>;

export const primaryMenuPaths = new Set([
  '/ops-center',
  '/api-keys',
  '/proxies',
  '/usage-logs',
  '/ai-assistant',
  '/account-refresh',
  '/ip-management',
  '/ops-errors',
  '/audit-logs',
  '/about',
  '/manage',
]);

export function LocalizedStackScreen({ options, ...props }: StackScreenProps) {
  const path = usePathname();
  const language = useSnapshot(languageState).value as 'zh' | 'en';
  const localizedOptions = typeof options === 'object' && options
    ? {
        ...options,
        title: typeof options.title === 'string' ? translateText(options.title, language) : options.title,
        ...(primaryMenuPaths.has(path) ? { headerShown: false, animation: 'none' as const } : {}),
      }
    : options;
  return <Stack.Screen {...props} options={localizedOptions} />;
}
