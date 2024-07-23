/**
 * Example of a rich template written in JSX via `@oh-just-another/templates-jsx`.
 *
 * The tsconfig in this app sets `"jsx": "react-jsx"` and `"jsxImportSource":
 * "@oh-just-another/templates-jsx"`. Vite's esbuild config matches, so every
 * intrinsic element (`<container>`, `<text>`, `<icon>`, `<button>`, …) goes
 * through our `h()` factory and lands as a plain `TemplateNode`.
 *
 * The output is a regular `TemplateLibrarySpec` — nothing JSX-specific
 * leaves this file. The host registers it via `loadTemplateLibrary` exactly
 * like the JSON examples in `custom-templates.ts`.
 */

import { bind, tsx2json } from "@oh-just-another/templates-jsx";
import type { TemplateLibrarySpec } from "@oh-just-another/templates";

const userBadgeIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>';

const tree = tsx2json(
  <container
    id="card"
    style={{ fill: "#fffaf0", stroke: "#b35900", strokeWidth: 1.5 }}
    layout={{
      flexDirection: "row",
      alignItems: "center",
      padding: 12,
      gap: 12,
      width: 280,
      height: 110,
    }}
  >
    <container
      id="avatar"
      style={{ fill: "#b35900" }}
      layout={{ width: 44, height: 44, alignSelf: "center", padding: 8 }}
    >
      <icon id="avatar-icon" svg={userBadgeIcon} style={{ color: "#fff" }} layout={{ flex: 1 }} />
    </container>
    <container id="body" layout={{ flexDirection: "column", flex: 1, gap: 4 }}>
      <text id="name" style={{ color: "#222", fontSize: 14, fontWeight: "bold" }}>
        {bind<string>("name")}
      </text>
      <text id="role" style={{ color: "#888", fontSize: 11 }}>
        {bind<string>("role")}
      </text>
      <container layout={{ flexDirection: "row", gap: 6, margin: { top: 6 } }}>
        <button
          id="msg"
          action="user.message"
          label="Message"
          style={{ fill: "#fff", stroke: "#b35900", color: "#b35900", fontSize: 11 }}
        />
        <button
          id="follow"
          action="user.follow"
          label="Follow"
          style={{ fill: "#b35900", stroke: "#7a3d00", color: "#fff", fontSize: 11 }}
        />
      </container>
    </container>
  </container>,
);

export const JSX_TEMPLATES: TemplateLibrarySpec = {
  format: "oh-just-another/template-library",
  version: 1,
  templates: [
    {
      id: "jsx.user-card",
      name: "User card (JSX)",
      category: "rich",
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="11" r="2.5"/><path d="M5.5 17a3.5 3.5 0 0 1 7 0"/><line x1="14" y1="9" x2="19" y2="9"/><line x1="14" y1="13" x2="17" y2="13"/></svg>',
      blueprint: {
        type: "template",
        width: 280,
        height: 110,
        minWidth: 220,
        minHeight: 96,
        maxWidth: 520,
        maxHeight: 200,
        noFlip: true,
        defaults: {
          name: "Ada Lovelace",
          role: "Mathematician · 1815-1852",
        },
        // The JSX tree is the same shape as the JSON `root` field — that's
        // the whole point of `tsx2json`.
        root: tree,
      },
    },
  ],
};
