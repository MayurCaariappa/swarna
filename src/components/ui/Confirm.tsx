import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

// An in-app "Are you sure?" sheet, used instead of the browser's confirm()
// (which shows the website address as a header in the installed iOS app).
//
//   const confirm = useConfirm();
//   if (!(await confirm({ title: "Delete this period?", action: "Delete", danger: true }))) return;

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  /** Label of the confirming button, e.g. "Unlink". */
  action?: string;
  cancel?: string;
  /** Red confirm button, for things that can't be undone. */
  danger?: boolean;
}

type Ask = (o: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<
    (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
  >(null);

  const ask = useCallback<Ask>(
    (o) => new Promise((resolve) => setOpen({ ...o, resolve })),
    [],
  );

  const close = (ok: boolean) => {
    open?.resolve(ok);
    setOpen(null);
  };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {open && <ConfirmSheet {...open} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmSheet({
  title,
  message,
  action = "OK",
  cancel = "Cancel",
  danger,
  onClose,
}: ConfirmOptions & { onClose: (ok: boolean) => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  // Latest onClose without re-running the effect (which would re-lock / re-focus).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    // Remember what had focus (e.g. the Unlink button) to give it back on close.
    const opener = document.activeElement as HTMLElement | null;
    // Safe default: focus lands on Cancel.
    cancelRef.current?.focus();

    // Lock the page behind the sheet (keep its scroll position).
    const { body } = document;
    const y = window.scrollY;
    const prev = body.style.cssText;
    body.style.cssText += `;position:fixed;top:${-y}px;left:0;right:0;overflow:hidden`;
    // Everything else is out of reach for screen readers and taps.
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    root?.setAttribute("aria-hidden", "true");

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current(false);
        return;
      }
      if (e.key !== "Tab" || !sheetRef.current) return;
      // Keep Tab cycling inside the sheet.
      const items = [
        ...sheetRef.current.querySelectorAll<HTMLElement>("button, [href], input"),
      ];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = sheetRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      root?.removeAttribute("inert");
      root?.removeAttribute("aria-hidden");
      body.style.cssText = prev;
      window.scrollTo(0, y);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  // Rendered outside #root, so the app behind can be made inert.
  return createPortal(
    <div className="confirm-backdrop" onClick={() => onClose(false)}>
      <div
        ref={sheetRef}
        className="confirm-sheet"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={message ? "confirm-msg" : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title">{title}</h2>
        {message && (
          <div id="confirm-msg" className="muted">
            {message}
          </div>
        )}
        <div className="confirm-actions">
          <button
            className={`btn ${danger ? "danger-solid" : "primary"}`}
            onClick={() => onClose(true)}
          >
            {action}
          </button>
          <button ref={cancelRef} className="btn" onClick={() => onClose(false)}>
            {cancel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}
