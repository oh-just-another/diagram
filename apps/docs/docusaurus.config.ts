import webpack from "webpack";
import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

// This runs in Node.js — don't use client-side code here (browser APIs, JSX…).

const GITHUB_URL = "https://github.com/oh-just-another/diagram";
const NPM_URL = "https://www.npmjs.com/package/@oh-just-another/editor";
const DOCS_ENTRY = "/docs/introduction/installation";

const config: Config = {
  title: "diagram",
  tagline: "Drop-in diagram editor for React — auto-detecting renderer, driveable from code.",
  favicon: "img/favicon.ico",

  // Served from the custom apex domain (Cloudflare A/AAAA → GitHub Pages IPs,
  // CNAME file in static/). At the domain root, so baseUrl is "/".
  url: "https://ohjustanother.site",
  baseUrl: "/",
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
        // Docs tree lives under docs/, routed at /docs. One auto-generated
        // sidebar (see sidebars.ts) keyed off _category_.json + frontmatter.
        docs: {
          sidebarPath: "./sidebars.ts",
          // Draft scaffold mirrored layout; no "edit this page" links yet.
          editUrl: undefined,
        },
        // The landing page is a simple MDX page (src/pages/index.mdx) with a
        // live editor; the blog is a placeholder src/pages route until there's
        // something to publish.
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    // Offline, build-time full-text search (no external service). Adds the
    // navbar search box and owns the /search results route. Swap for Algolia
    // DocSearch once the site is deployed and accepted into the OSS program.
    [
      "@easyops-cn/docusaurus-search-local",
      {
        hashed: true,
        indexDocs: true,
        indexBlog: false,
        indexPages: true,
        docsRouteBasePath: "/docs",
        highlightSearchTermsOnTargetPage: true,
      },
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
      items: [
        { to: DOCS_ENTRY, label: "Docs", position: "left" },
        { to: "/examples", label: "Examples", position: "left" },
        { href: GITHUB_URL, label: "GitHub", position: "right" },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Product",
          items: [
            { label: "Features", to: "/features" },
            { label: "Examples", to: "/examples" },
            { label: "FAQ", to: "/faq" },
          ],
        },
        {
          title: "Developers",
          items: [
            { label: "Quick start", to: DOCS_ENTRY },
            { label: "Examples", to: "/examples" },
            { label: "Docs", to: "/docs/getting-started/installation" },
          ],
        },
        {
          title: "Community",
          items: [
            { label: "GitHub", href: GITHUB_URL },
            { label: "npm", href: NPM_URL },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} oh-just-another · MIT licensed. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
