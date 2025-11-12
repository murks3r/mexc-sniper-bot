import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./migrations/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for DB connection");
}

const client = postgres(process.env.DATABASE_URL, { max: 1 });

export const db = drizzle(client, { schema });
export * from "./migrations/schema";

export async function getUserPreferences(userId: string) {
  throw new Error("getUserPreferences not implemented in db index; use dedicated service instead.");
}
