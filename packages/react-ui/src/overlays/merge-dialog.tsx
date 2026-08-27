import { useMemo, useState, type CSSProperties } from "react";
import {
  mergeBranchHeads,
  resolveConflict,
  type ConflictResolution,
  type MergeReport,
  type SceneConflict,
  type SnapshotStore,
  type VersionId,
} from "@oh-just-another/versioning";
import { Modal } from "../primitives/modal.js";

/**
 * Modal that drives a three-way branch merge. The host supplies the
 * `SnapshotStore`, source / target branch heads, and an `onApply`
 * callback that takes the merged scene (typically calling
 * `editor.loadScene` and then `store.capture` to record the result).
 *
 * Conflicts are listed per-item; the user picks `source` / `target` /
 * `both` before clicking Apply. Auto-mergeable changes ride along in
 * the merged scene without UI noise.
 */
export interface MergeDialogProps {
  readonly store: SnapshotStore;
  readonly sourceVersionId: VersionId;
  readonly targetVersionId: VersionId;
  readonly onApply: (mergedScene: MergeReport["mergedScene"]) => void;
  readonly onCancel: () => void;
  readonly style?: CSSProperties;
}

export const MergeDialog = ({
  store,
  sourceVersionId,
  targetVersionId,
  onApply,
  onCancel,
  style,
}: MergeDialogProps) => {
  const report = useMemo(
    () => mergeBranchHeads(store, sourceVersionId, targetVersionId),
    [store, sourceVersionId, targetVersionId],
  );
  const [picks, setPicks] = useState<ReadonlyMap<string, ConflictResolution>>(new Map());

  const pickFor = (c: SceneConflict): ConflictResolution =>
    picks.get(conflictKey(c)) ?? defaultPick(c);

  const setPick = (c: SceneConflict, pick: ConflictResolution): void => {
    const next = new Map(picks);
    next.set(conflictKey(c), pick);
    setPicks(next);
  };

  const onApplyClick = (): void => {
    let merged = report.mergedScene;
    for (const c of report.conflicts) {
      const pick = pickFor(c);
      if (pick === "both") continue; // host handles duplication
      merged = resolveConflict(merged, c, pick);
    }
    onApply(merged);
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title="Merge branches"
      style={{
        width: 480,
        maxHeight: "80vh",
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      <header
        className="du-modal-header"
        style={{ flexDirection: "column", alignItems: "stretch" }}
      >
        <h2 className="du-modal-title">Merge branches</h2>
        <p className="du-modal-subtitle">
          Auto-applied {report.applied.length} change{report.applied.length === 1 ? "" : "s"}.{" "}
          {report.conflicts.length} conflict{report.conflicts.length === 1 ? "" : "s"} need
          resolution.
        </p>
      </header>
      <div className="du-modal-body" style={{ flex: 1, overflowY: "auto" }}>
        {report.conflicts.length === 0 ? (
          <p className="du-modal-subtitle">No conflicts — ready to apply.</p>
        ) : (
          report.conflicts.map((c) => (
            <ConflictRow
              key={conflictKey(c)}
              conflict={c}
              pick={pickFor(c)}
              onPick={(p) => {
                setPick(c, p);
              }}
            />
          ))
        )}
      </div>
      <footer className="du-modal-footer">
        <button type="button" className="du-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="du-button du-button-primary" onClick={onApplyClick}>
          Apply
        </button>
      </footer>
    </Modal>
  );
};

const ConflictRow = ({
  conflict,
  pick,
  onPick,
}: {
  readonly conflict: SceneConflict;
  readonly pick: ConflictResolution;
  readonly onPick: (p: ConflictResolution) => void;
}) => (
  <div className="du-merge-conflict">
    <div className="du-merge-conflict-title">
      {conflict.kind} • {String(conflict.id)}
    </div>
    <div className="du-merge-conflict-picks">
      {(["source", "target", "both"] as const).map((side) => (
        <label key={side} className="du-merge-conflict-pick">
          <input
            type="radio"
            checked={pick === side}
            onChange={() => {
              onPick(side);
            }}
            name={`pick-${String(conflict.id)}`}
          />
          {side}
        </label>
      ))}
    </div>
  </div>
);

const conflictKey = (c: SceneConflict): string => `${c.kind}:${String(c.id)}`;

const defaultPick = (c: SceneConflict): ConflictResolution =>
  c.source !== null ? "source" : c.target !== null ? "target" : "source";
