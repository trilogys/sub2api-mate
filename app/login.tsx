import { Redirect, router } from 'expo-router';
import { Check, ChevronDown, ChevronUp, Eye, EyeOff, KeyRound, Languages, LogIn, Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { loginWithPassword, testAdminKey } from '@/src/services/admin';
import { adminConfigState, forgetAdminAccount, hasAuthenticatedAdminSession, saveAdminConfig, switchAdminAccount } from '@/src/store/admin-config';
import type { AdminAccountProfile } from '@/src/store/admin-config';
import { languageState, setAppLanguage } from '@/src/store/ui-preferences';
import { Text, TextInput, localizedAlert } from '@/src/components/localized-text';

const { useSnapshot } = require('valtio/react');
type LoginMode = 'password' | 'admin_key';

const lightColors = { page: '#F4F7FC', card: '#FFFFFF', soft: '#EEF4FF', primary: '#2F6DF6', text: '#172033', sub: '#667085', border: '#DDE6F2', danger: '#D9475C' };
function useLoginColors() { const { theme } = useUniwind(); return theme === 'dark' ? { page: '#0B1220', card: '#111827', soft: '#182235', primary: '#69A0FF', text: '#F4F7FB', sub: '#9EABC0', border: '#273449', danger: '#FF8293' } : lightColors; }

function formatLoginError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : '';
  if (message === 'WEB_NETWORK_OR_CORS_ERROR') return 'Web 端无法发起请求。请使用 npm run web 启动，或配置可用的 Web 代理。';
  if (message === 'WEB_PROXY_UPSTREAM_UNREACHABLE') return 'Web 代理无法连接 Sub2API 服务，请检查服务地址、HTTPS 证书和网络可达性。';
  if (message === 'INVALID_SERVER_RESPONSE') return '服务器返回的不是有效 JSON，请检查服务地址是否填写正确。';
  return message || '登录失败，请检查地址和凭据';
}

