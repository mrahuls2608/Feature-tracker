'use client';
import { ThemeProvider } from '@/lib/theme';
import { ToastProvider } from '@/components/toast';

export function Providers({ children }) {
  return (
    <ThemeProvider>
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  );
}
