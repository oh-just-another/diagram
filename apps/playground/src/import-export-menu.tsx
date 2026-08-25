import { Download, Upload } from "lucide-react";
import { MainMenu, ROW_ICON } from "@oh-just-another/react-ui";
import type { Editor } from "@oh-just-another/state";
import { EXPORT_FORMATS, IMPORT_FORMATS, exportSceneAs, importSceneFrom } from "./format-io";

/** Trigger a client-side download of `text` as `filename`. */
const downloadText = (filename: string, text: string): void => {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has grabbed the blob.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
};

/** Open the OS file picker and resolve the chosen file's text (or null if cancelled). */
const pickTextFile = (accept: string): Promise<{ name: string; text: string } | null> =>
  new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      file
        .text()
        .then((text) => {
          resolve({ name: file.name, text });
        })
        .catch(() => {
          resolve(null);
        });
    });
    input.click();
  });

/**
 * Playground wiring of the ready-made converters in
 * `@oh-just-another/importers` (+ native serialization): `ImportMenu` is a
 * Board › Import submenu (file picker → `editor.loadScene`), `ExportFormatItems`
 * are extra rows for Board › Export (download). Rendered through
 * `<Diagram renderBoardMenuExtras / renderExportMenuExtras>`, so both live in
 * `<MainMenu>`'s context.
 */
export const ImportMenu = ({ editor }: { readonly editor: Editor }) => {
  const runImport = (formatId: string, extension: string): void => {
    void pickTextFile(extension).then((picked) => {
      if (!picked) return;
      try {
        editor.loadScene(importSceneFrom(formatId, picked.text));
      } catch (err) {
        console.error(`[playground] import (${formatId}) failed`, err);
        window.alert(`Could not import ${picked.name}: ${(err as Error).message}`);
      }
    });
  };
  return (
    <MainMenu.Submenu icon={<Upload {...ROW_ICON} />} label="Import">
      {IMPORT_FORMATS.map((f) => (
        <MainMenu.Item
          key={f.id}
          onClick={() => {
            runImport(f.id, f.extension);
          }}
        >
          {f.label}
        </MainMenu.Item>
      ))}
    </MainMenu.Submenu>
  );
};

export const ExportFormatItems = ({ editor }: { readonly editor: Editor }) => {
  const runExport = (formatId: string): void => {
    try {
      const { text, filename } = exportSceneAs(formatId, editor.scene);
      downloadText(filename, text);
    } catch (err) {
      console.error(`[playground] export (${formatId}) failed`, err);
      window.alert(`Could not export: ${(err as Error).message}`);
    }
  };
  return (
    <>
      {EXPORT_FORMATS.map((f) => (
        <MainMenu.Item
          key={f.id}
          icon={<Download {...ROW_ICON} />}
          onClick={() => {
            runExport(f.id);
          }}
        >
          {f.label}
        </MainMenu.Item>
      ))}
    </>
  );
};
