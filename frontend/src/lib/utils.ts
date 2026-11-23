import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...i: ClassValue[]) => twMerge(clsx(i));
export const fmt = (d?: string | Date | null) => (d ? new Date(d).toLocaleString() : '-');
