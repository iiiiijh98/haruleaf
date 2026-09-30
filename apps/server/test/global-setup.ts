import { runMigrations } from '../src/db/migrate';
import { TEST_DATABASE_URL } from './helpers';

export default async function setup(): Promise<void> {
  await runMigrations(TEST_DATABASE_URL);
}
