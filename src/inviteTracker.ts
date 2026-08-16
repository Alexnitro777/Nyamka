import { Client, Collection, Guild, Invite, PermissionFlagsBits } from 'discord.js';
import { saveJoinMethod } from './storage';

interface CachedInvite {
  uses: number;
  inviterId: string | null;
}

interface DeletedInvite {
  inviterId: string | null;
  deletedAt: number;
}

interface GuildInviteState {
  invites: Map<string, CachedInvite>;
  recentlyDeleted: Map<string, DeletedInvite>;
  vanityUses: number | null;
}

const guildStates = new Map<string, GuildInviteState>();

function stateFor(guildId: string): GuildInviteState {
  let state = guildStates.get(guildId);
  if (!state) {
    state = { invites: new Map(), recentlyDeleted: new Map(), vanityUses: null };
    guildStates.set(guildId, state);
  }
  return state;
}

const UNKNOWN = 'Неизвестно';
const VANITY = 'По vanity-ссылке';
const TRAVEL = 'Путешествие';

const DELETED_WINDOW_MS = 10_000;
const RECACHE_INTERVAL_MS = 5 * 60 * 1000;

const locks = new Map<string, Promise<void>>();

function runExclusive(guildId: string, task: () => Promise<void>): Promise<void> {
  const prev = locks.get(guildId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  locks.set(guildId, next.catch(() => undefined));
  return next;
}

function firstValue(map: Map<string, string | null>): string | null {
  for (const value of map.values()) return value;
  return null;
}

function snapshotInvites(guildId: string, invites: Collection<string, Invite>): void {
  const state = stateFor(guildId);
  state.invites.clear();
  for (const invite of invites.values()) {
    state.invites.set(invite.code, {
      uses: invite.uses ?? 0,
      inviterId: invite.inviterId ?? null,
    });
  }
}

function hasManageGuild(guild: Guild): boolean {
  const me = guild.members.me;
  return me ? me.permissions.has(PermissionFlagsBits.ManageGuild) : true;
}

async function cacheGuildInvites(guild: Guild): Promise<void> {
  const state = stateFor(guild.id);

  if (!hasManageGuild(guild)) {
    console.warn(
      `[inviteTracker] ${guild.name}: нет права «Управление сервером» — способ входа будет «Неизвестно» для всех.`,
    );
  }

  try {
    const invites = await guild.invites.fetch();
    snapshotInvites(guild.id, invites);
    console.log(`[inviteTracker] ${guild.name}: закэшировано инвайтов: ${state.invites.size}`);
  } catch (err) {
    console.warn(
      `[inviteTracker] ${guild.name}: не удалось получить инвайты — нужно право «Управление сервером». Способ входа будет «Неизвестно».`,
      err,
    );
  }

  try {
    const vanity = await guild.fetchVanityData();
    state.vanityUses = typeof vanity.uses === 'number' ? vanity.uses : null;
  } catch {
    state.vanityUses = null;
  }
}

async function detectJoinMethod(guild: Guild): Promise<string> {
  const state = stateFor(guild.id);
  const now = Date.now();

  for (const [code, entry] of state.recentlyDeleted) {
    if (now - entry.deletedAt > DELETED_WINDOW_MS) state.recentlyDeleted.delete(code);
  }

  let fresh: Collection<string, Invite>;
  try {
    fresh = await guild.invites.fetch();
  } catch {
    return UNKNOWN;
  }

  const snapshotSize = state.invites.size;
  const strong = new Map<string, string | null>();
  const weak = new Map<string, string | null>();
  const grewCodes: string[] = [];

  for (const invite of fresh.values()) {
    const prev = state.invites.get(invite.code);
    const uses = invite.uses ?? 0;
    if (prev) {
      if (uses > prev.uses) {
        strong.set(invite.code, invite.inviterId ?? prev.inviterId);
        grewCodes.push(invite.code);
      }
    } else if (uses > 0) {
      weak.set(invite.code, invite.inviterId ?? null);
    }
  }

  for (const [code, prev] of state.invites) {
    if (!fresh.has(code)) strong.set(code, prev.inviterId);
  }

  const consumedDeleted: string[] = [];
  for (const [code, entry] of state.recentlyDeleted) {
    if (now - entry.deletedAt <= DELETED_WINDOW_MS) {
      strong.set(code, entry.inviterId);
      consumedDeleted.push(code);
    }
  }

  snapshotInvites(guild.id, fresh);
  for (const code of consumedDeleted) state.recentlyDeleted.delete(code);

  console.log(
    `[inviteTracker] ${guild.name}: снапшот ${snapshotSize}→${state.invites.size}, ` +
      `выросли=[${grewCodes.join(', ')}], удалённых-в-окне=[${consumedDeleted.join(', ')}], ` +
      `кандидатов=${strong.size} (слабых=${weak.size})`,
  );

  if (strong.size === 1) {
    const inviterId = firstValue(strong);
    return inviterId ? `<@${inviterId}>` : UNKNOWN;
  }

  if (strong.size > 1) {
    console.warn(
      `[inviteTracker] ${guild.name}: неоднозначно — изменилось несколько инвайтов: [${[...strong.keys()].join(', ')}]. Способ входа «Неизвестно».`,
    );
    return UNKNOWN;
  }

  try {
    const vanity = await guild.fetchVanityData();
    const uses = typeof vanity.uses === 'number' ? vanity.uses : null;
    const prevVanity = state.vanityUses;
    state.vanityUses = uses;
    if (prevVanity !== null && uses !== null && uses > prevVanity) {
      return vanity.code ? `https://discord.gg/${vanity.code}` : VANITY;
    }
  } catch {
  }

  if (weak.size === 1) {
    const inviterId = firstValue(weak);
    return inviterId ? `<@${inviterId}>` : UNKNOWN;
  }

  if (weak.size > 1) {
    console.warn(
      `[inviteTracker] ${guild.name}: неоднозначно — несколько ранее неизвестных инвайтов: [${[...weak.keys()].join(', ')}]. Способ входа «Неизвестно».`,
    );
    return UNKNOWN;
  }

  return TRAVEL;
}

export function registerInviteTracker(client: Client): void {
  client.once('ready', async () => {
    for (const guild of client.guilds.cache.values()) {
      await cacheGuildInvites(guild);
    }

    setInterval(() => {
      for (const guild of client.guilds.cache.values()) {
        void runExclusive(guild.id, () => cacheGuildInvites(guild)).catch((err) =>
          console.error('[inviteTracker] ошибка периодического ре-кэша инвайтов', err),
        );
      }
    }, RECACHE_INTERVAL_MS);
  });

  client.on('guildCreate', (guild) => {
    void cacheGuildInvites(guild).catch((err) =>
      console.error('[inviteTracker] ошибка кэширования инвайтов новой гильдии', err),
    );
  });

  client.on('inviteCreate', (invite) => {
    const guildId = invite.guild?.id;
    if (!guildId) return;
    void runExclusive(guildId, async () => {
      stateFor(guildId).invites.set(invite.code, {
        uses: invite.uses ?? 0,
        inviterId: invite.inviterId ?? null,
      });
    });
  });

  client.on('inviteDelete', (invite) => {
    const guildId = invite.guild?.id;
    if (!guildId) return;
    void runExclusive(guildId, async () => {
      const state = stateFor(guildId);
      const entry = state.invites.get(invite.code);
      if (entry) {
        state.recentlyDeleted.set(invite.code, {
          inviterId: entry.inviterId,
          deletedAt: Date.now(),
        });
      }
      state.invites.delete(invite.code);
    });
  });

  client.on('guildMemberAdd', (member) => {
    if (member.user.bot) return;
    const guildId = member.guild.id;
    void runExclusive(guildId, async () => {
      const method = await detectJoinMethod(member.guild);
      await saveJoinMethod(guildId, member.id, method);
      console.log(`[inviteTracker] ${member.user.tag} (${member.id}) — способ входа: ${method}`);
    }).catch((err) => console.error('[inviteTracker] ошибка определения способа входа', err));
  });
}
