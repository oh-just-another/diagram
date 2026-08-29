/**
 * File actions that touch the browser: the Open… picker, PNG / SVG
 * downloads, the selection PNG copy, and every action's `perform`. The
 * download sink (`URL.createObjectURL` + anchor click) and the PNG
 * exporter are stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementId, linkId } from "@oh-just-another/types";
import {
  addElement,
  addLink,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Element,
  type Link,
  type Scene,
} from "@oh-just-another/scene";
import { stringifyScene } from "@oh-just-another/serialization";
import type { Editor } from "@oh-just-another/state";

vi.mock("../src/png-export", () => ({
  exportSceneToPng: vi.fn(),
}));

import { exportSceneToPng } from "../src/png-export";
import {
  copySelectionAsPng,
  downloadPng,
  downloadSvg,
  fileActions,
  openSceneFile,
  setFileActionNotifier,
} from "../src/file-actions";
import { subsetScene } from "../src/scene-subset";

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

const fakeEditor = (scene: Scene, selection: string[] = []): Editor & { loaded: Scene[] } => {
  const loaded: Scene[] = [];
  const ids = new Set(selection.map(elementId));
  return {
    scene,
    selection: ids,
    expandSelectionWithDescendants: () => ids,
    loadScene: (s: Scene) => {
      loaded.push(s);
    },
    loaded,
  } as unknown as Editor & { loaded: Scene[] };
};

/** jsdom's `File` lacks `.text()` — a stand-in with just what the picker reads. */
const fileOf = (text: string): File => ({ text: () => Promise.resolve(text) }) as unknown as File;

const exportMock = vi.mocked(exportSceneToPng);
let notify: ReturnType<typeof vi.fn>;
let createObjectURL: ReturnType<typeof vi.fn>;
let anchorClick: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  notify = vi.fn();
  setFileActionNotifier(notify);
  createObjectURL = vi.fn(() => "blob:test");
  Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  exportMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Grab the hidden `<input type=file>` the picker clicks and feed it `file`. */
const pickFile = (editor: Editor, file: File | null): void => {
  const clicked: HTMLInputElement[] = [];
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
    this: HTMLInputElement,
  ) {
    clicked.push(this);
  });
  openSceneFile(editor);
  expect(clicked).toHaveLength(1);
  const el = clicked[0]!;
  Object.defineProperty(el, "files", { value: file ? [file] : [] });
  el.onchange?.(new Event("change"));
};

describe("openSceneFile", () => {
  it("loads a valid scene file into the editor", async () => {
    const editor = fakeEditor(emptyScene());
    const json = stringifyScene(sceneWith(rect("a")));
    pickFile(editor, fileOf(json));
    await vi.waitFor(() => {
      expect(editor.loaded).toHaveLength(1);
    });
    expect(editor.loaded[0]?.elements.has(elementId("a"))).toBe(true);
    expect(notify).not.toHaveBeenCalled();
  });

  it("reports a file that does not parse, and ignores a cancelled picker", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const editor = fakeEditor(emptyScene());
    pickFile(editor, fileOf("not json"));
    await vi.waitFor(() => {
      expect(notify).toHaveBeenCalledWith(expect.stringContaining("Failed to parse"));
    });
    expect(editor.loaded).toHaveLength(0);
    vi.restoreAllMocks();
    pickFile(editor, null);
    expect(editor.loaded).toHaveLength(0);
  });
});

describe("downloadPng / downloadSvg", () => {
  it("downloads the exporter's blob with the host canvas background", async () => {
    exportMock.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    await downloadPng(fakeEditor(sceneWith(rect("a"))), "color", { stickyTags: false });
    expect(exportMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        background: "color",
        backgroundColor: "#ffffff",
        content: { stickyTags: false },
      }),
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
  });

  it("notifies instead of downloading when the exporter yields nothing", async () => {
    exportMock.mockResolvedValue(null);
    await downloadPng(fakeEditor(emptyScene()), "transparent");
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("empty"));
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("downloadSvg serialises the scene as image/svg+xml", () => {
    downloadSvg(sceneWith(rect("a")), { stickyAuthor: false });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("image/svg+xml");
  });
});

describe("copySelectionAsPng", () => {
  it("falls back to the notifier when the clipboard cannot take blobs", async () => {
    await copySelectionAsPng(fakeEditor(sceneWith(rect("a")), ["a"]));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("clipboard"));
    expect(exportMock).not.toHaveBeenCalled();
  });
});

describe("fileActions perform", () => {
  it("each action delegates to its helper", async () => {
    exportMock.mockResolvedValue(null);
    const inputClick = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    const editor = fakeEditor(sceneWith(rect("a")), ["a"]);
    const byId = new Map(fileActions.map((a) => [a.id, a]));
    const run = (id: string): void => {
      byId.get(id)!.perform({ editor } as never);
    };
    run("save-scene");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    run("open-scene");
    expect(inputClick).toHaveBeenCalledTimes(1);
    run("export-png");
    await vi.waitFor(() => {
      expect(exportMock).toHaveBeenCalledTimes(1);
    });
    for (const id of ["copy-as-image", "copy-as-png", "copy-as-svg"]) {
      notify.mockClear();
      run(id);
      await vi.waitFor(() => {
        expect(notify, id).toHaveBeenCalledWith(expect.stringContaining("clipboard"));
      });
    }
    // A label-less rectangle has no text to copy.
    notify.mockClear();
    run("copy-as-text");
    await vi.waitFor(() => {
      expect(notify).toHaveBeenCalledWith(expect.stringContaining("Nothing to copy"));
    });
  });
});

describe("subsetScene links", () => {
  it("keeps links bound inside the subset or to a free point, drops the rest", () => {
    let scene = sceneWith(rect("a"), rect("b"), rect("c"));
    const anchor = (id: string): Link["from"] => ({
      kind: "anchor",
      elementId: elementId(id),
      anchor: { kind: "named", name: "right" },
    });
    const link = (id: string, from: Link["from"], to: Link["to"]): Link => ({
      id: linkId(id),
      layerId: DEFAULT_LAYER_ID,
      order: orderBetween(null, null),
      style: {},
      from,
      to,
    });
    scene = addLink(scene, link("ab", anchor("a"), anchor("b"))).scene;
    scene = addLink(scene, link("ac", anchor("a"), anchor("c"))).scene;
    scene = addLink(
      scene,
      link("ap", anchor("a"), { kind: "point", position: { x: 9, y: 9 } }),
    ).scene;
    const sub = subsetScene(scene, new Set([elementId("a"), elementId("b")]));
    expect([...sub.links.keys()].sort()).toEqual([linkId("ab"), linkId("ap")]);
    expect(sub.elements.size).toBe(2);
  });
});
