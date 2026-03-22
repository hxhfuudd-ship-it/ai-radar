'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const clearAppCaches = async () => {
      if (!('caches' in window)) return;
      const keys = await window.caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('ai-radar-'))
          .map((key) => window.caches.delete(key))
      );
    };

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations()
        .then(async (registrations) => {
          await Promise.all(registrations.map((registration) => registration.unregister()));
          await clearAppCaches();
        })
        .catch(() => {});
      return;
    }

    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  return null;
}
