/**
 * Tiny set of inline SVG icons used by the built-in palette. Each icon is a
 * 24×24 black stroke on transparent — the palette renders them on its own
 * background colour.
 *
 * Hosts can replace any icon by re-registering the template via
 * `registry.replace({ ...template, icon: newSvg })`.
 */

const wrap = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const RECT_ICON = wrap('<rect x="4" y="6" width="16" height="12" rx="1" />');
export const ELLIPSE_ICON = wrap('<ellipse cx="12" cy="12" rx="8" ry="6" />');
export const TRIANGLE_ICON = wrap('<path d="M12 4 L20 20 L4 20 Z" />');
export const DIAMOND_ICON = wrap('<path d="M12 3 L21 12 L12 21 L3 12 Z" />');
export const HEXAGON_ICON = wrap('<path d="M7 4 L17 4 L21 12 L17 20 L7 20 L3 12 Z" />');
export const ARROW_ICON = wrap('<path d="M4 12 H18" /><path d="M14 7 L19 12 L14 17" />');
export const STICKY_ICON = wrap('<path d="M5 4 H17 L19 6 V20 H5 Z" /><path d="M17 4 V6 H19" />');

// Flowchart symbols
export const PROCESS_ICON = wrap('<rect x="3" y="7" width="18" height="10" rx="1" />');
export const DECISION_ICON = wrap('<path d="M12 3 L21 12 L12 21 L3 12 Z" />');
export const TERMINATOR_ICON = wrap('<rect x="3" y="7" width="18" height="10" rx="5" />');
export const DOCUMENT_ICON = wrap('<path d="M3 5 H21 V17 Q15 13 12 17 Q9 21 3 17 Z" />');
export const DATA_ICON = wrap('<path d="M7 5 H23 L17 19 H1 Z" transform="translate(-1 0)"/>');
