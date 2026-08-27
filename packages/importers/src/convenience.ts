import type { Scene } from "@oh-just-another/scene";
import { parseMermaid } from "./mermaid.js";
import { parseDot } from "./dot.js";
import { parseDrawio } from "./drawio.js";
import { graphToScene } from "./to-scene.js";

/** One-shot converters: parse a text document into a laid-out scene. */
export const importMermaid = (source: string): Scene => graphToScene(parseMermaid(source));
export const importDot = (source: string): Scene => graphToScene(parseDot(source));
export const importDrawio = (source: string): Scene => graphToScene(parseDrawio(source));
