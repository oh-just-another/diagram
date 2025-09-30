import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Element,
} from "@oh-just-another/scene";
import { DEFAULT_BRANCH_ID, SnapshotStore } from "../src/index";

const author = { id: "u1", name: "Alice" };

const rect = (id: string, x = 0, y = 0): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 10,
  height: 10,
});

describe("SnapshotStore — capture + branches", () => {
  it("starts with empty main branch and no snapshots", () => {
    const store = new SnapshotStore();
    expect(store.list()).toHaveLength(0);
    expect(store.branches()).toHaveLength(1);
    expect(store.branches()[0]?.id).toBe(DEFAULT_BRANCH_ID);
    expect(store.currentBranchId).toBe(DEFAULT_BRANCH_ID);
  });

  it("capture appends to current branch and updates head", () => {
    const store = new SnapshotStore();
    const scene = emptyScene();
    const v1 = store.capture({ scene, author, message: "first" });
    expect(v1.branchId).toBe(DEFAULT_BRANCH_ID);
    expect(v1.parentId).toBe(null);
    expect(store.branches()[0]?.head).toBe(v1.id);

    const v2 = store.capture({ scene, author, message: "second" });
    expect(v2.parentId).toBe(v1.id);
    expect(store.listBranch(DEFAULT_BRANCH_ID)).toEqual([v1, v2]);
  });

  it("branch() creates a divergent branch rooted at given snapshot", () => {
    const store = new SnapshotStore();
    const v1 = store.capture({ scene: emptyScene(), author, message: "init" });
    const feature = store.branch({ name: "feature", fromVersion: v1.id });
    expect(feature.parentVersionId).toBe(v1.id);
    expect(feature.parentBranchId).toBe(DEFAULT_BRANCH_ID);
    expect(feature.head).toBe(null);

    store.setCurrentBranch(feature.id);
    const v2 = store.capture({ scene: emptyScene(), author, message: "feature work" });
    expect(v2.branchId).toBe(feature.id);
    expect(v2.parentId).toBe(null);
    expect(store.listBranch(feature.id)).toEqual([v2]);
    // main branch unaffected
    expect(store.listBranch(DEFAULT_BRANCH_ID)).toEqual([v1]);
  });

  it("subscribe fires on capture and branch", () => {
    const store = new SnapshotStore();
    let calls = 0;
    const unsub = store.subscribe(() => calls++);
    const v = store.capture({ scene: emptyScene(), author, message: "a" });
    const newBranch = store.branch({ name: "x", fromVersion: v.id });
    store.setCurrentBranch(newBranch.id);
    expect(calls).toBe(3);
    unsub();
  });

  it("export/import round-trips state", () => {
    const a = new SnapshotStore();
    let scene = emptyScene();
    ({ scene } = addElement(scene, rect("r1")));
    const v1 = a.capture({ scene, author, message: "first" });
    const feat = a.branch({ name: "alt", fromVersion: v1.id });
    a.setCurrentBranch(feat.id);
    a.capture({ scene, author, message: "alt-1" });

    const dump = a.export();
    const b = new SnapshotStore();
    b.import(dump);
    expect(b.list()).toHaveLength(2);
    expect(b.branches()).toHaveLength(2);
    // After import currentBranch resets to main.
    expect(b.currentBranchId).toBe(DEFAULT_BRANCH_ID);
  });
});
