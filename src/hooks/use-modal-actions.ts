import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export function useModalActions() {
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const closing = useRef(false);
  const pendingAction = useRef<(() => void) | undefined>(undefined);

  const onDismiss = useCallback(() => {
    if (!closing.current) return;
    closing.current = false;
    const action = pendingAction.current;
    pendingAction.current = undefined;
    action?.();
  }, []);

  const runAfterClose = (action: () => void) => {
    if (closing.current) return;
    if (!visibleRef.current) {
      action();
      return;
    }
    closing.current = true;
    pendingAction.current = action;
    setVisible(false);
  };

  // iOS must finish dismissing its native view controller before presenting or navigating.
  useEffect(() => {
    if (!visible && Platform.OS !== 'ios') onDismiss();
  }, [onDismiss, visible]);

  return { visible, setVisible, runAfterClose, onDismiss };
}
