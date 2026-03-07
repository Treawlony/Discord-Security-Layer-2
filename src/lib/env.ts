import { z } from "zod";

const EnvSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL URL"),
  DEFAULT_SESSION_DURATION_MIN: z.coerce.number().int().positive().default(60),
  DEFAULT_LOCKOUT_THRESHOLD: z.coerce.number().int().positive().default(5),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const result = EnvSchema.safeParse(process.env);

if (!result.success) {
  console.error("\n[Config] Missing or invalid environment variables:");
  for (const issue of result.error.issues) {
    console.error(`  • ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("\nCopy .env.example to .env and fill in the missing values.\n");
  process.exit(1);
}

export const env = result.data;
