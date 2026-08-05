import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { AdminButton, AdminChip, AdminField, AdminMessage, AdminSection, EmptyState } from '@/src/components/admin-ui';
import { ListCard } from '@/src/components/list-card';
import { Text, TextInput, localizedAlert } from '@/src/components/localized-text';
import { LocalizedStackScreen } from '@/src/components/localized-navigation';
import { PaginationControls } from '@/src/components/pagination-controls';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { listPaymentOrders, queryPaymentRefund, refundPaymentOrder } from '@/src/services/admin';
import type { PaymentOrder } from '@/src/types/admin';

const statuses = ['ALL', 'PENDING', 'PAID', 'RECHARGING', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'FAILED', 'REFUND_REQUESTED', 'REFUNDING', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REFUND_FAILED'] as const;
const refundableStatuses: PaymentOrder['status'][] = ['COMPLETED', 'REFUND_REQUESTED', 'PARTIALLY_REFUNDED', 'REFUND_FAILED'];
const queryableRefundStatuses: PaymentOrder['status'][] = ['REFUNDING', 'REFUND_PENDING', 'REFUND_FAILED'];

function money(value: number, currency = 'USD') {
  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

export default function PaymentOrdersScreen() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<(typeof statuses)[number]>('ALL');
  const [search, setSearch] = useState('');
  const keyword = useDebouncedValue(search.trim(), 300);
  const [refundTarget, setRefundTarget] = useState<PaymentOrder | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [deductBalance, setDeductBalance] = useState(true);

  const ordersQuery = useQuery({
    queryKey: ['payment-orders', page, status, keyword],
    queryFn: () => listPaymentOrders({ page, status: status === 'ALL' ? undefined : status, keyword: keyword || undefined }),
  });

  const closeRefund = () => {
    setRefundTarget(null);
    setRefundAmount('');
    setRefundReason('');
    setDeductBalance(true);
  };
  const openRefund = (order: PaymentOrder) => {
    setRefundTarget(order);
    setRefundAmount(String(Math.max(0, Number(order.pay_amount || order.amount) - Number(order.refund_amount || 0)).toFixed(2)));
    setRefundReason('');
    setDeductBalance(true);
  };

  const refundMutation = useMutation({
    mutationFn: ({ force }: { force: boolean }) => refundPaymentOrder(refundTarget!.id, {
      amount: Number(refundAmount),
      reason: refundReason.trim(),
      deduct_balance: deductBalance,
      force,
    }),
    onSuccess: async (result, variables) => {
      if (result.require_force && !variables.force) {
        localizedAlert('需要强制确认', result.warning || '用户余额不足，继续退款可能产生负余额。', [
          { text: '取消', style: 'cancel' },
          { text: '强制退款', style: 'destructive', onPress: () => refundMutation.mutate({ force: true }) },
        ]);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['payment-orders'] });
      const details = [result.warning, result.balance_deducted != null ? `余额扣减：${result.balance_deducted.toFixed(2)}` : '', result.subscription_days_deducted != null ? `订阅扣减：${result.subscription_days_deducted} 天` : ''].filter(Boolean).join('\n');
      localizedAlert('退款处理完成', details || '订单退款状态已更新。');
      closeRefund();
    },
    onError: (error) => localizedAlert('退款失败', error instanceof Error ? error.message : '请稍后重试。'),
  });

  const queryRefundMutation = useMutation({
    mutationFn: (id: number) => queryPaymentRefund(id),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['payment-orders'] });
      localizedAlert('退款状态已更新', result.warning || (result.success ? '退款已完成。' : '退款仍在处理中。'));
    },
    onError: (error) => localizedAlert('查询失败', error instanceof Error ? error.message : '请稍后重试。'),
  });

  const canSubmitRefund = Boolean(refundTarget && Number(refundAmount) > 0 && refundReason.trim());

  return (
    <>
      <LocalizedStackScreen options={{ title: '支付订单', headerShown: true }} />
      <ScreenShell title="支付订单" subtitle={`${ordersQuery.data?.total ?? 0} 条订单`} refreshing={ordersQuery.isRefetching} onRefresh={() => ordersQuery.refetch().then(() => undefined)} bottomInsetClassName="pb-8" safeAreaEdges={['bottom']}>
        <AdminSection title="检索订单" detail="支持订单号、用户和支付状态筛选。">
          <View className="flex-row items-center rounded-2xl bg-[#F6F8FC] px-4 dark:bg-[#152033]">
            <Search size={17} color="#7C8AA0" />
            <TextInput value={search} onChangeText={(value) => { setSearch(value); setPage(1); }} placeholder="订单号 / 用户" placeholderTextColor="#98A2B3" className="min-h-11 flex-1 px-3 text-sm text-[#172033] dark:text-[#F4F7FB]" />
          </View>
          <View className="flex-row flex-wrap gap-2">
            {statuses.map((value) => <AdminChip key={value} label={value === 'ALL' ? '全部' : value} selected={status === value} onPress={() => { setStatus(value); setPage(1); }} />)}
          </View>
        </AdminSection>

        <AdminMessage error={ordersQuery.error} />
        {ordersQuery.data?.items.map((order) => (
          <ListCard key={order.id} title={`订单 #${order.id}`} meta={`${order.out_trade_no} · 用户 #${order.user_id}`} badge={order.status} badgeTone={order.status === 'COMPLETED' ? 'success' : order.status.includes('FAILED') ? 'danger' : 'muted'}>
            <View className="mt-2 flex-row flex-wrap gap-2">
              <View className="min-w-[30%] flex-1 rounded-xl bg-[#F6F8FC] p-3 dark:bg-[#152033]"><Text className="text-[10px] text-[#7C8AA0]">支付金额</Text><Text className="mt-1 text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{money(order.pay_amount, order.currency)}</Text></View>
              <View className="min-w-[30%] flex-1 rounded-xl bg-[#F6F8FC] p-3 dark:bg-[#152033]"><Text className="text-[10px] text-[#7C8AA0]">已退款</Text><Text className="mt-1 text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{money(order.refund_amount, order.currency)}</Text></View>
              <View className="min-w-[30%] flex-1 rounded-xl bg-[#F6F8FC] p-3 dark:bg-[#152033]"><Text className="text-[10px] text-[#7C8AA0]">类型</Text><Text className="mt-1 text-xs font-bold text-[#172033] dark:text-[#F4F7FB]">{order.order_type} · {order.payment_type}</Text></View>
            </View>
            <Text className="mt-3 text-[11px] text-[#7C8AA0] dark:text-[#9EABC0]">{new Date(order.created_at).toLocaleString()}</Text>
            <View className="mt-3 flex-row flex-wrap gap-2">
              {refundableStatuses.includes(order.status) ? <AdminButton label="退款" tone="danger" onPress={() => openRefund(order)} /> : null}
              {queryableRefundStatuses.includes(order.status) ? <AdminButton label="查询退款" tone="muted" pending={queryRefundMutation.isPending && queryRefundMutation.variables === order.id} onPress={() => queryRefundMutation.mutate(order.id)} /> : null}
            </View>
          </ListCard>
        ))}
        {!ordersQuery.isLoading && !ordersQuery.data?.items.length ? <EmptyState label="暂无支付订单" /> : null}
        <PaginationControls page={page} pages={ordersQuery.data?.pages ?? 1} total={ordersQuery.data?.total} onChange={setPage} />
      </ScreenShell>

      <Modal visible={Boolean(refundTarget)} transparent animationType="fade" onRequestClose={closeRefund}>
        <View className="flex-1 justify-center bg-black/35 px-5 py-10">
          <View className="w-full max-w-[520px] self-center rounded-[24px] border border-[#E2E9F3] bg-white p-5 dark:border-[#273449] dark:bg-[#111827]">
            <View className="flex-row items-center gap-3"><Text className="flex-1 text-lg font-bold text-[#172033] dark:text-[#F4F7FB]">订单退款</Text><Pressable hitSlop={10} onPress={closeRefund}><X size={20} color="#667085" /></Pressable></View>
            <Text className="mt-1 text-xs text-[#667085] dark:text-[#9EABC0]">订单 #{refundTarget?.id} · 最多 {money(Math.max(0, Number(refundTarget?.pay_amount || 0) - Number(refundTarget?.refund_amount || 0)), refundTarget?.currency)}</Text>
            <View className="mt-4 gap-3">
              <AdminField label="退款金额" value={refundAmount} onChangeText={setRefundAmount} keyboardType="decimal-pad" />
              <AdminField label="退款原因" value={refundReason} onChangeText={setRefundReason} multiline placeholder="请填写退款原因" />
              <AdminChip label="同时扣减用户余额/订阅" selected={deductBalance} onPress={() => setDeductBalance((value) => !value)} />
              <Text className="text-[11px] leading-5 text-[#B7791F] dark:text-[#F4C15D]">余额不足时，服务端会要求二次强制确认；App 不会自动强制退款。</Text>
              <AdminButton label="提交退款" tone="danger" pending={refundMutation.isPending} disabled={!canSubmitRefund} onPress={() => refundMutation.mutate({ force: false })} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
