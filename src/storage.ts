import { eq, and, desc, isNotNull } from 'drizzle-orm';
import { db, pool } from './db';
import * as schema from './schema';
import { Application, ApplicationStatus, Appeal, AppealStatus } from './types';

async function addColumnIfMissing(table: string, definition: string): Promise<void> {
  try {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

let initialized = false;

export async function initStorage(): Promise<void> {
  if (initialized) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS applications (
      guildId VARCHAR(32) NOT NULL,
      userId VARCHAR(32) NOT NULL,
      username VARCHAR(255) NOT NULL,
      answers TEXT NOT NULL,
      submittedAt BIGINT NOT NULL,
      status VARCHAR(32) NOT NULL,
      reviewMessageUrl TEXT NULL,
      reviewerId VARCHAR(32) NULL,
      reason TEXT NULL,
      questionChannelId VARCHAR(32) NULL,
      number INT NULL,
      joinMethod TEXT NULL,
      removedRoles TEXT NULL,
      PRIMARY KEY (guildId, userId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS appeals (
      guildId VARCHAR(32) NOT NULL,
      userId VARCHAR(32) NOT NULL,
      username VARCHAR(255) NOT NULL,
      text TEXT NOT NULL,
      submittedAt BIGINT NOT NULL,
      status VARCHAR(32) NOT NULL,
      reviewMessageUrl TEXT NULL,
      reviewerId VARCHAR(32) NULL,
      reason TEXT NULL,
      resolvedAt BIGINT NULL,
      questionChannelId VARCHAR(32) NULL,
      blacklistReason TEXT NULL,
      blacklistType VARCHAR(16) NULL,
      number INT NULL,
      PRIMARY KEY (guildId, userId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS counters (
      guildId VARCHAR(32) NOT NULL,
      name VARCHAR(64) NOT NULL,
      value BIGINT NOT NULL,
      PRIMARY KEY (guildId, name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS join_methods (
      guildId VARCHAR(32) NOT NULL,
      userId VARCHAR(32) NOT NULL,
      method TEXT NOT NULL,
      joinedAt BIGINT NOT NULL,
      PRIMARY KEY (guildId, userId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guildId VARCHAR(32) NOT NULL,
      \`key\` VARCHAR(64) NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (guildId, \`key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_config (
      \`key\` VARCHAR(64) NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (\`key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);


  await addColumnIfMissing('applications', 'questionChannelId VARCHAR(32) NULL');
  await addColumnIfMissing('applications', 'number INT NULL');
  await addColumnIfMissing('applications', 'joinMethod TEXT NULL');
  await addColumnIfMissing('applications', 'removedRoles TEXT NULL');


  await addColumnIfMissing('appeals', 'reviewMessageUrl TEXT NULL');
  await addColumnIfMissing('appeals', 'resolvedAt BIGINT NULL');
  await addColumnIfMissing('appeals', 'questionChannelId VARCHAR(32) NULL');
  await addColumnIfMissing('appeals', 'blacklistReason TEXT NULL');
  await addColumnIfMissing('appeals', 'blacklistType VARCHAR(16) NULL');
  await addColumnIfMissing('appeals', 'number INT NULL');

  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM appeals LIKE 'id'");
    if ((cols as any[]).length === 0) {
      await pool.query("ALTER TABLE appeals DROP PRIMARY KEY, ADD COLUMN id INT AUTO_INCREMENT PRIMARY KEY FIRST, ADD INDEX idx_guild_user (guildId, userId)");
    }
  } catch (err) {
    console.error("Migration error for appeals:", err);
  }

  initialized = true;
}

export async function getGuildSettings(guildId: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ key: schema.guildSettings.key, value: schema.guildSettings.value })
    .from(schema.guildSettings)
    .where(eq(schema.guildSettings.guildId, guildId));

  const out: Record<string, string> = {};
  for (const row of rows) {
    out[row.key] = row.value;
  }
  return out;
}

export async function getAppConfigValue(key: string): Promise<string | undefined> {
  const [row] = await db
    .select({ value: schema.appConfig.value })
    .from(schema.appConfig)
    .where(eq(schema.appConfig.key, key));

  return row?.value;
}

export async function setAppConfigValue(key: string, value: string): Promise<void> {
  await db
    .insert(schema.appConfig)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value } });
}

export async function saveJoinMethod(
  guildId: string,
  userId: string,
  method: string,
): Promise<void> {
  const joinedAt = Date.now();
  await db
    .insert(schema.joinMethods)
    .values({ guildId, userId, method, joinedAt })
    .onDuplicateKeyUpdate({ set: { method, joinedAt } });
}

export async function getJoinMethod(
  guildId: string,
  userId: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ method: schema.joinMethods.method })
    .from(schema.joinMethods)
    .where(and(eq(schema.joinMethods.guildId, guildId), eq(schema.joinMethods.userId, userId)));

  return row?.method;
}

async function nextNumber(guildId: string, name: string): Promise<number> {
  const [result] = await pool.execute<any>(
    `INSERT INTO counters (guildId, name, value) VALUES (?, ?, LAST_INSERT_ID(1))
     ON DUPLICATE KEY UPDATE value = LAST_INSERT_ID(value + 1)`,
    [guildId, name],
  );
  return Number(result.insertId);
}

export function nextApplicationNumber(guildId: string): Promise<number> {
  return nextNumber(guildId, 'application');
}

export function nextAppealNumber(guildId: string): Promise<number> {
  return nextNumber(guildId, 'appeal');
}

function rowToApp(row: typeof schema.applications.$inferSelect): Application {
  return {
    userId: row.userId,
    username: row.username,
    guildId: row.guildId,
    answers: JSON.parse(row.answers),
    submittedAt: row.submittedAt,
    status: row.status as ApplicationStatus,
    reviewMessageUrl: row.reviewMessageUrl ?? undefined,
    reviewerId: row.reviewerId ?? undefined,
    reason: row.reason ?? undefined,
    questionChannelId: row.questionChannelId ?? undefined,
    number: row.number ?? undefined,
    joinMethod: row.joinMethod ?? undefined,
    removedRoles: row.removedRoles ? JSON.parse(row.removedRoles) : undefined,
  };
}

export async function saveApplication(app: Application): Promise<void> {
  const values = {
    guildId: app.guildId,
    userId: app.userId,
    username: app.username,
    answers: JSON.stringify(app.answers),
    submittedAt: app.submittedAt,
    status: app.status,
    reviewMessageUrl: app.reviewMessageUrl ?? null,
    reviewerId: app.reviewerId ?? null,
    reason: app.reason ?? null,
    questionChannelId: app.questionChannelId ?? null,
    number: app.number ?? null,
    joinMethod: app.joinMethod ?? null,
    removedRoles: app.removedRoles ? JSON.stringify(app.removedRoles) : null,
  };

  await db
    .insert(schema.applications)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        username: values.username,
        answers: values.answers,
        submittedAt: values.submittedAt,
        status: values.status,
        reviewMessageUrl: values.reviewMessageUrl,
        reviewerId: values.reviewerId,
        reason: values.reason,
        questionChannelId: values.questionChannelId,
        number: values.number,
        joinMethod: values.joinMethod,
        removedRoles: values.removedRoles,
      },
    });
}

export async function reserveApplication(app: Application): Promise<boolean> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute<any[]>(
      'SELECT status FROM applications WHERE guildId = ? AND userId = ? FOR UPDATE',
      [app.guildId, app.userId],
    );
    if (rows.length && rows[0].status === 'pending') {
      await conn.rollback();
      return false;
    }
    await conn.execute(
      `INSERT INTO applications (
        guildId, userId, username, answers, submittedAt, status,
        reviewMessageUrl, reviewerId, reason, questionChannelId, number, joinMethod, removedRoles
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        username = VALUES(username),
        answers = VALUES(answers),
        submittedAt = VALUES(submittedAt),
        status = VALUES(status),
        reviewMessageUrl = VALUES(reviewMessageUrl),
        reviewerId = VALUES(reviewerId),
        reason = VALUES(reason),
        questionChannelId = VALUES(questionChannelId),
        number = VALUES(number),
        joinMethod = VALUES(joinMethod),
        removedRoles = VALUES(removedRoles)`,
      [
        app.guildId,
        app.userId,
        app.username,
        JSON.stringify(app.answers),
        app.submittedAt,
        app.status,
        app.reviewMessageUrl ?? null,
        app.reviewerId ?? null,
        app.reason ?? null,
        app.questionChannelId ?? null,
        app.number ?? null,
        app.joinMethod ?? null,
        app.removedRoles ? JSON.stringify(app.removedRoles) : null,
      ],
    );
    await conn.commit();
    return true;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
    }
    throw err;
  } finally {
    conn.release();
  }
}

export async function claimApplicationQuestionChannel(
  guildId: string,
  userId: string,
  newId: string,
  oldId: string | null,
): Promise<boolean> {
  const [result] = await pool.execute<any>(
    'UPDATE applications SET questionChannelId = ? WHERE guildId = ? AND userId = ? AND questionChannelId <=> ?',
    [newId, guildId, userId, oldId],
  );
  return result.affectedRows === 1;
}

export async function getApplication(
  guildId: string,
  userId: string,
): Promise<Application | undefined> {
  const [row] = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.guildId, guildId), eq(schema.applications.userId, userId)));

  return row ? rowToApp(row) : undefined;
}

export async function getApplicationByQuestionChannel(
  channelId: string,
): Promise<Application | undefined> {
  const [row] = await db
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.questionChannelId, channelId));

  return row ? rowToApp(row) : undefined;
}

export async function listPendingApplications(guildId: string): Promise<Application[]> {
  const rows = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.guildId, guildId), eq(schema.applications.status, 'pending')))
    .orderBy(schema.applications.submittedAt);

  return rows.map(rowToApp);
}

export async function listApplicationsWithQuestionChannel(
  guildId: string,
): Promise<Application[]> {
  const rows = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.guildId, guildId), isNotNull(schema.applications.questionChannelId)));

  return rows.map(rowToApp);
}

export async function updateApplication(
  guildId: string,
  userId: string,
  patch: Partial<Application>,
): Promise<Application | undefined> {
  const current = await getApplication(guildId, userId);
  if (!current) return undefined;
  const updated = { ...current, ...patch };
  await saveApplication(updated);
  return updated;
}

export async function claimApplication(
  guildId: string,
  userId: string,
  to: ApplicationStatus,
  reviewerId: string,
  reason?: string,
): Promise<boolean> {
  const result = await db
    .update(schema.applications)
    .set({ status: to, reviewerId, reason: reason ?? null })
    .where(
      and(
        eq(schema.applications.guildId, guildId),
        eq(schema.applications.userId, userId),
        eq(schema.applications.status, 'pending'),
      ),
    );

  const affectedRows = (result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0;
  return affectedRows === 1;
}

export async function markApplicationLeft(
  guildId: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .update(schema.applications)
    .set({ status: 'left' })
    .where(
      and(
        eq(schema.applications.guildId, guildId),
        eq(schema.applications.userId, userId),
        eq(schema.applications.status, 'pending'),
      ),
    );

  const affectedRows = (result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0;
  return affectedRows === 1;
}

function rowToAppeal(row: typeof schema.appeals.$inferSelect): Appeal {
  return {
    userId: row.userId,
    guildId: row.guildId,
    username: row.username,
    text: row.text,
    submittedAt: row.submittedAt,
    status: row.status as AppealStatus,
    reviewMessageUrl: row.reviewMessageUrl ?? undefined,
    reviewerId: row.reviewerId ?? undefined,
    reason: row.reason ?? undefined,
    resolvedAt: row.resolvedAt ?? undefined,
    questionChannelId: row.questionChannelId ?? undefined,
    blacklistReason: row.blacklistReason ?? undefined,
    blacklistType: row.blacklistType ?? undefined,
    number: row.number ?? undefined,
  };
}

export async function saveAppeal(appeal: Appeal): Promise<void> {
  const values = {
    guildId: appeal.guildId,
    userId: appeal.userId,
    username: appeal.username,
    text: appeal.text,
    submittedAt: appeal.submittedAt,
    status: appeal.status,
    reviewMessageUrl: appeal.reviewMessageUrl ?? null,
    reviewerId: appeal.reviewerId ?? null,
    reason: appeal.reason ?? null,
    resolvedAt: appeal.resolvedAt ?? null,
    questionChannelId: appeal.questionChannelId ?? null,
    blacklistReason: appeal.blacklistReason ?? null,
    blacklistType: appeal.blacklistType ?? null,
    number: appeal.number ?? null,
  };

  await db
    .insert(schema.appeals)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        username: values.username,
        text: values.text,
        submittedAt: values.submittedAt,
        status: values.status,
        reviewMessageUrl: values.reviewMessageUrl,
        reviewerId: values.reviewerId,
        reason: values.reason,
        resolvedAt: values.resolvedAt,
        questionChannelId: values.questionChannelId,
        blacklistReason: values.blacklistReason,
        blacklistType: values.blacklistType,
        number: values.number,
      },
    });
}

export async function reserveAppeal(appeal: Appeal): Promise<boolean> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute<any[]>(
      'SELECT status FROM appeals WHERE guildId = ? AND userId = ? AND (blacklistType = ? OR blacklistType IS NULL) FOR UPDATE',
      [appeal.guildId, appeal.userId, appeal.blacklistType ?? null],
    );
    if (rows.length && rows.some(r => r.status === 'pending')) {
      await conn.rollback();
      return false;
    }
    await conn.execute(
      `INSERT INTO appeals (
        guildId, userId, username, text, submittedAt, status,
        reviewMessageUrl, reviewerId, reason, resolvedAt, questionChannelId, blacklistReason, blacklistType, number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        appeal.guildId,
        appeal.userId,
        appeal.username,
        appeal.text,
        appeal.submittedAt,
        appeal.status,
        appeal.reviewMessageUrl ?? null,
        appeal.reviewerId ?? null,
        appeal.reason ?? null,
        appeal.resolvedAt ?? null,
        appeal.questionChannelId ?? null,
        appeal.blacklistReason ?? null,
        appeal.blacklistType ?? null,
        appeal.number ?? null,
      ],
    );
    await conn.commit();
    return true;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
    }
    throw err;
  } finally {
    conn.release();
  }
}

export async function claimAppealQuestionChannel(
  guildId: string,
  userId: string,
  newId: string,
  oldId: string | null,
): Promise<boolean> {
  const [result] = await pool.execute<any>(
    'UPDATE appeals SET questionChannelId = ? WHERE guildId = ? AND userId = ? AND questionChannelId <=> ?',
    [newId, guildId, userId, oldId],
  );
  return result.affectedRows === 1;
}

export async function getAppeal(
  guildId: string,
  userId: string,
): Promise<Appeal | undefined> {
  const [row] = await db
    .select()
    .from(schema.appeals)
    .where(and(eq(schema.appeals.guildId, guildId), eq(schema.appeals.userId, userId)))
    .orderBy(desc(schema.appeals.submittedAt))
    .limit(1);

  return row ? rowToAppeal(row) : undefined;
}

export async function getPendingAppeals(
  guildId: string,
  userId: string,
): Promise<Appeal[]> {
  const rows = await db
    .select()
    .from(schema.appeals)
    .where(and(eq(schema.appeals.guildId, guildId), eq(schema.appeals.userId, userId), eq(schema.appeals.status, 'pending')));

  return rows.map(rowToAppeal);
}

export async function getAppealByQuestionChannel(
  channelId: string,
): Promise<Appeal | undefined> {
  const [row] = await db
    .select()
    .from(schema.appeals)
    .where(eq(schema.appeals.questionChannelId, channelId));

  return row ? rowToAppeal(row) : undefined;
}

export async function listPendingAppeals(guildId: string): Promise<Appeal[]> {
  const rows = await db
    .select()
    .from(schema.appeals)
    .where(and(eq(schema.appeals.guildId, guildId), eq(schema.appeals.status, 'pending')))
    .orderBy(schema.appeals.submittedAt);

  return rows.map(rowToAppeal);
}

export async function listAppealsWithQuestionChannel(guildId: string): Promise<Appeal[]> {
  const rows = await db
    .select()
    .from(schema.appeals)
    .where(and(eq(schema.appeals.guildId, guildId), isNotNull(schema.appeals.questionChannelId)));

  return rows.map(rowToAppeal);
}

export async function updateAppeal(
  guildId: string,
  userId: string,
  patch: Partial<Appeal>,
  blacklistType?: string,
): Promise<Appeal | undefined> {
  // Try to find the specific appeal to update
  const rows = await db
    .select()
    .from(schema.appeals)
    .where(and(
      eq(schema.appeals.guildId, guildId),
      eq(schema.appeals.userId, userId),
      blacklistType ? eq(schema.appeals.blacklistType, blacklistType) : undefined
    ))
    .orderBy(desc(schema.appeals.submittedAt))
    .limit(1);

  if (!rows.length) return undefined;
  
  const current = rowToAppeal(rows[0]);
  const updated = { ...current, ...patch };

  const values = {
    username: updated.username,
    text: updated.text,
    submittedAt: updated.submittedAt,
    status: updated.status,
    reviewMessageUrl: updated.reviewMessageUrl ?? null,
    reviewerId: updated.reviewerId ?? null,
    reason: updated.reason ?? null,
    resolvedAt: updated.resolvedAt ?? null,
    questionChannelId: updated.questionChannelId ?? null,
    blacklistReason: updated.blacklistReason ?? null,
    blacklistType: updated.blacklistType ?? null,
    number: updated.number ?? null,
  };

  await db
    .update(schema.appeals)
    .set(values)
    .where(eq(schema.appeals.id, rows[0].id));

  return updated;
}

export async function claimAppeal(
  guildId: string,
  userId: string,
  to: AppealStatus,
  reviewerId: string,
  reason?: string,
  resolvedAt: number = Date.now(),
  blacklistType?: string,
): Promise<boolean> {
  let conditions = and(
    eq(schema.appeals.guildId, guildId),
    eq(schema.appeals.userId, userId),
    eq(schema.appeals.status, 'pending'),
  );

  if (blacklistType) {
    conditions = and(conditions, eq(schema.appeals.blacklistType, blacklistType));
  } else {
    // Legacy fallback: if no type is given, we must pick ONE pending appeal or it updates all.
    // Drizzle's update will update all matching rows if there's multiple pending.
  }

  const result = await db
    .update(schema.appeals)
    .set({ status: to, reviewerId, reason: reason ?? null, resolvedAt })
    .where(conditions);

  const affectedRows = (result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0;
  return affectedRows === 1;
}

export async function markAppealLeft(
  guildId: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .update(schema.appeals)
    .set({ status: 'left' })
    .where(
      and(
        eq(schema.appeals.guildId, guildId),
        eq(schema.appeals.userId, userId),
        eq(schema.appeals.status, 'pending'),
      ),
    );

  const affectedRows = (result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0;
  return affectedRows === 1;
}

export async function isUserGloballyBlacklisted(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ status: schema.applications.status })
    .from(schema.applications)
    .where(and(eq(schema.applications.userId, userId), eq(schema.applications.status, 'blacklisted')))
    .limit(1);
  return !!row;
}

export async function isUserGloballyVerified(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ status: schema.applications.status })
    .from(schema.applications)
    .where(and(eq(schema.applications.userId, userId), eq(schema.applications.status, 'approved')))
    .limit(1);
  return !!row;
}
