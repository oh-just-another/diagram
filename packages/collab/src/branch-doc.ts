import * as Y from "yjs";
import type { Scene } from "@oh-just-another/scene";
import {
  applyConflictResolutions,
  mergeScenesThreeWay,
} from "@oh-just-another/scene";
import { SceneDoc } from "./scene-doc.js";
import type { ShapeId } from "@oh-just-another/types";
import type {
  BranchId,
  BranchMergeAPI,
  ConflictResolution,
  MergeConflict,
  MergeReport,
} from "./merge.js";

/**
 * Yjs subdoc branch wrapper.
 *
 * Holds a tree of named branches as Y.Doc subdocs inside one
 * parent doc. Each branch is a full `SceneDoc` (shapes / edges /
 * layers / annotations / viewport). The parent doc only stores
 * branch metadata: id → { name, parentBranchId, ancestorScene }.
 *
 * Subdocs in Yjs are independent CRDTs — they can be loaded /
 * unloaded individually and replicate over the same provider as
 * the parent. That lets a host hold dozens of branches without
 * paying the network cost of replicating all of them at once.
 *
 * Merge flow:
 *   1. `createBranch(name, fromBranchId)` clones the source
 *      branch's current scene into a new subdoc; remembers the
 *      cloned snapshot as the common ancestor.
 *   2. Editing a branch's `SceneDoc` mutates only its subdoc.
 *   3. `mergeBranch(source, target)` snapshots both heads, runs
 *      `mergeScenesThreeWay` against the source branch's stored
 *      ancestor, and reports auto-applied changes + conflicts.
 *   4. `applyConflictResolution(report, resolutions)` runs the
 *      pure `applyConflictResolutions` and returns the final
 *      scene; the host is responsible for `editor.loadScene(...)`
 *      and (optionally) committing the merge back into the
 *      target branch's subdoc.
 */

interface BranchMetadata {
  readonly id: string;
  readonly name: string;
  readonly parentBranchId: string | null;
  /** Subdoc guid Yjs uses for replication. */
  readonly subdocGuid: string;
  /** Scene snapshot taken when the branch was forked. */
  readonly ancestorScene: Scene;
}

export class BranchDoc implements BranchMergeAPI {
  readonly doc: Y.Doc;
  private readonly branches: Y.Map<BranchMetadata>;
  private readonly subdocs = new Map<string, Y.Doc>();
  private readonly sceneDocs = new Map<string, SceneDoc>();

  constructor(doc: Y.Doc = new Y.Doc()) {
    this.doc = doc;
    this.branches = doc.getMap<BranchMetadata>("branches");
  }

