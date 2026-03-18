import { v } from 'convex/values';
import { query } from './_generated/server';

/**
 * Simple health check query.
 *
 * Use this to verify:
 * - Convex deployment is reachable
 * - Functions execute correctly
 * - (optionally) DB access works
 */
export const health = query({
  args: {
    // optional flag to test DB roundtrip if you want stricter checks later
    checkDb: v.optional(v.boolean()),
  },

  handler: async (ctx, args) => {
    const now = Date.now();

    let dbCheck: 'skipped' | 'ok' | 'error' = 'skipped';

    if (args.checkDb) {
      try {
        // lightweight DB interaction (no schema required)
        // This ensures indexes + storage layer are working
        await ctx.db.query('_scheduled_functions').take(1);
        dbCheck = 'ok';
      } catch {
        dbCheck = 'error';
      }
    }

    return {
      status: 'ok' as const,
      timestamp: now,
      isoTime: new Date(now).toISOString(),
      environment: process.env.CONVEX_DEPLOYMENT ?? 'unknown',
      db: dbCheck,
    };
  },
});
