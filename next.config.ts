import type { NextConfig } from "next";

// Security headers applied to every response. The CSP is deliberately strict;
// loosen it per-need (for example a payment provider's hosted page) rather than globally.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      // Next.js needs inline scripts for hydration unless nonces are wired in; tracked for Phase 12.
      // React's development build uses eval for debugging aids; production never does.
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
      "connect-src 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "pg", "pino"],
  async redirects() {
    // The shop became the Resources marketplace; keep old links working.
    const rules = [
      { source: "/shop", destination: "/resources", permanent: true },
      { source: "/shop/:slug", destination: "/resources/:slug", permanent: true },
    ];
    // One public address: send www.<domain> to the address in APP_URL (sign-in cookies belong to one host, and email
    // and payment links are built from APP_URL). Skipped for localhost, an IP, or when APP_URL itself starts with www.
    try {
      const u = new URL(process.env.APP_URL ?? "");
      if (u.protocol === "https:" && u.hostname.includes(".") && !/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) && !u.hostname.startsWith("www.")) {
        rules.push({ source: "/:path*", has: [{ type: "host", value: `www.${u.hostname}` }], destination: `${u.origin}/:path*`, permanent: true } as (typeof rules)[number]);
      }
    } catch {
      /* APP_URL missing or invalid: no host redirect */
    }
    return rules;
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