  /**
   * Create the root branch from an initial scene. Idempotent —
   * if `id` already exists, returns the existing metadata
   * unchanged.
   */
  ensureRoot(id: string, name: string, initialScene: Scene): BranchId {
    const existing = this.branches.get(id);
    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        parentVersionId: existing.parentBranchId,
      };
    }
    const subdoc = new Y.Doc();
    const sceneDoc = new SceneDoc(subdoc);
    sceneDoc.replace(initialScene, "branch-init");
    const meta: BranchMetadata = {
      id,
      name,
      parentBranchId: null,
      subdocGuid: subdoc.guid,
      ancestorScene: cloneScene(initialScene),
    };
    this.branches.set(id, meta);
    this.subdocs.set(id, subdoc);
    this.sceneDocs.set(id, sceneDoc);
    return { id, name, parentVersionId: null };
  }

  /**
   * Fork a new branch from an existing one. The new subdoc starts
   * with a copy of the parent's current scene; that scene is also
   * remembered as the common ancestor for future merges back into
   * any other branch.
   */
  createBranch(id: string, name: string, parentBranchId: string): BranchId {
    const parent = this.requireBranch(parentBranchId);
    const parentDoc = this.requireSceneDoc(parentBranchId);
    const snapshot = parentDoc.snapshot();
    const subdoc = new Y.Doc();
    const sceneDoc = new SceneDoc(subdoc);
    sceneDoc.replace(snapshot, "branch-fork");
    const meta: BranchMetadata = {
      id,
      name,
      parentBranchId: parent.id,
      subdocGuid: subdoc.guid,
      ancestorScene: cloneScene(snapshot),
    };
    this.branches.set(id, meta);
    this.subdocs.set(id, subdoc);
    this.sceneDocs.set(id, sceneDoc);
    return { id, name, parentVersionId: parent.id };
  }

  /** SceneDoc for the named branch (throws when unknown). */
  sceneDocFor(branchId: string): SceneDoc {
    return this.requireSceneDoc(branchId);
  }

  /** Y.Doc subdoc passthrough — required by `BranchMergeAPI`. */
  branchToDoc(branchId: BranchId): Y.Doc {
    return this.requireSubdoc(branchId.id);
  }

  /**
   * Merge `source` into `target`. Uses the source branch's stored
   * ancestor as the three-way merge base. Auto-applied changes
   * land in the returned `autoMerged` scene; conflicts wait for
   * `applyConflictResolution`.
   */
  async mergeBranch(source: BranchId, target: BranchId): Promise<MergeReport> {
    const sMeta = this.requireBranch(source.id);
    const sourceScene = this.requireSceneDoc(source.id).snapshot();
    const targetScene = this.requireSceneDoc(target.id).snapshot();
    // Yjs snapshot allocates fresh shape objects every call — reference
    // equality (the algorithm's default) can't tell "unchanged" from
    // "edited" across two snapshots. JSON.stringify is good enough for
    // plain-object shapes, which is what the kernel ships.
    const report = mergeScenesThreeWay(sMeta.ancestorScene, sourceScene, targetScene, {
      compareShapes: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    });
    const applied: ShapeId[] = [];
    for (const [id, shape] of report.autoMerged.shapes) {
      const prev = targetScene.shapes.get(id);
      if (prev !== shape) applied.push(id);
    }
    const conflicts: MergeConflict[] = report.conflicts.map((c) => ({
      shapeId: c.shapeId,
      base: c.base,
      source: c.source,
      target: c.target,
    }));
    return {
      applied,
      conflicts,
      autoMerged: report.autoMerged,
    };
  }

  /**
   * Resolve a merge report and return the final scene. Pure —
   * does NOT push the result back into any branch's subdoc; the
   * host commits it by calling `sceneDocFor(targetId).replace(
   * finalScene)` when it wants to materialise the merge.
   */
  async applyConflictResolution(
    report: MergeReport,
    resolutions: readonly ConflictResolution[],
  ): Promise<Scene> {
    return applyConflictResolutions(
      {
        autoMerged: report.autoMerged,
        conflicts: report.conflicts.map((c) => ({
          shapeId: c.shapeId,
          base: c.base as never,
          source: c.source as never,
          target: c.target as never,
        })),
      },
      resolutions.map((r) => ({
        shapeId: r.shapeId,
        choice: r.choice === "ours" ? "ours" : r.choice === "theirs" ? "theirs" : "both",
      })),
    );
  }

  /**
   * Commit `scene` into `targetBranchId`'s subdoc and re-baseline
   * the source branch's ancestor so a follow-up merge starts from
   * the post-merge state. Call after `applyConflictResolution`
   * when the host is happy with the result.
   */
  commitMerge(sourceBranchId: string, targetBranchId: string, mergedScene: Scene): void {
    const targetDoc = this.requireSceneDoc(targetBranchId);
    targetDoc.replace(mergedScene, "branch-merge");
    const sMeta = this.requireBranch(sourceBranchId);
    this.branches.set(sourceBranchId, {
      ...sMeta,
      ancestorScene: cloneScene(mergedScene),
    });
  }

  private requireBranch(id: string): BranchMetadata {
    const m = this.branches.get(id);
    if (!m) throw new Error(`BranchDoc: unknown branch "${id}"`);
    return m;
  }

  private requireSceneDoc(id: string): SceneDoc {
    const cached = this.sceneDocs.get(id);
    if (cached) return cached;
    // Subdoc was created in a different session — rehydrate.
    const subdoc = this.requireSubdoc(id);
    const sceneDoc = new SceneDoc(subdoc);
    this.sceneDocs.set(id, sceneDoc);
    return sceneDoc;
  }

  private requireSubdoc(id: string): Y.Doc {
    const cached = this.subdocs.get(id);
    if (cached) return cached;
    const meta = this.requireBranch(id);
    // Create the subdoc shell with the recorded guid so peers
    // converge on the same doc id across sessions.
    const subdoc = new Y.Doc({ guid: meta.subdocGuid });
    this.subdocs.set(id, subdoc);
    return subdoc;
  }
}

/**
 * Deep clone a scene. The Yjs subdoc owns its own copies of
 * shapes / edges / layers, so the ancestor snapshot has to be a
 * detached deep clone — otherwise editor mutations would silently
 * mutate the ancestor and the three-way merge would always see
 * "no changes" on the source side.
 */
const cloneScene = (scene: Scene): Scene => ({
  shapes: new Map(
    [...scene.shapes].map(([id, shape]) => [id, structuredClone(shape)]),
  ),
  edges: new Map(
    [...scene.edges].map(([id, edge]) => [id, structuredClone(edge)]),
  ),
  layers: new Map(
    [...scene.layers].map(([id, layer]) => [id, structuredClone(layer)]),
  ),
  annotations: new Map(
    [...scene.annotations].map(([id, ann]) => [id, structuredClone(ann)]),
  ),
  viewport: structuredClone(scene.viewport),
});
