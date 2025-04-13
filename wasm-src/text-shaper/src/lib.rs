//! WASM text shaper for @0x0d15ea5e/text-shaper.
//!
//! ABI mirrors the `WasmShaperExports` interface:
//!
//!   memory          — wasm linear memory exported automatically
//!   alloc(n)        — bump allocator, returns ptr
//!   free(ptr, n)    — no-op (see below)
//!   setFont(family_ptr, family_len, size_px) — sets the current font
//!                     (the bundle contains exactly one font, Roboto Regular,
//!                     so the arguments are used only for the size; family is
//!                     ignored)
//!   measure(text_ptr, text_len) — returns advance width in CSS pixels for a
//!                     UTF-8 string.
//!
//! Implementation is pure ttf-parser. No complex shaping passes (GSUB /
//! GPOS / kerning lookups). For each code point we look up the glyph id via
//! cmap, sum the horizontal advance from hmtx, and scale by
//! `size_px / units_per_em`. The host gets advances that match what
//! Canvas2D.measureText would produce for the same font (within sub-pixel
//! rounding).
//!
//! Free is a no-op because the bump allocator does not reclaim memory; the JS
//! side must avoid running multi-MB allocations without `reset()`. In practice
//! allocations here are tiny (font family string + measured string) and the
//! runtime is short.

use core::cell::RefCell;
use fdsm::{
    bezier::scanline::FillRule,
    generate::generate_msdf,
    render::correct_sign_msdf,
    shape::Shape,
    transform::Transform as FdsmTransform,
};
use fdsm_ttf_parser::load_shape_from_face;
use image::RgbImage;
use nalgebra::{Affine2, Similarity2, Vector2};
use ttf_parser::Face;

/// Font embedded in the wasm bundle — Roboto Regular. ~500KB.
const FONT_BYTES: &[u8] = include_bytes!("../font/Roboto-Regular.ttf");

thread_local! {
    /// Current font size in CSS pixels. Changed via setFont(...).
    static FONT_SIZE: RefCell<f32> = const { RefCell::new(14.0) };

    /// Bump allocator: cursor + buffer. The JS side allocates short chunks
    /// (font family, measured strings); no freelist, just advance the pointer.
    static ARENA: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static ARENA_TOP: RefCell<usize> = const { RefCell::new(0) };
}

const ARENA_INITIAL_CAP: usize = 64 * 1024;

fn ensure_arena() {
    ARENA.with(|arena| {
        let mut a = arena.borrow_mut();
        if a.capacity() == 0 {
            a.resize(ARENA_INITIAL_CAP, 0);
        }
    });
}

/// Bump allocator: returns a pointer to n bytes. Grows in 64KB chunks when
/// out of space.
#[no_mangle]
pub extern "C" fn alloc(n: usize) -> *mut u8 {
    ensure_arena();
    ARENA.with(|arena| {
        let mut a = arena.borrow_mut();
        ARENA_TOP.with(|top_cell| {
            let mut top = top_cell.borrow_mut();
            while *top + n > a.len() {
                let new_len = (a.len() + ARENA_INITIAL_CAP).max(a.len() * 2);
                a.resize(new_len, 0);
            }
            let ptr = unsafe { a.as_mut_ptr().add(*top) };
            *top += n;
            ptr
        })
    })
}

/// No-op free. The bump allocator does not reclaim individual blocks; this
/// matches the documented ABI and keeps correctness simple (no double-free /
/// use-after-free possibilities).
#[no_mangle]
pub extern "C" fn free(_ptr: *mut u8, _n: usize) {}

/// Reset the bump cursor to 0 to reuse memory before a long batch of
/// measurements. The JS wrapper may call this automatically once `loadModule`
/// completes.
#[no_mangle]
pub extern "C" fn reset() {
    ARENA_TOP.with(|top| *top.borrow_mut() = 0);
}

