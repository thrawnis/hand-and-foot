import { ButtonHTMLAttributes, ReactNode } from 'react';
import { motion } from 'framer-motion';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'gold';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  loading?: boolean;
}

const variants = {
  primary: 'bg-felt-600 hover:bg-felt-500 text-white border border-felt-500',
  secondary: 'bg-felt-700 hover:bg-felt-600 text-white border border-felt-600',
  danger: 'bg-red-700 hover:bg-red-600 text-white border border-red-600',
  ghost: 'bg-transparent hover:bg-felt-700 text-felt-200 border border-felt-600',
  gold: 'bg-gold-500 hover:bg-gold-400 text-felt-900 border border-gold-400 font-bold',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-lg',
};

export function Button({ variant = 'primary', size = 'md', children, loading, disabled, className = '', ...props }: ButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      className={`
        inline-flex items-center justify-center gap-2 rounded-xl font-medium
        transition-colors duration-150 cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}
      `}
      disabled={disabled || loading}
      {...(props as any)}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </motion.button>
  );
}
