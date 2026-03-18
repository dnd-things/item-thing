import { z } from "zod";

const serverSchema = z.object({
  CONVEX_URL: z.string().url(),
  CONVEX_SECRET: z.string(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_CONVEX_URL: z.string().url(),
});

export const serverEnv = serverSchema.parse(process.env);
export const clientEnv = clientSchema.parse(process.env);
