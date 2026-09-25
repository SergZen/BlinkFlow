import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/utils';
import type { DealStatus } from '../mockData';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  status?: DealStatus;
}

export const Badge = ({ children, status, className, ...props }: BadgeProps) => {
  const getStatusColor = () => {
    switch (status) {
      case 'searching': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'in_progress': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'pending_approval': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'dispute': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'completed': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'cancelled': return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
      default: return 'bg-gray-800 text-gray-300 border-gray-700';
    }
  };

  return (
    <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium border', getStatusColor(), className)} {...props}>
      {children}
    </span>
  );
};

export const getStatusLabel = (status: DealStatus) => {
  switch (status) {
    case 'searching': return 'Seeking Contractor';
    case 'in_progress': return 'In Progress';
    case 'pending_approval': return 'Awaiting Confirmation';
    case 'dispute': return 'Disputed';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
};
