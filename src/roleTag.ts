import { Client, EmbedBuilder, GuildMember, TextChannel, User } from 'discord.js';
import { GuildConfig } from './types';
import { getGuildConfig } from './guildConfig';

export interface PrimaryGuildInfo {
  identityGuildId: string | null;
  identityEnabled: boolean | null;
  tag: string | null;
}

function normalizePrimaryGuild(pg: Record<string, unknown> | null | undefined): PrimaryGuildInfo | null {
  if (!pg) return null;
  const identityGuildId =
    (pg.identityGuildId as string | undefined) ??
    (pg.identity_guild_id as string | undefined) ??
    null;
  const identityEnabled =
    (pg.identityEnabled as boolean | undefined) ??
    (pg.identity_enabled as boolean | undefined) ??
    null;
  const tag = (pg.tag as string | undefined) ?? null;
  return { identityGuildId, identityEnabled, tag };
}

export function getPrimaryGuild(user: User): PrimaryGuildInfo | null {
  const anyUser = user as unknown as {
    primaryGuild?: Record<string, unknown> | null;
    primary_guild?: Record<string, unknown> | null;
  };
  return normalizePrimaryGuild(anyUser.primaryGuild ?? anyUser.primary_guild ?? null);
}

function infoIsOurTag(pg: PrimaryGuildInfo | null, guildId: string): boolean {
  if (!pg) return false;
  return pg.identityEnabled === true && pg.identityGuildId === guildId;
}

export function hasServerTag(user: User, guildId: string): boolean {
  return infoIsOurTag(getPrimaryGuild(user), guildId);
}

function rawUserHasServerTag(
  rawUser: Record<string, unknown> | undefined | null,
  guildId: string,
): boolean {
  if (!rawUser) return false;
  const pg = (rawUser.primary_guild ?? rawUser.primaryGuild) as
    | Record<string, unknown>
    | null
    | undefined;
  return infoIsOurTag(normalizePrimaryGuild(pg), guildId);
}

async function sendTagLog(
  member: GuildMember,
  gc: GuildConfig,
  action: 'added' | 'removed',
): Promise<void> {
  const channelId = gc.channels.tagLog;
  if (!channelId) return;
  const roleId = gc.roles.roleTag;

  try {
    const channel =
      member.guild.channels.cache.get(channelId) ??
      (await member.guild.channels.fetch(channelId).catch(() => null));
    if (!channel || !channel.isTextBased()) return;

    const added = action === 'added';

    const embed = new EmbedBuilder()
      .setColor(added ? 0x57f287 : 0xed4245)
      .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
      .setTitle(added ? '🏷️ Выдана роль за тег сервера' : '🏷️ Снята роль за тег сервера')
      .setDescription(`<@${member.id}>`)
      .addFields(
        { name: 'Участник', value: `${member.user.tag}\n\`${member.id}\``, inline: true },
        { name: 'Роль', value: roleId ? `<@&${roleId}>` : '—', inline: true },
        {
          name: 'Действие',
          value: added ? 'Участник надел тег сервера.' : 'Участник снял тег сервера.',
          inline: false,
        },
      )
      .setFooter({ text: 'Тег сервера' })
      .setTimestamp();

    await (channel as TextChannel).send({ embeds: [embed] });
  } catch (err) {
    console.error(`[roleTag] не удалось отправить лог для ${member.id}:`, err);
  }
}

const tagRoleLocks = new Map<string, Promise<void>>();

function runExclusive(key: string, task: () => Promise<void>): Promise<void> {
  const prev = tagRoleLocks.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  tagRoleLocks.set(key, next);
  void next.finally(() => {
    if (tagRoleLocks.get(key) === next) tagRoleLocks.delete(key);
  });
  return next;
}

async function applyTagRole(
  member: GuildMember,
  gc: GuildConfig,
  shouldHave: boolean,
): Promise<void> {
  const roleId = gc.roles.roleTag;
  if (!roleId) return;
  if (member.user.bot) return;

  const key = `${member.guild.id}:${member.id}`;
  await runExclusive(key, async () => {
    const fresh = member.guild.members.cache.get(member.id) ?? member;
    const hasRole = fresh.roles.cache.has(roleId);

    try {
      if (shouldHave && !hasRole) {
        await fresh.roles.add(roleId, 'Надел тег сервера');
        console.log(`[roleTag] выдана роль ${fresh.user.tag} (${fresh.id})`);
        await sendTagLog(fresh, gc, 'added');
      } else if (!shouldHave && hasRole) {
        await fresh.roles.remove(roleId, 'Снял тег сервера');
        console.log(`[roleTag] снята роль ${fresh.user.tag} (${fresh.id})`);
        await sendTagLog(fresh, gc, 'removed');
      }
    } catch (err) {
      console.error(`[roleTag] не удалось обновить роль для ${fresh.id}:`, err);
    }
  });
}

export async function syncMemberTagRole(member: GuildMember): Promise<void> {
  const gc = await getGuildConfig(member.guild.id);
  if (!gc || !gc.roles.roleTag) return;
  await applyTagRole(member, gc, hasServerTag(member.user, member.guild.id));
}

export async function syncAllTagRoles(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    const gc = await getGuildConfig(guild.id);
    if (!gc || !gc.roles.roleTag) continue;

    try {
      const members = await guild.members.fetch();
      for (const member of members.values()) {
        await applyTagRole(member, gc, hasServerTag(member.user, guild.id));
      }
      console.log(
        `[roleTag] синхронизация для ${guild.name} завершена (${members.size} участников).`,
      );
    } catch (err) {
      console.error(`[roleTag] синхронизация для ${guild.id} не удалась:`, err);
    }
  }
}

export function registerTagRoleEvents(client: Client): void {
  client.on('guildMemberAdd', async (member) => {
    const m = member.partial ? await member.fetch().catch(() => null) : member;
    if (m) await syncMemberTagRole(m);
  });

  client.on('guildMemberUpdate', async (_oldMember, newMember) => {
    const m = newMember.partial ? await newMember.fetch().catch(() => null) : newMember;
    if (m) await syncMemberTagRole(m);
  });

  client.on('userUpdate', async (_oldUser, newUser) => {
    for (const guild of client.guilds.cache.values()) {
      const member = await guild.members.fetch(newUser.id).catch(() => null);
      if (member) await syncMemberTagRole(member);
    }
  });

  client.on('raw', async (packet: { t?: string; d?: Record<string, unknown> }) => {
    if (!packet || packet.t !== 'GUILD_MEMBER_UPDATE') return;
    const data = packet.d;
    if (!data) return;
    const guildId = data.guild_id as string | undefined;
    if (!guildId) return;
    const rawUser = data.user as Record<string, unknown> | undefined;
    const userId = rawUser?.id as string | undefined;
    if (!userId) return;

    const gc = await getGuildConfig(guildId);
    if (!gc || !gc.roles.roleTag) return;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    await applyTagRole(member, gc, rawUserHasServerTag(rawUser, guildId));
  });
}
