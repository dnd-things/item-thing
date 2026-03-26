import { z } from 'zod';

const serverSchema = z.object({
  CONVEX_DEPLOYMENT: z.string().min(1),
});

export const serverEnv = serverSchema.parse({
  CONVEX_DEPLOYMENT: process.env.CONVEX_DEPLOYMENT,
});
