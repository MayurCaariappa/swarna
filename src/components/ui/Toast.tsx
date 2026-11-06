import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// A short message above the tab bar after a one-tap action, with Undo when the
// action can be reversed:  toast("Period started today", () => undo())

type Show = (message: string, undo?: () => void | Promise<void>) => void;

const ToastContext = createContext<Show | null>(null);
const SHOW_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    undo?: () => void | Promise<void>;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback<Show>((message, undo) => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), message, undo });
    timer.current = setTimeout(() => setToast(null), SHOW_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="snack-wrap" role="status" aria-live="polite">
        {toast && (
          <div className="snack" key={toast.id}>
            <span>{toast.message}</span>
            {toast.undo && (
              <button
                className="snack-undo"
                onClick={async () => {
                  clearTimeout(timer.current);
                  const undo = toast.undo!;
                  setToast(null);
                  await undo();
                }}
              >
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
