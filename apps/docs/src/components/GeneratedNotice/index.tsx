import type { ReactNode } from "react";

/**
 * Red banner shown at the top of every docs page. The docs content was
 * generated automatically and has not been human-reviewed yet — this notice
 * makes that explicit to readers. Remove the `DocItem/Content` swizzle (and this
 * component) once the docs have been verified.
 */
export default function GeneratedNotice(): ReactNode {
  return (
    <div
      className="alert alert--danger margin-bottom--md"
      role="alert"
      style={{ fontSize: "0.9rem" }}
    >
      <strong>⚠️ Generated draft — needs review.</strong> This page was generated automatically and
      has not been manually verified. Details may be inaccurate or incomplete; treat code and APIs
      as provisional until reviewed.
    </div>
  );
}
