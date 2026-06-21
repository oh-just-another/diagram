import webpack from "webpack";
import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

// This runs in Node.js — don't use client-side code here (browser APIs, JSX…).

const GITHUB_URL = "https://github.com/oh-just-another/diagram";

const config: Config = {
  title: "diagram",
  tagline: "Drop-in diagram editor for React — auto-detecting renderer, driveable from code.",
  favicon: "img/favicon.ico",

  // Project page on GitHub Pages: https://oh-just-another.github.io/diagram/
  url: "https://oh-just-another.github.io",
  baseUrl: "/diagram/",
  organizationName: "oh-just-another",
  projectName: "diagram",
  trailingSlash: false,

  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
  },

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  plugins: [
    // The embedded editor pulls in @oh-just-another/{text,raster}-wasm, whose
    // Node-only branches `await import("node:fs/promises" | "node:url")` (never
    // reached in the browser). Teach webpack to (a) tolerate the package's
    // extensionless ESM relative imports and (b) stub the node: builtins so the
    // browser bundle resolves.
    function editorBrowserBundling() {
      return {
        name: "editor-browser-bundling",
        configureWebpack(_config: unknown, isServer: boolean) {
          return {
            module: {
              rules: [{ test: /\.m?js$/, resolve: { fullySpecified: false } }],
            },
            resolve: {
              // The @oh-just-another/* packages publish ESM-only ("import")
              // exports. Docusaurus' SSR (node) build resolves without the
              // "import" condition, so add it for the server compiler.
              ...(isServer
                ? { conditionNames: ["import", "require", "module", "node", "default"] }
                : {}),
              fallback: {
                "fs/promises": false,
                fs: false,
                url: false,
                path: false,
              },
            },
            plugins: [
              new webpack.NormalModuleReplacementPlugin(
                /^node:/,
                (resource: { request: string }) => {
                  resource.request = resource.request.replace(/^node:/, "");
                },
              ),
            ],
          };
        },
      };
    },
  ],

  presets: [
    [
      "classic",
      {
        // Single landing page for now (src/pages/index.mdx); no docs tree or blog.
        docs: false,
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/docusaurus-social-card.jpg",
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "diagram",
      logo: {
        alt: "diagram",
        src: "img/logo.svg",
      },
      items: [{ href: GITHUB_URL, label: "GitHub", position: "right" }],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "More",
          items: [{ label: "GitHub", href: GITHUB_URL }],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} oh-just-another. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
