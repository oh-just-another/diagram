import type { AtlasGlyph, GlyphAtlas } from "@oh-just-another/glyph-atlas";
import type { Transform } from "@oh-just-another/types";
import { compileShader, glReq, linkProgram } from "./webgl-helpers.js";

/**
 * MSDF text-rendering glue for WebGL2Target. Owns the dedicated shader
 * program (vertex quad + median3 + smoothstep AA fragment), a reusable
 * VBO, and the per-frame batching logic.
 *
 * The MSDF pipeline has its own shader, uniforms and vertex layout that
 * share nothing with the solid / stroke / image programs, so it lives
 * in its own module and is independently testable.
 *
 * One instance per WebGL2 context. `dispose()` releases the program and
 * VBO.
 */
export interface Msdf2DTextStyle {
  /** Premultiplied alpha 0..1. */
  readonly opacity: number;
  /** Fill colour as normalised RGB (0..1 per channel). */
  readonly color: readonly [number, number, number];
  /** Current world→screen affine. */
  readonly transform: Transform;
}

export class MsdfTextPipeline {
  private readonly program: WebGLProgram;
  private readonly vbo: WebGLBuffer;
  private readonly uTransform: WebGLUniformLocation | null;
  private readonly uColor: WebGLUniformLocation | null;
  private readonly uOpacity: WebGLUniformLocation | null;
  private readonly uPxRange: WebGLUniformLocation | null;
  private readonly uAtlas: WebGLUniformLocation | null;
  private readonly aPos: number;
  private readonly aUV: number;

  constructor(private readonly gl: WebGL2RenderingContext) {
    const vert = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC, "MSDF");
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC, "MSDF");
    this.program = linkProgram(gl, vert, frag, "MSDF");
    this.vbo = glReq(gl.createBuffer());
    this.aPos = gl.getAttribLocation(this.program, "aPos");
    this.aUV = gl.getAttribLocation(this.program, "aUV");
    this.uTransform = gl.getUniformLocation(this.program, "uTransform");
    this.uColor = gl.getUniformLocation(this.program, "uColor");
    this.uOpacity = gl.getUniformLocation(this.program, "uOpacity");
    this.uPxRange = gl.getUniformLocation(this.program, "uPxRange");
    this.uAtlas = gl.getUniformLocation(this.program, "uAtlas");
  }

  /**
   * Build per-glyph quads for `text` starting at the cursor position
   * `(x, y)` in world coordinates (top-left baseline convention —
   * caller adjusts for textAlign / textBaseline upstream).
   *
   * Returns the screen-width of the rendered string in world units so
   * callers can chain text or compute hit-test boxes. Returns 0 if the
   * atlas couldn't bake one of the glyphs (atlas full) — the partial
   * draw still lands.
   */
  drawText(
    text: string,
    x: number,
    y: number,
    fontSize: number,
    atlas: GlyphAtlas,
    style: Msdf2DTextStyle,
    surfaceSize: { width: number; height: number },
    /**
     * Horizontal alignment factor: 0 = left (cursor at `x`), 0.5 =
     * centre, 1 = right. Applied as a single world-space x shift after
     * measuring the run, so there's no separate width-measuring walk
     * over the atlas.
     */
    alignFactor = 0,
    /** Embedded font id (0=sans, 1=serif, 2=mono); selects atlas glyphs. */
    fontId = 0,
  ): number {
    if (text.length === 0) return 0;

    // Walk glyphs, pack interleaved position+uv into one batch. Each
    // glyph = 6 vertices (two triangles), 4 floats per vertex
    // (x, y, u, v) = 24 floats.
    const verticesPerGlyph = 6;
    const floatsPerVertex = 4;
    const needed = text.length * verticesPerGlyph * floatsPerVertex;
    // Reuse the module-level scratch buffer — grow on demand.
    ensureGlyphBufCapacity(needed);
    const buf = scratchGlyphBuf;
    let writeOffset = 0;
    let cursor = x;
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp === undefined) continue;
      const glyph = atlas.getOrRasterize(cp, fontId);
      if (!glyph) break; // atlas full or shaper unavailable
      const advancePx = (glyph.advance * fontSize) / glyph.unitsPerEm;
      if (glyph.empty) {
        cursor += advancePx;
        continue;
      }
      writeGlyphQuad(buf, writeOffset, glyph, cursor, y, fontSize, atlas);
      writeOffset += verticesPerGlyph * floatsPerVertex;
      cursor += advancePx;
    }
    if (writeOffset === 0) return cursor - x; // every glyph empty / unavailable

    const tex = atlas.uploadTo(this.gl);
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, buf.subarray(0, writeOffset), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(this.aUV);
    gl.vertexAttribPointer(this.aUV, 2, gl.FLOAT, false, 16, 8);
    // Alignment: shift the whole run left by `width × alignFactor` in
    // world space, folded into the transform's translation (screen
    // shift = column-0 × worldDx). One walk total — no separate width
    // measurement pass.
    const t = style.transform;
    let mat = t;
    if (alignFactor !== 0) {
      const dx = -(cursor - x) * alignFactor;
      mat = { ...t, e: t.e + t.a * dx, f: t.f + t.b * dx };
    }
    writeAffineToClipMat3(scratchMat3, mat, surfaceSize.width, surfaceSize.height);
    gl.uniformMatrix3fv(this.uTransform, false, scratchMat3);
    gl.uniform3f(this.uColor, style.color[0], style.color[1], style.color[2]);
    gl.uniform1f(this.uOpacity, style.opacity);
    // `pxRange` is the SDF range converted into screen pixels at the
    // current font size: the shader needs it to keep the AA band the
    // right thickness independent of zoom.
    const tileGlyphPx = atlas.tileSize - 2 * atlas.range;
    const pxRange = (atlas.range * fontSize) / Math.max(1, tileGlyphPx);
    gl.uniform1f(this.uPxRange, pxRange);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.uAtlas, 0);
    gl.drawArrays(gl.TRIANGLES, 0, writeOffset / floatsPerVertex);
    return cursor - x;
  }

  dispose(): void {
    this.gl.deleteBuffer(this.vbo);
    this.gl.deleteProgram(this.program);
  }
}

