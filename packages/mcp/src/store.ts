import { randomUUID } from "node:crypto";
import type { Scene } from "@oh-just-another/scene";

/** Error thrown by tool handlers; its message is safe to relay to the client. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

/**
 * In-memory scene registry for one MCP server process. Scenes live for the
 * lifetime of the stdio session — no persistence, no network.
 */
export class SceneStore {
  private readonly scenes = new Map<string, Scene>();

  /** Register a scene under a fresh id and return the id. */
  add(scene: Scene): string {
    const id = randomUUID();
    this.scenes.set(id, scene);
    return id;
  }

  /** Get a scene or throw a client-friendly error. */
  get(sceneId: string): Scene {
    const scene = this.scenes.get(sceneId);
    if (!scene) {
      throw new ToolError(
        `Unknown sceneId "${sceneId}". Create one with create_scene, load_scene, or import_mermaid.`,
      );
    }
    return scene;
  }

  /** Replace the scene stored under an existing id. */
  set(sceneId: string, scene: Scene): void {
    if (!this.scenes.has(sceneId)) {
      throw new ToolError(`Unknown sceneId "${sceneId}".`);
    }
    this.scenes.set(sceneId, scene);
  }
}
