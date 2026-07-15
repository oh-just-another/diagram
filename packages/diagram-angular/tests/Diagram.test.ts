// Must come first: registers a stub <oja-diagram> before the wrapper's
// side-effect import registers the real (React-mounting) element.
import "./oja-diagram-stub";
// JIT compiler — vitest runs the component's decorators at runtime.
import "@angular/compiler";
import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { beforeEach, describe, expect, it } from "vitest";
import type { Scene } from "@oh-just-another/scene";
import { DiagramComponent } from "../src/index";

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

const createFixture = () => {
  TestBed.configureTestingModule({
    imports: [DiagramComponent],
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(DiagramComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const diagram = el.querySelector("oja-diagram");
  if (!diagram) throw new Error("<oja-diagram> not rendered");
  return { fixture, diagram };
};

describe("<oja-diagram-ng> (Angular)", () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it("reflects inputs onto the underlying element's attributes", () => {
    const { fixture, diagram } = createFixture();
    fixture.componentRef.setInput("theme", "dark");
    fixture.componentRef.setInput("renderer", "webgl2");
    fixture.componentRef.setInput("grid", true);
    fixture.detectChanges();
    expect(diagram.getAttribute("theme")).toBe("dark");
    expect(diagram.getAttribute("renderer")).toBe("webgl2");
    expect(diagram.hasAttribute("grid")).toBe(true);
    expect(diagram.hasAttribute("snap")).toBe(false);

    fixture.componentRef.setInput("theme", "light");
    fixture.componentRef.setInput("grid", false);
    fixture.detectChanges();
    expect(diagram.getAttribute("theme")).toBe("light");
    expect(diagram.hasAttribute("grid")).toBe(false);
  });

  it("re-emits the element's CustomEvents as Angular outputs", () => {
    const { fixture, diagram } = createFixture();
    const scenes: Scene[] = [];
    fixture.componentInstance.scenechange.subscribe((scene: Scene) => scenes.push(scene));
    const scene = { schemaVersion: 1 } as unknown as Scene;
    diagram.dispatchEvent(new CustomEvent("scenechange", { detail: scene }));
    expect(scenes).toEqual([scene]);
  });

  it("exposes the imperative controller on the component instance", () => {
    const { fixture } = createFixture();
    const instance = fixture.componentInstance;
    expect(typeof instance.undo).toBe("function");
    expect(typeof instance.loadScene).toBe("function");
    expect(typeof instance.zoomToFit).toBe("function");
    // Before the editor is ready the pass-throughs are inert, not throwing.
    expect(() => {
      instance.undo();
    }).not.toThrow();
    expect(instance.getActiveTool()).toBeNull();
  });
});
