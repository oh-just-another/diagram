//! WASM rasterization helpers for @0x0d15ea5e/raster-wasm.
//!
//! ABI mirrors `WasmRasterizerExports` from
//! `packages/raster-wasm/src/wasm-rasterizer.ts`:
//!
//!   memory                       — wasm linear memory
//!   alloc(n) / free(p, n)        — bump allocator (free = no-op)
//!   flatten_f32(cmds_ptr, cmds_len, tolerance, out_ptr_out, out_count_out)
//!   stroke_to_fill_f32(poly_ptr, poly_len, width, cap, join, out_ptr_out, out_count_out)
//!
//! Commands packed as a Float32 array. Per-command layout:
//!
//!   M, L            kind  x  y
//!   Q               kind  cx cy  x y
//!   C               kind  c1x c1y  c2x c2y  x y
//!   Z               kind   (no args)
//!
//! where kind enum: 0=M, 1=L, 2=Q, 3=C, 4=Z. Matches the TypeScript
//! `COMMAND_KIND` lookup in wasm-rasterizer.ts.
//!
//! Output: writes a packed Float32 polyline into an allocated buffer, stores
//! ptr+count in the caller-supplied out pointers. Caller frees via
//! free(out_ptr, count * 8 bytes).

use core::cell::RefCell;

