// Registers <oh-diagram> as a side effect; markup in index.html mounts it.
import "@oh-just-another/element";

const el = document.querySelector("oh-diagram");
el?.addEventListener("ready", () => {
  console.info("[example] oh-diagram ready");
});
el?.addEventListener("scenechange", () => {
  console.info("[example] scene changed");
});