/**
 * Pure-math helper: compute the screen-space rect + atlas UV rect for
 * one glyph. Exported so tests can verify the geometry without booting
 * a real WebGL2 context.
 *
 * Returns `{ left, top, right, bottom, u0, v0, u1, v1 }` in screen
 * pixels / normalised UVs. Caller packs the six vertices into a vertex
 * buffer.
 */
export const glyphQuadGeometry = (
  g: AtlasGlyph,
  cursorX: number,
  cursorY: number,
  fontSize: number,
  atlas: { atlasSize: number; tileSize: number; range: number },
): {
  left: number;
  top: number;
  right: number;
  bottom: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
} => {
  const unitToPx = fontSize / g.unitsPerEm;
  // The MSDF tile is `tileSize × tileSize` but the glyph itself only
  // occupies a `scaledW + 2*range` × `scaledH + 2*range` rectangle
  // inside it — the rest of the tile is empty ("fully outside" SDF).
  // The rasteriser scales by max(bboxW, bboxH) so the bigger axis fills
  // `tileSize - 2*range` and the smaller axis is proportional. UVs must
  // cover only that used rect, otherwise narrow letters ('i', 'l', 'I')
  // get the empty atlas margin stretched into them and read as
  // wide/skewed/distorted.
  const tileGlyphAtlasPx = Math.max(1, atlas.tileSize - 2 * atlas.range);
  const fontUnitsPerAtlasPx = Math.max(g.bboxW, g.bboxH) / tileGlyphAtlasPx;
  // Atlas pixels occupied by the glyph + its SDF margin.
  const usedW_atlas = g.bboxW / fontUnitsPerAtlasPx + 2 * atlas.range;
  const usedH_atlas = g.bboxH / fontUnitsPerAtlasPx + 2 * atlas.range;
  // Screen-pixel margin = the same `range` atlas pixels mapped through
  // `fontUnitsPerAtlasPx × unitToPx`.
  const marginPx = atlas.range * fontUnitsPerAtlasPx * unitToPx;
  const w = g.bboxW * unitToPx + 2 * marginPx;
  const h = g.bboxH * unitToPx + 2 * marginPx;
  // Glyph quad position in screen coords (y-down). `cursorY` is the
  // text baseline; the font bbox lives from baseline upward, so the
  // glyph top sits at `cursor - bboxYMax * unitToPx`.
  const left = cursorX + g.bboxXMin * unitToPx - marginPx;
  const top = cursorY + (-g.bboxYMin - g.bboxH) * unitToPx - marginPx;
  const right = left + w;
  const bottom = top + h;
  // Atlas UVs — cover the used rect, inset by half a texel on every
  // side so the LINEAR filter never pulls in pixels from the adjacent
  // tile. Without this inset the LINEAR sampler at a tile boundary
  // averages the current glyph's edge with the neighbouring tile, which
  // shows up as faint vertical / horizontal stripes between adjacent
  // letters at certain zooms.
  //
  // The rasteriser writes the glyph right-side-up (y-flip applied in
  // the Rust transform), so UV v=0 maps to the top of the glyph.
  const inset = 0.5;
  const u0 = (g.atlasX + inset) / atlas.atlasSize;
  const v0 = (g.atlasY + inset) / atlas.atlasSize;
  const u1 = (g.atlasX + usedW_atlas - inset) / atlas.atlasSize;
  const v1 = (g.atlasY + usedH_atlas - inset) / atlas.atlasSize;
  return { left, top, right, bottom, u0, v0, u1, v1 };
};