export default function LoginScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const colors = useLoginColors();
  const config = useSnapshot(adminConfigState);
  const language = useSnapshot(languageState).value as 'zh' | 'en';
  const [mode, setMode] = useState<LoginMode>('password');
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminKey, setAdminKey] = useState(config.adminApiKey);
  const [remember, setRemember] = useState(true);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const rememberedAccounts = config.accounts.filter((account: AdminAccountProfile) => {
    if (account.remembered === false || account.enabled === false) return false;
    return account.authMode === 'password'
      ? Boolean(account.loginSecret || account.accessToken)
      : Boolean(account.adminApiKey);
  });

  if (hasAuthenticatedAdminSession(config)) return <Redirect href={config.user?.role === 'user' ? '/api-keys' : '/monitor'} />;

  const keepSecretVisible = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), Platform.OS === 'android' ? 220 : 120);
  };

  const submit = async () => {
    Keyboard.dismiss();
    const url = baseUrl.trim().replace(/\/$/, '');
    if (!url) return setError('请输入 Sub2API 服务地址');
    if (mode === 'password' && (!email.trim() || !password)) return setError('请输入邮箱和密码');
    if (mode === 'admin_key' && !adminKey.trim()) return setError('请输入 Admin Key');
    setLoading(true);
    setError('');
    try {
      if (mode === 'password') {
        const response = await loginWithPassword(url, email.trim(), password);
        if (!response.access_token || !response.user) throw new Error('登录响应缺少用户或令牌');
        await saveAdminConfig({ baseUrl: url, authMode: 'password', accessToken: response.access_token, refreshToken: response.refresh_token, user: response.user, remember, loginEmail: email.trim(), loginSecret: password });
        router.replace(response.user.role === 'admin' ? '/monitor' : '/api-keys');
      } else {
        await testAdminKey(url, adminKey.trim());
        await saveAdminConfig({ baseUrl: url, adminApiKey: adminKey.trim(), authMode: 'admin_key', user: null, remember });
        router.replace('/monitor');
      }
    } catch (reason) {
      setError(formatLoginError(reason));
    } finally { setLoading(false); }
  };

  const loginRememberedAccount = async (accountId: string) => {
    const account = config.accounts.find((item: AdminAccountProfile) => item.id === accountId) as AdminAccountProfile | undefined;
    if (!account) return;
    setLoading(true);
    setError('');
    setAccountPickerOpen(false);
    try {
      if (account.authMode === 'password' && account.loginSecret) {
        const loginEmail = account.loginEmail || account.user?.email || '';
        const response = await loginWithPassword(account.baseUrl, loginEmail, account.loginSecret);
        if (!response.access_token || !response.user) throw new Error('登录响应缺少用户或令牌');
        await saveAdminConfig({ baseUrl: account.baseUrl, authMode: 'password', accessToken: response.access_token, refreshToken: response.refresh_token, user: response.user, remember: true, loginEmail, loginSecret: account.loginSecret });
        router.replace(response.user.role === 'admin' ? '/monitor' : '/api-keys');
        return;
      }
      if ((account.authMode ?? 'admin_key') === 'admin_key' && account.adminApiKey) {
        await testAdminKey(account.baseUrl, account.adminApiKey);
        await saveAdminConfig({ baseUrl: account.baseUrl, adminApiKey: account.adminApiKey, authMode: 'admin_key', user: null, remember: true });
        router.replace('/monitor');
        return;
      }
      await switchAdminAccount(account.id);
      router.replace(account.user?.role === 'user' ? '/api-keys' : '/monitor');
    } catch (reason) {
      setMode(account.authMode ?? 'admin_key');
      setBaseUrl(account.baseUrl);
      setEmail(account.loginEmail || account.user?.email || '');
      setPassword(account.loginSecret || '');
      setAdminKey(account.adminApiKey || '');
      setError(formatLoginError(reason));
    } finally {
      setLoading(false);
    }
  };

  const forgetAccount = (accountId: string, label: string) => {
    localizedAlert('删除已记住的账号？', `删除“${label}”后，下次登录需要重新输入信息。`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => void forgetAdminAccount(accountId) },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 18 }}>
          <View style={{ gap: 6 }}><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, color: colors.primary, fontSize: 13, fontWeight: '700' }}>SUB2API MOBILE</Text><Pressable accessibilityLabel="切换语言" onPress={() => void setAppLanguage(language === 'zh' ? 'en' : 'zh')} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 12, backgroundColor: colors.soft, paddingHorizontal: 10, paddingVertical: 7 }}><Languages size={15} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800' }}>{language === 'zh' ? 'EN' : '中文'}</Text></Pressable></View><Text style={{ color: colors.text, fontSize: 28, fontWeight: '800' }}>连接你的服务</Text><Text style={{ color: colors.sub, lineHeight: 21 }}>支持邮箱密码登录和 Admin Key 管理模式。普通用户登录后只显示自助功能。</Text></View>
          {rememberedAccounts.length ? <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' }}>
            <Pressable onPress={() => setAccountPickerOpen((value) => !value)} style={{ minHeight: 52, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10 }}><KeyRound size={17} color={colors.primary} /><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>已记住的账号</Text><Text style={{ marginTop: 2, color: colors.sub, fontSize: 10 }}>{rememberedAccounts.length} 个账号，点击下拉快速登录</Text></View>{accountPickerOpen ? <ChevronUp size={18} color={colors.sub} /> : <ChevronDown size={18} color={colors.sub} />}</Pressable>
            {accountPickerOpen ? <View style={{ borderTopWidth: 1, borderTopColor: colors.border, padding: 8, gap: 6 }}>{rememberedAccounts.map((account: AdminAccountProfile) => { const title = account.authMode === 'password' ? account.loginEmail || account.user?.email || '邮箱账号' : 'Admin Key'; return <View key={account.id} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 14, backgroundColor: colors.soft }}><Pressable disabled={loading} onPress={() => void loginRememberedAccount(account.id)} style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 11 }}><Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: '800' }}>{title}</Text><Text numberOfLines={1} style={{ marginTop: 3, color: colors.sub, fontSize: 10 }}>{account.baseUrl} · {account.authMode === 'password' ? '邮箱登录' : 'Admin Key'}</Text></Pressable><Pressable accessibilityLabel={`删除 ${title}`} onPress={() => forgetAccount(account.id, title)} style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}><Trash2 size={16} color={colors.danger} /></Pressable></View>; })}</View> : null}
          </View> : null}
          <View style={{ flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: colors.soft }}>
            {([['password', '邮箱密码', LogIn], ['admin_key', 'Admin Key', KeyRound]] as const).map(([value, label, Icon]) => <Pressable key={value} onPress={() => { setMode(value); setError(''); }} style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingVertical: 11, borderRadius: 12, backgroundColor: mode === value ? colors.card : 'transparent' }}><Icon size={17} color={mode === value ? colors.primary : colors.sub} /><Text style={{ color: mode === value ? colors.primary : colors.sub, fontWeight: '700' }}>{label}</Text></Pressable>)}
          </View>
          <View style={{ backgroundColor: colors.card, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 14 }}>
            <Field label="服务地址" value={baseUrl} onChangeText={setBaseUrl} placeholder="https://sub2api.example.com" />
            {mode === 'password' ? <><Field label="邮箱" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" /><SecretField label="密码" value={password} onChangeText={setPassword} visible={showSecret} onToggle={() => setShowSecret((v) => !v)} onFocus={keepSecretVisible} /></> : <SecretField label="Admin Key" value={adminKey} onChangeText={setAdminKey} visible={showSecret} onToggle={() => setShowSecret((v) => !v)} onFocus={keepSecretVisible} />}
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: remember }} onPress={() => setRemember((value) => !value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><View style={{ width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: remember ? colors.primary : colors.border, backgroundColor: remember ? colors.primary : colors.card }}>{remember ? <Check size={14} color="#fff" /> : null}</View><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>记住登录信息</Text><Text style={{ marginTop: 2, color: colors.sub, fontSize: 10 }}>{Platform.OS === 'web' ? 'Web 端不会保存密码或 Admin Key' : '退出后仍可从账号下拉列表快速登录'}</Text></View></Pressable>
            {error ? <Text style={{ color: colors.danger, fontSize: 12, lineHeight: 18 }}>{error}</Text> : null}
            <Pressable disabled={loading} onPress={submit} style={{ height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, opacity: loading ? 0.65 : 1 }}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>登录并连接</Text>}</Pressable>
          </View>
          <Text style={{ textAlign: 'center', color: '#8B98AA', fontSize: 11 }}>{Platform.OS === 'web' ? 'Web 端不持久化密码和 Admin Key。' : '勾选后凭据保存在设备安全存储中，不会上传到移动端项目。'}</Text>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field(props: { label: string; value: string; onChangeText: (v: string) => void; placeholder: string; keyboardType?: 'email-address' }) {
  const colors = useLoginColors();
  return <View style={{ gap: 7 }}><Text style={{ color: colors.sub, fontSize: 12 }}>{props.label}</Text><TextInput {...props} autoCapitalize="none" autoCorrect={false} placeholderTextColor="#98A2B3" style={{ backgroundColor: colors.soft, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 13, color: colors.text, fontSize: 15 }} /></View>;
}

function SecretField(props: { label: string; value: string; onChangeText: (v: string) => void; visible: boolean; onToggle: () => void; onFocus?: () => void }) {
  const colors = useLoginColors();
  return <View style={{ gap: 7 }}><Text style={{ color: colors.sub, fontSize: 12 }}>{props.label}</Text><View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.soft, borderRadius: 15, paddingRight: 12 }}><TextInput value={props.value} onChangeText={props.onChangeText} onFocus={props.onFocus} secureTextEntry={!props.visible} autoCapitalize="none" autoCorrect={false} placeholder="••••••••" placeholderTextColor="#98A2B3" returnKeyType="done" onSubmitEditing={Keyboard.dismiss} style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 13, color: colors.text, fontSize: 15 }} /><Pressable accessibilityLabel={props.visible ? '隐藏密码' : '显示密码'} hitSlop={10} onPress={props.onToggle}>{props.visible ? <EyeOff size={19} color={colors.sub} /> : <Eye size={19} color={colors.sub} />}</Pressable></View></View>;
}
