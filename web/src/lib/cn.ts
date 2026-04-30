// 8.9: small className helper. clsx for conditional classes, tailwind-merge
// to dedupe conflicting Tailwind utilities (e.g. last bg-X wins).

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...classes: ClassValue[]): string {
  return twMerge(clsx(classes));
}
