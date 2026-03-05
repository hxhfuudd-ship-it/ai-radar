'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Radar, Bookmark, MessageCircle, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const navItems = [
  { href: '/', label: '发现', icon: Radar },
  { href: '/bookmarks', label: '收藏', icon: Bookmark },
  { href: '/chat', label: '对话', icon: MessageCircle },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold" onClick={() => setMobileOpen(false)}>
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Radar className="h-4 w-4" />
          </div>
          <span className="text-lg">AI Radar</span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
                {active ? (
                  <span className="absolute bottom-[-0.6rem] left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-primary" />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden"
          onClick={() => setMobileOpen(prev => !prev)}
          aria-label="切换菜单"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {mobileOpen ? (
        <div className="border-t px-4 pb-3 pt-2 sm:hidden">
          <nav className="flex flex-col gap-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
