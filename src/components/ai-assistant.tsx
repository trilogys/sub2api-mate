import * as SecureStore from 'expo-secure-store';
import { router, usePathname } from 'expo-router';
import { Bot, Clock3, GripHorizontal, History, MapPin, Plus, Search, Send, Settings2, Trash2, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, Vibration, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MarkdownMessage } from '@/src/components/markdown-message';
import { AI_PROVIDER_STORAGE_KEY, createAIResponse } from '@/src/services/ai';
import type { AIChatMessage, AIProviderConfig } from '@/src/services/ai';
import { formatLocalKnowledgeAnswer, getAppKnowledgeContext } from '@/src/services/app-knowledge';
import { assistantPetOptions, assistantPreferencesState, hydrateAssistantPreferences, setFloatingAssistantEnabled, setFloatingAssistantPosition } from '@/src/store/assistant-preferences';
import { Text, TextInput, localizedAlert } from '@/src/components/localized-text';

const { useSnapshot } = require('valtio/react');

type ChatItem = AIChatMessage & { id: string };
type Conversation = { id: string; title: string; createdAt: string; updatedAt: string; model: string; reasoningEffort: AIProviderConfig['reasoningEffort']; messages: ChatItem[] };

const HISTORY_KEY = 'sub2api_ai_conversations_v2';
const FLOATING_SIZE = 48;
const FLOATING_VISIBLE_EDGE = 30;
const FLOATING_MARGIN = 10;
const welcomeMessage: ChatItem = {
  id: 'welcome',
  role: 'assistant',
  text: '你好，我是 GateNest 助手。你可以直接问 Sub2API、CLIProxyAPI 的管理、排错、接口、参数和页面位置问题。',
};

function messageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function freshConversation(config?: AIProviderConfig | null): Conversation {
  const now = new Date().toISOString();
  return { id: messageId(), title: '新对话', createdAt: now, updatedAt: now, model: config?.model || 'gpt-5.6-terra', reasoningEffort: config?.reasoningEffort || 'medium', messages: [{ ...welcomeMessage, id: messageId() }] };
}

async function readHistory() {
  const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(HISTORY_KEY) ?? null : await SecureStore.getItemAsync(HISTORY_KEY);
  if (!raw) return [] as Conversation[];
  try { const parsed = JSON.parse(raw) as Conversation[]; return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

async function writeHistory(items: Conversation[]) {
  const trimmed = items.slice(0, 20).map((conversation) => ({ ...conversation, messages: conversation.messages.slice(-30).map((message) => ({ ...message, text: message.text.slice(0, 12000) })) }));
  const raw = JSON.stringify(trimmed);
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(HISTORY_KEY, raw);
  else await SecureStore.setItemAsync(HISTORY_KEY, raw);
}

function parseAIConfig(value: string | null): AIProviderConfig | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as AIProviderConfig;
    return parsed.baseUrl && parsed.apiKey && parsed.model && parsed.reasoningEffort ? parsed : null;
  } catch {
    return null;
  }
}