const writeGlyphQuad = (
  buf: Float32Array,
  offset: number,
  g: AtlasGlyph,
  cursorX: number,
  cursorY: number,
  fontSize: number,
  atlas: GlyphAtlas,
): void => {
  const { left, top, right, bottom, u0, v0, u1, v1 } = glyphQuadGeometry(
    g,
    cursorX,
    cursorY,
    fontSize,
    atlas,
  );
  // Two triangles, six vertices, (x, y, u, v) each.
  buf.set(
    [
      left,
      top,
      u0,
      v0,
      right,
      top,
      u1,
      v0,
      left,
      bottom,
      u0,
      v1,
      right,
      top,
      u1,
      v0,
      right,
      bottom,
      u1,
      v1,
      left,
      bottom,
      u0,
      v1,
    ],
    offset,
  );
};

/**
 * Module-level scratch buffers — reused across every `drawText`
 * invocation so the text hot path allocates zero `Float32Array`s after
 * warmup.
 *
 * `scratchGlyphBuf` starts at 512 floats (21 chars worth of glyph
 * quads); longer strings grow to the next power of 2. `scratchMat3` is
 * a fixed mat3 (column-major), no grow needed.
 *
 * Safe for single-threaded WebGL — `drawText` is not reentrant, calls
 * are serialised through the editor render loop. Multiple WebGL2Target
 * instances share the buffer, which is fine.
 */
let scratchGlyphBuf = new Float32Array(512);
const scratchMat3 = new Float32Array(9);

const ensureGlyphBufCapacity = (n: number): void => {
  if (scratchGlyphBuf.length >= n) return;
  let cap = scratchGlyphBuf.length;
  while (cap < n) cap *= 2;
  scratchGlyphBuf = new Float32Array(cap);
};

/**
 * Write the column-major mat3 the shader expects into a caller-owned
 * scratch buffer. The editor affine maps (worldX, worldY) → screen
 * pixels, then we scale pixels into clip space (-1..1) with a y flip so
 * positive y goes down on the screen.
 */
const writeAffineToClipMat3 = (out: Float32Array, t: Transform, w: number, h: number): void => {
  const sx = 2 / w;
  const sy = -2 / h;
  out[0] = t.a * sx;
  out[1] = t.b * sy;
  out[2] = 0;
  out[3] = t.c * sx;
  out[4] = t.d * sy;
  out[5] = 0;
  out[6] = t.e * sx - 1;
  out[7] = t.f * sy + 1;
  out[8] = 1;
};

const VERTEX_SRC = `#version 300 es
in vec2 aPos;
in vec2 aUV;
uniform mat3 uTransform;
out vec2 vUV;
void main() {
  vec3 p = uTransform * vec3(aPos, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
  vUV = aUV;
}`;

/**
 * Standard MSDF fragment shader: sample the 3-channel SDF, take the
 * median of (r, g, b) to recover a single signed distance, and use
 * `smoothstep` to antialias the 0.5 isoline. `pxRange` controls how
 * wide the AA band is in screen pixels — without it the smoothstep
 * collapses to a hard edge at high zoom and over-blurs at low zoom.
 *
 * The 0.5 isoline is the canonical inside/outside boundary for MSDF
 * (the generator centres the distance field on 0.5 in u8 encoding:
 * 0 = deep outside, 128 = on the edge, 255 = deep inside).
 */
const FRAGMENT_SRC = `#version 300 es
precision mediump float;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uPxRange;
uniform sampler2D uAtlas;
in vec2 vUV;
out vec4 fragColor;

float median(float r, float g, float b) {
  return max(min(r, g), min(max(r, g), b));
}

void main() {
  vec3 msd = texture(uAtlas, vUV).rgb;
  float sd = median(msd.r, msd.g, msd.b);
  // Convert signed distance to screen-space AA: fwidth(vUV) tracks how
  // much UV changes per screen pixel, multiplied by pxRange gives the
  // screen-pixel cover of one SDF step.
  float dx = fwidth(sd) * 0.5;
  float alpha = smoothstep(0.5 - dx, 0.5 + dx, sd);
  if (alpha < 0.001) discard;
  // Premultiplied output to match the context's premultipliedAlpha
  // contract + blendFunc(ONE, 1-SRC_ALPHA).
  float a = alpha * uOpacity;
  fragColor = vec4(uColor * a, a);
}`;
