import type { NextConfig } from "next";
const config: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["postgres"],
  poweredByHeader: false,
  outputFileTracingIncludes: { "/*": ["./public/showcase/**"] },
  logging: {
    incomingRequests: {
      ignore: [
        /^\/invite(?:[?#]|$)/,
        /^\/api\/invitations\/info/,
        /^\/auth\/callback(?:[?#]|$)/,
      ],
    },
    browserToTerminal: false,
  },
  async headers() {
    const storageOrigin = process.env.SUPABASE_URL
      ? new URL(process.env.SUPABASE_URL).origin
      : "";
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' ${storageOrigin}; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
          },
        ],
      },
      {
        source: "/invite",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};
export default config;
