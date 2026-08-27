import { LOGO_DARK_MARKUP, LOGO_LIGHT_MARKUP, LOGO_VIEWBOX } from "./logo.generated.js";

/**
 * Product logo for the brand cell of the top bar. Renders the light and the
 * dark artwork (`assets/logo.svg` / `assets/logo-dark.svg`, inlined by
 * `scripts/gen-logo.mjs`); CSS shows the one matching the active theme
 * (`.du-brand-logo-light` / `.du-brand-logo-dark`). Height follows
 * `--du-brand-h`, width follows the artwork's aspect ratio.
 */
export const BrandLogo = ({ label = "Logo" }: { readonly label?: string }) => (
  <span className="du-brand-logo" role="img" aria-label={label}>
    <svg
      className="du-brand-logo-light"
      viewBox={LOGO_VIEWBOX}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: LOGO_LIGHT_MARKUP }}
    />
    <svg
      className="du-brand-logo-dark"
      viewBox={LOGO_VIEWBOX}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: LOGO_DARK_MARKUP }}
    />
  </span>
);
