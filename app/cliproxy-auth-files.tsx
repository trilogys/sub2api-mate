import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Download, FileJson, Pencil, Search, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { AdminButton, AdminField, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
import { Text, localizedAlert } from '@/src/components/localized-text';
import { ScreenShell } from '@/src/components/screen-shell';
import {
  deleteCLIProxyAuthFile,
  downloadCLIProxyAuthFile,
  importCLIProxyVertexCredential,
  listCLIProxyAuthFileModels,
  listCLIProxyAuthFiles,
  setCLIProxyAuthFileFields,
  uploadCLIProxyAuthFile,
} from '@/src/services/cliproxy';
import { cliProxyConfigState } from '@/src/store/cliproxy-config';
import { workspaceModeState } from '@/src/store/workspace-mode';
import type { CLIProxyAuthFile, CLIProxyConnection } from '@/src/types/cliproxy';

const { useSnapshot } = require('valtio/react');

async function readAssetText(asset: DocumentPicker.DocumentPickerAsset) {
  if (asset.file && typeof asset.file.text === 'function') return asset.file.text();
  return new File(asset.uri).text();
}

async function saveTextFile(name: string, content: string, mimeType: string) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return;
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('当前设备不支持系统文件分享。');
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true, intermediates: true });
  file.write(content);
  try {
    await Sharing.shareAsync(file.uri, { mimeType, UTI: mimeType === 'application/json' ? 'public.json' : 'public.text', dialogTitle: `保存或分享 ${name}` });
  } finally {
    if (file.exists) file.delete();
  }
}

function fileTitle(file: CLIProxyAuthFile) {
  return file.label || file.email || file.account || file.name;
}

