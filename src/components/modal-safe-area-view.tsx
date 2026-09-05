import type { PropsWithChildren } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export function ModalSafeAreaView({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  if (Platform.OS !== 'ios') {
    return <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>{children}</SafeAreaView>;
  }
  // iOS Modal content has a separate native view hierarchy; use the window's React context.
  return <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }}>
    {children}
  </View>;
}
