# @oh-just-another/history

L1 undo / redo for `@oh-just-another/scene` patches.

Pure logic — no DOM, no Node API. Depends only on `@types` and `@scene`. The class owns no scene; callers push patches and apply the returned inverse / replay patches themselves.

## Why a separate package

History is what's needed to make `Editor` (in `@state`) commit drags as a single undo step, but it is also useful outside the editor:

- A collab pipeline (Phase 13) can reuse the patch-based model.
- A headless / CLI tool can rebuild scenes by replaying patches.
- A server can audit operations by collecting `Patch`es from clients.

## Quick start

```ts
import { History } from "@oh-just-another/history";
import { apply } from "@oh-just-another/scene";

const history = new History({ limit: 100 });

// Single op
history.push(patch);
scene = apply(scene, history.undo()!); // returns the inverse to apply
scene = apply(scene, history.redo()!); // re-apply the original

// Gesture: many patches → one undo step
const tx = history.transaction();
for (const p of dragPatches) tx.add(p);
tx.commit(); // merged per entity: 100 moves of one shape collapse to 1
```

## API

| Name                                  | Purpose                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `new History(options?)`               | Construct. `options.limit` (default `Infinity`), `options.mergeTransactions` (default `true`).               |
| `push(patch)`                         | Append. Clears the redo stack. No-ops are skipped.                                                           |
| `undo() / redo()`                     | Return the patch to apply (inverse for undo), or `null` if empty. Moves the record onto the other stack.     |
| `canUndo / canRedo / size / redoSize` | Stack introspection.                                                                                         |
| `clear()`                             | Drop both stacks.                                                                                            |
| `transaction()`                       | Open a transaction. Returns `{ add, commit, cancel, isOpen }`.                                               |
| `hasOpenTransaction()`                | True between `transaction()` and `commit/cancel()`.                                                          |
| `record(patch, { transaction? })`     | Route through a given open transaction, or `push` directly.                                                  |
| `mergeByEntity(patches)`              | Standalone helper: collapses a patch list per entity (first.`before` / latest.`after`). Used internally too. |

## Design notes

- **`History` owns no scene.** Returning patches (not applying them) keeps the class trivial to test, lets the host integrate with any state container, and makes the same instance reusable for offline replay.
- **`undo()` returns the _inverse_ patch; `redo()` returns the _original_.** That is the form callers need at the application site.
- **Transactions merge per entity by default.** A 100-tick drag of one shape becomes one undo record with `before = shape-at-press`, `after = shape-at-up`. Disable for debug logs that want every intermediate state.
- **Selection should not be a patch.** Most editors (standard, standard) exclude selection from undo. The kernel doesn't enforce it — just don't `push` selection-only changes.
- **Branches (CRDT)** will live alongside the linear stack when Phase 13 lands; the API will gain an `apply(remotePatch)` path without breaking `undo/redo` semantics for local operations.

