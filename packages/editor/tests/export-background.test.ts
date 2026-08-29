/**
 * "With background" PNG exports use the scene's paper colour when the
 * document carries one; otherwise the host's CSS variable (white in jsdom).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyScene, type Scene } from "@oh-just-another/scene";
import type { Editor } from "@oh-just-another/state";

vi.mock("../src/png-export", () => ({ exportSceneToPng: vi.fn() }));

import { exportSceneToPng } from "../src/png-export";
import { downloadPng, setFileActionNotifier } from "../src/file-actions";

const exportMock = vi.mocked(exportSceneToPng);
const fakeEditor = (scene: Scene): Editor => ({ scene }) as unknown as Editor;

afterEach(() => {
  exportMock.mockReset();
});

describe("downloadPng background", () => {
  it("passes the scene's paper colour, else the host default", async () => {
    setFileActionNotifier(() => undefined);
    exportMock.mockResolvedValue(null);
    const scene = emptyScene();
    await downloadPng(
      fakeEditor({ ...scene, viewport: { ...scene.viewport, background: "#4a4a4a" } }),
      "color",
    );
    expect(exportMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ backgroundColor: "#4a4a4a" }),
    );
    await downloadPng(fakeEditor(scene), "color");
    expect(exportMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ backgroundColor: "#ffffff" }),
    );
  });
});
