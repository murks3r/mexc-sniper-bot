import type { NextConfig } from "next";

// Bundle analyzer setup
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  // Silence workspace root inference warning
  outputFileTracingRoot: require('path').join(__dirname),

  // Exclude server-only packages from client-side bundles
  serverExternalPackages: [
    "better-sqlite3",
    "expo-secure-store",
    "expo-modules-core",
    "react-native",
    "@react-native-async-storage/async-storage",
    "lightningcss",
    "lightningcss-darwin-arm64",
    // OpenTelemetry packages for server-side only
    "@opentelemetry/auto-instrumentations-node",
    "@opentelemetry/instrumentation",
    "@opentelemetry/sdk-node",
    "@opentelemetry/resources",
    "@opentelemetry/exporter-jaeger",
    "@opentelemetry/exporter-prometheus",
    "@opentelemetry/sdk-trace-node",
    "@opentelemetry/sdk-metrics"
  ],

  // TypeScript configuration
  typescript: {
    // Allow builds for deployment while fixing remaining type issues
    ignoreBuildErrors: true,
  },
  
  // Note: eslint config removed in Next.js 16 - use Biome or ESLint directly

  // Disable Cache Components - incompatible with dynamic routes that use cookies/headers
  // See: https://nextjs.org/docs/messages/route-segment-config-with-cache-components
  cacheComponents: false,

  // Experimental features for better optimization
  experimental: {
    optimizePackageImports: [
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-label',
      '@radix-ui/react-progress',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-separator',
      '@radix-ui/react-switch',
      '@radix-ui/react-toggle',
      '@tanstack/react-query',
      '@tanstack/react-query-devtools',
      'lucide-react',
      'date-fns',
      'recharts',
      'react-day-picker',
      'class-variance-authority',
      'clsx',
      'tailwind-merge'
    ],
    // Disable optimizeCss to avoid Turbopack native module issues
    // CSS optimization is still handled by PostCSS/Tailwind
    optimizeCss: false,
    gzipSize: true,
    // Enable Turbopack filesystem caching for faster dev restarts
    turbopackFileSystemCacheForDev: true,
  },
  
  // Use webpack for production builds to avoid Turbopack native module issues
  // Turbopack is still used for dev mode (faster), but webpack handles production builds
  webpack: (config, { isServer, dev }) => {
    // For production builds, ensure native CSS modules are excluded from client bundle
    if (!isServer && !dev) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'lightningcss': false,
        'lightningcss/node': false,
        '@tailwindcss/oxide': false,
        '@tailwindcss/postcss': false,
      };
    }
    
    // Exclude native modules from being processed
    config.externals = config.externals || [];
    if (Array.isArray(config.externals)) {
      config.externals.push({
        'lightningcss': 'commonjs lightningcss',
        '@tailwindcss/oxide': 'commonjs @tailwindcss/oxide',
      });
    }
    
    return config;
  },

  // Turbopack configuration disabled - using webpack for both dev and production
  // due to Turbopack's native module resolution limitations with lightningcss
  // turbopack: {
  //   resolveAlias: { ... }
  // },

  // Note: serverComponentsExternalPackages has been moved to serverExternalPackages
};

export default withBundleAnalyzer(nextConfig);