import { useUniwind } from 'uniwind';

export function useUserManagementColors() {
  const { theme } = useUniwind();

  return theme === 'dark'
    ? {
        page: '#0B1220',
        card: '#111827',
        muted: '#182235',
        mutedCard: '#182235',
        border: '#273449',
        primary: '#2F6DF6',
        dark: '#2F6DF6',
        text: '#F4F7FB',
        subtext: '#9EABC0',
        danger: '#FF8293',
        dangerBg: '#3A1720',
        errorBg: '#3A1720',
        errorText: '#FF8293',
        accentBg: '#3B2B16',
        accentText: '#F4C15D',
      }
    : {
        page: '#F4F7FC',
        card: '#FFFFFF',
        muted: '#F1F5FA',
        mutedCard: '#F1F5FA',
        border: '#E2E9F3',
        primary: '#2F6DF6',
        dark: '#2F6DF6',
        text: '#172033',
        subtext: '#667085',
        danger: '#D9475C',
        dangerBg: '#FFF0F2',
        errorBg: '#FFF0F2',
        errorText: '#D9475C',
        accentBg: '#FFF7E7',
        accentText: '#8C5A22',
      };
}
