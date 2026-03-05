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
}

const ScanContext = createContext<{
  state: ScanState;
  startScan: (force: boolean) => void;
}>({
  state: { isScanning: false, phase: '', detail: '', displayProgress: 0, elapsed: 0, showForce: false },
  startScan: () => {},
});

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}秒`;
  return `${Math.floor(s / 60)}分${s % 60}秒`;
}

function phaseToProgress(phase: string, total: number, completed: number): number {
  if (phase === 'scouting') return 10;
  if (phase === 'fetching') return Math.round(15 + (total > 0 ? completed / total : 0) * 20);
  if (phase === 'analyzing') return Math.round(35 + (total > 0 ? completed / total : 0) * 60);
  if (phase === 'done') return 100;
  return 0;
}

const PHASE_LABEL: Record<string, string> = {
  scouting: '搜索中',
  fetching: '获取 README',
  analyzing: 'AI 分析中',
  done: '完成',
  error: '失败',
};

// ---- Provider ----
export function ScanProvider({ onComplete, children }: { onComplete?: () => void; children: React.ReactNode }) {
  const [isScanning, setIsScanning] = useState(false);
  const [phase, setPhase] = useState('');
  const [detail, setDetail] = useState('');
  const [displayProgress, setDisplayProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [showForce, setShowForce] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  useEffect(() => () => {
    stopTimer();
    abortRef.current?.abort();
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

  const startScan = useCallback(async (force: boolean) => {
    startTimeRef.current = Date.now();
    setIsScanning(true);
    setShowForce(false);
    setPhase('启动中');
    setDetail('正在启动扫描...');
    setDisplayProgress(3);
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
            lastPhase = data.phase;
            lastCompleted = data.completed ?? 0;
            lastTotal = data.total ?? 0;

            const pct = phaseToProgress(data.phase, lastTotal, lastCompleted);
            setDisplayProgress(pct);

            if (data.phase === 'done') {
              setDisplayProgress(100);
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
        setDisplayProgress(100);
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

  const state: ScanState = { isScanning, phase, detail, displayProgress, elapsed, showForce };

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
  const { phase, detail, displayProgress, elapsed, isScanning } = state;
  const pct = Math.round(displayProgress);

  if (!phase) return null;

  const isError = phase === '失败';
  const showBar = isScanning || phase === '完成';

  return (
    <div className="mb-4 space-y-1.5">
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
      {showBar && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary"
            style={{
              width: `${displayProgress}%`,
              transition: 'width 0.4s ease-out',
            }}
          />
        </div>
      )}
    </div>
  );
}
