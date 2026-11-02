import { create } from 'zustand';
import { clearCache } from '../services/useResource';
interface Toast {
  id: number;
  message: string;
  error: boolean;
}
type Theme = 'white' | 'dark' | 'auto';
interface UI {
  theme: Theme;
  setTheme: (v: Theme) => void;
  collapsed: boolean;
  toggleSidebar: () => void;
  toasts: Toast[];
  notify: (message: string, error?: boolean) => void;
  dismiss: (id: number) => void;
}
const apply = (v: Theme) => {
  document.documentElement.dataset.theme =
    v === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'white') : v;
  localStorage.setItem('discord-theme', v);
};
const stored = localStorage.getItem('discord-theme');
const initial: Theme =
  stored === 'dark' || stored === 'white' || stored === 'auto' ? stored : 'white';
apply(initial);
export const useUI = create<UI>((set, get) => ({
  theme: initial,
  setTheme: (v) => {
    apply(v);
    set({ theme: v });
  },
  collapsed: localStorage.getItem('discord-sidebar-collapsed') === 'true',
  toggleSidebar: () =>
    set((s) => {
      localStorage.setItem('discord-sidebar-collapsed', String(!s.collapsed));
      return { collapsed: !s.collapsed };
    }),
  toasts: [],
  notify: (message, error = false) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, message, error }].slice(-3) }));
    setTimeout(() => get().dismiss(id), 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (useUI.getState().theme === 'auto') apply('auto');
});
interface Auth {
  username: string | null;
  setUser: (username: string | null) => void;
}
export const useAuth = create<Auth>((set) => ({
  username: null,
  setUser: (username) => {
    if (!username) clearCache();
    set({ username });
  },
}));
