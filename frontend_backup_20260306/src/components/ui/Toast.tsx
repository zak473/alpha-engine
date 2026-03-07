"use client";

import { cn } from "@/lib/utils";
import { CheckCircle, Info, TriangleAlert, X, XCircle } from "lucide-react";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/* ─── Types ─────────────────────────────────────────────────────── */

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

/* ─── Context ───────────────────────────────────────────────────── */

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");

  return {
    toast: {
      success: (message: string) => ctx.addToast(message, "success"),
      error: (message: string) => ctx.addToast(message, "error"),
      warning: (message: string) => ctx.addToast(message, "warning"),
      info: (message: string) => ctx.addToast(message, "info"),
    },
  };
}

/* ─── Provider ──────────────────────────────────────────────────── */

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).slice(2, 10);
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

/* ─── Container ─────────────────────────────────────────────────── */

function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: Toast[];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  );
}

/* ─── Item ──────────────────────────────────────────────────────── */

const TOAST_CONFIG: Record<
  ToastType,
  { icon: ReactNode; border: string }
> = {
  success: {
    icon: <CheckCircle size={14} className="text-accent-green shrink-0" />,
    border: "border-l-accent-green",
  },
  error: {
    icon: <XCircle size={14} className="text-accent-red shrink-0" />,
    border: "border-l-accent-red",
  },
  warning: {
    icon: <TriangleAlert size={14} className="text-accent-amber shrink-0" />,
    border: "border-l-accent-amber",
  },
  info: {
    icon: <Info size={14} className="text-accent-blue shrink-0" />,
    border: "border-l-accent-blue",
  },
};

function ToastItem({
  toast,
  onRemove,
}: {
  toast: Toast;
  onRemove: (id: string) => void;
}) {
  const { icon, border } = TOAST_CONFIG[toast.type];

  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-3",
        "bg-surface-overlay border border-surface-border border-l-2 rounded-lg",
        "px-3 py-2.5 shadow-lg min-w-[240px] max-w-[360px]",
        border
      )}
    >
      {icon}
      <span className="text-sm text-text-primary flex-1">{toast.message}</span>
      <button
        onClick={() => onRemove(toast.id)}
        className="text-text-muted hover:text-text-primary transition-colors ml-1"
      >
        <X size={12} />
      </button>
    </div>
  );
}
