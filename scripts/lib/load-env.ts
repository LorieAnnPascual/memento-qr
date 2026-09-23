import { config } from 'dotenv';

// Must be imported before anything that reads DATABASE_URL.
config({ path: '.env.local' });
