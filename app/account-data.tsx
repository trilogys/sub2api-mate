import { useMutation } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { FileDown, FileJson, FileUp, ShieldAlert } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, Switch, View } from 'react-native';

import { AdminButton, AdminMessage, AdminSection } from '@/src/components/admin-ui';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
import { Text, localizedAlert } from '@/src/components/localized-text';
import { ScreenShell } from '@/src/components/screen-shell';
import { queryClient } from '@/src/lib/query-client';
import { exportAccountData, importAccountData } from '@/src/services/admin';
import { isAdminSession } from '@/src/store/admin-config';
import { languageState } from '@/src/store/ui-preferences';
import type { AdminDataImportResult, AdminDataPayload } from '@/src/types/admin';

const { useSnapshot } = require('valtio/react');

const SUPPORTED_DATA_TYPES = ['sub2api-data', 'sub2api-bundle'];
const SUPPORTED_DATA_VERSION = 1;

type PendingImport = {
  fileNames: string[];
  payload: AdminDataPayload;
};

function formatExportTimestamp() {
  const now = new Date();
  const pad2 = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
}

function isJsonAsset(asset: DocumentPicker.DocumentPickerAsset) {
  const name = asset.name.toLowerCase();
  return name.endsWith('.json') || asset.mimeType === 'application/json' || asset.mimeType === 'text/json';
}

function isValidDataPayload(payload: unknown): payload is AdminDataPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const candidate = payload as Record<string, unknown>;
  if (
    candidate.type !== undefined
    && candidate.type !== ''
    && !SUPPORTED_DATA_TYPES.includes(candidate.type as string)
  ) return false;
  if (
    candidate.version !== undefined
    && candidate.version !== 0
    && candidate.version !== SUPPORTED_DATA_VERSION
  ) return false;
  return Array.isArray(candidate.proxies) && Array.isArray(candidate.accounts);
}

function mergeDataPayloads(payloads: AdminDataPayload[]): AdminDataPayload {
  const [firstPayload] = payloads;
  if (payloads.length === 1 && firstPayload) return firstPayload;
  return {
    type: payloads.find((item) => typeof item.type === 'string')?.type,
    version: payloads.find((item) => typeof item.version === 'number')?.version,
    exported_at: new Date().toISOString(),
    proxies: payloads.flatMap((item) => item.proxies),
    accounts: payloads.flatMap((item) => item.accounts),
    skipped_shadows: payloads.reduce((sum, item) => {
      const count = Number(item.skipped_shadows || 0);
      return Number.isFinite(count) ? sum + count : sum;
    }, 0),
  };
}

async function readAssetText(asset: DocumentPicker.DocumentPickerAsset) {
  if (asset.file && typeof asset.file.text === 'function') return asset.file.text();
  return new File(asset.uri).text();
}

async function saveJsonFile(payload: AdminDataPayload) {
  const filename = `sub2api-account-${formatExportTimestamp()}.json`;
  const content = JSON.stringify(payload, null, 2);
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return filename;
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('当前设备不支持系统文件分享');
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true, intermediates: true });
  file.write(content);
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: '保存或分享账号 JSON',
    });
  } finally {
    if (file.exists) file.delete();
  }
  return filename;
}

function resultSummary(result: AdminDataImportResult, language: 'zh' | 'en') {
  return language === 'en'
    ? `Accounts: ${result.account_created} created, ${result.account_failed} failed\nProxies: ${result.proxy_created} created, ${result.proxy_reused} reused, ${result.proxy_failed} failed`
    : `账号：成功 ${result.account_created}，失败 ${result.account_failed}\n代理：新建 ${result.proxy_created}，复用 ${result.proxy_reused}，失败 ${result.proxy_failed}`;
}

