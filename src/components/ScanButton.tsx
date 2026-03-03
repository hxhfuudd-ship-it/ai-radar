'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface ScanButtonProps {
  onComplete?: () => void;
}

export function ScanButton({ onComplete }: ScanButtonProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState('');

  async function handleScan() {
    setIsScanning(true);
    setStatus('正在扫描 GitHub...');

    try {
      const res = await fetch('/api/scan', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        setStatus(`扫描完成！发现 ${data.projectsFound} 个项目`);
        onComplete?.();
      } else {
        setStatus(`扫描失败: ${data.error}`);
      }
    } catch (err) {
      setStatus('扫描出错，请检查网络和 API 配置');
    } finally {
      setIsScanning(false);
      setTimeout(() => setStatus(''), 5000);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={handleScan} disabled={isScanning} variant="default">
        {isScanning ? '扫描中...' : '扫描最新项目'}
      </Button>
      {status && (
        <span className="text-sm text-muted-foreground">{status}</span>
      )}
    </div>
  );
}
