import { defineConfig } from 'drizzle-kit';
import { loadRootEnv } from './src/config';

loadRootEnv();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://haruleaf:haruleaf@localhost:5433/haruleaf',
  },
});
