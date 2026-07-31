import * as SecureStore from 'expo-secure-store';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { Check, ChevronDown, ChevronUp, Search, SlidersHorizontal, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';
import { PaginationControls } from '@/src/components/pagination-controls';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { listUsageLogs } from '@/src/services/admin';
import type { AdminUsageLog } from '@/src/types/admin';
import { Text, TextInput } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';

const KEY = 'sub2api_usage_visible_fields_v1';
const fieldOptions = [
  ['status', '状态'], ['user', '用户'], ['api_key', 'API 密钥'], ['account', '上游账号'], ['group', '分组'], ['ip', 'IP'], ['request_id', '请求 ID'], ['model', '请求模型'], ['upstream_model', '上游模型'], ['platform', '平台'], ['service_tier', '服务等级'], ['request_type', '请求类型'], ['stream', '流式'], ['tokens', 'Token 明细'], ['cost', '费用'], ['duration', '总耗时'], ['first_token', '首字耗时'], ['billing', '计费模式'], ['endpoints', '端点'], ['time', '时间'],
] as const;
type FieldId = typeof fieldOptions[number][0];
const defaultFields: FieldId[] = ['status','user','account','model','upstream_model','request_type','stream','tokens','cost','duration','first_token','time'];

async function loadFields() { try { const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY); return raw ? JSON.parse(raw) as FieldId[] : defaultFields; } catch { return defaultFields; } }
async function saveFields(fields: FieldId[]) { const raw = JSON.stringify(fields); if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, raw); else await SecureStore.setItemAsync(KEY, raw); }

export default function UsageLogsScreen() {
  const [model, setModel] = useState(''); const [page, setPage] = useState(1); const [fields, setFields] = useState<FieldId[]>(defaultFields); const [settings, setSettings] = useState(false);
  const debounced = useDebouncedValue(model.trim(), 250); useEffect(() => setPage(1), [debounced]); useEffect(() => { loadFields().then(setFields); }, []);
  const query = useQuery({ queryKey: ['usage-logs', debounced, page], queryFn: () => listUsageLogs(debounced, page) });
  const toggle = (id: FieldId) => { const next = fields.includes(id) ? fields.filter((x) => x !== id) : [...fields, id]; setFields(next); saveFields(next).catch(() => undefined); };
  return <><LocalizedStackScreen options={{ title: '使用记录', headerShown: true }} /><ScreenShell title="使用记录" subtitle={`${query.data?.total ?? 0} 条调用记录`} bottomInsetClassName="pb-8" safeAreaEdges={['bottom']} refreshing={query.isRefetching} onRefresh={() => query.refetch().then(() => undefined)}>
    <View className="flex-row items-center gap-2"><View className="flex-1 flex-row items-center gap-2 rounded-2xl bg-white dark:bg-[#111827] px-4 py-3"><Search size={16} color="#6B778C" /><TextInput value={model} onChangeText={setModel} placeholder="按模型筛选" placeholderTextColor="#98A2B3" autoCapitalize="none" className="flex-1 text-xs text-[#172033] dark:text-[#F4F7FB]" /></View><Pressable onPress={() => setSettings(true)} className="h-11 w-11 items-center justify-center rounded-2xl bg-[#EAF2FF] dark:bg-[#172C55]"><SlidersHorizontal size={18} color="#2F6DF6" /></Pressable></View>
    {query.data?.items.map((item) => <UsageCard key={item.id} item={item} fields={fields} />)}
    {query.isError ? <Text className="text-xs text-[#D9475C]">{(query.error as Error).message}</Text> : null}<PaginationControls page={page} pages={query.data?.pages ?? 1} total={query.data?.total} onChange={setPage} />
  </ScreenShell><Modal visible={settings} transparent animationType="fade" onRequestClose={() => setSettings(false)}><View className="flex-1 items-center justify-center bg-black/30 px-5"><View className="w-full max-w-[520px] rounded-[24px] bg-white dark:bg-[#111827] p-5"><View className="flex-row items-center"><Text className="flex-1 text-base font-bold text-[#172033] dark:text-[#F4F7FB]">自定义状态显示</Text><Pressable onPress={() => setSettings(false)}><X size={21} color="#667085" /></Pressable></View><Text className="mt-1 text-[11px] leading-5 text-[#7B8798] dark:text-[#9EABC0]">选择卡片中要显示的请求状态和诊断字段。</Text><View className="mt-4 flex-row flex-wrap gap-2">{fieldOptions.map(([id, label]) => { const active = fields.includes(id); return <Pressable key={id} onPress={() => toggle(id)} className={`flex-row items-center gap-1 rounded-full px-3 py-2 ${active ? 'bg-[#2F6DF6]' : 'bg-[#EEF3F8]'}`}>{active ? <Check size={13} color="#fff" /> : null}<Text className={`text-[11px] font-bold ${active ? 'text-white' : 'text-[#607086] dark:text-[#AAB6C8]'}`}>{label}</Text></Pressable>; })}</View><Pressable onPress={() => { setFields(defaultFields); saveFields(defaultFields); }} className="mt-4 items-center rounded-2xl bg-[#EEF4FF] dark:bg-[#172C55] py-3"><Text className="text-xs font-bold text-[#2F6DF6]">恢复默认</Text></Pressable></View></View></Modal></>;
}

