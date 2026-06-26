import { createContext, useContext, type ReactNode } from "react";

/**
 * Where floating UI (tooltips, popovers, context menus, hover chips) is
 * portaled. Defaults to `document.body` — the right target for an editor
 * mounted in the page's main document.
 *
 * A host that mounts the editor inside a shadow root sets this to a node
 * within that root, so portaled content stays inside the styled subtree
 * instead of escaping to `document.body` where the shadow-scoped styles
 * don't reach.
 */
const PortalContainerContext = createContext<HTMLElement | null>(null);

export const PortalContainerProvider = ({
  container,
  children,
}: {
  readonly container: HTMLElement | null;
  readonly children: ReactNode;
}) => (
  <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>
);

/** Resolve the active portal target, falling back to `document.body`. */
export const usePortalContainer = (): HTMLElement =>
  useContext(PortalContainerContext) ?? document.body;
