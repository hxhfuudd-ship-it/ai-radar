'use client';

import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { Button } from '@/components/ui/button';

// ---- 共享状态 ----
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
  const [targetProgress, setTargetProgress] = useState(0);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [showForce, setShowForce] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const smoothRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const doneCalledRef = useRef(false);

  function stopAll() {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (smoothRef.current) { clearInterval(smoothRef.current); smoothRef.current = null; }
  }

  useEffect(() => {
    if (targetProgress === 100) { setDisplayProgress(100); return; }
    smoothRef.current = setInterval(() => {
      setDisplayProgress(prev => {
        if (prev >= targetProgress) return prev;
        return Math.min(prev + Math.max(0.5, (targetProgress - prev) * 0.15), targetProgress);
      });
    }, 200);
    return () => { if (smoothRef.current) clearInterval(smoothRef.current); };
  }, [targetProgress]);

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/scan');
      if (!res.ok) return;
      const data = await res.json();
      setPhase(PHASE_LABEL[data.phase] ?? data.phase);
      setDetail(data.current || '');
      setTargetProgress(phaseToProgress(data.phase, data.total, data.completed));

      if (data.phase === 'done') {
        setIsScanning(false);
        stopAll();
        if (data.completed === 0 && data.total > 0) setShowForce(true);
        if (!doneCalledRef.current) { doneCalledRef.current = true; onComplete?.(); }
      } else if (data.phase === 'error') {
        setDetail(data.error || '未知错误');
        setIsScanning(false);
        stopAll();
      }
    } catch { /* keep polling */ }
  }, [onComplete]);

  const startScan = useCallback(async (force: boolean) => {
    doneCalledRef.current = false;
    startTimeRef.current = Date.now();
    setIsScanning(true);
    setShowForce(false);
    setPhase('启动中');
    setDetail('正在启动扫描...');
    setTargetProgress(3);
    setDisplayProgress(0);
    setElapsed(0);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!data.success && data.error !== '扫描正在进行中') {
        setPhase('失败');
        setDetail(data.error || '启动失败');
        setIsScanning(false);
        return;
      }
      pollingRef.current = setInterval(pollStatus, 1200);
      timerRef.current = setInterval(() => setElapsed(Date.now() - startTimeRef.current), 1000);
      pollStatus();
    } catch {
      setPhase('失败');
      setDetail('网络错误');
      setIsScanning(false);
    }
  }, [pollStatus]);

  useEffect(() => () => stopAll(), []);

  useEffect(() => {
    if (!isScanning && phase === '完成') {
      const t = setTimeout(() => {
        setPhase(''); setDetail(''); setTargetProgress(0); setDisplayProgress(0); setElapsed(0);
      }, 8000);
      return () => clearTimeout(t);
    }
  }, [isScanning, phase]);

  const state: ScanState = { isScanning, phase, detail, displayProgress, elapsed, showForce };

  return (
    <ScanContext.Provider value={{ state, startScan }}>
      {children}
    </ScanContext.Provider>
  );
}

// ---- 按钮组件（放在 header 行里） ----
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

// ---- 进度条组件（放在 header 下方独立行） ----
export function ScanProgress() {
  const { state } = useContext(ScanContext);
  const { phase, detail, displayProgress, elapsed, isScanning } = state;
  const pct = Math.round(displayProgress);

  if (!phase) return null;

  return (
    <div className="mb-4 space-y-1.5">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold text-primary shrink-0">[{phase}]</span>
        <span className="text-muted-foreground truncate min-w-0">{detail}</span>
        {isScanning && elapsed > 0 && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatElapsed(elapsed)}</span>
        )}
        {isScanning && pct > 0 && pct < 100 && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{pct}%</span>
        )}
      </div>
      {(isScanning || displayProgress > 0) && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary"
            style={{
              width: `${displayProgress}%`,
              transition: displayProgress === 100 ? 'width 0.4s ease-out' : 'none',
            }}
          />
        </div>
      )}
    </div>
  );
}
