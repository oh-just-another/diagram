/**
 * Edge length of the WebGL2 texture that backs the atlas. WebGL2
 * mandates `MAX_TEXTURE_SIZE ≥ 2048`; 2048 is universally supported
 * and gives 64 × 64 = 4096 glyph slots at the default tile size —
 * well past every script the editor typically displays. Hosts that
 * render exotic CJK / emoji ranges can pass a larger size (`4096`
 * is also widely supported) at the cost of one larger upload.
 */
export const DEFAULT_ATLAS_SIZE = 2048;

/**
 * Per-glyph tile edge in atlas pixels (a single tile holds one
 * glyph's MSDF). 32 px is the sweet spot found in the Mapbox /
 * Valve writeups: small enough to fit thousands of glyphs in one
 * 2048 atlas, large enough that the SDF range still has 4-pixel
 * headroom on every side for `smoothstep` antialiasing.
 *
 * Tile size **does not** equal the rendered glyph size — the shader
 * samples the MSDF and scales freely. So 32 px tiles render crisply
 * at 8 px or 800 px alike.
 */
export const DEFAULT_TILE_SIZE = 32;

/**
 * SDF range in atlas pixels. Controls how many pixels of the tile
 * sit outside the glyph's tight bbox as a "soft" band where the
 * shader's `smoothstep` can blend the edge. 4 px → 1/8th of a
 * 32-px tile is reserved for the band on every side, leaving a
 * 24×24 area for the glyph itself. Lower → sharper edges with
 * less AA freedom; higher → softer edges and more wasted texels.
 */
export const DEFAULT_RANGE = 4;
