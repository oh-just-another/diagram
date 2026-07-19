import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import type { Vec2 } from "@oh-just-another/types";

/** Screen-space (CSS px) + world-space point pair an open request carries. */
export interface ContextMenuOpenRequest {
  readonly screenPoint: Vec2;
  readonly worldPoint: Vec2;
}

type OpenFn = (req: ContextMenuOpenRequest) => void;

/**
 * Shared imperative handle for the diagram's context menu. Lets UI
 * outside the canvas — e.g. the "⋯" button in the selection floating
 * panel — open the same menu that a right-click opens, positioned
 * wherever the caller asks.
 *
 * `<ContextMenu>` registers its open handler on mount; callers use
 * {@link useContextMenuController}.`open(...)`. When no `<ContextMenu>`
 * is mounted, `open` is a no-op.
 */
export interface ContextMenuController {
  readonly open: OpenFn;
  /** `<ContextMenu>` registers its open handler here. */
  readonly register: (fn: OpenFn) => () => void;
}

const ContextMenuControllerContext = createContext<ContextMenuController | null>(null);

/**
 * Provides a single {@link ContextMenuController} to everything
 * inside. Mounted automatically by `<DiagramRoot>`; context flows
 * through React portals, so the floating selection panel (portaled to
 * `document.body`) still sees it.
 */
export const ContextMenuControllerProvider = ({ children }: { readonly children: ReactNode }) => {
  const ref = useRef<OpenFn | null>(null);
  const controller = useMemo<ContextMenuController>(
    () => ({
      open: (req) => ref.current?.(req),
      register: (fn) => {
        ref.current = fn;
        return () => {
          if (ref.current === fn) ref.current = null;
        };
      },
    }),
    [],
  );
  return (
    <ContextMenuControllerContext.Provider value={controller}>
      {children}
    </ContextMenuControllerContext.Provider>
  );
};

/** Access the shared context-menu controller, or `null` outside a provider. */
export const useContextMenuController = (): ContextMenuController | null =>
  useContext(ContextMenuControllerContext);
