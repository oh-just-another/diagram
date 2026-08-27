import { useEffect, useReducer } from "react";
import { createPortal } from "react-dom";
import { Link as LinkIcon } from "lucide-react";
import { getElementWorldBounds } from "@oh-just-another/scene";
import { useDiagramOptional } from "../core/hooks.js";
import { useQuietViewport } from "../core/use-quiet-viewport.js";
import { usePortalContainer } from "../core/portal-container.js";
import { BADGE_ICON } from "../core/constants.js";

/**
 * Persistent link badges. Every element carrying a (safe) `href` shows a
 * small chip anchored to its top-right corner, so links are discoverable
 * without hovering — the hover popup and Cmd/Ctrl-click remain the detail /
 * open affordances. Clicking the badge opens the link via `editor.openLink`
 * (scheme already validated by `elementLink`). Also shown in read-only mode:
 * following links is a viewing feature, not an edit.
 *
 * Positions are computed from world bounds + viewport on every editor
 * change, so badges track pan / zoom / move. Portaled to the overlay
 * container like the hover popup.
 */
export const LinkBadges = () => {
  const editor = useDiagramOptional();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const portalContainer = usePortalContainer();
  const quiet = useQuietViewport(editor);

  useEffect(() => {
    if (!editor) return undefined;
    return editor.on("change", () => {
      bump();
    });
  }, [editor]);

  if (!editor || !quiet) return null;
  const host = editor.hostElement as HTMLElement | null;
  if (!host) return null;

  const v = editor.scene.viewport;
  const hostRect = host.getBoundingClientRect();
  const badges: { id: string; href: string; x: number; y: number }[] = [];
  for (const shape of editor.scene.elements.values()) {
    const href = editor.elementLink(shape.id);
    if (!href) continue;
    const b = getElementWorldBounds(shape);
    badges.push({
      id: shape.id,
      href,
      x: (b.x + b.width - v.pan.x) * v.zoom + hostRect.left,
      y: (b.y - v.pan.y) * v.zoom + hostRect.top,
    });
  }
  if (badges.length === 0) return null;

  return createPortal(
    <>
      {badges.map((badge) => (
        <button
          key={badge.id}
          type="button"
          className="du-link-badge"
          style={{ position: "fixed", left: badge.x, top: badge.y }}
          title={badge.href}
          aria-label={`Open link ${badge.href}`}
          onClick={() => {
            editor.openLink(badge.href);
          }}
        >
          <LinkIcon {...BADGE_ICON} aria-hidden />
        </button>
      ))}
    </>,
    portalContainer,
  );
};
