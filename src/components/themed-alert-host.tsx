import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, View, type AlertButton } from 'react-native';

import { Text } from '@/src/components/localized-text';
import { registerThemedAlertPresenter, type ThemedAlertRequest } from '@/src/store/themed-alert';

type AlertTone = 'info' | 'success' | 'warning' | 'error';

function getTone(request: ThemedAlertRequest): AlertTone {
  if (/失败|错误|异常|无法|不可用|failed|error/i.test(request.title)) return 'error';
  if (/成功|完成|已下载|已复制|success|completed|downloaded|copied/i.test(request.title)) return 'success';
  if (request.buttons?.some((button) => button.style === 'destructive')) return 'warning';
  return 'info';
}

const toneStyles = {
  info: { icon: Info, color: '#2F6DF6', background: 'bg-[#EAF2FF] dark:bg-[#172C55]' },
  success: { icon: CheckCircle2, color: '#20A66A', background: 'bg-[#EAF8F0] dark:bg-[#153326]' },
  warning: { icon: TriangleAlert, color: '#D88A18', background: 'bg-[#FFF6E7] dark:bg-[#3B2B16]' },
  error: { icon: CircleAlert, color: '#D9475C', background: 'bg-[#FFF0F2] dark:bg-[#3A1720]' },
} as const;

function buttonClasses(button: AlertButton) {
  if (button.style === 'destructive') return { box: 'bg-[#D9475C]', text: 'text-white' };
  if (button.style === 'cancel' || /取消|稍后|cancel|later/i.test(button.text ?? '')) return { box: 'bg-[#E2E9F3] dark:bg-[#273449]', text: 'text-[#344054] dark:text-[#D5DDEA]' };
  return { box: 'bg-[#2F6DF6]', text: 'text-white' };
}

export function ThemedAlertHost() {
  const [queue, setQueue] = useState<ThemedAlertRequest[]>([]);
  const current = queue[0];
  const lastVisibleRequestRef = useRef<ThemedAlertRequest | undefined>(undefined);
  if (current) lastVisibleRequestRef.current = current;
  const displayedRequest = current ?? lastVisibleRequestRef.current;

  useEffect(() => registerThemedAlertPresenter((request) => {
    setQueue((items) => [...items, request]);
  }), []);

  const close = (notifyDismiss = false) => {
    const request = current;
    setQueue((items) => items.slice(1));
    if (notifyDismiss) request?.options?.onDismiss?.();
  };

  const dismissible = displayedRequest?.options?.cancelable !== false;
  const buttons = displayedRequest?.buttons?.length ? displayedRequest.buttons : [{ text: '确定' }];
  const stacked = buttons.length > 2;
  const tone = displayedRequest ? getTone(displayedRequest) : 'info';
  const toneStyle = toneStyles[tone];
  const Icon = toneStyle.icon;

  return (
    <Modal
      visible={Boolean(current)}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={() => { if (dismissible) close(true); }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="关闭弹窗"
        onPress={() => { if (dismissible) close(true); }}
        className="flex-1 items-center justify-center bg-black/45 px-5"
      >
        <Pressable
          accessibilityRole="alert"
          onPress={(event) => event.stopPropagation()}
          className="w-full max-w-[380px] rounded-[26px] border border-[#E2E9F3] bg-white p-5 dark:border-[#273449] dark:bg-[#111827]"
          style={{ shadowColor: '#101828', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 12 }}
        >
          <View className="flex-row items-start gap-3">
            <View className={`h-11 w-11 items-center justify-center rounded-2xl ${toneStyle.background}`}>
              <Icon size={22} color={toneStyle.color} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-base font-bold text-[#172033] dark:text-[#F4F7FB]">{displayedRequest?.title}</Text>
              {displayedRequest?.message ? <Text selectable className="mt-1 text-xs leading-5 text-[#6B778C] dark:text-[#9EABC0]">{displayedRequest.message}</Text> : null}
            </View>
            {dismissible ? (
              <Pressable accessibilityLabel="关闭" hitSlop={10} onPress={() => close(true)} className="p-1">
                <X size={18} color="#7C8AA0" />
              </Pressable>
            ) : null}
          </View>

          <View className={`mt-5 gap-2 ${stacked ? '' : 'flex-row'}`}>
            {buttons.map((button, index) => {
              const styles = buttonClasses(button);
              return (
                <Pressable
                  key={`${button.text ?? 'button'}-${index}`}
                  onPress={() => {
                    close(false);
                    if (button.onPress) requestAnimationFrame(() => button.onPress?.());
                  }}
                  className={`${stacked ? 'w-full' : 'min-w-0 flex-1'} min-h-11 items-center justify-center rounded-2xl px-4 py-3 ${styles.box}`}
                >
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} className={`text-sm font-bold ${styles.text}`}>{button.text || '确定'}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