function formatSize(value?: number) {
  if (!value) return '—';
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KiB`;
}

export default function CLIProxyAuthFilesScreen() {
  const queryClient = useQueryClient();
  const workspace = useSnapshot(workspaceModeState);
  const stored = useSnapshot(cliProxyConfigState);
  const connection = useMemo<CLIProxyConnection>(() => ({ baseUrl: stored.baseUrl, managementKey: stored.managementKey }), [stored.baseUrl, stored.managementKey]);
  const configured = workspace.mode === 'cliproxy' && Boolean(connection.baseUrl && connection.managementKey);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<CLIProxyAuthFile | null>(null);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [projectID, setProjectID] = useState('');
  const [modelsFor, setModelsFor] = useState('');
  const [vertexLocation, setVertexLocation] = useState('us-central1');

  const filesQuery = useQuery({
    queryKey: ['cliproxy', 'auth-files', stored.baseUrl, stored.revision],
    queryFn: () => listCLIProxyAuthFiles(connection),
    enabled: configured,
  });

  const filteredFiles = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return filesQuery.data ?? [];
    return (filesQuery.data ?? []).filter((file) => [file.name, file.label, file.email, file.account, file.provider, file.type]
      .some((value) => value?.toLowerCase().includes(needle)));
  }, [filesQuery.data, search]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/json', 'application/octet-stream'], copyToCacheDirectory: true, multiple: true });
      if (result.canceled) return 0;
      let uploaded = 0;
      for (const asset of result.assets) {
        if (!asset.name.toLowerCase().endsWith('.json')) throw new Error(`${asset.name} 不是 JSON 文件。`);
        await uploadCLIProxyAuthFile(connection, asset.name, await readAssetText(asset));
        uploaded += 1;
      }
      return uploaded;
    },
    onSuccess: async (count) => {
      if (!count) return;
      await queryClient.invalidateQueries({ queryKey: ['cliproxy'] });
      localizedAlert('导入成功', `已导入 ${count} 个 CLIProxy 凭据文件，运行时账号池已热更新。`);
    },
  });

  const vertexMutation = useMutation({
    mutationFn: async () => {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/json', 'application/octet-stream'], copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return undefined;
      const asset = result.assets[0];
      if (!asset) return undefined;
      const json = JSON.parse(await readAssetText(asset)) as { project_id?: unknown; private_key?: unknown };
      if (typeof json.project_id !== 'string' || typeof json.private_key !== 'string') throw new Error('Vertex 服务账号 JSON 缺少 project_id 或 private_key。');
      const upload = asset.file ?? { uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/json' };
      return importCLIProxyVertexCredential(connection, upload, vertexLocation);
    },
    onSuccess: async (result) => {
      if (!result) return;
      await queryClient.invalidateQueries({ queryKey: ['cliproxy'] });
      localizedAlert('Vertex 凭据已导入', `${result.project_id || '服务账号'} · ${result.location || vertexLocation}`);
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async (file: CLIProxyAuthFile) => {
      const content = await downloadCLIProxyAuthFile(connection, file.name);
      await saveTextFile(file.name, content, 'application/json');
      return file.name;
    },
    onSuccess: (name) => localizedAlert('导出成功', `已打开 ${name} 的系统保存/分享面板。`),
  });

  const deleteMutation = useMutation({
    mutationFn: (file: CLIProxyAuthFile) => deleteCLIProxyAuthFile(connection, file.name),
    onSuccess: async () => {
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['cliproxy'] });
    },
  });

  const modelsMutation = useMutation({
    mutationFn: async (file: CLIProxyAuthFile) => ({ file: file.name, models: await listCLIProxyAuthFileModels(connection, file.auth_index || file.id || file.name) }),
    onSuccess: ({ file }) => setModelsFor(file),
  });

  const editMutation = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error('未选择凭据。');
      return setCLIProxyAuthFileFields(connection, editing.auth_index || editing.id || editing.name, {
        label: label.trim(),
        note: note.trim(),
        project_id: projectID.trim(),
      });
    },
    onSuccess: async () => {
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['cliproxy', 'auth-files'] });
    },
  });

  const startEdit = (file: CLIProxyAuthFile) => {
    setEditing(file);
    setLabel(file.label || '');
    setNote(file.note || '');
    setProjectID(file.project_id || '');
    editMutation.reset();
  };

  if (workspace.mode !== 'cliproxy') return null;

  return (
    <>
      <LocalizedStackScreen options={{ title: 'CLIProxy 凭据', headerShown: true }} />
      <ScreenShell title="CLIProxy 凭据" subtitle="导入、导出、删除和检查单实例账号文件" safeAreaEdges={['bottom']} bottomInsetClassName="pb-10" refreshing={filesQuery.isRefetching} onRefresh={async () => { await filesQuery.refetch(); }}>
        <AdminSection title="凭据文件操作" detail="凭据文件只写入 CLIProxyAPI 的 auth-dir，不会进入 Sub2API。导出的 JSON 含敏感 Token，请仅保存到可信位置。">
          <View className="flex-row items-center gap-2 rounded-2xl border border-[#E2E9F3] bg-[#F6F8FC] px-3 dark:border-[#273449] dark:bg-[#152033]">
            <Search size={16} color="#7B8798" />
            <View className="flex-1"><AdminField label="搜索" value={search} onChangeText={setSearch} placeholder="名称、邮箱、提供商" /></View>
          </View>
          <AdminButton label="导入凭据 JSON" pending={uploadMutation.isPending} disabled={!configured} onPress={() => uploadMutation.mutate()} />
          <View className="flex-row gap-2">
            <View className="flex-1"><AdminField label="Vertex Location" value={vertexLocation} onChangeText={setVertexLocation} autoCapitalize="none" placeholder="us-central1" /></View>
            <View className="flex-1 justify-end"><AdminButton label="导入账号" pending={vertexMutation.isPending} disabled={!configured} tone="muted" onPress={() => vertexMutation.mutate()} /></View>
          </View>
          <Text className="text-[10px] leading-5 text-[#946321] dark:text-[#FFD66B]">同名文件可能被上游覆盖；OAuth 凭据优先使用授权流程创建，手工 JSON 适合迁移和备份恢复。</Text>
          <AdminMessage error={filesQuery.error || uploadMutation.error || vertexMutation.error || downloadMutation.error || deleteMutation.error || modelsMutation.error} />
        </AdminSection>

        {editing ? (
          <AdminSection title={`编辑元数据 · ${editing.name}`} detail="只更新 CLIProxy 凭据元数据；分组路由所需的统一优先级不会在这里修改。">
            <AdminField label="显示名称" value={label} onChangeText={setLabel} placeholder="例如：Codex 主账号" />
            <AdminField label="备注" value={note} onChangeText={setNote} placeholder="账号用途" />
            <AdminField label="Project ID" value={projectID} onChangeText={setProjectID} autoCapitalize="none" placeholder="可选" />
            <View className="flex-row gap-2">
              <View className="flex-1"><AdminButton label="保存元数据" pending={editMutation.isPending} onPress={() => editMutation.mutate()} /></View>
              <View className="flex-1"><AdminButton label="取消" tone="muted" onPress={() => setEditing(null)} /></View>
            </View>
            <AdminMessage error={editMutation.error} />
          </AdminSection>
        ) : null}

        <AdminSection title="账号文件列表" detail={`${filteredFiles.length}/${filesQuery.data?.length ?? 0} 个凭据；runtime-only 凭据由外部存储提供，不能通过文件接口导出或删除。`}>
          {filesQuery.isLoading ? <Text className="text-xs text-[#98A2B3]">正在读取凭据…</Text> : null}
          {!filesQuery.isLoading && !filteredFiles.length ? <EmptyState label="没有匹配的 CLIProxy 凭据" /> : null}
          {filteredFiles.map((file) => {
            const canManageFile = !file.runtime_only && file.source !== 'memory' && file.name.toLowerCase().endsWith('.json');
            const modelResult = modelsMutation.data?.file === file.name ? modelsMutation.data.models : [];
            return (
              <View key={file.auth_index || file.id || file.name} className="gap-3 rounded-2xl border border-[#E2E9F3] bg-[#F8FAFD] p-3 dark:border-[#273449] dark:bg-[#152033]">
                <View className="flex-row items-start gap-3">
                  <View className="h-9 w-9 items-center justify-center rounded-xl bg-[#EAF2FF] dark:bg-[#172C55]"><FileJson size={18} color="#2F6DF6" /></View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-[#172033] dark:text-[#F4F7FB]">{fileTitle(file)}</Text>
                    <Text selectable className="mt-1 text-[10px] leading-4 text-[#6B778C] dark:text-[#9EABC0]">{file.name}</Text>
                    <Text className="mt-1 text-[10px] text-[#6B778C] dark:text-[#9EABC0]">{file.provider || file.type || 'unknown'} · {file.runtime_only ? 'runtime-only' : 'file'} · {formatSize(file.size)} · {file.disabled ? '已停用' : file.unavailable ? '不可用' : file.status || '正常'}</Text>
                    {file.note ? <Text className="mt-1 text-[10px] text-[#7B8798] dark:text-[#9EABC0]">备注：{file.note}</Text> : null}
                  </View>
                </View>
                {modelsFor === file.name && modelsMutation.data?.file === file.name ? (
                  <View className="rounded-xl bg-white p-3 dark:bg-[#111827]">
                    <Text className="text-[10px] font-bold text-[#475467] dark:text-[#C2CCDB]">支持模型（{modelResult.length}）</Text>
                    <Text selectable className="mt-1 text-[10px] leading-5 text-[#6B778C] dark:text-[#9EABC0]">{modelResult.map((model) => model.id).join(' · ') || '上游未返回模型'}</Text>
                  </View>
                ) : null}
                <View className="flex-row flex-wrap gap-2">
                  <Pressable onPress={() => startEdit(file)} className="flex-row items-center gap-1 rounded-xl bg-[#EAF2FF] px-3 py-2.5 dark:bg-[#172C55]"><Pencil size={13} color="#2F6DF6" /><Text className="text-[10px] font-bold text-[#2F6DF6]">元数据</Text></Pressable>
                  <Pressable disabled={modelsMutation.isPending} onPress={() => modelsMutation.mutate(file)} className="flex-row items-center gap-1 rounded-xl bg-[#EAF2FF] px-3 py-2.5 disabled:opacity-50 dark:bg-[#172C55]"><Search size={13} color="#2F6DF6" /><Text className="text-[10px] font-bold text-[#2F6DF6]">模型</Text></Pressable>
                  <Pressable disabled={!canManageFile || downloadMutation.isPending} onPress={() => localizedAlert('导出敏感凭据？', `${file.name} 包含可用 Token，请仅保存到可信位置。`, [{ text: '取消', style: 'cancel' }, { text: '继续导出', onPress: () => downloadMutation.mutate(file) }])} className="flex-row items-center gap-1 rounded-xl bg-[#EAF2FF] px-3 py-2.5 disabled:opacity-35 dark:bg-[#172C55]"><Download size={13} color="#2F6DF6" /><Text className="text-[10px] font-bold text-[#2F6DF6]">导出</Text></Pressable>
                  <Pressable disabled={!canManageFile || deleteMutation.isPending} onPress={() => localizedAlert('删除 CLIProxy 凭据？', `将从 CLIProxyAPI 磁盘和运行时移除 ${file.name}。该操作不能撤销。`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => deleteMutation.mutate(file) }])} className="flex-row items-center gap-1 rounded-xl bg-[#FFF0F2] px-3 py-2.5 disabled:opacity-35 dark:bg-[#3A1720]"><Trash2 size={13} color="#D9475C" /><Text className="text-[10px] font-bold text-[#D9475C]">删除</Text></Pressable>
                </View>
              </View>
            );
          })}
        </AdminSection>
      </ScreenShell>
    </>
  );
}
