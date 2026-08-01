import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { copyWithFeedback } from '@/src/lib/clipboard';

import { AdminButton, AdminField, AdminMessage, AdminSection } from '@/src/components/admin-ui';
import { adminRawFetch, createAdminWebSocket } from '@/src/lib/admin-fetch';
import type { AdminRawResponse } from '@/src/lib/admin-fetch';
import { getAdminRoute } from '@/src/services/app-knowledge';
import { Text, TextInput, localizedAlert } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

function prettyBody(body: string) {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

export default function APIConsoleDetailScreen() {
  const params = useLocalSearchParams<{ index?: string }>();
  const route = getAdminRoute(Number(params.index));
  const socketRef = useRef<WebSocket | null>(null);
  const pathParameters = useMemo(() => route ? [...route.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => match[1]) : [], [route]);
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [headers, setHeaders] = useState('{}');
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [response, setResponse] = useState<AdminRawResponse>();
  const [socketStatus, setSocketStatus] = useState('未连接');
  const [socketMessages, setSocketMessages] = useState<string[]>([]);

  useEffect(() => () => socketRef.current?.close(), []);

  if (!route) {
    return <SafeAreaView className="flex-1 items-center justify-center bg-[#F4F7FC] dark:bg-[#0B1220]"><Text className="text-sm text-[#D9475C]">API 路由不存在</Text></SafeAreaView>;
  }

  const resolvedPath = () => {
    const path = route.path.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) => encodeURIComponent(pathValues[name]?.trim() || `:${name}`));
    const normalizedQuery = query.trim().replace(/^\?/, '');
    return normalizedQuery ? `${path}?${normalizedQuery}` : path;
  };

  const validatePath = () => {
    const missing = pathParameters.find((name) => !pathValues[name]?.trim());
    if (missing) throw new Error(`请填写路径参数：${missing}`);
  };

  const execute = async () => {
    setPending(true);
    setError(undefined);
    setResponse(undefined);
    try {
      validatePath();
      const parsedHeaders = headers.trim() ? JSON.parse(headers) as Record<string, string> : {};
      if (!parsedHeaders || Array.isArray(parsedHeaders) || typeof parsedHeaders !== 'object') throw new Error('请求头必须是 JSON 对象');
      let requestBody: string | undefined;
      if (route.method !== 'GET' && body.trim()) {
        if (!Object.keys(parsedHeaders).some((key) => key.toLowerCase() === 'content-type') || parsedHeaders['Content-Type']?.includes('json')) {
          requestBody = JSON.stringify(JSON.parse(body));
        } else {
          requestBody = body;
        }
      }
      const result = await adminRawFetch(resolvedPath(), { method: route.method, headers: parsedHeaders, body: requestBody });
      setResponse(result);
    } catch (reason) {
      setError(reason);
    } finally {
      setPending(false);
    }
  };

  const confirmExecute = () => {
    if (route.method === 'GET') {
      void execute();
      return;
    }
    localizedAlert('确认调用接口？', `${route.method} ${resolvedPath()} 可能修改服务器数据。`, [
      { text: '取消', style: 'cancel' },
      { text: '确认调用', style: route.method === 'DELETE' ? 'destructive' : 'default', onPress: () => void execute() },
    ]);
  };

  const connectWebSocket = () => {
    try {
      validatePath();
      socketRef.current?.close();
      setSocketMessages([]);
      setSocketStatus('连接中');
      const socket = createAdminWebSocket(resolvedPath());
      socketRef.current = socket;
      socket.onopen = () => setSocketStatus('已连接');
      socket.onmessage = (event) => setSocketMessages((current) => [...current.slice(-99), String(event.data)]);
      socket.onerror = () => setSocketStatus('连接错误');
      socket.onclose = () => setSocketStatus('已断开');
    } catch (reason) {
      setError(reason);
    }
  };

  const openAIDiagnostic = (details: string) => {
    router.push({
      pathname: '/ai-assistant',
      params: {
        prompt: `请诊断这个接口错误并给出修复建议：\n${route.method} ${resolvedPath()}\n${details}`,
      },
    });
  };

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-[#F4F7FC] dark:bg-[#0B1220]">
      <LocalizedStackScreen options={{ title: route.transport === 'websocket' ? 'WebSocket API' : `${route.method} API`, headerShown: true }} />
      <ScrollView contentContainerClassName="gap-4 px-5 pb-10 pt-4" keyboardShouldPersistTaps="handled">
        <AdminSection title={route.transport === 'websocket' ? `WS ${route.path}` : `${route.method} ${route.path}`} detail={`${route.handler} · ${route.dedicated ? '已有专用服务封装' : '通过通用控制台完整接入'}`}>
          <Text selectable className="font-mono text-xs leading-5 text-[#6B778C] dark:text-[#9EABC0]">最终地址：{resolvedPath()}</Text>
        </AdminSection>

        {pathParameters.length ? <AdminSection title="路径参数" detail="路径中的必填占位参数">
          {pathParameters.map((name) => <AdminField key={name} label={name} value={pathValues[name] || ''} onChangeText={(value) => setPathValues((current) => ({ ...current, [name]: value }))} placeholder={`填写 ${name}`} autoCapitalize="none" autoCorrect={false} />)}
        </AdminSection> : null}

        <AdminSection title="查询参数" detail="使用 URL 查询字符串格式，例如 page=1&page_size=20">
          <AdminField label="Query String" value={query} onChangeText={setQuery} placeholder="page=1&page_size=20" autoCapitalize="none" autoCorrect={false} />
        </AdminSection>

        {route.transport === 'http' ? <>
          <AdminSection title="请求设置" detail="x-api-key 自动使用当前登录配置；这里只填写额外请求头。">
            <Text className="text-xs font-medium text-[#667085] dark:text-[#9EABC0]">额外请求头（JSON）</Text>
            <TextInput value={headers} onChangeText={setHeaders} multiline autoCapitalize="none" autoCorrect={false} className="min-h-20 rounded-2xl bg-[#F1F5FA] dark:bg-[#182235] px-4 py-3 font-mono text-xs text-[#172033] dark:text-[#F4F7FB]" />
            {route.method !== 'GET' ? <><Text className="text-xs font-medium text-[#667085] dark:text-[#9EABC0]">请求体（无需请求体时留空）</Text><TextInput value={body} onChangeText={setBody} placeholder="{ }" placeholderTextColor="#8b938f" multiline autoCapitalize="none" autoCorrect={false} className="min-h-40 rounded-2xl bg-[#1F2A3D] px-4 py-3 font-mono text-xs text-[#EDF3FA]" /></> : null}
            <AdminButton label={`调用 ${route.method} 接口`} pending={pending} onPress={confirmExecute} tone={route.method === 'DELETE' ? 'danger' : 'primary'} />
            <AdminMessage error={error} />
            {error ? <AdminButton label="让 AI 诊断这个请求错误" tone="muted" onPress={() => openAIDiagnostic(`请求异常：${error instanceof Error ? error.message : String(error)}`)} /> : null}
          </AdminSection>

          {response ? <AdminSection title={`响应 · HTTP ${response.status}`} detail={`${response.durationMs} ms · ${response.contentType || '未知类型'}${response.contentDisposition ? ` · ${response.contentDisposition}` : ''}`}>
            <View className={`rounded-2xl p-3 ${response.ok ? 'bg-[#1F2A3D]' : 'bg-[#5c2f27]'}`}><Text selectable className="font-mono text-xs leading-5 text-[#EDF3FA]">{prettyBody(response.body) || '(空响应)'}</Text></View>
            <AdminButton label="复制响应" tone="muted" onPress={() => void copyWithFeedback(response.body, '接口响应')} />
            {!response.ok ? <AdminButton label="让 AI 诊断并准备修复 PR" onPress={() => openAIDiagnostic(`HTTP ${response.status}\nContent-Type: ${response.contentType}\n响应：${response.body.slice(0, 5000)}`)} /> : null}
          </AdminSection> : null}
        </> : <AdminSection title="实时连接" detail="Android 使用当前管理员 x-api-key 建立 WebSocket；Web 浏览器不支持自定义握手请求头。">
          <Text className="text-sm text-[#344054] dark:text-[#D5DDEA]">状态：{socketStatus}</Text>
          <View className="flex-row gap-2"><View className="flex-1"><AdminButton label="连接" onPress={connectWebSocket} /></View><AdminButton label="断开" tone="muted" onPress={() => socketRef.current?.close()} /></View>
          <View className="max-h-96 rounded-2xl bg-[#1F2A3D] p-3"><Text selectable className="font-mono text-xs leading-5 text-[#EDF3FA]">{socketMessages.length ? socketMessages.join('\n') : '(等待消息)'}</Text></View>
          <AdminMessage error={error} />
        </AdminSection>}
      </ScrollView>
    </SafeAreaView>
  );
}
