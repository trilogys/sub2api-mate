import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { deleteUser, getUser, updateUser } from '@/src/services/admin';
import type { UpdateUserRequest } from '@/src/types/admin';
import { Text, TextInput, localizedAlert } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
import { useUserManagementColors } from '@/src/components/user-management-ui';

function Field({ label, value, onChangeText, secureTextEntry = false, keyboardType = 'default', multiline = false }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'number-pad';
  multiline?: boolean;
}) {
  const colors = useUserManagementColors();
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize="none"
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={{ minHeight: multiline ? 80 : undefined, backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, color: colors.text }}
      />
    </View>
  );
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const colors = useUserManagementColors();
  return (
    <Pressable onPress={onPress} style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.muted, paddingVertical: 11, alignItems: 'center' }}>
      <Text style={{ color: active ? '#fff' : colors.text, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function optionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function EditUserScreen() {
  const colors = useUserManagementColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = Number(id);
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [notes, setNotes] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [status, setStatus] = useState<'active' | 'disabled'>('active');
  const [concurrency, setConcurrency] = useState('');
  const [rpmLimit, setRpmLimit] = useState('');
  const [error, setError] = useState('');

  const userQuery = useQuery({ queryKey: ['user', userId], queryFn: () => getUser(userId), enabled: Number.isFinite(userId) });

  useEffect(() => {
    const user = userQuery.data;
    if (!user) return;
    setEmail(user.email ?? '');
    setUsername(user.username ?? '');
    setNotes(user.notes ?? '');
    setRole(user.role === 'admin' ? 'admin' : 'user');
    setStatus(user.status === 'disabled' ? 'disabled' : 'active');
    setConcurrency(user.concurrency == null ? '' : String(user.concurrency));
    setRpmLimit(user.rpm_limit == null ? '' : String(user.rpm_limit));
  }, [userQuery.data]);

  const payload = useMemo<UpdateUserRequest>(() => ({
    email: email.trim(),
    username: username.trim(),
    notes: notes.trim(),
    password: password.trim() || undefined,
    role,
    status,
    concurrency: optionalNumber(concurrency),
    rpm_limit: optionalNumber(rpmLimit),
  }), [concurrency, email, notes, password, role, rpmLimit, status, username]);

  const saveMutation = useMutation({
    mutationFn: () => updateUser(userId, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['user', userId] }),
        queryClient.invalidateQueries({ queryKey: ['users'] }),
      ]);
      router.replace(`/users/${userId}`);
    },
    onError: (value) => setError(value instanceof Error ? value.message : '保存用户失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteUser(userId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      router.replace('/(tabs)/users');
    },
    onError: (value) => setError(value instanceof Error ? value.message : '删除用户失败'),
  });

  const busy = saveMutation.isPending || deleteMutation.isPending;

  return (
    <>
      <LocalizedStackScreen options={{ title: '编辑用户', headerShown: true }} />
      <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.page }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 22, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
            <Field label="邮箱" value={email} onChangeText={setEmail} keyboardType="email-address" />
            <Field label="用户名" value={username} onChangeText={setUsername} />
            <Field label="备注" value={notes} onChangeText={setNotes} multiline />
            <Field label="新密码（留空不修改）" value={password} onChangeText={setPassword} secureTextEntry />
            <Field label="并发上限" value={concurrency} onChangeText={setConcurrency} keyboardType="number-pad" />
            <Field label="RPM 上限" value={rpmLimit} onChangeText={setRpmLimit} keyboardType="number-pad" />

            <Text style={{ marginBottom: 8, fontSize: 12, color: colors.subtext }}>角色</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <Choice label="普通用户" active={role === 'user'} onPress={() => setRole('user')} />
              <Choice label="管理员" active={role === 'admin'} onPress={() => setRole('admin')} />
            </View>

            <Text style={{ marginBottom: 8, fontSize: 12, color: colors.subtext }}>状态</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Choice label="启用" active={status === 'active'} onPress={() => setStatus('active')} />
              <Choice label="禁用" active={status === 'disabled'} onPress={() => setStatus('disabled')} />
            </View>
          </View>

          {error || userQuery.error ? (
            <View style={{ marginTop: 12, borderRadius: 12, backgroundColor: colors.errorBg, padding: 12 }}>
              <Text style={{ color: colors.danger }}>{error || (userQuery.error as Error)?.message}</Text>
            </View>
          ) : null}

          <Pressable disabled={!email.trim() || busy} onPress={() => { setError(''); saveMutation.mutate(); }} style={{ marginTop: 14, borderRadius: 12, backgroundColor: !email.trim() || busy ? '#7C8AA0' : colors.primary, paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{saveMutation.isPending ? '保存中…' : '保存用户'}</Text>
          </Pressable>

          <Pressable
            disabled={busy || userQuery.data?.role === 'admin'}
            onPress={() => localizedAlert('删除用户', `确定删除“${email}”吗？`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => deleteMutation.mutate() }])}
            style={{ marginTop: 10, borderRadius: 12, backgroundColor: colors.errorBg, paddingVertical: 13, alignItems: 'center', opacity: userQuery.data?.role === 'admin' ? 0.5 : 1 }}
          >
            <Text style={{ color: colors.danger, fontWeight: '700' }}>删除用户</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
