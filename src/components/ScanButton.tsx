'use client';

import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { Button } from '@/components/ui/button';

interface ScanState {
  isScanning: boolean;
  phase: string;
  detail: string;
  displayProgress: number;
  elapsed: number;
  showForce: boolean;
  lastScanAt: string | null;
}

const ScanContext = createContext<{
  state: ScanState;
  startScan: (force: boolean) => void;
}>({
  state: {
    isScanning: false,
    phase: '',
    detail: '',
    displayProgress: 0,
    elapsed: 0,
    showForce: false,
    lastScanAt: null,
  },
  startScan: () => {},
});

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}秒`;
  return `${Math.floor(s / 60)}分${s % 60}秒`;
}

function phaseToProgress(phase: string, total: number, completed: number): number {
  // refreshing: 0–10%, scouting: 10–15%, fetching: 15–35%, analyzing: 35–98%, done: 100%
  if (phase === 'refreshing') return Math.round(total > 0 ? (completed / total) * 10 : 2);
  if (phase === 'scouting') return 12;
  if (phase === 'fetching') return Math.round(15 + (total > 0 ? completed / total : 0) * 20);
  if (phase === 'analyzing') return Math.round(35 + (total > 0 ? completed / total : 0) * 63);
  if (phase === 'done') return 100;
  return 0;
}

const PHASE_LABEL: Record<string, string> = {
  refreshing: '刷新中',
  scouting: '搜索中',
  fetching: '获取 README',
  analyzing: 'AI 分析中',
  done: '完成',
  error: '失败',
};

const LAST_SCAN_STORAGE_KEY = 'ai-radar:last-scan-at';

function formatLastScan(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffHours = Math.floor(diffMs / 3_600_000);

  if (diffHours < 1) return '刚刚';
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffHours < 48) return '昨天';
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function phaseSoftCap(phase: string): number {
  if (phase === 'refreshing') return 10;
  if (phase === 'scouting') return 14;
  if (phase === 'fetching') return 34;
  if (phase === 'analyzing') return 96;
  if (phase === 'done') return 100;
  return 6;
}

// ---- Provider ----
export function ScanProvider({ onComplete, children }: { onComplete?: () => void; children: React.ReactNode }) {
  const [isScanning, setIsScanning] = useState(false);
  const [phase, setPhase] = useState('');
  const [detail, setDetail] = useState('');
  const [displayProgress, setDisplayProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [showForce, setShowForce] = useState(false);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const rawPhaseRef = useRef('');
  const actualProgressRef = useRef(0);
  const serverTickRef = useRef(0);

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  useEffect(() => () => {
    stopTimer();
    abortRef.current?.abort();
  }, []);

  useEffect(() => {
    const localValue = typeof window !== 'undefined'
      ? localStorage.getItem(LAST_SCAN_STORAGE_KEY)
      : null;
    if (localValue) setLastScanAt(localValue);

    void fetch('/api/scan')
      .then(res => res.json())
      .then(data => {
        const serverValue = typeof data?.lastScanAt === 'string' ? data.lastScanAt : null;
        if (!serverValue) return;

        setLastScanAt(prev => {
          if (!prev) return serverValue;
          return new Date(serverValue).getTime() > new Date(prev).getTime() ? serverValue : prev;
        });
        if (typeof window !== 'undefined') {
          localStorage.setItem(LAST_SCAN_STORAGE_KEY, serverValue);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isScanning && (phase === '完成' || phase === '失败')) {
      const delay = phase === '完成' ? 8000 : 5000;
      const t = setTimeout(() => {
        setPhase(''); setDetail(''); setDisplayProgress(0); setElapsed(0);
      }, delay);
      return () => clearTimeout(t);
    }
  }, [isScanning, phase]);

  useEffect(() => {
    if (!isScanning && phase === '完成') {
      setDisplayProgress(100);
    }
  }, [isScanning, phase]);

  useEffect(() => {
    if (!isScanning) return;

    const tick = setInterval(() => {
      const rawPhase = rawPhaseRef.current;
      const actual = actualProgressRef.current;
      const idleMs = Date.now() - serverTickRef.current;
      let target = actual;

      if (rawPhase !== 'done' && rawPhase !== 'error') {
        const cap = phaseSoftCap(rawPhase);
        if (idleMs > 700 && actual < cap) {
          const optimistic = Math.min(cap, actual + (idleMs - 700) / 240);
          target = Math.max(target, optimistic);
        }
      } else if (rawPhase === 'done') {
        target = 100;
      }

      setDisplayProgress(prev => {
        const delta = target - prev;
        if (delta <= 0) return prev;  // NEVER go backward
        if (Math.abs(delta) < 0.15) return target;

        const easedStep = rawPhase === 'done'
          ? Math.max(1.2, delta * 0.35)
          : Math.max(0.2, delta * 0.18);

        return Math.min(100, prev + easedStep);
      });
    }, 120);

    return () => clearInterval(tick);
  }, [isScanning]);

  const startScan = useCallback(async (force: boolean) => {
    startTimeRef.current = Date.now();
    setIsScanning(true);
    setShowForce(false);
    setPhase('启动中');
    setDetail('正在启动扫描...');
    setDisplayProgress(3);
    rawPhaseRef.current = 'scouting';
    actualProgressRef.current = 3;
    serverTickRef.current = Date.now();
    setElapsed(0);

    timerRef.current = setInterval(() => setElapsed(Date.now() - startTimeRef.current), 1000);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setPhase('提示');
          setDetail(data.error || '扫描正在进行中');
        } else {
          setPhase('失败');
          setDetail(data.error || '启动失败');
        }
        setIsScanning(false);
        stopTimer();
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lastPhase = '';
      let lastCompleted = 0;
      let lastTotal = 0;
      let streamScannedAt: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            const label = PHASE_LABEL[data.phase] ?? data.phase;
            setPhase(label);
            setDetail(data.current || data.error || '');
            rawPhaseRef.current = data.phase ?? '';
            lastPhase = data.phase;
            lastCompleted = data.completed ?? 0;
            lastTotal = data.total ?? 0;

            const pct = phaseToProgress(data.phase, lastTotal, lastCompleted);
            actualProgressRef.current = Math.max(actualProgressRef.current, pct);
            serverTickRef.current = Date.now();

            if (data.phase === 'done') {
              actualProgressRef.current = 100;
              serverTickRef.current = Date.now();
              setDisplayProgress(100);
              if (typeof data.scannedAt === 'string' && data.scannedAt) {
                streamScannedAt = data.scannedAt;
              }
              const doneAt = streamScannedAt ?? new Date().toISOString();
              setLastScanAt(doneAt);
              if (typeof window !== 'undefined') {
                localStorage.setItem(LAST_SCAN_STORAGE_KEY, doneAt);
              }
              if (data.completed === 0 && data.total > 0) setShowForce(true);
              onComplete?.();
            }
          } catch {
            // skip malformed line
          }
        }
      }

      if (lastPhase !== 'done' && lastPhase !== 'error') {
        setPhase('完成');
        rawPhaseRef.current = 'done';
        actualProgressRef.current = 100;
        serverTickRef.current = Date.now();
        setDisplayProgress(100);
        const doneAt = new Date().toISOString();
        setLastScanAt(doneAt);
        if (typeof window !== 'undefined') {
          localStorage.setItem(LAST_SCAN_STORAGE_KEY, doneAt);
        }
        onComplete?.();
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setPhase('失败');
        setDetail('网络错误');
      }
    } finally {
      setIsScanning(false);
      stopTimer();
    }
  }, [onComplete]);

  const state: ScanState = {
    isScanning,
    phase,
    detail,
    displayProgress,
    elapsed,
    showForce,
    lastScanAt,
  };

  return (
    <ScanContext.Provider value={{ state, startScan }}>
      {children}
    </ScanContext.Provider>
  );
}

// ---- 按钮组件 ----
export function ScanButton() {
  const { state, startScan } = useContext(ScanContext);
  return (
    <div className="flex items-center gap-2 shrink-0">
      <Button onClick={() => startScan(false)} disabled={state.isScanning} variant="default">
        {state.isScanning ? '扫描中...' : '扫描最新项目'}
      </Button>
      {state.showForce && !state.isScanning && (
        <Button onClick={() => startScan(true)} variant="outline" size="sm">
          强制重新分析
        </Button>
      )}
    </div>
  );
}

// ---- 进度条组件 ----
export function ScanProgress() {
  const { state } = useContext(ScanContext);
  const { phase, detail, displayProgress, elapsed, isScanning, lastScanAt } = state;
  const pct = Math.round(displayProgress);

  if (!phase && !lastScanAt) return null;

  const isError = phase === '失败';
  const showBar = isScanning || phase === '完成';

  return (
    <div className="mb-4 space-y-1.5">
      {lastScanAt ? (
        <div className="text-xs text-muted-foreground">
          上次扫描：{formatLastScan(lastScanAt)}
        </div>
      ) : null}
      {!phase ? null : (
      <div className="flex items-center gap-2 text-sm">
        <span className={`font-semibold shrink-0 ${isError ? 'text-destructive' : 'text-primary'}`}>[{phase}]</span>
        <span className="text-muted-foreground truncate min-w-0">{detail}</span>
        {isScanning && elapsed > 0 && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatElapsed(elapsed)}</span>
        )}
        {isScanning && pct > 0 && pct < 100 && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{pct}%</span>
        )}
      </div>
      )}
      {showBar && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary"
            style={{
              width: `${displayProgress}%`,
              transition: 'width 0.18s linear',
            }}
          />
        </div>
      )}
    </div>
  );
}