function UsageCard({ item, fields }: { item: AdminUsageLog; fields: FieldId[] }) {
  const [expanded, setExpanded] = useState(false);
  const show = (id: FieldId) => fields.includes(id); const inputTokens = item.input_tokens ?? 0; const outputTokens = item.output_tokens ?? 0; const cacheCreationTokens = item.cache_creation_tokens ?? 0; const cacheReadTokens = item.cache_read_tokens ?? 0; const tokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens; const ok = !item.status_code || item.status_code < 400;
  const pairs: Array<[FieldId, string, string]> = [
    ['user','User',item.user?.email || `#${item.user_id}`], ['api_key','API Key',item.api_key?.name || `#${item.api_key_id}`], ['account','Account',item.account?.name || `#${item.account_id ?? '--'}`], ['group','Group',item.group?.name || (item.group_id ? `#${item.group_id}` : '--')], ['ip','IP',item.client_ip || '--'], ['request_id','Request ID',item.request_id], ['upstream_model','Upstream model',item.upstream_model || '--'], ['platform','Platform',item.platform || '--'], ['service_tier','Service tier',item.service_tier || '--'], ['request_type','Request type',item.request_type || '--'], ['stream','Stream',item.stream ? 'Yes' : 'No'], ['tokens','Token usage',`${tokens.toLocaleString()} (input ${inputTokens} / output ${outputTokens} / cache write ${cacheCreationTokens} / cache read ${cacheReadTokens})`], ['cost','Cost',`Standard $${item.total_cost.toFixed(4)} / Charged $${item.actual_cost.toFixed(4)}`], ['duration','Duration',item.duration_ms == null ? '--' : `${item.duration_ms} ms`], ['first_token','TTFT',item.first_token_ms == null ? '--' : `${item.first_token_ms} ms`], ['billing','Billing mode',item.billing_mode || '--'], ['endpoints','Endpoints',`${item.request_path || item.inbound_endpoint || '--'} → ${item.upstream_endpoint || '--'}`], ['time','Time',new Date(item.created_at).toLocaleString()],
  ];
  const coreDetails: Array<[string, string, string]> = [
    ['endpoint', 'Endpoints', `${item.request_path || item.inbound_endpoint || '--'} → ${item.upstream_endpoint || '--'}`],
    ['ip', 'IP', item.client_ip || '--'],
    ['group', 'Group', item.group?.name || (item.group_id ? `#${item.group_id}` : '--')],
    ['tokens', 'Token usage', `Total ${tokens.toLocaleString()} · Input ${inputTokens} · Output ${outputTokens} · Cache write ${cacheCreationTokens} · Cache read ${cacheReadTokens}`],
  ];
  const details = pairs.filter(([id]) => show(id) && !['tokens', 'endpoints', 'group', 'ip', 'cost', 'duration', 'first_token', 'time'].includes(id));
  return <View className="rounded-[22px] border border-[#E2E9F3] dark:border-[#273449] bg-white dark:bg-[#111827] p-4">
    <View className="flex-row items-start gap-3"><View className={`mt-1 h-2.5 w-2.5 rounded-full ${ok ? 'bg-[#20B26B]' : 'bg-[#D9475C]'}`} /><View className="flex-1"><Text numberOfLines={1} className="text-[13px] font-bold text-[#172033] dark:text-[#F4F7FB]">{show('model') ? item.model || 'Unknown model' : `Record #${item.id}`}</Text><Text className="mt-1 text-[10px] text-[#8B97A8] dark:text-[#9EABC0]">{new Date(item.created_at).toLocaleString()} · {item.platform || 'Unknown platform'}</Text></View>{show('status') ? <Text className={`rounded-full px-2 py-1 text-[9px] font-bold ${ok ? 'bg-[#EAF9F0] dark:bg-[#123326] text-[#23885A]' : 'bg-[#FFF0F3] dark:bg-[#3A1720] text-[#D9475C]'}`}>{item.status_code || (ok ? 'Success' : 'Failed')}</Text> : null}</View>
    <View className="mt-3 flex-row gap-2">
      <Metric label="TOKEN" value={tokens.toLocaleString()} />
      <Metric label="COST" value={`$${item.actual_cost.toFixed(4)}`} />
      <Metric label="LATENCY" value={item.duration_ms == null ? '--' : `${item.duration_ms}ms`} />
      <Metric label="TTFT" value={item.first_token_ms == null ? '--' : `${item.first_token_ms}ms`} />
    </View>
    <View className="mt-3 flex-row items-center"><Text numberOfLines={1} className="flex-1 text-[10px] text-[#667085] dark:text-[#9EABC0]">{item.user?.email || `User #${item.user_id}`} · {item.account?.name || `Account #${item.account_id ?? '--'}`}</Text><Pressable onPress={() => setExpanded((value) => !value)} className="flex-row items-center gap-1 rounded-full bg-[#EEF4FF] dark:bg-[#172C55] px-3 py-2"><Text className="text-[10px] font-bold text-[#2F6DF6]">{expanded ? 'Collapse' : 'Details'}</Text>{expanded ? <ChevronUp size={13} color="#2F6DF6" /> : <ChevronDown size={13} color="#2F6DF6" />}</Pressable></View>
    {expanded ? <View className="mt-3 border-t border-[#EDF1F6] dark:border-[#273449] pt-3">{[...coreDetails, ...details].map(([id,label,value]) => <View key={id} className="mb-2 flex-row gap-3"><Text className="w-16 text-[9px] text-[#8B97A8] dark:text-[#9EABC0]">{label}</Text><Text selectable className="flex-1 text-[10px] leading-4 text-[#4D5C70] dark:text-[#B4C0D2]">{value}</Text></View>)}</View> : null}
    {item.error_message ? <Text className="mt-2 rounded-xl bg-[#FFF4F6] px-3 py-2 text-[10px] leading-4 text-[#D9475C]">{item.error_message}</Text> : null}
  </View>;
}

function Metric({ label, value }: { label: string; value: string }) { return <View className="min-h-14 flex-1 items-center justify-center rounded-xl border border-[#E2E9F3] bg-[#F4F7FC] dark:border-[#273449] dark:bg-[#0B1220] px-1 py-2"><Text numberOfLines={1} className="text-center text-[10px] font-semibold text-[#8B97A8] dark:text-[#9EABC0]">{label}</Text><Text numberOfLines={1} className="mt-1 text-center text-[10px] font-bold text-[#172033] dark:text-[#F4F7FB]">{value}</Text></View>; }
