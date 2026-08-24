import { Activity, ChevronLeft, ChevronRight, ExternalLink, FileKey2, Gauge, Info, Layers3, LayoutDashboard, LogIn, Network, Plug, Repeat2, Rocket, Server, Settings2, Store } from 'lucide-react-native';
import { router, usePathname } from 'expo-router';
import { Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useUniwind } from 'uniwind';

import { Text } from '@/src/components/localized-text';
import { adminConfigState, hasAuthenticatedAdminSession } from '@/src/store/admin-config';
import { cliProxyConfigState } from '@/src/store/cliproxy-config';
import { setWorkspaceMode } from '@/src/store/workspace-mode';

const { useSnapshot } = require('valtio/react');

const sections = [
  { title: '运行', items: [
    { id: 'dashboard', title: '仪表盘', route: '/cliproxy', icon: LayoutDashboard },
    { id: 'quick-start', title: '快速开始', route: '/cliproxy-quick-start', icon: Rocket },
  ] },
  { title: '网关', items: [
    { id: 'providers', title: 'AI 提供商', route: '/cliproxy-providers', icon: Network },
    { id: 'auth-files', title: '认证文件', route: '/cliproxy-auth-files', icon: FileKey2 },
    { id: 'oauth', title: 'OAuth 登录', route: '/cliproxy-oauth', icon: LogIn },
    { id: 'groups', title: 'CLIProxy 分组', route: '/cliproxy-groups', icon: Layers3 },
  ] },
  { title: '观测', items: [
    { id: 'quotas', title: '配额管理', route: '/cliproxy-quotas', icon: Gauge },
    { id: 'observability', title: '日志查看', route: '/cliproxy-observability', icon: Activity },
  ] },
  { title: '控制', items: [
    { id: 'system', title: '配置面板', route: '/cliproxy-system', icon: Settings2 },
    { id: 'plugins', title: '插件管理', route: '/cliproxy-plugins', icon: Plug },
    { id: 'plugin-store', title: '插件商店', route: '/cliproxy-plugin-store', icon: Store },
    { id: 'hub', title: '中心信息', route: '/cliproxy-hub', icon: Server },
    { id: 'about', title: '关于应用', route: '/about', icon: Info },
  ] },
] as const;

