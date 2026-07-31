import * as SecureStore from 'expo-secure-store';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { Text } from '@/src/components/localized-text';
import { AI_PROVIDER_STORAGE_KEY, listAIModels, testAIProvider } from '@/src/services/ai';
import type { AIProviderConfig, ReasoningEffort } from '@/src/services/ai';

const efforts: ReasoningEffort[] = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
const suggestedModels = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'];

const initialConfig: AIProviderConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-5.6-terra',
  reasoningEffort: 'medium',
};

export function AIProviderSettings({ onSaved }: { onSaved?: (config: AIProviderConfig | null) => void }) {
  const [config, setConfig] = useState<AIProviderConfig>(initialConfig);
  const [models, setModels] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    SecureStore.getItemAsync(AI_PROVIDER_STORAGE_KEY).then((value) => {
      if (!value) return;
      try {
        const next = { ...initialConfig, ...JSON.parse(value) };
        setConfig(next);
        setSaved(true);
      } catch {
        setSaved(false);
      }
    });
  }, []);

  const modelQuery = useMutation({ mutationFn: () => listAIModels(config), onSuccess: setModels });
  const test = useMutation({ mutationFn: () => testAIProvider(config) });
  const update = <K extends keyof AIProviderConfig>(key: K, value: AIProviderConfig[K]) => {
    setConfig((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };
  const save = async () => {
    if (Platform.OS === 'web') return;
    await SecureStore.setItemAsync(AI_PROVIDER_STORAGE_KEY, JSON.stringify(config));
    setSaved(true);
    onSaved?.(config);
  };
  const clear = async () => {
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(AI_PROVIDER_STORAGE_KEY);
    setConfig(initialConfig);
    setModels([]);
    setSaved(false);
    test.reset();
    onSaved?.(null);
  };
  const valid = Boolean(config.baseUrl.trim() && config.apiKey.trim() && config.model.trim());

  return (
    <View className="gap-3">
      <AdminSection title="OpenAI 兼容服务" detail="Base URL 请填写到 /v1；API Key 仅保存在当前手机 SecureStore。">
        <AdminField label="Base URL" value={config.baseUrl} onChangeText={(value) => update('baseUrl', value)} placeholder="https://api.openai.com/v1" autoCapitalize="none" autoCorrect={false} />
        <AdminField label="API Key" value={config.apiKey} onChangeText={(value) => update('apiKey', value)} placeholder="sk-..." secureTextEntry={!showApiKey} autoCapitalize="none" autoCorrect={false} />
        <Pressable onPress={() => setShowApiKey((value) => !value)} className="self-start flex-row items-center gap-2 rounded-full bg-[#EEF4FF] dark:bg-[#172C55] px-3 py-2">
          {showApiKey ? <EyeOff size={15} color="#2F6DF6" /> : <Eye size={15} color="#2F6DF6" />}
          <Text className="text-[11px] font-bold text-[#2F6DF6]">{showApiKey ? '隐藏 API Key' : '查看 API Key'}</Text>
        </Pressable>
        <AdminField label="模型" value={config.model} onChangeText={(value) => update('model', value)} placeholder="gpt-5.6-terra" autoCapitalize="none" autoCorrect={false} />
        <View className="flex-row flex-wrap gap-2">{suggestedModels.map((model) => <AdminChip key={model} label={model} selected={config.model === model} onPress={() => update('model', model)} />)}</View>
        <AdminButton label="从服务加载模型" tone="muted" pending={modelQuery.isPending} disabled={!config.baseUrl.trim() || !config.apiKey.trim()} onPress={() => modelQuery.mutate()} />
        {models.length ? <View className="max-h-64 gap-2 rounded-2xl bg-[#F1F5FA] dark:bg-[#182235] p-3">{models.slice(0, 50).map((model) => <Pressable key={model} onPress={() => update('model', model)} className="rounded-xl bg-white dark:bg-[#111827] px-3 py-2"><Text className="text-xs text-[#344054] dark:text-[#D5DDEA]">{model}</Text></Pressable>)}</View> : !modelQuery.isPending ? <EmptyState label="尚未加载远程模型列表" /> : null}
        <AdminMessage error={modelQuery.error} success={models.length ? `已加载 ${models.length} 个模型，显示前 50 个` : undefined} />
      </AdminSection>

      <AdminSection title="推理强度" detail="不同模型和兼容服务支持范围可能不同，请以测试结果为准。">
        <View className="flex-row flex-wrap gap-2">{efforts.map((effort) => <AdminChip key={effort} label={effort} selected={config.reasoningEffort === effort} onPress={() => update('reasoningEffort', effort)} />)}</View>
      </AdminSection>

      <AdminSection title="连接测试" detail="调用 Responses API，要求模型只返回 OK，并显示实际模型与 Token 用量。">
        <AdminButton label="测试模型连接" pending={test.isPending} disabled={!valid} onPress={() => test.mutate()} />
        <AdminMessage error={test.error} success={test.data ? `成功 · ${test.data.model} · ${test.data.text || '收到响应'} · ${test.data.usage?.total_tokens ?? '-'} tokens` : undefined} />
      </AdminSection>

      <AdminSection title="保存配置" detail={Platform.OS === 'web' ? 'Web 版不持久化敏感配置，请在 Android App 中保存。' : '保存后立即供 AI 助手的完整对话与悬浮窗口使用。'}>
        <View className="flex-row gap-2"><View className="flex-1"><AdminButton label={saved ? '配置已保存' : '安全保存配置'} disabled={!valid || Platform.OS === 'web'} onPress={save} /></View><AdminButton label="清除" tone="muted" onPress={clear} /></View>
      </AdminSection>
    </View>
  );
}
