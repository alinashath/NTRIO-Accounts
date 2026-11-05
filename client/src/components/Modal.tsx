import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Wider sheet / dialog */
  size?: "md" | "lg";
  /**
   * form = tall mobile sheet with sticky footer support (children fill height).
   * auto = compact bottom sheet on phone, centered dialog on desktop.
   */
  variant?: "auto" | "form";
  footer?: React.ReactNode;
  /**
   * When false, backdrop taps and Escape leave the dialog open.
   * The header close button still calls onClose.
   */
  closeOnDismiss?: boolean;
};

export function Modal({
  open,
  title,
  onClose,
  children,
  size = "md",
  variant = "auto",
  footer,
  closeOnDismiss = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !closeOnDismiss) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, closeOnDismiss]);

  if (!open) return null;

  const isForm = variant === "form";

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center touch-manipulation sm:items-center sm:p-4"
      style={{ backgroundColor: "var(--overlay)" }}
      role="presentation"
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        if (closeOnDismiss) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={clsx(
          "theme-light flex w-full flex-col overflow-hidden border border-border bg-surface",
          "rounded-t-[var(--sheet-radius)] sm:rounded-[var(--radius-xl)]",
          isForm
            ? "h-[var(--sheet-max)] max-h-[var(--sheet-max)] sm:h-auto sm:max-h-[var(--sheet-max)]"
            : "max-h-[var(--sheet-max)]",
          size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Mobile grabber — app-sheet affordance */}
        <div className="flex shrink-0 justify-center pt-2 sm:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-[var(--control-border)]" />
        </div>

        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
          <h2 id="modal-title" className="min-w-0 flex-1 text-section text-ink">
            {title}
          </h2>
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-sm text-muted-label hover:bg-neutral-bg hover:text-ink"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </button>
        </header>

        <div
          className={clsx(
            "min-h-0 flex-1",
            isForm ? "flex flex-col overflow-hidden" : "overflow-y-auto overscroll-contain",
            !isForm && "px-4 py-4",
            !footer && "pb-[max(1rem,env(safe-area-inset-bottom,0px))]",
          )}
        >
          {isForm ? <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-4">{children}</div> : children}
        </div>

        {footer ? (
          <footer className="shrink-0 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
