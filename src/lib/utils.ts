import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Add missing export aliases for compatibility - using proper logger
import { createSimpleLogger } from "./unified-logger";
export const logger = createSimpleLogger("utils");
