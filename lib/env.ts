import { z } from 'zod';

const serverSchema = z.object({
  CONVEX_DEPLOYMENT: z.string().min(1),
});

const clientSchema = z.object({
  NEXT_PUBLIC_CONVEX_URL: z.url(),
});

export const serverEnv = serverSchema.parse({
  CONVEX_DEPLOYMENT: process.env.CONVEX_DEPLOYMENT,
});

export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
});
