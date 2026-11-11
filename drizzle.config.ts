import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Drizzle Kit runs outside Next.js, so load the same root .env* files the app uses.
loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for migrations. Add your PostgreSQL connection string to the project-root .env or .env.local.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
});
