import { z } from 'zod';

const clientSchema = z.object({
  NEXT_PUBLIC_CONVEX_URL: z.url(),
});

export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
});
