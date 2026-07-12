import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Live Svelte demo — the REAL `@oh-just-another/diagram-svelte` wrapper
 * (its shipped `.svelte` source, compiled by svelte-loader in this site's
 * webpack config) mounted at runtime with Svelte 5's `mount()` into a div
 * this React page owns. No microfrontend machinery — the wrapper is a thin
 * shell over the `<oja-diagram>` custom element.
 */
export default function SvelteDemo({ height = "420px" }: { height?: string }): ReactNode {
  const [ready, setReady] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    let instance: unknown = null;
    let unmountFn: ((component: unknown) => void) | null = null;
    void Promise.all([import("svelte"), import("@oh-just-another/diagram-svelte")]).then(
      ([svelte, wrapper]) => {
        if (!alive || !hostRef.current) return;
        unmountFn = svelte.unmount as (component: unknown) => void;
        // With the "svelte" export condition the package root resolves to the
        // compiled Diagram.svelte module — the component is its default export.
        const component =
          (wrapper as { default?: unknown }).default ?? (wrapper as { Diagram?: unknown }).Diagram;
        instance = (svelte.mount as (c: unknown, o: unknown) => unknown)(component, {
          target: hostRef.current,
          props: { theme: "system", grid: true, snap: true },
        });
        setReady(true);
      },
    );
    return () => {
      alive = false;
      if (instance && unmountFn) unmountFn(instance);
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
          Loading Svelte…
        </div>
      )}
    </div>
  );
}
