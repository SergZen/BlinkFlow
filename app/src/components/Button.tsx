import { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'gradient' | 'outline';
}

export const Button = ({ children, variant = 'primary', className, ...props }: ButtonProps) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'gradient': return 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white border-transparent shadow-[0_0_15px_rgba(139,92,246,0.3)]';
      case 'primary': return 'bg-blue-600 hover:bg-blue-500 text-white border-transparent';
      case 'secondary': return 'bg-gray-800 hover:bg-gray-700 text-white border-transparent';
      case 'danger': return 'bg-red-600/10 hover:bg-red-600/20 text-red-500 border-red-600/20';
      case 'outline': return 'bg-transparent hover:bg-gray-800 text-gray-300 border-gray-700';
      default: return '';
    }
  };

  return (
    <button 
      className={cn('px-4 py-2 rounded-lg font-medium text-sm transition-all border flex items-center justify-center gap-2', getVariantStyles(), className)} 
      {...props}
    >
      {children}
    </button>
  );
};
