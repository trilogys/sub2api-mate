import { useEffect } from 'react';

import { markPerformance } from '@/src/lib/performance';

export function useScreenInteractive(
  name: 'login_interactive' | 'dashboard_interactive' | 'users_interactive' | 'monitor_interactive'
) {
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      markPerformance(name);
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [name]);
}
