import * as Clipboard from 'expo-clipboard';
import { localizedAlert } from '@/src/components/localized-text';

export async function copyWithFeedback(value: string, label = '内容') {
  try {
    await Clipboard.setStringAsync(value);
    localizedAlert('复制成功', `${label}已复制到剪贴板`);
  } catch {
    localizedAlert('复制失败', '请重试或长按文本手动复制');
  }
}
