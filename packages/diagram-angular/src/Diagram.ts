import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  type AfterViewInit,
  type ElementRef,
  type OnChanges,
  type OnDestroy,
} from "@angular/core";
// Side effect: registers the <oja-diagram> custom element the moment this
// wrapper is imported, so the host never has to call `defineOjaDiagram`.
import "@oh-just-another/diagram";
import {
  applyOjaDiagramProps,
  bindOjaDiagramEvents,
  ojaDiagramController,
  type DiagramRenderer,
  type DiagramTheme,
  type OjaDiagramController,
  type OjaDiagramElement,
  type OjaDiagramEventMap,
} from "@oh-just-another/diagram";
import type { Scene } from "@oh-just-another/scene";

/**
 * `<oja-diagram-ng>` — a thin Angular standalone component over the
 * `<oja-diagram>` custom element. Inputs map one-to-one to the element's
 * configuration; the four element events re-emit as Angular outputs
 * (`(ready)`, `(scenechange)`, `(selectionchange)`, `(themechange)`). The
 * element is driven imperatively rather than through the template so
 * custom-element property-vs-attribute quirks never bite, and the binding
 * logic itself lives once in `@oh-just-another/diagram`.
 *
 * Imperative control (`undo`, `loadScene`, …) is reachable through the
 * component instance (template reference variable or `viewChild`) — it
 * implements the curated {@link OjaDiagramController} surface.
 */
@Component({
  selector: "oja-diagram-ng",
  standalone: true,
  template: `<oja-diagram #el style="display:block;width:100%;height:100%"></oja-diagram>`,
  styles: [":host{display:block;width:100%;height:100%}"],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DiagramComponent implements AfterViewInit, OnChanges, OnDestroy, OjaDiagramController {
  @Input() scene?: Scene;
  @Input() theme?: DiagramTheme;
  @Input() renderer?: DiagramRenderer;
  @Input() grid = false;
  @Input() snap = false;

  @Output() readonly ready = new EventEmitter<OjaDiagramEventMap["ready"]>();
  @Output() readonly scenechange = new EventEmitter<OjaDiagramEventMap["scenechange"]>();
  @Output() readonly selectionchange = new EventEmitter<OjaDiagramEventMap["selectionchange"]>();
  @Output() readonly themechange = new EventEmitter<OjaDiagramEventMap["themechange"]>();

  @ViewChild("el", { static: true })
  private readonly elRef?: ElementRef<OjaDiagramElement>;

  private unbind: (() => void) | null = null;
  private readonly controller: OjaDiagramController = ojaDiagramController(
    () => this.elRef?.nativeElement ?? null,
  );

  ngAfterViewInit(): void {
    const el = this.elRef?.nativeElement;
    if (!el) return;
    this.sync();
    this.unbind = bindOjaDiagramEvents(el, {
      ready: (detail) => {
        this.ready.emit(detail);
      },
      scenechange: (detail) => {
        this.scenechange.emit(detail);
      },
      selectionchange: (detail) => {
        this.selectionchange.emit(detail);
      },
      themechange: (detail) => {
        this.themechange.emit(detail);
      },
    });
  }

  // One hook over every input — `applyOjaDiagramProps` is idempotent.
  ngOnChanges(): void {
    this.sync();
  }

  ngOnDestroy(): void {
    this.unbind?.();
    this.unbind = null;
  }

  private sync(): void {
    const el = this.elRef?.nativeElement;
    if (!el) return;
    applyOjaDiagramProps(el, {
      scene: this.scene,
      theme: this.theme,
      renderer: this.renderer,
      grid: this.grid,
      snap: this.snap,
    });
  }

  // --- Imperative controller (pass-throughs to the element) ---

  getScene(): Scene | undefined {
    return this.controller.getScene();
  }
  loadScene(scene: Scene): void {
    this.controller.loadScene(scene);
  }
  undo(): void {
    this.controller.undo();
  }
  redo(): void {
    this.controller.redo();
  }
  zoomToFit(): void {
    this.controller.zoomToFit();
  }
  getActiveTool(): ReturnType<OjaDiagramController["getActiveTool"]> {
    return this.controller.getActiveTool();
  }
  setActiveTool(tool: Parameters<OjaDiagramController["setActiveTool"]>[0]): void {
    this.controller.setActiveTool(tool);
  }
  getSelection(): ReturnType<OjaDiagramController["getSelection"]> {
    return this.controller.getSelection();
  }
  setSelection(ids: Parameters<OjaDiagramController["setSelection"]>[0]): void {
    this.controller.setSelection(ids);
  }
}
