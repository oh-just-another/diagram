<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Diagram } from "@oh-just-another/diagram-vue";
import {
  parseScene,
  parseFiles,
  stringifyScene,
  stringifyFiles,
} from "@oh-just-another/serialization";
import type { Scene } from "@oh-just-another/scene";

// The wrapper does not persist — that's the host's job. This wires a minimal
// localStorage round-trip through the component's events so a reload keeps the
// scene (and its image / GIF bytes).
const SCENE_KEY = "oh-vue-example-scene";
const FILES_KEY = "oh-vue-example-files";

const scene = ref<Scene>();

onMounted(() => {
  const saved = localStorage.getItem(SCENE_KEY);
  if (!saved) return;
  try {
    let next = parseScene(saved);
    const files = localStorage.getItem(FILES_KEY);
    if (files) next = { ...next, files: parseFiles(files) };
    scene.value = next;
  } catch (err) {
    console.warn("[example] could not restore scene", err);
  }
});

function onSceneChange(next: Scene) {
  try {
    localStorage.setItem(SCENE_KEY, stringifyScene(next));
    if (next.files.size > 0) localStorage.setItem(FILES_KEY, stringifyFiles(next));
    else localStorage.removeItem(FILES_KEY);
  } catch (err) {
    console.warn("[example] could not save scene", err);
  }
}
</script>

<template>
  <Diagram
    :scene="scene"
    theme="system"
    grid
    snap
    style="height: 100vh"
    @scenechange="onSceneChange"
  />
</template>
