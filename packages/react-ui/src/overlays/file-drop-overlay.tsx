import type { ReactNode } from "react";
import {
  Braces,
  Download,
  File,
  FileText,
  Image as ImageIcon,
  LayoutDashboard,
  Film,
} from "lucide-react";
import type { FileDropKind } from "@oh-just-another/state";
import { useDiagramOptional } from "../core/hooks.js";
import { CONTROL_ICON, DROP_OVERLAY_ICON_SIZE, ICON_STROKE } from "../core/constants.js";

const KIND_ICON: Record<FileDropKind, ReactNode> = {
  image: <ImageIcon {...CONTROL_ICON} aria-hidden />,
  video: <Film {...CONTROL_ICON} aria-hidden />,
  scene: <LayoutDashboard {...CONTROL_ICON} aria-hidden />,
  text: <FileText {...CONTROL_ICON} aria-hidden />,
  data: <Braces {...CONTROL_ICON} aria-hidden />,
  file: <File {...CONTROL_ICON} aria-hidden />,
};

export interface FileDropOverlayProps {
  /** Show while an OS file drag hovers the canvas. */
  readonly active: boolean;
  /** Big label under the drop glyph. Default `"DROP"`. */
  readonly label?: string;
}

/**
 * Full-canvas hint shown while a file is dragged over the editor: a dashed
 * frame and ONE card — a drop glyph with "DROP" on top, then a row per
 * labelled file-drop handler (`editor.getFileDropHandlers()`) listing what
 * the canvas accepts — images, video, whatever the host registered. Pointer-events
 * none, so the drop still lands on the canvas handlers beneath.
 */
export const FileDropOverlay = ({ active, label = "DROP" }: FileDropOverlayProps) => {
  const editor = useDiagramOptional();
  if (!active) return null;
  const handlers = (editor?.getFileDropHandlers() ?? []).filter((h) => h.label !== undefined);
  return (
    <div
      className="du-drop-overlay"
      role="status"
      aria-live="polite"
      aria-label={`${label}: drop a file`}
    >
      <div className="du-drop-overlay-frame">
        <div className="du-drop-overlay-card">
          <div className="du-drop-overlay-center">
            <Download size={DROP_OVERLAY_ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
            <span className="du-drop-overlay-label">{label}</span>
          </div>
          {handlers.length > 0 ? (
            <ul className="du-drop-overlay-types" aria-label="Accepted files">
              {handlers.map((h) => (
                <li key={h.id} className="du-drop-type">
                  {KIND_ICON[h.kind ?? "file"]}
                  <span className="du-drop-type-label">{h.label}</span>
                  {h.formats && h.formats.length > 0 ? (
                    <span className="du-drop-type-formats">{h.formats.join(" · ")}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
};
