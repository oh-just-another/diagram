import { useEffect, useState } from "react";
import { usePortalContainer } from "@oh-just-another/react-ui";
import type { DiagramTheme } from "./Diagram.js";

/**
 * Create a portal container that mirrors the editor's `theme` as a `data-theme`
 * attribute, nested inside whatever portal container is already in effect
 * (another provider, or `document.body` by default).
 *
 * Floating chrome (the selection / property panel, popovers, tooltips, menus)
 * portals out of the editor's clipped subtree. That also escapes the
 * `data-theme` set on the editor root, so the stylesheet's `:root` +
 * `prefers-color-scheme` fallback leaks the OS theme into the portaled UI —
 * e.g. a dark menu while the app is set to light. Portaling into this themed
 * wrapper instead makes the floating UI inherit the editor's chosen theme
 * regardless of the OS preference.
 *
 * Nesting (rather than always appending to `document.body`) preserves any host
 * setup: the web-component wrapper portals into a shadow-internal layer so its
 * adopted stylesheet still reaches the menus — this wrapper stays inside it.
 *
 * `"system"` removes the attribute so the media query (OS theme) takes over,
 * matching the editor root. The element is unstyled and unpositioned, so it
 * never creates a containing block — absolutely / fixed positioned portal
 * children resolve exactly as they did against the parent container.
 */
export const useThemedPortalContainer = (theme: DiagramTheme): HTMLElement | null => {
  const parent = usePortalContainer();
  const [el] = useState<HTMLDivElement | null>(() =>
    typeof document === "undefined" ? null : document.createElement("div"),
  );

  useEffect(() => {
    if (!el) return;
    el.setAttribute("data-diagram-portal", "");
    parent.appendChild(el);
    return () => {
      el.remove();
    };
  }, [el, parent]);

  useEffect(() => {
    if (!el) return;
    if (theme === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", theme);
  }, [el, theme]);

  return el;
};
