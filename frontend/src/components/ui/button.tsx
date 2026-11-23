import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
const v = cva('inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal', {
  variants: { variant: { primary: 'bg-navy text-white hover:bg-navy-700', accent: 'bg-teal text-white hover:opacity-90', danger: 'bg-crit text-white hover:opacity-90', ghost: 'border border-line bg-white text-navy hover:bg-mist' } }, defaultVariants: { variant: 'primary' } });
export const Button = ({ className, variant, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof v>) => <button className={cn(v({ variant }), className)} {...p} />;