export function AIAssistant() {
  const preferences = useSnapshot(assistantPreferencesState);
  const pathname = usePathname();
  const scrollRef = useRef<ScrollView>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatItem[]>([welcomeMessage]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [draft, setDraft] = useState('');
  const [aiConfig, setAIConfig] = useState<AIProviderConfig | null>(null);
  const [sending, setSending] = useState(false);
  const [suggestedScreen, setSuggestedScreen] = useState<{ title: string; route: string } | null>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [floatingPosition, setFloatingPosition] = useState({ x: screenWidth - FLOATING_SIZE - 18, y: screenHeight - FLOATING_SIZE - 88 });
  const floatingPositionRef = useRef(floatingPosition);
  const floatingDraggingRef = useRef(false);
  const floatingDragOffsetRef = useRef({ x: 0, y: 0 });
  const floatingSuppressOpenRef = useRef(false);
  const [floatingDragging, setFloatingDragging] = useState(false);
  const [floatingEditing, setFloatingEditing] = useState(false);
  const [panelHeight, setPanelHeight] = useState(Math.round(screenHeight * 0.92));
  const dragStartHeight = useRef(panelHeight);
  const resizeResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 2,
    onPanResponderGrant: () => { dragStartHeight.current = panelHeight; },
    onPanResponderMove: (_, gesture) => setPanelHeight(Math.max(Math.round(screenHeight * 0.55), Math.min(Math.round(screenHeight * 0.97), dragStartHeight.current - gesture.dy))),
  }), [panelHeight, screenHeight]);

  useEffect(() => { hydrateAssistantPreferences(); }, []);

  useEffect(() => {
    if (!floatingEditing || floatingDragging) return;
    const timer = setTimeout(() => setFloatingEditing(false), 3000);
    return () => clearTimeout(timer);
  }, [floatingDragging, floatingEditing]);

  useEffect(() => {
    if (!preferences.hydrated) return;
    const saved = preferences.floatingPosition;
    const next = saved
      ? {
          x: saved.x < 0
            ? -(FLOATING_SIZE - FLOATING_VISIBLE_EDGE)
            : saved.x > screenWidth - FLOATING_SIZE
              ? screenWidth - FLOATING_VISIBLE_EDGE
              : Math.max(0, Math.min(screenWidth - FLOATING_SIZE, saved.x)),
          y: Math.max(48, Math.min(screenHeight - FLOATING_SIZE - 24, saved.y)),
        }
      : { x: screenWidth - FLOATING_SIZE - 18, y: screenHeight - FLOATING_SIZE - 88 };
    floatingPositionRef.current = next;
    setFloatingPosition(next);
  }, [preferences.floatingPosition?.x, preferences.floatingPosition?.y, preferences.hydrated, screenHeight, screenWidth, FLOATING_VISIBLE_EDGE]);

  const startFloatingDrag = (event: GestureResponderEvent) => {
    const current = floatingPositionRef.current;
    const next = {
      x: current.x < 0
        ? FLOATING_MARGIN
        : current.x > screenWidth - FLOATING_SIZE
          ? screenWidth - FLOATING_SIZE - FLOATING_MARGIN
          : current.x,
      y: Math.max(48, Math.min(screenHeight - FLOATING_SIZE - 24, current.y)),
    };
    floatingPositionRef.current = next;
    setFloatingPosition(next);
    floatingDragOffsetRef.current = {
      x: event.nativeEvent.pageX - next.x,
      y: event.nativeEvent.pageY - next.y,
    };
    floatingDraggingRef.current = true;
    floatingSuppressOpenRef.current = true;
    setFloatingDragging(true);
    setFloatingEditing(true);
    Vibration.vibrate(20);
  };

  const moveFloatingAssistant = (event: GestureResponderEvent) => {
    if (!floatingDraggingRef.current) return;
    const next = {
      x: Math.max(-(FLOATING_SIZE - FLOATING_VISIBLE_EDGE), Math.min(screenWidth - FLOATING_VISIBLE_EDGE, event.nativeEvent.pageX - floatingDragOffsetRef.current.x)),
      y: Math.max(48, Math.min(screenHeight - FLOATING_SIZE - 24, event.nativeEvent.pageY - floatingDragOffsetRef.current.y)),
    };
    floatingPositionRef.current = next;
    setFloatingPosition(next);
  };

  const finishFloatingDrag = () => {
    if (!floatingDraggingRef.current) return;
    floatingDraggingRef.current = false;
    setFloatingDragging(false);
    const current = floatingPositionRef.current;
    const next = {
      x: current.x < 0
        ? -(FLOATING_SIZE - FLOATING_VISIBLE_EDGE)
        : current.x > screenWidth - FLOATING_SIZE
          ? screenWidth - FLOATING_VISIBLE_EDGE
          : current.x,
      y: current.y,
    };
    floatingPositionRef.current = next;
    setFloatingPosition(next);
    void setFloatingAssistantPosition(next);
    setTimeout(() => {
      floatingSuppressOpenRef.current = false;
    }, 350);
  };

  const appendAssistant = (text: string) => {
    setMessages((current) => [...current, { id: messageId(), role: 'assistant', text }]);
  };

  useEffect(() => {
    if (!open) return;
    Promise.all([
      Platform.OS === 'web' ? Promise.resolve(null) : SecureStore.getItemAsync(AI_PROVIDER_STORAGE_KEY),
      readHistory(),
    ]).then(([savedAI, savedHistory]) => {
      const parsedConfig = parseAIConfig(savedAI);
      setAIConfig(parsedConfig);
      const history = savedHistory.length ? savedHistory : [freshConversation(parsedConfig)];
      setConversations(history);
      setActiveConversationId(history[0].id);
      setMessages(history[0].messages);
      setHistoryReady(true);
    }).catch(() => setAIConfig(null));
  }, [open]);

  useEffect(() => {
    if (!historyReady || !activeConversationId) return;
    setConversations((current) => {
      const now = new Date().toISOString();
      const firstUserMessage = messages.find((message) => message.role === 'user')?.text.trim();
      const next = current
        .map((conversation) => conversation.id === activeConversationId ? { ...conversation, title: conversation.title === '新对话' && firstUserMessage ? firstUserMessage.slice(0, 24) : conversation.title, updatedAt: now, messages } : conversation)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      void writeHistory(next);
      return next;
    });
  }, [activeConversationId, historyReady, messages]);

  const newConversation = () => {
    const next = freshConversation(aiConfig);
    const history = [next, ...conversations];
    setConversations(history);
    setActiveConversationId(next.id);
    setMessages(next.messages);
    setDraft('');
    setSuggestedScreen(null);
    setHistoryOpen(false);
    void writeHistory(history);
  };

  const openConversation = (conversation: Conversation) => {
    setActiveConversationId(conversation.id);
    setMessages(conversation.messages);
    setDraft('');
    setSuggestedScreen(null);
    setHistoryOpen(false);
  };

  const deleteConversation = (conversation: Conversation) => {
    const remaining = conversations.filter((item) => item.id !== conversation.id);
    const next = remaining.length ? remaining : [freshConversation(aiConfig)];
    setConversations(next);
    if (conversation.id === activeConversationId) {
      setActiveConversationId(next[0].id);
      setMessages(next[0].messages);
      setDraft('');
      setSuggestedScreen(null);
    }
    void writeHistory(next);
  };

  const confirmDeleteConversation = (conversation: Conversation) => {
    localizedAlert('删除历史对话', `确认删除“${conversation.title}”吗？`, [
      { text: '取消' },
      { text: '删除', style: 'destructive', onPress: () => deleteConversation(conversation) },
    ]);
  };

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [messages, open]);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    const userMessage: ChatItem = { id: messageId(), role: 'user', text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft('');
    const appKnowledge = getAppKnowledgeContext(text);
    const screen = appKnowledge.results.find(({ entry }) => entry.kind === 'screen' && !entry.app_route.includes(':'))?.entry;
    const hasAPIResult = appKnowledge.results.some(({ entry }) => entry.kind === 'route' || entry.kind === 'upstream_service');
    setSuggestedScreen(screen?.kind === 'screen'
      ? { title: screen.title, route: screen.app_route }
      : hasAPIResult ? { title: '全部 API', route: '/api-console' } : null);
    if (!aiConfig) {
      appendAssistant(`${formatLocalKnowledgeAnswer(text)}\n\n当前未配置 AI；保存 AI 配置后，我还能结合这些结果解释和排错。`);
      return;
    }
    setSending(true);
    try {
      const result = await createAIResponse(
        aiConfig,
        nextMessages.map(({ role, text: content }) => ({ role, text: content })),
        appKnowledge.text,
      );
      appendAssistant(result.text);
    } catch (error) {
      appendAssistant(error instanceof Error ? `AI 请求失败：${error.message}` : 'AI 请求失败，请检查配置');
    } finally {
      setSending(false);
    }
  };

  const openAssistantSettings = () => {
    setOpen(false);
    router.push('/ai-assistant?settings=1' as never);
  };

  const petOption = assistantPetOptions.find((option) => option.value === preferences.pet) ?? assistantPetOptions[0];
  const floatingDockSide = floatingPosition.x < 0
    ? 'left'
    : floatingPosition.x > screenWidth - FLOATING_SIZE
      ? 'right'
      : null;
  const floatingPetRotation = floatingDockSide === 'left' ? '18deg' : floatingDockSide === 'right' ? '-36deg' : '0deg';

  if (pathname === '/login' || !preferences.hydrated || !preferences.floatingEnabled) return null;

  return (
    <>
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: floatingPosition.x,
          top: floatingPosition.y,
          zIndex: 100,
          width: FLOATING_SIZE,
          height: FLOATING_SIZE,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`打开${petOption.label}`}
          delayLongPress={420}
          pressRetentionOffset={{ top: 500, bottom: 500, left: 500, right: 500 }}
          onLongPress={startFloatingDrag}
          onTouchMove={moveFloatingAssistant}
          onTouchEnd={finishFloatingDrag}
          onTouchCancel={finishFloatingDrag}
          onPressOut={finishFloatingDrag}
          onPress={() => {
            if (floatingSuppressOpenRef.current) {
              floatingSuppressOpenRef.current = false;
              return;
            }
            if (floatingEditing) {
              setFloatingEditing(false);
              return;
            }
            setOpen(true);
          }}
          style={{
            width: FLOATING_SIZE,
            height: FLOATING_SIZE,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent',
            transform: [{ scale: floatingDragging ? 1.06 : 1 }],
          }}
        >
          <View style={{ transform: [{ rotate: floatingPetRotation }] }}>
            {preferences.pet === 'ai' ? <Bot size={25} color="#2F6DF6" /> : <Text style={{ fontSize: 29 }}>{petOption.emoji}</Text>}
          </View>
        </Pressable>
        {floatingEditing ? (
          <Pressable
            accessibilityLabel="关闭悬浮助手"
            onPress={() => {
              setFloatingEditing(false);
              void setFloatingAssistantEnabled(false);
            }}
            style={{
              position: 'absolute',
              right: -8,
              top: -7,
              width: 20,
              height: 20,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#D9475C',
              borderWidth: 1.5,
              borderColor: '#FFFFFF',
              elevation: 12,
            }}
          >
            <X size={10} color="#FFFFFF" strokeWidth={3} />
          </Pressable>
        ) : null}
      </View>

      <Modal visible={open} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(18, 31, 53, 0.5)' }}
        >
          <SafeAreaView
            edges={['bottom']}
            style={{ height: panelHeight, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#F4F7FC', overflow: 'hidden' }}
          >
            <View {...resizeResponder.panHandlers} accessibilityLabel="上下拖动调整助手窗口高度" style={{ height: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F7FC' }}><GripHorizontal size={24} color="#98A2B3" /></View>
            <View className="flex-row items-center justify-between border-b border-[#E4EAF2] dark:border-[#273449] px-5 py-4">
              <View className="flex-row items-center gap-3">
                <View className={`h-10 w-10 items-center justify-center rounded-full ${preferences.pet === 'ai' ? 'bg-[#2F6DF6]' : 'border border-[#B8CEFF] bg-white'}`}>{preferences.pet === 'ai' ? <Bot size={21} color="#ffffff" /> : <Text style={{ fontSize: 23 }}>{petOption.emoji}</Text>}</View>
                <View><Text className="text-base font-bold text-[#172033] dark:text-[#F4F7FB]">Sub2API AI 助手</Text><Text className="text-[11px] text-[#6B778C] dark:text-[#9EABC0]">手动对话 · 页面与 API 辅助</Text></View>
              </View>
              <View className="flex-row items-center gap-1"><Pressable accessibilityLabel="新建 AI 对话" onPress={newConversation} className="h-9 w-9 items-center justify-center rounded-full bg-[#EAF2FF] dark:bg-[#172C55]"><Plus size={18} color="#2F6DF6" /></Pressable><Pressable accessibilityLabel="查看历史对话" onPress={() => setHistoryOpen(true)} className="h-9 w-9 items-center justify-center rounded-full bg-[#EAF2FF] dark:bg-[#172C55]"><History size={17} color="#2F6DF6" /></Pressable><Pressable accessibilityLabel="关闭 AI 助手" onPress={() => setOpen(false)} className="h-9 w-9 items-center justify-center rounded-full bg-[#EEF3F9] dark:bg-[#1A2638]"><X size={19} color="#344054" /></Pressable></View>
            </View>

            <ScrollView
              ref={scrollRef}
              style={{ flex: 1, minHeight: 0 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, rowGap: 12 }}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {messages.map((message) => (
                <View
                  key={message.id}
                  style={message.role === 'assistant' ? { alignSelf: 'stretch', width: '100%' } : { alignSelf: 'flex-end', maxWidth: '88%' }}
                  className={`rounded-2xl px-4 py-3 ${message.role === 'user' ? 'bg-[#2F6DF6]' : 'border border-[#E4EAF2] bg-[#FFFFFF] dark:border-[#273449] dark:bg-[#111827]'}`}
                >
                  {message.role === 'assistant' ? <MarkdownMessage text={message.text} /> : <Text selectable className="text-sm leading-5 text-white">{message.text}</Text>}
                </View>
              ))}
              {sending ? <View className="self-start rounded-2xl bg-[#FFFFFF] dark:bg-[#111827] px-4 py-3"><ActivityIndicator size="small" color="#2F6DF6" /></View> : null}
            </ScrollView>

            <View className="border-t border-[#E4EAF2] dark:border-[#273449] px-4 py-3">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pb-3">
                <Pressable onPress={openAssistantSettings} className="flex-row items-center gap-2 rounded-full bg-[#EEF3F9] dark:bg-[#1A2638] px-4 py-2"><Settings2 size={15} color="#344054" /><Text className="text-xs font-semibold text-[#344054] dark:text-[#D5DDEA]">助手设置</Text></Pressable>
                <Pressable onPress={() => { setOpen(false); router.push('/ai-assistant'); }} className="flex-row items-center gap-2 rounded-full bg-[#EEF3F9] dark:bg-[#1A2638] px-4 py-2"><Bot size={15} color="#344054" /><Text className="text-xs font-semibold text-[#344054] dark:text-[#D5DDEA]">完整对话</Text></Pressable>
                <Pressable onPress={() => setDraft('帮我查找这个参数或 API：')} className="flex-row items-center gap-2 rounded-full bg-[#EEF3F9] dark:bg-[#1A2638] px-4 py-2"><Search size={15} color="#344054" /><Text className="text-xs font-semibold text-[#344054] dark:text-[#D5DDEA]">查 API/参数</Text></Pressable>
                {suggestedScreen ? <Pressable onPress={() => { setOpen(false); router.push(suggestedScreen.route as never); }} className="flex-row items-center gap-2 rounded-full bg-[#EAF2FF] dark:bg-[#172C55] px-4 py-2"><MapPin size={15} color="#2F6DF6" /><Text className="text-xs font-semibold text-[#2F6DF6]">打开{suggestedScreen.title}</Text></Pressable> : null}
                <Pressable onPress={() => setMessages([welcomeMessage])} className="flex-row items-center gap-2 rounded-full bg-[#EEF3F9] dark:bg-[#1A2638] px-4 py-2"><Trash2 size={15} color="#344054" /><Text className="text-xs font-semibold text-[#344054] dark:text-[#D5DDEA]">清空对话</Text></Pressable>
              </ScrollView>
              <View className="flex-row items-end gap-2 rounded-2xl border border-[#D5DEEA] dark:border-[#34435A] bg-white dark:bg-[#111827] px-3 py-2">
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="询问 Sub2API、接口、参数或排错问题…"
                  placeholderTextColor="#98A2B3"
                  multiline
                  maxLength={4000}
                  className="max-h-28 min-h-10 flex-1 py-2 text-sm text-[#172033] dark:text-[#F4F7FB]"
                />
                <Pressable accessibilityLabel="发送消息" disabled={!draft.trim() || sending} onPress={() => void sendMessage()} className={`mb-1 h-9 w-9 items-center justify-center rounded-full ${draft.trim() && !sending ? 'bg-[#2F6DF6]' : 'bg-[#D5DEEA]'}`}><Send size={17} color="#ffffff" /></Pressable>
              </View>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={historyOpen} transparent animationType="fade" onRequestClose={() => setHistoryOpen(false)}>
        <View className="flex-1 items-center justify-center bg-black/30 px-5 py-8">
          <View className="max-h-[78%] w-full max-w-[520px] rounded-[24px] bg-[#F4F7FC] dark:bg-[#0B1220] p-5">
            <View className="flex-row items-center"><Text className="flex-1 text-base font-bold text-[#172033] dark:text-[#F4F7FB]">历史对话</Text><Pressable accessibilityLabel="关闭历史对话" onPress={() => setHistoryOpen(false)}><X size={21} color="#667085" /></Pressable></View>
            <Pressable onPress={newConversation} className="my-4 flex-row items-center justify-center gap-2 rounded-2xl bg-[#2F6DF6] py-3"><Plus size={16} color="#fff" /><Text className="text-xs font-bold text-white">新建对话</Text></Pressable>
            <ScrollView showsVerticalScrollIndicator={false}>{conversations.map((conversation) => <View key={conversation.id} className={`mb-2 flex-row items-center rounded-2xl border p-3 ${conversation.id === activeConversationId ? 'border-[#9DBAFA] bg-[#EAF2FF] dark:bg-[#172C55]' : 'border-[#E2E9F3] bg-white dark:border-[#273449] dark:bg-[#111827]'}`}><Pressable onPress={() => openConversation(conversation)} className="flex-1"><Text numberOfLines={1} className="text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{conversation.title}</Text><View className="mt-1 flex-row items-center gap-1"><Clock3 size={11} color="#7B8798" /><Text numberOfLines={1} className="flex-1 text-[9px] text-[#7B8798] dark:text-[#9EABC0]">{new Date(conversation.updatedAt).toLocaleString()} · {conversation.model} · {conversation.messages.length} 条</Text></View></Pressable><Pressable accessibilityLabel={`删除历史对话 ${conversation.title}`} hitSlop={8} onPress={() => confirmDeleteConversation(conversation)} className="ml-2 h-9 w-9 items-center justify-center rounded-full bg-[#FFF0F3] dark:bg-[#3A1720]"><Trash2 size={16} color="#D9475C" /></Pressable></View>)}</ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
