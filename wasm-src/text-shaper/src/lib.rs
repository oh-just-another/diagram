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
#[no_mangle]
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
