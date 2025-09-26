import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addShape,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Element,
} from "@oh-just-another/scene";
import { importIntoStore, serializeStore, SnapshotStore, stringifyStore } from "../src/index";

const author = { id: "u1", name: "Alice" };

const rect = (id: string): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 1, y: 2 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#abc" },
  width: 10,
  height: 10,
});

describe("snapshot store serialization", () => {
  it("round-trips snapshots + branches through serializeStore / importIntoStore", () => {
    const a = new SnapshotStore();
    let scene = emptyScene();
    ({ scene } = addShape(scene, rect("r1")));
    const v1 = a.capture({ scene, author, message: "init" });
    const feat = a.branch({ name: "feature", fromVersion: v1.id });
    a.setCurrentBranch(feat.id);
    a.capture({ scene, author, message: "feat-1" });

    const dump = serializeStore(a);
    expect(dump.snapshots).toHaveLength(2);
    expect(dump.branches).toHaveLength(2);

    const b = new SnapshotStore();
    importIntoStore(b, dump);
    expect(b.list()).toHaveLength(2);
    expect(b.branches().map((br) => br.name)).toEqual(["main", "feature"]);
    // Embedded scenes round-trip too.
    expect(b.get(v1.id)?.scene.shapes.get(elementId("r1"))?.position).toEqual({ x: 1, y: 2 });
  });

  it("stringifyStore produces JSON parseable by importIntoStore (via JSON.parse)", () => {
    const a = new SnapshotStore();
    a.capture({ scene: emptyScene(), author, message: "x" });
    const json = stringifyStore(a);
    const parsed = JSON.parse(json) as ReturnType<typeof serializeStore>;
    expect(parsed.format).toBe("oh-just-another/versioning");
  });
});