/// setFont — sets the font size. `family_ptr` / `family_len` are accepted for
/// ABI compatibility but ignored: this wasm bundle has only Roboto Regular.
#[export_name = "setFont"]
pub extern "C" fn set_font(_family_ptr: *const u8, _family_len: usize, size_px: f32) {
    FONT_SIZE.with(|cell| *cell.borrow_mut() = size_px);
}

/// Measures a UTF-8 string via ttf-parser. Returns the total horizontal
/// advance in CSS pixels.
#[no_mangle]
pub extern "C" fn measure(text_ptr: *const u8, text_len: usize) -> f32 {
    let text_bytes = unsafe { core::slice::from_raw_parts(text_ptr, text_len) };
    let text = match core::str::from_utf8(text_bytes) {
        Ok(s) => s,
        Err(_) => return 0.0,
    };
    let face = match Face::parse(FONT_BYTES, 0) {
        Ok(f) => f,
        Err(_) => return 0.0,
    };
    let upem = face.units_per_em() as f32;
    let size = FONT_SIZE.with(|cell| *cell.borrow());
    let scale = size / upem;

    let mut total_units: u32 = 0;
    for ch in text.chars() {
        let gid = face.glyph_index(ch).unwrap_or_else(|| {
            // Tofu glyph (id 0) — code points that the font doesn't cover.
            // ttf-parser uses GlyphId(0) for both "missing" and ".notdef";
            // both should still have a valid hmtx entry.
            ttf_parser::GlyphId(0)
        });
        let advance = face.glyph_hor_advance(gid).unwrap_or(0) as u32;
        total_units = total_units.saturating_add(advance);
    }
    (total_units as f32) * scale
}

/// Return font-unit metrics for a single code point as a packed
/// `[advance, bbox_x_min, bbox_y_min, bbox_w, bbox_h, units_per_em]`
/// little-endian f32 array. Bbox is the tight glyph bounding box in
/// font units (NOT scaled — host converts to pixels using the same
/// `font_size / units_per_em` ratio that `measure` uses). Returns the
/// pointer to a bump-allocated 24-byte block; the layout is fixed so
/// the JS side can read it as `Float32Array(buf, ptr, 6)`. The
/// pointer stays valid until the next `reset()`.
///
/// Missing glyph: zeros across the board (host should treat as
/// non-renderable and skip).
#[export_name = "glyphMetrics"]
pub extern "C" fn glyph_metrics(code_point: u32) -> *const f32 {
    let ptr = alloc(24) as *mut f32;
    unsafe {
        for i in 0..6 {
            ptr.add(i).write(0.0);
        }
    }
    let face = match Face::parse(FONT_BYTES, 0) {
        Ok(f) => f,
        Err(_) => return ptr,
    };
    let upem = face.units_per_em() as f32;
    let ch = match char::from_u32(code_point) {
        Some(c) => c,
        None => return ptr,
    };
    let gid = match face.glyph_index(ch) {
        Some(g) => g,
        None => return ptr,
    };
    let advance = face.glyph_hor_advance(gid).unwrap_or(0) as f32;
    let bbox = face.glyph_bounding_box(gid);
    unsafe {
        ptr.add(0).write(advance);
        if let Some(b) = bbox {
            ptr.add(1).write(b.x_min as f32);
            ptr.add(2).write(b.y_min as f32);
            ptr.add(3).write((b.x_max - b.x_min) as f32);
            ptr.add(4).write((b.y_max - b.y_min) as f32);
        }
        ptr.add(5).write(upem);
    }
    ptr
}

