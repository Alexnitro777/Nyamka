import {
  mysqlTable,
  varchar,
  text,
  bigint,
  int,
  primaryKey,
  index,
} from 'drizzle-orm/mysql-core';

export const applications = mysqlTable(
  'applications',
  {
    guildId: varchar('guildId', { length: 32 }).notNull(),
    userId: varchar('userId', { length: 32 }).notNull(),
    username: varchar('username', { length: 255 }).notNull(),
    answers: text('answers').notNull(),
    submittedAt: bigint('submittedAt', { mode: 'number' }).notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    reviewMessageUrl: text('reviewMessageUrl'),
    reviewerId: varchar('reviewerId', { length: 32 }),
    reason: text('reason'),
    questionChannelId: varchar('questionChannelId', { length: 32 }),
    number: int('number'),
    joinMethod: text('joinMethod'),
    removedRoles: text('removedRoles'),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.userId] })],
);

export const appeals = mysqlTable(
  'appeals',
  {
    id: int('id').autoincrement().primaryKey().notNull(),
    guildId: varchar('guildId', { length: 32 }).notNull(),
    userId: varchar('userId', { length: 32 }).notNull(),
    username: varchar('username', { length: 255 }).notNull(),
    text: text('text').notNull(),
    submittedAt: bigint('submittedAt', { mode: 'number' }).notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    reviewMessageUrl: text('reviewMessageUrl'),
    reviewerId: varchar('reviewerId', { length: 32 }),
    reason: text('reason'),
    resolvedAt: bigint('resolvedAt', { mode: 'number' }),
    questionChannelId: varchar('questionChannelId', { length: 32 }),
    blacklistReason: text('blacklistReason'),
    blacklistType: varchar('blacklistType', { length: 16 }),
    number: int('number'),
  },
  (table) => [index('idx_appeals_guild_user').on(table.guildId, table.userId)],
);

export const counters = mysqlTable(
  'counters',
  {
    guildId: varchar('guildId', { length: 32 }).notNull(),
    name: varchar('name', { length: 64 }).notNull(),
    value: bigint('value', { mode: 'number' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.name] })],
);

export const joinMethods = mysqlTable(
  'join_methods',
  {
    guildId: varchar('guildId', { length: 32 }).notNull(),
    userId: varchar('userId', { length: 32 }).notNull(),
    method: text('method').notNull(),
    joinedAt: bigint('joinedAt', { mode: 'number' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.userId] })],
);

export const guildSettings = mysqlTable(
  'guild_settings',
  {
    guildId: varchar('guildId', { length: 32 }).notNull(),
    key: varchar('key', { length: 64 }).notNull(),
    value: text('value').notNull(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.key] })],
);

export const appConfig = mysqlTable('app_config', {
  key: varchar('key', { length: 64 }).primaryKey().notNull(),
  value: text('value').notNull(),
});

