import { Deal, DealStatus } from './types';

export const dealTotal = (deal: Deal): number => {
  return deal.tasks
    .filter(t => t.status !== 'Cancelled')
    .reduce((sum, t) => sum + t.amount, 0);
};

export const dealDoneCount = (deal: Deal): number => {
  return deal.tasks.filter(t => t.status === 'Completed' || t.status === 'Resolved').length;
};

export const dealTaskCount = (deal: Deal): number => {
  return deal.tasks.filter(t => t.status !== 'Cancelled').length;
};

export const deriveDealStatus = (deal: Deal): DealStatus => {
  const tasks = deal.tasks;
  if (tasks.length === 0 || tasks.every(t => t.status === 'Cancelled')) return 'cancelled';
  if (tasks.some(t => t.status === 'Disputed')) return 'dispute';
  if (tasks.some(t => t.status === 'Finished')) return 'pending_approval';
  if (!deal.contractor) return 'searching';
  
  const activeTasks = tasks.filter(t => t.status !== 'Cancelled');
  if (activeTasks.length > 0 && activeTasks.every(t => t.status === 'Completed' || t.status === 'Resolved')) {
    return 'completed';
  }
  
  return 'in_progress';
};
