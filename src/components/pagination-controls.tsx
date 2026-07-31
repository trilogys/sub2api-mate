import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { Text } from '@/src/components/localized-text';

export function PaginationControls({ page, pages, total, onChange }: { page: number; pages: number; total?: number; onChange: (page: number) => void }) {
  if (pages <= 1) return null;
  return (
    <View className="flex-row items-center justify-between rounded-2xl border border-[#E2E9F3] dark:border-[#273449] bg-[#FFFFFF] dark:bg-[#111827] px-3 py-2.5">
      <Pressable disabled={page <= 1} onPress={() => onChange(page - 1)} className={`h-9 w-9 items-center justify-center rounded-xl bg-[#E2E9F3] dark:bg-[#273449] ${page <= 1 ? 'opacity-40' : ''}`}><ChevronLeft size={18} color="#475467" /></Pressable>
      <Text className="text-xs font-semibold text-[#475467] dark:text-[#C2CCDB]">第 {page} / {pages} 页{total == null ? '' : ` · 共 ${total} 条`}</Text>
      <Pressable disabled={page >= pages} onPress={() => onChange(page + 1)} className={`h-9 w-9 items-center justify-center rounded-xl bg-[#E2E9F3] dark:bg-[#273449] ${page >= pages ? 'opacity-40' : ''}`}><ChevronRight size={18} color="#475467" /></Pressable>
    </View>
  );
}
