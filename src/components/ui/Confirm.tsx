import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

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

  useEffect(() => {
    // Safe default: focus lands on Cancel.
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="confirm-backdrop" onClick={() => onClose(false)}>
      <div
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
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}
