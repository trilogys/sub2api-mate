import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { ChevronDown, ExternalLink, GitPullRequest, Wrench, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, View } from 'react-native';

import { AdminButton, AdminMessage, AdminSection } from '@/src/components/admin-ui';
import { AIProviderSettings } from '@/src/components/ai-provider-settings';
import { AssistantAppearancePicker } from '@/src/components/assistant-appearance-picker';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
import { MarkdownMessage } from '@/src/components/markdown-message';
import { ScreenShell } from '@/src/components/screen-shell';
import { Text, TextInput, localizedAlert } from '@/src/components/localized-text';
import { AI_PROVIDER_STORAGE_KEY, createAIFixProposal, listAIModels } from '@/src/services/ai';
import type { AIChatMessage, AIFixProposal, AIProviderConfig, ReasoningEffort } from '@/src/services/ai';
import { getAppKnowledgeContext } from '@/src/services/app-knowledge';
import { createGitHubFixPullRequest, findRelevantRepositoryFiles, loadGitHubConfig } from '@/src/services/github';
import type { GitHubConfig, GitHubSourceFile } from '@/src/services/github';

type ChatItem = AIChatMessage & { id: string };
type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  messages: ChatItem[];
};

const HISTORY_KEY = 'sub2api_ai_conversations_v2';
const efforts: ReasoningEffort[] = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const welcome = (): ChatItem => ({
  id: uid(),
  role: 'assistant',
  text: '你好，我可以查找 App 页面、Sub2API API 与参数，也能协助排错、构建和生成受控的 GitHub 修复方案。',
});
const fresh = (config?: AIProviderConfig | null): Conversation => {
  const now = new Date().toISOString();
  return {
    id: uid(),
    title: '新对话',
    createdAt: now,
    updatedAt: now,
    model: config?.model || 'gpt-5.6-terra',
    reasoningEffort: config?.reasoningEffort || 'medium',
    messages: [welcome()],
  };
};

async function readStorage(key: string) {
  return Platform.OS === 'web'
    ? globalThis.localStorage?.getItem(key) ?? null
    : SecureStore.getItemAsync(key);
}

async function writeHistory(items: Conversation[]) {
  const trimmed = items.slice(0, 20).map((conversation) => ({
    ...conversation,
    messages: conversation.messages.slice(-30).map((message) => ({
      ...message,
      text: message.text.slice(0, 12000),
    })),
  }));
  const raw = JSON.stringify(trimmed);
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(HISTORY_KEY, raw);
  else await SecureStore.setItemAsync(HISTORY_KEY, raw);
}

function parseConfig(raw: string | null): AIProviderConfig | null {
  try {
    const value = raw ? JSON.parse(raw) as AIProviderConfig : null;
    return value?.baseUrl && value.apiKey && value.model ? value : null;
  } catch {
    return null;
  }
}

