import { runMigrations } from '../src/db/migrate';
import { assertTestDatabase, TEST_DATABASE_URL } from './helpers';

export default async function setup(): Promise<void> {
  assertTestDatabase(TEST_DATABASE_URL);
  await runMigrations(TEST_DATABASE_URL);
}
