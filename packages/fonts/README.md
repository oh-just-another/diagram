# @oh-just-another/fonts

The fonts the editor ships and draws with — Roboto, PT Serif, Roboto Mono — as web fonts.

L0, no dependencies. WebGL2 draws text from these faces (baked into the MSDF shaper); bundling them as web fonts lets the Canvas2D and offscreen backends draw the **same** faces, so text is identical across renderers instead of falling back to whatever the OS resolves.

The `.woff2` files are subset to Latin, Latin Extended, Cyrillic, Greek and common punctuation.

## API

| Name                                     | Notes                                                                                                                         |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `registerBundledFonts(scope)`            | Loads the faces and adds them to `scope.fonts`. Pass `document` on the main thread, `self` in a worker. Resolves once loaded. |
| `resolveBundledFamily(css)`              | Map a CSS font-family stack to the bundled family (`Roboto` / `PT Serif` / `Roboto Mono`) that backs it.                      |
| `FONT_SANS` / `FONT_SERIF` / `FONT_MONO` | The three bundled family names.                                                                                               |

```ts
import { registerBundledFonts } from "@oh-just-another/fonts";

await registerBundledFonts(document); // then draw crisp, consistent text
```
