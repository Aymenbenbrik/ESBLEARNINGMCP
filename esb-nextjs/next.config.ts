import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["recharts", "survey-core", "survey-react-ui", "survey-creator-core", "survey-creator-react"],
};

export default nextConfig;
