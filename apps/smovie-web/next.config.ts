import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@smovie/glass-player"],
  images: { unoptimized: true },
}

export default nextConfig
