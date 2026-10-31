'use client';
import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

const Ctx = createContext({ toast: () => {} });

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const dismiss = useCallback((id) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message, { type = 'success', duration = 4000 } = {}) => {
      const id = Math.random().toString(36).slice(2);
      setItems((xs) => [...xs.slice(-3), { id, message, type }]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );
  const api = { toast, success: (m) => toast(m), error: (m) => toast(typeof m === 'string' ? m : m?.message || 'Something went wrong', { type: 'error', duration: 6000 }), info: (m) => toast(m, { type: 'info' }) };
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {items.map((t) => {
          const Icon = t.type === 'error' ? XCircle : t.type === 'info' ? Info : CheckCircle2;
          return (
            <div key={t.id} className="pointer-events-auto flex items-start gap-3 rounded-lg border border-line bg-panel p-3 text-sm shadow-lg animate-fade-in">
              <Icon className={t.type === 'error' ? 'h-4 w-4 shrink-0 text-[#c43b3a]' : t.type === 'info' ? 'h-4 w-4 shrink-0 text-brand-500' : 'h-4 w-4 shrink-0 text-[#0ca30c]'} />
              <p className="min-w-0 flex-1">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="text-subtle hover:text-ink" aria-label="Dismiss"><X className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
