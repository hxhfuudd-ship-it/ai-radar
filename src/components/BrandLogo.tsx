import Image from 'next/image';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  size?: number;
  className?: string;
  decorative?: boolean;
}

export function BrandLogo({
  size = 28,
  className,
  decorative = false,
}: BrandLogoProps) {
  return (
    <Image
      src="/icons/logo-mark.svg"
      alt={decorative ? '' : 'AI Radar Logo'}
      aria-hidden={decorative}
      width={size}
      height={size}
      className={cn('shrink-0 rounded-[22%]', className)}
    />
  );
}
