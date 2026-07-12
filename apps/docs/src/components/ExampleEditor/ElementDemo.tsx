import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Live `<oja-diagram>` demo. The custom element is framework-agnostic, so it
 * runs inside this React docs site exactly as it would in any page: importing
 * `@oh-just-another/diagram` auto-defines the tag, and the attributes below
 * are the element's real public surface. Browser-only, so the import lives in
 * an effect (never runs during the static build).
 */
export default function ElementDemo({ height = "420px" }: { height?: string }): ReactNode {
  const [ready, setReady] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    void import("@oh-just-another/diagram").then(() => {
      if (!alive || !hostRef.current) return;
      // Created imperatively so the static build never sees the unknown tag.
      const el = document.createElement("oja-diagram");
      el.setAttribute("theme", "system");
      el.setAttribute("grid", "");
      el.setAttribute("snap", "");
      el.style.display = "block";
      el.style.height = "100%";
      hostRef.current.appendChild(el);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div
      ref={hostRef}
      style={{
        height,
        position: "relative",
        overflow: "hidden",
        borderRadius: "8px",
        border: "1px solid var(--ifm-color-emphasis-300)",
        marginBottom: "1rem",
      }}
    >
      {!ready && (
        <div
          style={{
            height: "100%",
            display: "grid",
            placeItems: "center",
            color: "var(--ifm-color-emphasis-600)",
          }}
        >
          Loading the element…
        </div>
      )}
    </div>
  );
}
