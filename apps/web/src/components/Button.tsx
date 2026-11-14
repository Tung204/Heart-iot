import type { ComponentProps, ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'danger';
export type ButtonSize = 'sm' | 'md';

interface ButtonOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
}

function buttonClass(variant: ButtonVariant, size: ButtonSize, fullWidth: boolean): string {
  const parts = ['button', `button--${variant}`, `button--${size}`];
  if (fullWidth) parts.push('button--full');
  return parts.join(' ');
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonOptions & ComponentProps<'button'>) {
  return (
    <button
      type={type}
      className={`${buttonClass(variant, size, fullWidth)}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Nút điều hướng (thẻ <a> qua React Router) cùng kiểu dáng với Button. */
export function ButtonLink({
  to,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  children,
  ...rest
}: ButtonOptions & { to: string } & Omit<ComponentProps<typeof Link>, 'to'>) {
  return (
    <Link
      to={to}
      className={`${buttonClass(variant, size, fullWidth)}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </Link>
  );
}
