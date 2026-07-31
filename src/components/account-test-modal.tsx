import { useMutation, useQuery } from '@tanstack/react-query';
import { Bot, CheckCircle2, Search, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAvailableAccountModels, testAccount } from '@/src/services/admin';
import type { AdminAccount } from '@/src/types/admin';
import { Text, TextInput } from '@/src/components/localized-text';

type AccountTestModalProps = {
  account: AdminAccount | null;
  visible: boolean;
  onClose: () => void;
};

function modelErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return '模型列表加载失败，请手动输入模型 ID 后测试。';
  if (error.message === 'INVALID_SERVER_RESPONSE' || error.message.startsWith('INVALID_SERVER_RESPONSE:')) {
    return '模型列表接口返回了非 JSON 内容。通常是服务地址、反向代理或 Sub2API 版本不匹配，不是因为没有选择模型。你仍可在下方手动输入模型 ID 进行测试。';
  }
  return `${error.message}。也可以手动输入模型 ID 后继续测试。`;
}

export function AccountTestModal({ account, visible, onClose }: AccountTestModalProps) {
  const [selectedModelId, setSelectedModelId] = useState('');
  const [search, setSearch] = useState('');
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'default' | 'compact'>('default');

  const modelsQuery = useQuery({
    queryKey: ['account-models', account?.id],
    queryFn: () => getAvailableAccountModels(account!.id),
    enabled: visible && Boolean(account?.id),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!visible) return;
    setSearch('');
    setPrompt('');
    setMode('default');
    setSelectedModelId('');
  }, [account?.id, visible]);

  useEffect(() => {
    if (selectedModelId || !modelsQuery.data?.length) return;
    const preferred = modelsQuery.data.find((model) => model.id.includes('sonnet')) ?? modelsQuery.data[0];
    setSelectedModelId(preferred.id);
  }, [modelsQuery.data, selectedModelId]);

  const models = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return modelsQuery.data ?? [];
    return (modelsQuery.data ?? []).filter((model) =>
      `${model.id} ${model.display_name}`.toLowerCase().includes(keyword)
    );
  }, [modelsQuery.data, search]);

  const testMutation = useMutation({
    mutationFn: () => testAccount(account!.id, {
      model_id: selectedModelId,
      prompt: prompt.trim(),
      mode: account?.platform === 'openai' ? mode : undefined,
    }),
  });

  const close = () => {
    if (testMutation.isPending) return;
    testMutation.reset();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(18, 31, 53, 0.48)' }}
      >
        <SafeAreaView
          edges={['bottom']}
          style={{ maxHeight: '92%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#F4F7FC' }}
        >
          <View className="flex-row items-center justify-between border-b border-[#E2E9F3] dark:border-[#273449] bg-white dark:bg-[#111827] px-5 py-4" style={{ borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
            <View className="flex-1 flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-2xl bg-[#2F6DF6]"><Bot size={20} color="#fff" /></View>
              <View className="flex-1">
                <Text className="text-base font-bold text-[#172033] dark:text-[#F4F7FB]">测试模型账号</Text>
                <Text numberOfLines={1} className="mt-0.5 text-xs text-[#6B778C] dark:text-[#9EABC0]">{account?.name} · {account?.platform}</Text>
              </View>
            </View>
            <Pressable accessibilityLabel="关闭" onPress={close} className="h-10 w-10 items-center justify-center rounded-full bg-[#EEF3F9] dark:bg-[#1A2638]"><X size={20} color="#475467" /></Pressable>
          </View>

          <ScrollView className="px-4" contentContainerClassName="gap-4 py-4" keyboardShouldPersistTaps="handled">
            <View className="rounded-[22px] border border-[#E2E9F3] dark:border-[#273449] bg-white dark:bg-[#111827] p-4">
              <Text className="text-sm font-bold text-[#172033] dark:text-[#F4F7FB]">选择测试模型</Text>
              <View className="mt-3 flex-row items-center gap-2 rounded-2xl bg-[#F1F5FA] dark:bg-[#182235] px-3 py-2.5">
                <Search size={16} color="#7C8AA0" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="搜索模型"
                  placeholderTextColor="#98A2B3"
                  autoCapitalize="none"
                  className="flex-1 text-sm text-[#172033] dark:text-[#F4F7FB]"
                />
              </View>
              <Text className="mt-3 text-[11px] font-semibold text-[#667085] dark:text-[#9EABC0]">当前测试模型</Text>
              <TextInput
                value={selectedModelId}
                onChangeText={(value) => { setSelectedModelId(value.trim()); testMutation.reset(); }}
                placeholder="例如：gpt-5.1-codex 或 claude-sonnet-4-5"
                placeholderTextColor="#98A2B3"
                autoCapitalize="none"
                autoCorrect={false}
                className="mt-2 rounded-2xl border border-[#DCE5F1] bg-white dark:bg-[#111827] px-3 py-3 text-sm text-[#172033] dark:text-[#F4F7FB]"
              />
              {modelsQuery.isLoading ? <ActivityIndicator className="my-6" color="#2F6DF6" /> : null}
              {modelsQuery.isError ? <Text className="mt-3 rounded-2xl bg-[#FFF0F2] dark:bg-[#3A1720] p-3 text-xs leading-5 text-[#D9475C]">{modelErrorMessage(modelsQuery.error)}</Text> : null}
              <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }} contentContainerClassName="gap-2 pt-3">
                {models.map((model) => {
                  const selected = model.id === selectedModelId;
                  return (
                    <Pressable
                      key={model.id}
                      onPress={() => { setSelectedModelId(model.id); testMutation.reset(); }}
                      className={`flex-row items-center justify-between rounded-2xl border px-3 py-3 ${selected ? 'border-[#2F6DF6] bg-[#EAF2FF] dark:bg-[#172C55]' : 'border-[#E8EDF5] dark:border-[#273449] bg-white dark:bg-[#111827]'}`}
                    >
                      <View className="flex-1 pr-3">
                        <Text className={`text-sm font-semibold ${selected ? 'text-[#2459C4]' : 'text-[#344054] dark:text-[#D5DDEA]'}`}>{model.display_name || model.id}</Text>
                        {model.display_name !== model.id ? <Text numberOfLines={1} className="mt-0.5 text-[11px] text-[#7C8AA0] dark:text-[#9EABC0]">{model.id}</Text> : null}
                      </View>
                      {selected ? <CheckCircle2 size={18} color="#2F6DF6" /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
              {!modelsQuery.isLoading && !models.length ? <Text className="py-5 text-center text-xs text-[#7C8AA0] dark:text-[#9EABC0]">没有可用模型</Text> : null}
            </View>

            {account?.platform === 'openai' ? (
              <View className="rounded-[22px] border border-[#E2E9F3] dark:border-[#273449] bg-white dark:bg-[#111827] p-4">
                <Text className="text-sm font-bold text-[#172033] dark:text-[#F4F7FB]">OpenAI 测试模式</Text>
                <View className="mt-3 flex-row gap-2">
                  {(['default', 'compact'] as const).map((value) => (
                    <Pressable key={value} onPress={() => setMode(value)} className={`flex-1 rounded-2xl py-3 ${mode === value ? 'bg-[#2F6DF6]' : 'bg-[#EEF3F9] dark:bg-[#1A2638]'}`}>
                      <Text className={`text-center text-xs font-bold ${mode === value ? 'text-white' : 'text-[#475467] dark:text-[#C2CCDB]'}`}>{value === 'default' ? '标准' : '紧凑'}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <View className="rounded-[22px] border border-[#E2E9F3] dark:border-[#273449] bg-white dark:bg-[#111827] p-4">
              <Text className="text-sm font-bold text-[#172033] dark:text-[#F4F7FB]">测试提示词（可选）</Text>
              <TextInput
                value={prompt}
                onChangeText={setPrompt}
                placeholder="留空时使用服务端默认测试内容"
                placeholderTextColor="#98A2B3"
                multiline
                className="mt-3 min-h-20 rounded-2xl bg-[#F1F5FA] dark:bg-[#182235] px-4 py-3 text-sm text-[#172033] dark:text-[#F4F7FB]"
                textAlignVertical="top"
              />
            </View>

            {testMutation.data ? (
              <View className="rounded-[22px] border border-[#CDE9DA] bg-[#F0FBF5] p-4">
                <Text className="text-sm font-bold text-[#16794B]">{testMutation.data.message}</Text>
                <Text className="mt-1 text-xs text-[#4C7A65]">模型：{testMutation.data.model}</Text>
                {testMutation.data.output ? <Text selectable className="mt-3 text-xs leading-5 text-[#344054] dark:text-[#D5DDEA]">{testMutation.data.output}</Text> : null}
              </View>
            ) : null}
            {testMutation.error ? <Text className="rounded-2xl bg-[#FFF0F2] dark:bg-[#3A1720] p-3 text-sm text-[#D9475C]">{(testMutation.error as Error).message}</Text> : null}
          </ScrollView>

          <View className="border-t border-[#E2E9F3] dark:border-[#273449] bg-white dark:bg-[#111827] px-4 py-3">
            <Pressable
              disabled={!selectedModelId.trim() || testMutation.isPending}
              onPress={() => testMutation.mutate()}
              className="min-h-12 items-center justify-center rounded-2xl bg-[#2F6DF6] px-4 disabled:opacity-50"
            >
              {testMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text className="text-sm font-bold text-white">开始测试所选模型</Text>}
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
