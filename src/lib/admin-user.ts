import type { AdminUser } from '@/src/types/admin';

export function getFirstCreatedAdmin(users: readonly AdminUser[]) {
  return [...users]
    .filter((user) => user.role?.toLowerCase() === 'admin')
    .sort((left, right) => {
      const leftTime = left.created_at ? Date.parse(left.created_at) : Number.NaN;
      const rightTime = right.created_at ? Date.parse(right.created_at) : Number.NaN;
      const timeDifference = (Number.isFinite(leftTime) ? leftTime : Number.MAX_SAFE_INTEGER) - (Number.isFinite(rightTime) ? rightTime : Number.MAX_SAFE_INTEGER);
      return timeDifference || left.id - right.id;
    })[0];
}
