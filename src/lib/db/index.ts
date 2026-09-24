import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// Capped low: the Supabase session pooler this project uses caps concurrent
// clients at 15 total, shared across the dev server, drizzle-kit, and any
// ad-hoc scripts running at the same time. The client is cached on globalThis
// so dev hot reloads reuse it instead of leaking a fresh pool each time, and
// idle connections are released quickly.
const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };

// A page runs several queries at once. Over a single connection they are sent as
// a pipeline, and Supabase's transaction pooler (port 6543, used on Vercel) stalls
// on that until the function times out. More than one connection avoids it, and
// the pooler shares them, so 5 is safe on Vercel too.
const maxConnections = 5;

const client =
  globalForDb.pgClient ??
  postgres(connectionString, { prepare: false, max: maxConnections, idle_timeout: 20 });

if (process.env.NODE_ENV !== 'production') globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
