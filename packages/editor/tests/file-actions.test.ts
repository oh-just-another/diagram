/**
 * Coverage for the editor file-ops actions: action metadata + read-only
 * flags, JSON save wiring (serialize → download), and the copy-as-image
 * clipboard-unsupported fallback. PNG rendering itself is covered by
 * `png-export.test.ts`; here we only glue-test the action layer with
 * mocked download / clipboard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementId, fileId } from "@oh-just-another/types";
import {
  addElement,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { ActionRegistry, type Editor } from "@oh-just-another/state";
import {
  fileActions,
  registerFileActions,
  setFileActionNotifier,
  downloadScene,
  copySceneAsImage,
} from "../src/file-actions";

const rect = (id: string): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 50,
  height: 50,
});

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

/** Minimal Editor stand-in — file actions only read `.scene`. */
const fakeEditor = (scene: Scene): Editor => ({ scene }) as unknown as Editor;

describe("file actions metadata", () => {
  it("registers Save / Open / Export / Copy with the expected hotkeys + view flags", () => {
    const byId = new Map(fileActions.map((a) => [a.id, a]));
    expect([...byId.keys()].sort()).toEqual(
      ["copy-as-image", "export-png", "open-scene", "save-scene"].sort(),
    );
    // Non-mutating ops stay live in read-only …
    expect(byId.get("save-scene")?.viewMode).toBe(true);
    expect(byId.get("export-png")?.viewMode).toBe(true);
    expect(byId.get("copy-as-image")?.viewMode).toBe(true);
    // … but Open replaces the document, so it is gated.
    expect(byId.get("open-scene")?.viewMode).toBeUndefined();
    expect(byId.get("save-scene")?.hotkey).toEqual({ key: "s", meta: true });
    expect(byId.get("copy-as-image")?.hotkey).toEqual({ key: "c", shift: true, alt: true });
  });

  it("registerFileActions is idempotent and populates a registry", () => {
    const reg = new ActionRegistry();
    registerFileActions(reg);
    registerFileActions(reg); // replace-in-place, no throw
    expect(reg.get("save-scene")).toBeDefined();
    expect(reg.get("copy-as-image")).toBeDefined();
  });
});

describe("downloadScene", () => {
  let created: Blob[];
  let anchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    created = [];
    anchor = { href: "", download: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(anchor as unknown as HTMLAnchorElement);
    vi.spyOn(document.body, "appendChild").mockImplementation((n) => n);
    vi.spyOn(document.body, "removeChild").mockImplementation((n) => n);
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = (b: Blob) => {
      created.push(b);
      return "blob:mock";
    };
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => undefined;
    (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = () => 1;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serialises the scene to a JSON blob and triggers a download", () => {
    downloadScene(sceneWith(rect("a")));
    expect(created).toHaveLength(1);
    expect(created[0]?.type).toBe("application/json");
    expect(anchor.download).toBe("scene.diagram.json");
    expect(anchor.click).toHaveBeenCalledOnce();
  });

  // Regression: the saved file carried only `fileId` references, so a scene
  // with media opened elsewhere rendered blank shapes.
  it("embeds Scene.files bytes so the saved file is self-contained", async () => {
    const scene = sceneWith(rect("a"));
    const bytes = new Uint8Array([9, 8, 7]);
    const withFile = {
      ...scene,
      files: new Map([
        [fileId("f1"), { id: fileId("f1"), mime: "image/png", createdAt: 1, data: bytes.buffer }],
      ]),
    };
    downloadScene(withFile);
    // jsdom's Blob lacks `.text()` — go through FileReader instead.
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.onerror = () => {
        reject(new Error("read failed"));
      };
      reader.readAsText(created[0]!);
    });
    const doc = JSON.parse(text) as { files?: { id: string; mime: string }[] };
    expect(doc.files).toHaveLength(1);
    expect(doc.files?.[0]).toMatchObject({ id: "f1", mime: "image/png" });
  });
});

describe("copySceneAsImage", () => {
  afterEach(() => {
    setFileActionNotifier((m) => {
      if (typeof window !== "undefined") window.alert(m);
    });
  });

  it("notifies instead of throwing when the clipboard API is unavailable", async () => {
    const notify = vi.fn();
    setFileActionNotifier(notify);
    // No ClipboardItem / clipboard.write in jsdom → unsupported path.
    await copySceneAsImage(fakeEditor(sceneWith(rect("a"))));
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0]?.[0]).toMatch(/clipboard/i);
  });
});
