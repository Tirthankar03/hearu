import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "server/db/schemas/*",
  out: 'server/db/migrations',
  dbCredentials: {
    url: process.env["DATABASE_URL"]!,
  },
});