export default function AccountDataScreen() {
  const admin = isAdminSession();
  const language = useSnapshot(languageState).value as 'zh' | 'en';
  const [includeProxies, setIncludeProxies] = useState(true);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [importResult, setImportResult] = useState<AdminDataImportResult | null>(null);
  const [exportSuccess, setExportSuccess] = useState('');

  const exportMutation = useMutation({
    mutationFn: async () => {
      const payload = await exportAccountData(includeProxies);
      const filename = await saveJsonFile(payload);
      return { payload, filename };
    },
    onSuccess: ({ payload, filename }) => {
      const skipped = Number(payload.skipped_shadows || 0);
      setExportSuccess(language === 'en' ? `Generated ${filename}` : `已生成 ${filename}`);
      localizedAlert(
        skipped > 0 ? '导出完成，有账号被跳过' : '导出成功',
        skipped > 0
          ? language === 'en'
            ? `The save/share sheet is open. The server skipped ${skipped} Spark shadow accounts according to the official rule.`
            : `已打开系统保存/分享面板。服务端按官方规则跳过了 ${skipped} 个 Spark 影子账号。`
          : '已打开系统保存/分享面板。请将 JSON 文件保存到可信位置。',
      );
    },
  });

  const importMutation = useMutation({
    mutationFn: () => {
      if (!pendingImport) throw new Error('请先选择账号 JSON 文件');
      return importAccountData(pendingImport.payload);
    },
    onSuccess: async (result) => {
      setImportResult(result);
      setPendingImport(null);
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      const hasFailures = result.account_failed > 0 || result.proxy_failed > 0;
      localizedAlert(hasFailures ? '导入完成，但有失败' : '导入成功', resultSummary(result, language));
    },
  });

  const pickImportFiles = async () => {
    importMutation.reset();
    setImportResult(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/json', 'application/octet-stream'],
        copyToCacheDirectory: true,
        multiple: true,
        base64: false,
      });
      if (picked.canceled) return;
      const assets = picked.assets.filter(isJsonAsset);
      const ignored = picked.assets.length - assets.length;
      if (!assets.length) throw new Error('请选择 JSON 文件');
      const payloads: AdminDataPayload[] = [];
      for (const asset of assets) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(await readAssetText(asset));
        } catch {
          throw new Error(language === 'en' ? `${asset.name} is not valid JSON` : `${asset.name} 不是有效的 JSON 文件`);
        }
        if (!isValidDataPayload(parsed)) {
          throw new Error(language === 'en' ? `${asset.name} is not a supported Sub2API account data file` : `${asset.name} 不是受支持的 Sub2API 账号数据文件`);
        }
        payloads.push(parsed);
      }
      setPendingImport({ fileNames: assets.map((asset) => asset.name), payload: mergeDataPayloads(payloads) });
      if (ignored > 0) localizedAlert('已忽略非 JSON 文件', language === 'en' ? `${ignored} unsupported files were ignored.` : `共忽略 ${ignored} 个不支持的文件。`);
    } catch (error) {
      localizedAlert('选择文件失败', error instanceof Error ? error.message : String(error));
    }
  };

  const requestExport = () => {
    setExportSuccess('');
    localizedAlert(
      '导出账号数据？',
      language === 'en'
        ? `This exports every account credential${includeProxies ? ' and linked proxy passwords' : ''}. Sensitive data in the file is not encrypted. Save it only in a trusted location.`
        : `将导出全部账号凭据${includeProxies ? '和关联代理密码' : ''}。文件中的敏感信息未加密，请仅保存到可信位置。`,
      [
        { text: '取消', style: 'cancel' },
        { text: '继续导出', onPress: () => exportMutation.mutate() },
      ],
    );
  };

  const requestImport = () => {
    if (!pendingImport) return;
    localizedAlert(
      '确认导入账号数据？',
      language === 'en'
        ? `Import ${pendingImport.payload.accounts.length} accounts and ${pendingImport.payload.proxies.length} proxies. The server may partially succeed, and created data is not rolled back automatically.`
        : `即将导入 ${pendingImport.payload.accounts.length} 个账号和 ${pendingImport.payload.proxies.length} 个代理。服务端可能部分成功，已创建的数据不会自动回滚。`,
      [
        { text: '取消', style: 'cancel' },
        { text: '确认导入', onPress: () => importMutation.mutate() },
      ],
    );
  };

  return (
    <>
      <LocalizedStackScreen options={{ title: '账号操作', headerShown: true }} />
      <ScreenShell title="账号操作" subtitle="导入和导出 Sub2API 官方兼容的账号 JSON 数据" bottomInsetClassName="pb-10" safeAreaEdges={['bottom']}>
        {!admin ? (
          <AdminSection title="需要管理员权限" detail="普通用户不能读取或导入服务端账号凭据。">
            <AdminButton label="返回更多管理" tone="muted" onPress={() => router.replace('/manage')} />
          </AdminSection>
        ) : (
          <>
            <View className="flex-row items-start gap-3 rounded-[18px] border border-[#F4D594] bg-[#FFF8E8] p-4 dark:border-[#6A4C1F] dark:bg-[#332611]">
              <ShieldAlert size={21} color="#D88A18" />
              <View className="flex-1">
                <Text className="text-sm font-bold text-[#8A5A16] dark:text-[#FFD071]">敏感数据</Text>
                <Text className="mt-1 text-xs leading-5 text-[#8A641F] dark:text-[#E8C985]">导出的 JSON 包含账号凭据，选择包含代理时还可能包含代理密码。请勿发送到不可信设备、群聊或网盘。</Text>
              </View>
            </View>

            <AdminSection title="导出账号" detail="从当前服务器导出全部账号，文件结构与 Sub2API Web 管理端一致。">
              <View className="flex-row items-center gap-3 rounded-2xl bg-[#F4F7FC] p-3 dark:bg-[#182235]">
                <View className="h-10 w-10 items-center justify-center rounded-xl bg-[#EAF2FF] dark:bg-[#172C55]">
                  <FileDown size={19} color="#2F6DF6" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-bold text-[#172033] dark:text-[#F4F7FB]">包含关联代理</Text>
                  <Text className="mt-1 text-[11px] leading-4 text-[#6B778C] dark:text-[#9EABC0]">默认开启；关闭后请求会携带 include_proxies=false。</Text>
                </View>
                <Switch value={includeProxies} onValueChange={setIncludeProxies} trackColor={{ false: '#CDD7E5', true: '#8DB5FF' }} thumbColor={includeProxies ? '#2F6DF6' : '#FFFFFF'} />
              </View>
              <AdminButton label="导出 JSON" pending={exportMutation.isPending} onPress={requestExport} />
              <AdminMessage error={exportMutation.error} success={exportSuccess || undefined} />
              <Text className="text-[10px] leading-4 text-[#7B8798] dark:text-[#9EABC0]">官方规则会排除不持有独立凭据的 Spark 影子账号，并在导出完成后显示跳过数量。</Text>
            </AdminSection>

            <AdminSection title="导入账号" detail="支持选择一个或多个官方 JSON 文件；多文件会在本地校验后合并导入。">
              <Pressable onPress={() => void pickImportFiles()} className="flex-row items-center gap-3 rounded-2xl border border-dashed border-[#AFC7EA] bg-[#F7FAFF] p-4 dark:border-[#385986] dark:bg-[#132035]">
                <View className="h-10 w-10 items-center justify-center rounded-xl bg-[#E8F7F0] dark:bg-[#15392B]">
                  <FileUp size={19} color="#23885A" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-bold text-[#172033] dark:text-[#F4F7FB]">选择 JSON 文件</Text>
                  <Text className="mt-1 text-[11px] text-[#6B778C] dark:text-[#9EABC0]">校验 type、version、accounts 和 proxies</Text>
                </View>
                <FileJson size={19} color="#2F6DF6" />
              </Pressable>

              {pendingImport ? (
                <View className="gap-2 rounded-2xl bg-[#F4F7FC] p-4 dark:bg-[#182235]">
                  <Text numberOfLines={2} className="text-xs font-bold text-[#315B9C] dark:text-[#AFC9F7]">{pendingImport.fileNames.join('、')}</Text>
                  <Text className="text-xs leading-5 text-[#56647A] dark:text-[#B6C1D1]">{language === 'en' ? `Accounts ${pendingImport.payload.accounts.length} · Proxies ${pendingImport.payload.proxies.length} · Files ${pendingImport.fileNames.length}` : `账号 ${pendingImport.payload.accounts.length} · 代理 ${pendingImport.payload.proxies.length} · 文件 ${pendingImport.fileNames.length}`}</Text>
                  <Text className="text-[10px] leading-4 text-[#7B8798] dark:text-[#9EABC0]">按官方逻辑跳过默认分组自动绑定（skip_default_group_bind=true）。</Text>
                </View>
              ) : null}

              <AdminButton label="确认导入" pending={importMutation.isPending} disabled={!pendingImport} onPress={requestImport} />
              <AdminMessage error={importMutation.error} />
            </AdminSection>

            {importResult ? (
              <AdminSection title="导入结果" detail={resultSummary(importResult, language)}>
                {(importResult.errors ?? []).map((item, index) => (
                  <View key={`${item.kind}-${item.name || item.proxy_key || index}-${index}`} className="rounded-2xl bg-[#FFF0F3] p-3 dark:bg-[#3A1720]">
                    <Text className="text-xs font-bold text-[#D9475C]">{item.kind === 'account' ? '账号' : '代理'} · {item.name || item.proxy_key || '-'}</Text>
                    <Text className="mt-1 text-[11px] leading-4 text-[#9B3143] dark:text-[#FF9CAB]">{item.message}</Text>
                  </View>
                ))}
              </AdminSection>
            ) : null}

            <Text className="px-1 text-[10px] leading-4 text-[#7B8798] dark:text-[#9EABC0]">若服务器启用了 Step-up，导出可能要求额外验证；Admin Key 模式可能被服务端拒绝，请按服务器安全策略使用管理员邮箱登录。</Text>
          </>
        )}
      </ScreenShell>
    </>
  );
}
