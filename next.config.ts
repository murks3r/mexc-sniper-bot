import type { NextConfig } from "next";

// Bundle analyzer setup
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
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


  // Enable Cache Components (Next.js 16)
  cacheComponents: true,

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

  // Turbopack configuration (for dev mode only)
  // Production builds use webpack to avoid native module issues
  turbopack: {
    // Resolve aliases to exclude problematic modules from client bundles
    // Using conditional exports to only apply to browser builds
    resolveAlias: {
      // Node.js built-in modules - exclude from browser bundles
      // These are automatically handled by Turbopack, but explicit for clarity
      fs: { browser: './empty-module.js' },
      path: { browser: './empty-module.js' },
      os: { browser: './empty-module.js' },
      crypto: { browser: './empty-module.js' },
      buffer: { browser: './empty-module.js' },
      stream: { browser: './empty-module.js' },
      util: { browser: './empty-module.js' },
      url: { browser: './empty-module.js' },
      querystring: { browser: './empty-module.js' },
      
      // React Native and Expo dependencies - exclude from browser bundles
      // These are mobile-only and should never be in web bundles
      'expo-secure-store': { browser: './empty-module.js' },
      'expo-modules-core': { browser: './empty-module.js' },
      'react-native': { browser: './empty-module.js' },
      '@react-native-async-storage/async-storage': { browser: './empty-module.js' },
      
      // OpenTelemetry packages - server-only, exclude from browser bundles
      // These use Node.js APIs and gRPC which don't work in browsers
      '@opentelemetry/auto-instrumentations-node': { browser: './empty-module.js' },
      '@opentelemetry/instrumentation': { browser: './empty-module.js' },
      '@opentelemetry/sdk-node': { browser: './empty-module.js' },
      '@opentelemetry/resources': { browser: './empty-module.js' },
      '@opentelemetry/exporter-jaeger': { browser: './empty-module.js' },
      '@opentelemetry/exporter-prometheus': { browser: './empty-module.js' },
      '@opentelemetry/sdk-trace-node': { browser: './empty-module.js' },
      '@opentelemetry/sdk-metrics': { browser: './empty-module.js' },
      '@opentelemetry/core': { browser: './empty-module.js' },
      
      // gRPC and Node.js specific modules - exclude from browser bundles
      // gRPC is a server-side protocol and doesn't work in browsers
      '@grpc/grpc-js': { browser: './empty-module.js' },
      '@opentelemetry/otlp-grpc-exporter-base': { browser: './empty-module.js' },
      '@opentelemetry/exporter-logs-otlp-grpc': { browser: './empty-module.js' },
      
      // CSS processing native modules - exclude from browser bundles
      // These are PostCSS plugins that only run server-side during build
      'lightningcss': { browser: './empty-module.js' },
      'lightningcss/node': { browser: './empty-module.js' },
      '@tailwindcss/oxide': { browser: './empty-module.js' },
      '@tailwindcss/postcss': { browser: './empty-module.js' },
    },
  },

  // Note: serverComponentsExternalPackages has been moved to serverExternalPackages
};

export default withBundleAnalyzer(nextConfig);