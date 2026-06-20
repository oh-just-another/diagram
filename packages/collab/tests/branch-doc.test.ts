import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  updateElement,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { BranchDoc } from "../src/branch-doc";

const seed = (): Scene => {
  let s = emptyScene();
  const a: Element = {
    id: elementId("a"),
    layerId: DEFAULT_LAYER_ID,
    type: "rectangle",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: { fill: "#aaa" },
    width: 40,
    height: 40,
  };
  const b: Element = {
    ...a,
    id: elementId("b"),
    position: { x: 100, y: 0 },
    style: { fill: "#bbb" },
  };
  ({ scene: s } = addElement(s, a));
  ({ scene: s } = addElement(s, b));
  return s;
};

describe("BranchDoc", () => {
  it("ensureRoot seeds the main branch with the initial scene", () => {
    const bd = new BranchDoc();
    bd.ensureRoot("main", "main", seed());
    const snap = bd.sceneDocFor("main").snapshot();
    expect(snap.elements.size).toBe(2);
  });

  it("createBranch forks the parent's current scene", () => {
    const bd = new BranchDoc();
    bd.ensureRoot("main", "main", seed());
    bd.createBranch("feat", "feat", "main");
    const out = bd.sceneDocFor("feat").snapshot();
    expect(out.elements.size).toBe(2);
    expect(out.elements.get(elementId("a"))?.position).toEqual({ x: 0, y: 0 });
  });

  it("auto-merges non-conflicting changes from source into target", async () => {
    const bd = new BranchDoc();
    bd.ensureRoot("main", "main", seed());
    bd.createBranch("feat", "feat", "main");

    // Source moves shape "a", target leaves it alone — should auto-merge.
    const featDoc = bd.sceneDocFor("feat");
    const featSnap = featDoc.snapshot();
    const { scene: featMoved } = updateElement(featSnap, elementId("a"), (s) => ({
      ...s,
      position: { x: 999, y: 999 },
    }));
    featDoc.replace(featMoved);

    const report = await bd.mergeBranch(
      { id: "feat", name: "feat", parentVersionId: "main" },
      { id: "main", name: "main", parentVersionId: null },
    );
    expect(report.conflicts).toHaveLength(0);
    expect(report.autoMerged.elements.get(elementId("a"))?.position).toEqual({ x: 999, y: 999 });
  });

  it("reports a conflict when both branches edit the same shape", async () => {
    const bd = new BranchDoc();
    bd.ensureRoot("main", "main", seed());
    bd.createBranch("feat", "feat", "main");

    const featDoc = bd.sceneDocFor("feat");
    const { scene: featMoved } = updateElement(featDoc.snapshot(), elementId("a"), (s) => ({
      ...s,
      position: { x: 100, y: 100 },
    }));
    featDoc.replace(featMoved);

    const mainDoc = bd.sceneDocFor("main");
    const { scene: mainMoved } = updateElement(mainDoc.snapshot(), elementId("a"), (s) => ({
      ...s,
      position: { x: 50, y: 50 },
    }));
    mainDoc.replace(mainMoved);

    const report = await bd.mergeBranch(
      { id: "feat", name: "feat", parentVersionId: "main" },
      { id: "main", name: "main", parentVersionId: null },
    );
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0]!.elementId).toBe(elementId("a"));
  });

  it("applyConflictResolution honours the chosen side", async () => {
    const bd = new BranchDoc();
    bd.ensureRoot("main", "main", seed());
    bd.createBranch("feat", "feat", "main");

    const featDoc = bd.sceneDocFor("feat");
    const { scene: featMoved } = updateElement(featDoc.snapshot(), elementId("a"), (s) => ({
      ...s,
      position: { x: 100, y: 100 },
    }));
    featDoc.replace(featMoved);

    const mainDoc = bd.sceneDocFor("main");
    const { scene: mainMoved } = updateElement(mainDoc.snapshot(), elementId("a"), (s) => ({
      ...s,
      position: { x: 50, y: 50 },
    }));
    mainDoc.replace(mainMoved);

    const report = await bd.mergeBranch(
      { id: "feat", name: "feat", parentVersionId: "main" },
      { id: "main", name: "main", parentVersionId: null },
    );
    const merged = await bd.applyConflictResolution(report, [
      { elementId: elementId("a"), choice: "theirs" },
    ]);
    expect(merged.elements.get(elementId("a"))?.position).toEqual({ x: 100, y: 100 });
  });

  it("commitMerge writes back to target and re-baselines source ancestor", async () => {
    const bd = new BranchDoc();
    bd.ensureRoot("main", "main", seed());
    bd.createBranch("feat", "feat", "main");

    const featDoc = bd.sceneDocFor("feat");
    const { scene: featMoved } = updateElement(featDoc.snapshot(), elementId("a"), (s) => ({
      ...s,
      position: { x: 999, y: 999 },
    }));
    featDoc.replace(featMoved);

    const report = await bd.mergeBranch(
      { id: "feat", name: "feat", parentVersionId: "main" },
      { id: "main", name: "main", parentVersionId: null },
    );
    bd.commitMerge("feat", "main", report.autoMerged);

    // Target now has the merged scene.
    expect(bd.sceneDocFor("main").snapshot().elements.get(elementId("a"))?.position).toEqual({
      x: 999,
      y: 999,
    });

    // Second merge from feat should now report zero conflicts /
    // applied changes (ancestor caught up with the merged state).
    const report2 = await bd.mergeBranch(
      { id: "feat", name: "feat", parentVersionId: "main" },
      { id: "main", name: "main", parentVersionId: null },
    );
    expect(report2.applied).toHaveLength(0);
    expect(report2.conflicts).toHaveLength(0);
  });
});
