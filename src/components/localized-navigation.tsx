import { Stack } from 'expo-router';
import type { ComponentProps } from 'react';

import { translateText } from '@/src/components/localized-text';
import { languageState } from '@/src/store/ui-preferences';

const { useSnapshot } = require('valtio/react');

type StackScreenProps = ComponentProps<typeof Stack.Screen>;

export function LocalizedStackScreen({ options, ...props }: StackScreenProps) {
  const language = useSnapshot(languageState).value as 'zh' | 'en';
  const localizedOptions = typeof options === 'object' && options
    ? { ...options, title: typeof options.title === 'string' ? translateText(options.title, language) : options.title }
    : options;
  return <Stack.Screen {...props} options={localizedOptions} />;
}
