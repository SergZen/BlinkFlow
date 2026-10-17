import type { Deal } from './types';

export const dealTitle = (deal?: Deal | null): string => {
  if (!deal) return 'Untitled Deal';
  return deal.title || deal.tasks?.[0]?.meta?.title || 'Untitled Deal';
};
