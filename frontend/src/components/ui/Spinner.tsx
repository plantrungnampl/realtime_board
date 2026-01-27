import { Loader2, type LucideProps } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className, ...props }: LucideProps) {
  return <Loader2 className={cn("animate-spin", className)} {...props} />;
}
