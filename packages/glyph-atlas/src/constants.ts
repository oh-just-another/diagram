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
 * glyph's MSDF). 64 px gives the glyph itself a 48×48 area (after
 * subtracting two `range`-pixel margins), enough resolution that the
 * bilinear texture filter doesn't round off sharp corners in serif /
 * counter-shape glyphs even at extreme zoom.
 *
 * 2048-px atlas / 64-px tile = 32 columns × 32 rows = 1024 slots —
 * enough for the BMP basic + extended Latin + Cyrillic + common
 * punctuation a normal editor session touches.
 */
export const DEFAULT_TILE_SIZE = 64;

/**
 * SDF range in atlas pixels. Controls how many pixels of the tile
 * sit outside the glyph's tight bbox as a "soft" band where the
 * shader's `smoothstep` can blend the edge. 8 px → 1/8th of a
 * 64-px tile is reserved on every side, leaving a 48×48 area for
 * the glyph itself. Matches the tile size so the geometric ratio
 * stays constant.
 */
export const DEFAULT_RANGE = 8;
