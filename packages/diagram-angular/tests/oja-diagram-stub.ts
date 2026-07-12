// Pre-registers a lightweight <oja-diagram> stand-in BEFORE the wrapper's
// side-effect import can register the real element (`defineOjaDiagram` is
// idempotent and leaves a taken tag untouched). TestBed hosts fixtures inside
// the document, so the real element would connect and mount the React / WASM
// editor in jsdom; with the stub the tests assert the wrapper's binding
// contract only — same scope as the Vue wrapper's off-document tests.
import type { Scene } from "@oh-just-another/scene";

class OjaDiagramStub extends HTMLElement {
  scene: Scene | undefined = undefined;

  getScene(): Scene | undefined {
    return undefined;
  }
  loadScene(_scene: Scene): void {}
  undo(): void {}
  redo(): void {}
  zoomToFit(): void {}
  getActiveTool(): null {
    return null;
  }
  setActiveTool(_mode: unknown): void {}
  getSelection(): ReadonlySet<never> {
    return new Set();
  }
  setSelection(_ids: Iterable<unknown>): void {}
}

if (!customElements.get("oja-diagram")) {
  customElements.define("oja-diagram", OjaDiagramStub);
}
