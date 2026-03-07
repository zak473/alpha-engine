"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open:       boolean;
  onClose:    () => void;
  title?:     string;
  subtitle?:  string;
  children:   ReactNode;
  className?: string;
  /** "sm" ~480px | "md" ~640px | "lg" ~896px | "xl" ~1152px */
  size?:      "sm" | "md" | "lg" | "xl";
}

const sizeClass = { sm: "max-w-sm", md: "max-w-2xl", lg: "max-w-4xl", xl: "max-w-6xl" };

export function Modal({ open, onClose, title, subtitle, children, className, size = "md" }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.72)" }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full outline-none",
          sizeClass[size],
          className
        )}
        style={{
          background:   "var(--bg1)",
          border:       "1px solid var(--border1)",
          borderRadius: "var(--radius-md)",
          boxShadow:    "0 8px 32px rgba(0,0,0,0.6)",
          maxHeight:    "90vh",
          display:      "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        {(title || subtitle) && (
          <div
            style={{
              display:        "flex",
              alignItems:     "flex-start",
              justifyContent: "space-between",
              padding:        "10px 16px",
              borderBottom:   "1px solid var(--border0)",
              flexShrink:     0,
            }}
          >
            <div>
              {title && (
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text0)" }}>{title}</p>
              )}
              {subtitle && (
                <p style={{ fontSize: 11, color: "var(--text1)", marginTop: 2 }}>{subtitle}</p>
              )}
            </div>
            <button
              onClick={onClose}
              style={{ color: "var(--text1)", marginLeft: 12, flexShrink: 0 }}
              className="hover:text-t0 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Body — scrollable */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
