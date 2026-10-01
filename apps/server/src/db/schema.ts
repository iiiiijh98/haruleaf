import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    loginId: varchar('login_id', { length: 30 }).notNull().unique(),
    nickname: varchar('nickname', { length: 30 }).notNull(),
    coinBalance: integer('coin_balance').notNull().default(0),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('users_coin_balance_nonnegative', sql`${t.coinBalance} >= 0`),
    check('users_login_id_format', sql`${t.loginId} ~ '^[a-z0-9_]{3,30}$'`),
    check('users_nickname_not_blank', sql`char_length(btrim(${t.nickname})) >= 1`),
  ],
);

export const userCredentials = pgTable('user_credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: char('token_hash', { length: 64 }).notNull().unique(),
    platform: varchar('platform', { length: 8 }).notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    lastUsedAt: timestamptz('last_used_at').notNull().defaultNow(),
    expiresAt: timestamptz('expires_at').notNull(),
    revokedAt: timestamptz('revoked_at'),
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    check('sessions_platform_valid', sql`${t.platform} in ('ios', 'web')`),
  ],
);

export const authEvents = pgTable(
  'auth_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    loginId: varchar('login_id', { length: 30 }).notNull(),
    event: varchar('event', { length: 16 }).notNull(),
    platform: varchar('platform', { length: 8 }).notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('auth_events_user_id_idx').on(t.userId),
    check('auth_events_event_valid', sql`${t.event} in ('SIGNUP', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT')`),
    check('auth_events_platform_valid', sql`${t.platform} in ('ios', 'web')`),
  ],
);

export const plants = pgTable(
  'plants',
  {
    id: varchar('id', { length: 40 }).primaryKey(),
    name: varchar('name', { length: 40 }).notNull(),
    description: text('description').notNull(),
    kind: varchar('kind', { length: 8 }).notNull(),
    catalogClass: varchar('catalog_class', { length: 10 }).notNull(),
    initialFree: boolean('initial_free').notNull(),
    coinPrice: integer('coin_price'),
    sortOrder: integer('sort_order').notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [
    check('plants_kind_valid', sql`${t.kind} in ('PLANT', 'FLOWER')`),
    check('plants_class_valid', sql`${t.catalogClass} in ('STANDARD', 'LIMITED', 'SPECIAL')`),
    check(
      'plants_price_matches_class',
      sql`(${t.catalogClass} = 'STANDARD' and ${t.coinPrice} is null) or (${t.catalogClass} <> 'STANDARD' and ${t.coinPrice} is not null and ${t.coinPrice} > 0)`,
    ),
    check('plants_initial_is_standard', sql`not ${t.initialFree} or ${t.catalogClass} = 'STANDARD'`),
  ],
);

export const userPlants = pgTable(
  'user_plants',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    plantId: varchar('plant_id', { length: 40 })
      .notNull()
      .references(() => plants.id),
    unlockSource: varchar('unlock_source', { length: 12 }).notNull(),
    unlockedAt: timestamptz('unlocked_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.plantId] }),
    check('user_plants_source_valid', sql`${t.unlockSource} in ('INITIAL', 'ACHIEVEMENT', 'SHOP')`),
  ],
);

export const diaries = pgTable(
  'diaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    diaryDate: date('diary_date', { mode: 'string' }).notNull(),
    body: text('body').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('diaries_user_date_unique').on(t.userId, t.diaryDate),
    check('diaries_body_length', sql`char_length(btrim(${t.body})) between 1 and 10000`),
  ],
);

export const monthlyRecords = pgTable(
  'monthly_records',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    month: date('month', { mode: 'string' }).notNull(),
    plantId: varchar('plant_id', { length: 40 }).references(() => plants.id),
    selectionLocked: boolean('selection_locked').notNull().default(false),
    totalDays: smallint('total_days').notNull(),
    writtenDays: smallint('written_days').notNull().default(0),
    growthPercent: numeric('growth_percent', { precision: 5, scale: 2 }).notNull().default('0'),
    growthStage: smallint('growth_stage').notNull().default(1),
    finalized: boolean('finalized').notNull().default(false),
    finalizedAt: timestamptz('finalized_at'),
    unlockedPlantId: varchar('unlocked_plant_id', { length: 40 }).references(() => plants.id),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.month] }),
    check('monthly_records_month_first_day', sql`extract(day from ${t.month}) = 1`),
    check('monthly_records_total_days_range', sql`${t.totalDays} between 28 and 31`),
    check('monthly_records_written_days_range', sql`${t.writtenDays} between 0 and ${t.totalDays}`),
    check('monthly_records_growth_percent_range', sql`${t.growthPercent} between 0 and 100`),
    check('monthly_records_growth_stage_range', sql`${t.growthStage} between 1 and 5`),
  ],
);

export const coinTransactions = pgTable(
  'coin_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 12 }).notNull(),
    amount: integer('amount').notNull(),
    referenceKey: varchar('reference_key', { length: 40 }).notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('coin_transactions_once_per_reference').on(t.userId, t.type, t.referenceKey),
    check(
      'coin_transactions_amount_sign',
      sql`(${t.type} = 'ATTENDANCE' and ${t.amount} > 0) or (${t.type} = 'PURCHASE' and ${t.amount} < 0) or (${t.type} = 'ADJUSTMENT' and ${t.amount} > 0)`,
    ),
  ],
);
