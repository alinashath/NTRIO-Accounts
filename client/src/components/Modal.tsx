import clsx from "clsx";
import { useEffect } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Wider sheet on small phones */
  size?: "md" | "lg";
};

export function Modal({ open, title, onClose, children, size = "md" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-900/50 p-0 touch-manipulation sm:items-center sm:p-4"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={clsx(
          "flex max-h-[min(92dvh,900px)] w-full flex-col overflow-hidden border border-border bg-card sm:rounded-[var(--radius-md)]",
          "rounded-t-[var(--radius-md)] sm:max-h-[85vh]",
          size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2.5 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <h2 id="modal-title" className="text-sm font-semibold text-foreground">
            {title}
          </h2>
          <button
            type="button"
            className="flex h-7 w-7 touch-manipulation items-center justify-center rounded-[var(--radius-md)] text-lg leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
