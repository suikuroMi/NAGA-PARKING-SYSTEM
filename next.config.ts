import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';
const scriptSrc = isProd ? "script-src 'self' 'unsafe-inline'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{source:'/:path*',headers:[
      {key:'X-Content-Type-Options',value:'nosniff'},
      {key:'X-Frame-Options',value:'DENY'},
      {key:'Referrer-Policy',value:'same-origin'},
      {key:'Permissions-Policy',value:'camera=(self), microphone=(), geolocation=()'},
      {key:'Content-Security-Policy',value:`default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`},
    ]}]
  },
};

export default nextConfig;
