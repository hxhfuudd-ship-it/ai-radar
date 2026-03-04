export interface ScanStatus {
  running: boolean;
  phase: 'idle' | 'scouting' | 'fetching' | 'analyzing' | 'done' | 'error';
  total: number;
  completed: number;
  current: string;
  error: string;
  startedAt: number;
  finishedAt: number;
}

const state: ScanStatus = {
  running: false,
  phase: 'idle',
  total: 0,
  completed: 0,
  current: '',
  error: '',
  startedAt: 0,
  finishedAt: 0,
};

export function getScanStatus(): Readonly<ScanStatus> {
  return { ...state };
}

export function updateScanStatus(patch: Partial<ScanStatus>) {
  Object.assign(state, patch);
}

export function resetScanStatus() {
  state.running = true;
  state.phase = 'scouting';
  state.total = 0;
  state.completed = 0;
  state.current = '';
  state.error = '';
  state.startedAt = Date.now();
  state.finishedAt = 0;
}
