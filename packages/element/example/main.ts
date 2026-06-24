// Registers <oh-diagram> as a side effect; markup in index.html mounts it.
import "@oh-just-another/element";
import {
  parseScene,
  parseFiles,
  stringifyScene,
  stringifyFiles,
} from "@oh-just-another/serialization";
import type { Scene } from "@oh-just-another/scene";

// The element itself does not persist — that's the host's job. This wires a
// minimal localStorage round-trip through its public events / methods so a
// reload keeps the scene (and its image / GIF bytes).
const SCENE_KEY = "oh-diagram-example-scene";
const FILES_KEY = "oh-diagram-example-files";

const el = document.querySelector("oh-diagram");

el?.addEventListener("ready", () => {
  const savedScene = localStorage.getItem(SCENE_KEY);
  if (!savedScene) return;
  try {
    let scene = parseScene(savedScene);
    const savedFiles = localStorage.getItem(FILES_KEY);
    if (savedFiles) scene = { ...scene, files: parseFiles(savedFiles) };
    el.loadScene(scene);
  } catch (err) {
    console.warn("[example] could not restore scene", err);
  }
});

el?.addEventListener("scenechange", (event) => {
  const scene = (event as CustomEvent<Scene>).detail;
  try {
    localStorage.setItem(SCENE_KEY, stringifyScene(scene));
    if (scene.files.size > 0) localStorage.setItem(FILES_KEY, stringifyFiles(scene));
    else localStorage.removeItem(FILES_KEY);
  } catch (err) {
    console.warn("[example] could not save scene", err);
  }
});
