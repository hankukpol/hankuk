/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // ExcelJS가 참조하는 Node.js 모듈은 클라이언트 번들에서 제외한다.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        stream: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
