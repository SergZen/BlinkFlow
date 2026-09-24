import { ReactNode, HTMLAttributes } from 'react';
import { cn } from '../lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const Card = ({ children, className, ...props }: CardProps) => {
  return (
    <div className={cn('bg-gray-900 border border-gray-800 rounded-xl overflow-hidden', className)} {...props}>
      {children}
    </div>
  );
};