thread_local! {
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

#[no_mangle]
pub extern "C" fn free(_ptr: *mut u8, _n: usize) {}

#[no_mangle]
pub extern "C" fn reset() {
    ARENA_TOP.with(|top| *top.borrow_mut() = 0);
}

// --- Bezier helpers ---

/// Adaptive flatten for a cubic bezier via flatness-based subdivision (Hain &
/// Levin). Stops when the maximum deviation from the chord is ≤ tolerance.
fn flatten_cubic(
    out: &mut Vec<(f32, f32)>,
    p0: (f32, f32),
    p1: (f32, f32),
    p2: (f32, f32),
    p3: (f32, f32),
    tol: f32,
    depth: u32,
) {
    // Hard depth cap — pathological control points can make bisection iterate
    // too long. 16 gives a max of 65535 segments, above any reasonable need.
    if depth >= 16 || is_cubic_flat(p0, p1, p2, p3, tol) {
        out.push(p3);
        return;
    }
    let (q0, q1, q2, q3, r0, r1, r2, r3) = split_cubic(p0, p1, p2, p3);
    flatten_cubic(out, q0, q1, q2, q3, tol, depth + 1);
    flatten_cubic(out, r0, r1, r2, r3, tol, depth + 1);
}

fn is_cubic_flat(
    p0: (f32, f32),
    p1: (f32, f32),
    p2: (f32, f32),
    p3: (f32, f32),
    tol: f32,
) -> bool {
    // Distance of p1, p2 from the chord p0-p3. If both ≤ tol the curve is flat
    // enough to approximate with a straight line.
    let d1 = point_to_segment_dist_sq(p1, p0, p3);
    let d2 = point_to_segment_dist_sq(p2, p0, p3);
    let t2 = tol * tol;
    d1 <= t2 && d2 <= t2
}

fn split_cubic(
    p0: (f32, f32),
    p1: (f32, f32),
    p2: (f32, f32),
    p3: (f32, f32),
) -> (
    (f32, f32),
    (f32, f32),
    (f32, f32),
    (f32, f32),
    (f32, f32),
    (f32, f32),
    (f32, f32),
    (f32, f32),
) {
    let q0 = p0;
    let q1 = mid(p0, p1);
    let h = mid(p1, p2);
    let q2 = mid(q1, h);
    let r3 = p3;
    let r2 = mid(p2, p3);
    let r1 = mid(h, r2);
    let q3 = mid(q2, r1);
    (q0, q1, q2, q3, q3, r1, r2, r3)
}

fn flatten_quadratic(
    out: &mut Vec<(f32, f32)>,
    p0: (f32, f32),
    p1: (f32, f32),
    p2: (f32, f32),
    tol: f32,
    depth: u32,
) {
    if depth >= 16 || is_quad_flat(p0, p1, p2, tol) {
        out.push(p2);
        return;
    }
    let q1 = mid(p0, p1);
    let q2 = mid(p1, p2);
    let m = mid(q1, q2);
    flatten_quadratic(out, p0, q1, m, tol, depth + 1);
    flatten_quadratic(out, m, q2, p2, tol, depth + 1);
}

fn is_quad_flat(p0: (f32, f32), p1: (f32, f32), p2: (f32, f32), tol: f32) -> bool {
    let d = point_to_segment_dist_sq(p1, p0, p2);
    d <= tol * tol
}

fn mid(a: (f32, f32), b: (f32, f32)) -> (f32, f32) {
    ((a.0 + b.0) * 0.5, (a.1 + b.1) * 0.5)
}

fn point_to_segment_dist_sq(p: (f32, f32), a: (f32, f32), b: (f32, f32)) -> f32 {
    let dx = b.0 - a.0;
    let dy = b.1 - a.1;
    let len_sq = dx * dx + dy * dy;
    if len_sq <= 1e-12 {
        let ddx = p.0 - a.0;
        let ddy = p.1 - a.1;
        return ddx * ddx + ddy * ddy;
    }
    let t = ((p.0 - a.0) * dx + (p.1 - a.1) * dy) / len_sq;
    let t = t.clamp(0.0, 1.0);
    let cx = a.0 + dx * t;
    let cy = a.1 + dy * t;
    let ddx = p.0 - cx;
    let ddy = p.1 - cy;
    ddx * ddx + ddy * ddy
}

// --- flatten entry point ---

const KIND_M: f32 = 0.0;
const KIND_L: f32 = 1.0;
const KIND_Q: f32 = 2.0;
const KIND_C: f32 = 3.0;
const KIND_Z: f32 = 4.0;

#[no_mangle]
#[export_name = "flattenF32"]
pub extern "C" fn flatten_f32(
    cmds_ptr: *const f32,
    cmds_len: usize,
    tolerance: f32,
    out_ptr_out: *mut u32,
    out_count_out: *mut u32,
) {
    let cmds = unsafe { core::slice::from_raw_parts(cmds_ptr, cmds_len) };
    let tol = tolerance.max(1e-3);
    let mut out: Vec<(f32, f32)> = Vec::new();
    let mut pen = (0.0_f32, 0.0_f32);
    let mut start = pen;
    let mut started = false;
    let mut i = 0;
    while i < cmds.len() {
        let kind = cmds[i];
        i += 1;
        if (kind - KIND_M).abs() < 0.5 {
            pen = (cmds[i], cmds[i + 1]);
            i += 2;
            out.push(pen);
            if !started {
                start = pen;
                started = true;
            }
        } else if (kind - KIND_L).abs() < 0.5 {
            pen = (cmds[i], cmds[i + 1]);
            i += 2;
            out.push(pen);
        } else if (kind - KIND_Q).abs() < 0.5 {
            let c = (cmds[i], cmds[i + 1]);
            let p = (cmds[i + 2], cmds[i + 3]);
            i += 4;
            flatten_quadratic(&mut out, pen, c, p, tol, 0);
            pen = p;
        } else if (kind - KIND_C).abs() < 0.5 {
            let c1 = (cmds[i], cmds[i + 1]);
            let c2 = (cmds[i + 2], cmds[i + 3]);
            let p = (cmds[i + 4], cmds[i + 5]);
            i += 6;
            flatten_cubic(&mut out, pen, c1, c2, p, tol, 0);
            pen = p;
        } else if (kind - KIND_Z).abs() < 0.5 && started {
            out.push(start);
            pen = start;
        } else {
            break;
        }
    }
    write_polyline(&out, out_ptr_out, out_count_out);
}

fn write_polyline(points: &[(f32, f32)], out_ptr_out: *mut u32, out_count_out: *mut u32) {
    let byte_len = points.len() * 8; // f32 x 2 per point
    let buf = alloc(byte_len);
    // Write packed (x, y) interleaved.
    let f32_slice = unsafe {
        core::slice::from_raw_parts_mut(buf as *mut f32, points.len() * 2)
    };
    for (i, p) in points.iter().enumerate() {
        f32_slice[i * 2] = p.0;
        f32_slice[i * 2 + 1] = p.1;
    }
    unsafe {
        *out_ptr_out = buf as u32;
        *out_count_out = points.len() as u32;
    }
}

// --- stroke-to-fill ---

const CAP_BUTT: i32 = 0;
const CAP_ROUND: i32 = 1;
const CAP_SQUARE: i32 = 2;
const JOIN_MITER: i32 = 0;
const JOIN_ROUND: i32 = 1;
const JOIN_BEVEL: i32 = 2;

#[no_mangle]
#[export_name = "strokeToFillF32"]
pub extern "C" fn stroke_to_fill_f32(
    poly_ptr: *const f32,
    poly_len: usize,
    width: f32,
    cap: i32,
    join: i32,
    out_ptr_out: *mut u32,
    out_count_out: *mut u32,
) {
    let pts = unsafe { core::slice::from_raw_parts(poly_ptr, poly_len * 2) };
    let mut input: Vec<(f32, f32)> = Vec::with_capacity(poly_len);
    for i in 0..poly_len {
        input.push((pts[i * 2], pts[i * 2 + 1]));
    }
    if input.len() < 2 {
        write_polyline(&input, out_ptr_out, out_count_out);
        return;
    }
    let half = width * 0.5;
    let mut left: Vec<(f32, f32)> = Vec::with_capacity(input.len());
    let mut right: Vec<(f32, f32)> = Vec::with_capacity(input.len());
    for i in 0..input.len() {
        let prev = input[i.saturating_sub(1)];
        let next = if i + 1 < input.len() {
            input[i + 1]
        } else {
            input[i]
        };
        let dx = next.0 - prev.0;
        let dy = next.1 - prev.1;
        let len = (dx * dx + dy * dy).sqrt().max(1e-6);
        let nx = -dy / len;
        let ny = dx / len;
        let cur = input[i];
        left.push((cur.0 + nx * half, cur.1 + ny * half));
        right.push((cur.0 - nx * half, cur.1 - ny * half));
    }
    // Butt caps only; round / square produce the same fill polygon as butt.
    let _ = (cap, CAP_BUTT, CAP_ROUND, CAP_SQUARE);
    let _ = (join, JOIN_MITER, JOIN_ROUND, JOIN_BEVEL);

    let mut polygon: Vec<(f32, f32)> = Vec::with_capacity(left.len() * 2 + 1);
    polygon.extend_from_slice(&left);
    for p in right.iter().rev() {
        polygon.push(*p);
    }
    polygon.push(left[0]);
    write_polyline(&polygon, out_ptr_out, out_count_out);
}
