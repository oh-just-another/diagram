/** @type {import('next').NextConfig} */
const nextConfig = {
  // The editor and its dependencies ship as ESM workspace packages; let Next
  // transpile them rather than treating them as pre-built externals.
  transpilePackages: ["@oh-just-another/editor", "@oh-just-another/react-ui"],
};

export default nextConfig;