export function CLIProxySidebar() {
  const path = usePathname();
  const config = useSnapshot(cliProxyConfigState);
  useSnapshot(adminConfigState);
  const { theme } = useUniwind();
  const [expanded, setExpanded] = useState(false);
  const dark = theme === 'dark';

  if (path === '/login' || !config.baseUrl) return null;

  const navigate = (route: string) => {
    setExpanded(false);
    router.replace(route as never);
  };

  const switchToSub2API = async () => {
    await setWorkspaceMode('sub2api');
    setExpanded(false);
    if (!hasAuthenticatedAdminSession(adminConfigState)) {
      router.replace('/login');
      return;
    }
    router.replace(adminConfigState.user?.role === 'user' ? '/api-keys' : '/monitor');
  };

  const openWebsite = () => {
    const url = config.baseUrl.trim().replace(/\/+$/, '');
    if (url) void Linking.openURL(`${url}/management.html`);
  };

  const menu = (showText: boolean) => sections.map((section) => (
    <View key={section.title} style={{ marginBottom: showText ? 8 : 2 }}>
      {showText ? <Text style={{ paddingHorizontal: 12, paddingVertical: 6, fontSize: 9, fontWeight: '700', color: dark ? '#6F7D91' : '#98A2B3' }}>{section.title}</Text> : null}
      {section.items.map((item) => {
        const Icon = item.icon;
        const active = path === item.route;
        return <Pressable key={item.id} accessibilityLabel={item.title} onPress={() => navigate(item.route)} style={{ minHeight: 46, marginBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: showText ? 'flex-start' : 'center', gap: 10, borderRadius: 13, backgroundColor: active ? (dark ? '#17345A' : '#E8F0FF') : 'transparent', paddingHorizontal: showText ? 12 : 0 }}><Icon size={19} color={active ? (dark ? '#69A0FF' : '#2F6DF6') : dark ? '#9EABC0' : '#607086'} />{showText ? <Text style={{ fontSize: 12, fontWeight: '800', color: active ? (dark ? '#8BB4FF' : '#2F6DF6') : dark ? '#D5DDEA' : '#475467' }}>{item.title}</Text> : null}</Pressable>;
      })}
    </View>
  ));

  return (
    <>
      <View style={{ width: 50, borderRightWidth: 1, borderRightColor: dark ? '#273449' : '#E1E8F2', backgroundColor: dark ? '#0F1726' : '#F7F9FD' }}>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
          <Pressable accessibilityLabel="展开 CLIProxy 菜单" onPress={() => setExpanded(true)} style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2F6DF6' }}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>CP</Text></View>
          </Pressable>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 5, paddingVertical: 4 }} showsVerticalScrollIndicator={false}>{menu(false)}</ScrollView>
          <View style={{ borderTopWidth: 1, borderTopColor: dark ? '#273449' : '#E1E8F2', paddingHorizontal: 5, paddingTop: 7 }}>
            <Pressable accessibilityLabel="切换到 Sub2API" onPress={() => void switchToSub2API()} style={{ height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13 }}><Repeat2 size={19} color="#2F6DF6" /></Pressable>
            <Pressable accessibilityLabel="展开 CLIProxy 菜单" onPress={() => setExpanded(true)} style={{ height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: dark ? '#172C55' : '#EAF2FF' }}><ChevronRight size={22} color={dark ? '#8BB4FF' : '#2F6DF6'} /></Pressable>
          </View>
        </SafeAreaView>
      </View>

      <Modal visible={expanded} transparent animationType="fade" onRequestClose={() => setExpanded(false)}>
        <Pressable onPress={() => setExpanded(false)} style={{ flex: 1, backgroundColor: 'rgba(5,10,20,.52)' }}>
          <Pressable onPress={(event) => event.stopPropagation()} style={{ width: '76%', maxWidth: 310, height: '100%', backgroundColor: dark ? '#0F1726' : '#F7F9FD' }}>
            <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
              <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: dark ? '#273449' : '#E1E8F2' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: dark ? '#F4F7FB' : '#172033' }}>CLIProxyAPI Mate</Text>
                  <Pressable accessibilityLabel="打开 CLIProxyAPI 管理页" onPress={openWebsite} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, backgroundColor: dark ? '#172C55' : '#EAF2FF', paddingHorizontal: 8, paddingVertical: 7 }}><ExternalLink size={13} color={dark ? '#8BB4FF' : '#2F6DF6'} /><Text style={{ fontSize: 9, fontWeight: '800', color: dark ? '#8BB4FF' : '#2F6DF6' }}>WEB</Text></Pressable>
                </View>
                <Text numberOfLines={2} style={{ marginTop: 7, fontSize: 10, lineHeight: 15, color: dark ? '#9EABC0' : '#738095' }}>{config.baseUrl}</Text>
              </View>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8 }} showsVerticalScrollIndicator={false}>{menu(true)}</ScrollView>
              <View style={{ borderTopWidth: 1, borderTopColor: dark ? '#273449' : '#E1E8F2', padding: 12, gap: 8 }}>
                <Pressable onPress={() => void switchToSub2API()} style={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13, backgroundColor: dark ? '#172C55' : '#EAF2FF' }}><Repeat2 size={17} color="#2F6DF6" /><Text style={{ color: '#2F6DF6', fontSize: 12, fontWeight: '800' }}>切换到 Sub2API</Text></Pressable>
                <Pressable onPress={() => setExpanded(false)} style={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13 }}><ChevronLeft size={20} color={dark ? '#9EABC0' : '#607086'} /><Text style={{ color: dark ? '#D5DDEA' : '#475467', fontSize: 12, fontWeight: '800' }}>收起菜单</Text></Pressable>
              </View>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
