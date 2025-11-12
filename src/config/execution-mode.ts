export const EXECUTION_MODE = {
  primary: process.env.PRIMARY_EXECUTOR || "supabase",
  inngestFallback: process.env.INNGEST_FALLBACK === "true",
  dualRun: process.env.DUAL_RUN_MODE === "true",
} as const;
