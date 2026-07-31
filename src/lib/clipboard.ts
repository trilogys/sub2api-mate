import * as Clipboard from 'expo-clipboard';
import { Alert } from 'react-native';

export async function copyWithFeedback(value: string, label = '内容') {
  try {
    await Clipboard.setStringAsync(value);
    Alert.alert('复制成功', `${label}已复制到剪贴板`);
  } catch {
    Alert.alert('复制失败', '请重试或长按文本手动复制');
  }
}
