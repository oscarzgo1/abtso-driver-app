import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Next 16 defaults to serving every optimized image at quality 75,
    // regardless of the source file's own quality — fine for broad photos,
    // but it visibly soft-compresses anything with small detail (e.g. the
    // on-screen text in the admin-panel screenshots). 90 is now available
    // for those; 75 stays in the list as the default for everything else.
    qualities: [75, 90],
  },
  async rewrites() {
    return {
      // pricing.tachyo.co.uk is served by this same project: its root shows
      // the pricing page. Everything else (assets, /contact, ...) resolves
      // normally, so links from the pricing page keep working on that host.
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "host", value: "pricing.tachyo.co.uk" }],
          destination: "/pricing",
        },
      ],
    };
  },
};

export default nextConfig;
