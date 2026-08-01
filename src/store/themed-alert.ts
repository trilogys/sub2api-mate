import type { AlertButton, AlertOptions } from 'react-native';

export type ThemedAlertRequest = {
  id: number;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  options?: AlertOptions;
};

type AlertPresenter = (request: ThemedAlertRequest) => void;

let nextId = 1;
let presenter: AlertPresenter | null = null;
let pending: ThemedAlertRequest[] = [];

export function showThemedAlert(request: Omit<ThemedAlertRequest, 'id'>) {
  const next = { ...request, id: nextId++ };
  if (presenter) presenter(next);
  else pending.push(next);
}

export function registerThemedAlertPresenter(nextPresenter: AlertPresenter) {
  presenter = nextPresenter;
  const queued = pending;
  pending = [];
  queued.forEach(nextPresenter);
  return () => {
    if (presenter === nextPresenter) presenter = null;
  };
}