export default function AIAssistantScreen() {
  const [config, setConfig] = useState<AIProviderConfig | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState('');
  const [modelOpen, setModelOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState<unknown>();
  const [github, setGithub] = useState<GitHubConfig | null>(null);
  const [proposal, setProposal] = useState<AIFixProposal>();
  const [sources, setSources] = useState<GitHubSourceFile[]>([]);
  const [fixing, setFixing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [pr, setPr] = useState<{ html_url: string; number: number; title: string }>();

  const active = conversations.find((conversation) => conversation.id === activeId) ?? conversations[0];

  useEffect(() => {
    Promise.all([readStorage(AI_PROVIDER_STORAGE_KEY), readStorage(HISTORY_KEY), loadGitHubConfig()])
      .then(([rawConfig, rawHistory, nextGitHub]) => {
        const parsed = parseConfig(rawConfig);
        setConfig(parsed);
        setGithub(nextGitHub);
        let history: Conversation[] = [];
        try { history = rawHistory ? JSON.parse(rawHistory) : []; } catch {}
        if (!history.length) history = [fresh(parsed)];
        setConversations(history);
        setActiveId(history[0].id);
      });
  }, []);

  const persist = (next: Conversation[]) => {
    const sorted = [...next].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    setConversations(sorted);
    void writeHistory(sorted);
  };

  const updateActive = (update: (conversation: Conversation) => Conversation) => {
    if (!active) return;
    persist(conversations.map((conversation) => conversation.id === active.id ? update(conversation) : conversation));
  };

  const loadModels = async () => {
    if (!config) return;
    setError(undefined);
    try {
      setModels(await listAIModels({ ...config, model: active?.model || config.model }));
    } catch (reason) {
      setError(reason);
    }
  };

  const lastProblem = useMemo(
    () => [...(active?.messages ?? [])].reverse().find((message) => message.role === 'user')?.text || '',
    [active],
  );

  const generateFix = async () => {
    if (!lastProblem || !config || !github?.token || !active) {
      setError(new Error('需要悬浮助手中的当前问题、AI 配置和 GitHub Token'));
      return;
    }
    setFixing(true);
    setError(undefined);
    try {
      const files = await findRelevantRepositoryFiles(github, lastProblem);
      const next = await createAIFixProposal(
        { ...config, model: active.model, reasoningEffort: active.reasoningEffort },
        lastProblem,
        files.map(({ path, excerpt }) => ({ path, excerpt })),
        getAppKnowledgeContext(lastProblem).text,
      );
      setSources(files);
      setProposal(next);
    } catch (reason) {
      setError(reason);
    } finally {
      setFixing(false);
    }
  };

  const publish = async () => {
    if (!github || !proposal || !sources.length) return;
    setPublishing(true);
    try {
      setPr(await createGitHubFixPullRequest(github, sources, proposal));
    } catch (reason) {
      setError(reason);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <>
      <LocalizedStackScreen options={{ title: 'AI 助手', headerShown: true }} />
      <ScreenShell
        title="AI 助手"
        subtitle="管理悬浮助手、模型与修复配置"
        safeAreaEdges={['bottom']}
        bottomInsetClassName="pb-8"
      >
        <View className="gap-3">
          <AdminSection title="悬浮助手" detail="在这里控制开关和外观；长按可移动，靠边松手后会自动半隐藏。">
            <AssistantAppearancePicker />
          </AdminSection>
          <AIProviderSettings onSaved={setConfig} />
        </View>

        <View className="gap-3 rounded-[20px] border border-[#DDE6F2] bg-white p-3 dark:border-[#273449] dark:bg-[#111827]">
          <Pressable onPress={() => setModelOpen(true)} className="flex-row items-center justify-between rounded-xl bg-[#F1F5FA] px-3 py-2 dark:bg-[#182235]">
            <View className="flex-1">
              <Text className="text-[9px] text-[#7B8798] dark:text-[#9EABC0]">模型</Text>
              <Text numberOfLines={1} className="mt-0.5 text-[11px] font-bold text-[#172033] dark:text-[#F4F7FB]">{active?.model || config?.model || '未配置'}</Text>
            </View>
            <ChevronDown size={15} color="#667085" />
          </Pressable>
          <View>
            <Text className="mb-2 text-[9px] text-[#7B8798] dark:text-[#9EABC0]">推理强度</Text>
            <View className="flex-row flex-wrap gap-1">
              {efforts.map((effort) => (
                <Pressable
                  key={effort}
                  onPress={() => updateActive((conversation) => ({ ...conversation, reasoningEffort: effort, updatedAt: new Date().toISOString() }))}
                  className={`rounded-full px-3 py-1.5 ${active?.reasoningEffort === effort ? 'bg-[#2F6DF6]' : 'bg-[#EEF3F8] dark:bg-[#182235]'}`}
                >
                  <Text className={`text-[9px] font-bold ${active?.reasoningEffort === effort ? 'text-white' : 'text-[#667085] dark:text-[#9EABC0]'}`}>{effort}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <AdminSection title="AI 修复工作流" detail="使用悬浮助手当前会话中的最新问题生成修复方案；创建 Draft PR 前仍会确认。">
          <AdminButton label="根据当前问题生成修复方案" pending={fixing} disabled={!lastProblem} onPress={generateFix} />
          {proposal ? (
            <View className="gap-2 rounded-2xl bg-[#F1F5FA] p-3 dark:bg-[#182235]">
              <View className="flex-row gap-2">
                <Wrench size={16} color="#2F6DF6" />
                <Text className="flex-1 text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{proposal.title}</Text>
              </View>
              <MarkdownMessage text={proposal.summary} />
              {proposal.changes.map((change) => (
                <Text key={change.path} selectable className="text-[10px] leading-4 text-[#607086] dark:text-[#AAB6C8]">{change.path} · {change.reason}</Text>
              ))}
              {proposal.changes.length ? (
                <AdminButton
                  label="确认创建 Draft PR"
                  pending={publishing}
                  onPress={() => localizedAlert('创建 Draft PR', `将修改 ${proposal.changes.length} 个文件。`, [
                    { text: '取消' },
                    { text: '确认', onPress: publish },
                  ])}
                />
              ) : null}
            </View>
          ) : null}
          {pr ? (
            <Pressable onPress={() => Linking.openURL(pr.html_url)} className="flex-row items-center gap-2 rounded-2xl bg-[#EAF2FF] p-3 dark:bg-[#172C55]">
              <GitPullRequest size={16} color="#2F6DF6" />
              <Text className="flex-1 text-xs font-bold text-[#2F6DF6]">PR #{pr.number} · {pr.title}</Text>
              <ExternalLink size={14} color="#2F6DF6" />
            </Pressable>
          ) : null}
          <AdminMessage error={error} />
        </AdminSection>

        <AdminButton label="GitHub 配置" tone="muted" onPress={() => router.push('/github-settings')} />
      </ScreenShell>

      <Modal visible={modelOpen} transparent animationType="fade" onRequestClose={() => setModelOpen(false)}>
        <View className="flex-1 items-center justify-center bg-black/30 px-5">
          <View className="max-h-[75%] w-full rounded-[24px] bg-white p-5 dark:bg-[#111827]">
            <View className="flex-row">
              <Text className="flex-1 text-base font-bold text-[#172033] dark:text-[#F4F7FB]">选择模型</Text>
              <Pressable onPress={() => setModelOpen(false)}><X size={21} color="#667085" /></Pressable>
            </View>
            <TextInput
              value={active?.model || ''}
              onChangeText={(model) => updateActive((conversation) => ({ ...conversation, model, updatedAt: new Date().toISOString() }))}
              placeholder="输入模型 ID"
              autoCapitalize="none"
              className="mt-4 rounded-2xl bg-[#F1F5FA] px-4 py-3 text-xs text-[#172033] dark:bg-[#182235] dark:text-[#F4F7FB]"
            />
            <Pressable onPress={loadModels} className="mt-3 items-center rounded-2xl bg-[#EAF2FF] py-3 dark:bg-[#172C55]">
              <Text className="text-xs font-bold text-[#2F6DF6]">从服务加载模型</Text>
            </Pressable>
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8, paddingTop: 12 }}>
              {models.slice(0, 50).map((model) => (
                <Pressable
                  key={model}
                  onPress={() => {
                    updateActive((conversation) => ({ ...conversation, model, updatedAt: new Date().toISOString() }));
                    setModelOpen(false);
                  }}
                  className="rounded-xl bg-[#F4F7FC] px-3 py-2 dark:bg-[#0B1220]"
                >
                  <Text className="text-xs text-[#344054] dark:text-[#D5DDEA]">{model}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
