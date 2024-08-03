import type { CSSProperties, ReactNode } from "react";
import type { Editor, Mode } from "@oh-just-another/state";
import type { Scene } from "@oh-just-another/scene";
import { DiagramRoot, DiagramSurface } from "./diagram-root.js";

/**
 * Convenience one-component setup for the simple case where the canvas is
 * the **only** content (no side panels or floating toolbar). Equivalent to:
 *
 * ```tsx
 * <DiagramRoot initialScene={s}>
 *   <DiagramSurface style={style} />
 * </DiagramRoot>
 * ```
 *
 * For layouts with a palette / property panel / toolbar living next to the
 * canvas, prefer `<DiagramRoot>` + `<DiagramSurface>` directly — that lets
 * the side panels be flex siblings of the canvas surface instead of being
 * covered by the underlying canvas elements.
 */
export interface DiagramCanvasProps {
  readonly initialScene: Scene;
  readonly initialMode?: Mode;
  readonly onReady?: (editor: Editor) => void;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly skipInstallRenderers?: boolean;
  /**
   * Optional React subtree rendered **as a sibling** of the canvas surface
   * inside a shared `<DiagramRoot>`. Useful when the host wants e.g. a
   * floating toolbar with `position: absolute` over the surface.
   *
   * Note: anything that needs to share horizontal space with the canvas
   * (palettes, inspectors) should be placed alongside a `<DiagramSurface>`
   * inside a `<DiagramRoot>` instead — using this `children` prop overlays
   * them, which is rarely what you want.
   */
  readonly children?: ReactNode;
}

export const DiagramCanvas = ({
  initialScene,
  initialMode,
  onReady,
  style,
  className,
  skipInstallRenderers,
  children,
}: DiagramCanvasProps) => (
  <DiagramRoot
    initialScene={initialScene}
    {...(initialMode !== undefined ? { initialMode } : {})}
    {...(onReady !== undefined ? { onReady } : {})}
    {...(skipInstallRenderers !== undefined ? { skipInstallRenderers } : {})}
  >
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        ...style,
      }}
    >
      <DiagramSurface />
      {children}
    </div>
  </DiagramRoot>
);