/// Rasterise a single glyph into an `atlas_size × atlas_size` RGB
/// multi-channel signed distance field. The result is written to a
/// freshly bump-allocated `atlas_size * atlas_size * 3` byte block;
/// the returned pointer is valid until the next `reset()`.
///
/// `range` is the SDF range in *atlas pixels* — the distance at which
/// the SDF saturates to fully-inside (255) or fully-outside (0). A
/// conservative default is `atlas_size / 8` (e.g. 8 for a 64×64
/// atlas), giving the host shader ~8 pixels of antialiasable slack
/// at every glyph edge. Smaller `range` → smaller AA band → harder
/// edges but less room for the shader's `smoothstep` to soften;
/// larger → softer edges and more wasted texels.
///
/// The glyph is scaled to fit `(atlas_size - 2*range) × (atlas_size -
/// 2*range)` and centred, leaving a `range`-pixel margin on every
/// side. The host MUST account for that margin when computing the
/// screen-space quad — it knows the inset since it picked `range`.
///
/// Missing glyph: all bytes zero (zero reads as "deep outside" in the
/// shader, so the host gets a transparent quad).
#[export_name = "rasterizeGlyphMSDF"]
pub extern "C" fn rasterize_glyph_msdf(
    code_point: u32,
    atlas_size: u32,
    range: f32,
) -> *const u8 {
    let n = (atlas_size as usize) * (atlas_size as usize) * 3;
    let ptr = alloc(n);
    // Pre-fill with 0 so missing-glyph case reads as fully outside.
    unsafe {
        core::ptr::write_bytes(ptr, 0, n);
    }

    let face = match Face::parse(FONT_BYTES, 0) {
        Ok(f) => f,
        Err(_) => return ptr,
    };
    let ch = match char::from_u32(code_point) {
        Some(c) => c,
        None => return ptr,
    };
    let gid = match face.glyph_index(ch) {
        Some(g) => g,
        None => return ptr,
    };
    let bbox = match face.glyph_bounding_box(gid) {
        Some(b) => b,
        None => return ptr, // whitespace / no-contour glyph
    };

    // Load the glyph outline into an fdsm Shape (still in font units).
    // `load_shape_from_face` returns `None` for genuinely empty glyphs
    // (a few control / whitespace chars); their atlas tile stays the
    // all-zero "fully outside" sentinel.
    let mut shape: Shape<_> = match load_shape_from_face(&face, gid) {
        Some(s) => s,
        None => return ptr,
    };

    // Scale + translate so the glyph fits inside the atlas cell with a
    // `range`-pixel margin on every side. The font coord system is
    // y-up; atlas / image coords are y-down. fdsm handles the flip
    // internally as long as we feed it the standard "scale + offset"
    // similarity.
    let bbox_w = (bbox.x_max - bbox.x_min) as f64;
    let bbox_h = (bbox.y_max - bbox.y_min) as f64;
    let target = (atlas_size as f64 - 2.0 * range as f64).max(1.0);
    let scale = if bbox_w.max(bbox_h) > 0.0 {
        target / bbox_w.max(bbox_h)
    } else {
        1.0
    };
    let shrinkage = 1.0 / scale;
    let transformation: Affine2<f64> = nalgebra::convert(Similarity2::new(
        Vector2::new(
            range as f64 - bbox.x_min as f64 / shrinkage,
            range as f64 - bbox.y_min as f64 / shrinkage,
        ),
        0.0,
        scale,
    ));
    shape.transform(&transformation);

    // 3-channel edge colouring (Chlumsky). The angle parameter is the
    // *sine* of the corner threshold; 0.03 ≈ sin(1.7°) survives small
    // kerning wiggles without misclassifying smooth segments as corners.
    let coloured = Shape::edge_coloring_simple(shape, 0.03, 0);
    let prepared = coloured.prepare();

    let mut img = RgbImage::new(atlas_size, atlas_size);
    generate_msdf(&prepared, range as f64, &mut img);
    // The raw MSDF can have sign errors near corners where two
    // contours with disagreeing channel masks meet; fdsm's
    // `correct_sign_msdf` re-tests every pixel against the prepared
    // shape and flips it if the channels disagree about inside / out.
    correct_sign_msdf(&mut img, &prepared, FillRule::Nonzero);

    // Copy raw bytes into the bump-allocated output buffer.
    let raw: &[u8] = img.as_raw();
    debug_assert_eq!(raw.len(), n);
    unsafe {
        core::ptr::copy_nonoverlapping(raw.as_ptr(), ptr, n);
    }
    ptr
}
