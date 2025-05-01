import type { AtlasGlyph, GlyphAtlas } from "@oh-just-another/glyph-atlas";
import type { Transform } from "@oh-just-another/types";

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
  private readonly uTransform: WebGLUniformLocation;
  private readonly uColor: WebGLUniformLocation;
  private readonly uOpacity: WebGLUniformLocation;
  private readonly uAtlasSize: WebGLUniformLocation;
  private readonly uPxRange: WebGLUniformLocation;
  private readonly uAtlas: WebGLUniformLocation;
  private readonly aPos: number;
  private readonly aUV: number;

  constructor(private readonly gl: WebGL2RenderingContext) {
    const vert = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    this.program = link(gl, vert, frag);
    this.vbo = gl.createBuffer()!;
    this.aPos = gl.getAttribLocation(this.program, "aPos");
    this.aUV = gl.getAttribLocation(this.program, "aUV");
    this.uTransform = gl.getUniformLocation(this.program, "uTransform")!;
    this.uColor = gl.getUniformLocation(this.program, "uColor")!;
    this.uOpacity = gl.getUniformLocation(this.program, "uOpacity")!;
    this.uAtlasSize = gl.getUniformLocation(this.program, "uAtlasSize")!;
    this.uPxRange = gl.getUniformLocation(this.program, "uPxRange")!;
    this.uAtlas = gl.getUniformLocation(this.program, "uAtlas")!;
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
  ): number {
    if (text.length === 0) return 0;

    // Walk glyphs, pack interleaved position+uv into one batch. Each
    // glyph = 6 vertices (two triangles), 4 floats per vertex
    // (x, y, u, v) = 24 floats.
    const verticesPerGlyph = 6;
    const floatsPerVertex = 4;
    const buf = new Float32Array(text.length * verticesPerGlyph * floatsPerVertex);
    let writeOffset = 0;
    let cursor = x;
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      const glyph = atlas.getOrRasterize(cp);
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
    gl.uniformMatrix3fv(
      this.uTransform,
      false,
      affineToClipMat3(style.transform, surfaceSize.width, surfaceSize.height),
    );
    gl.uniform3f(this.uColor, style.color[0], style.color[1], style.color[2]);
    gl.uniform1f(this.uOpacity, style.opacity);
    gl.uniform1f(this.uAtlasSize, atlas.atlasSize);
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
  // Atlas UVs — *only* the used rect (top-left at (atlasX, atlasY),
  // size = usedW_atlas × usedH_atlas). The rasteriser writes the
  // glyph right-side-up (y-flip applied in the Rust transform), so
  // UV v=0 maps to the top of the glyph as expected.
  const u0 = g.atlasX / atlas.atlasSize;
  const v0 = g.atlasY / atlas.atlasSize;
  const u1 = (g.atlasX + usedW_atlas) / atlas.atlasSize;
  const v1 = (g.atlasY + usedH_atlas) / atlas.atlasSize;
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
      left,  top,    u0, v0,
      right, top,    u1, v0,
      left,  bottom, u0, v1,
      right, top,    u1, v0,
      right, bottom, u1, v1,
      left,  bottom, u0, v1,
    ],
    offset,
  );
};

/**
 * Build the column-major mat3 the shader expects. Mirrors the
 * solid-fill program's transform pipeline: editor affine maps
 * (worldX, worldY) → screen pixels, then we scale pixels into
 * clip space (-1..1) with a y flip so positive y goes down on the
 * screen — same convention every other 2D backend in this kernel
 * uses.
 */
const affineToClipMat3 = (t: Transform, w: number, h: number): Float32Array => {
  const sx = 2 / w;
  const sy = -2 / h;
  return new Float32Array([
    t.a * sx, t.b * sy, 0,
    t.c * sx, t.d * sy, 0,
    t.e * sx - 1, t.f * sy + 1, 1,
  ]);
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
  fragColor = vec4(uColor, alpha * uOpacity);
}`;

const compile = (gl: WebGL2RenderingContext, type: number, src: string): WebGLShader => {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`MSDF shader compile failed: ${log}`);
  }
  return sh;
};

const link = (
  gl: WebGL2RenderingContext,
  vert: WebGLShader,
  frag: WebGLShader,
): WebGLProgram => {
  const program = gl.createProgram()!;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`MSDF program link failed: ${log}`);
  }
  return program;
};
