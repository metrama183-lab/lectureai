// store/toastStore.js — lightweight in-app notifications

import { create } from 'zustand';

let _nextId = 1;

const useToastStore = create((set) => ({
  toasts: [],

  addToast: (type, message, duration = 4000) => {
    const id = _nextId++;
    set((state) => ({
      toasts: [...state.toasts, { id, type, message }],
    }));
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
    return id;
  },

  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export default useToastStore;
