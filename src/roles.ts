import { GuildMember } from 'discord.js';
import { GuildConfig } from './types';

export async function blacklistMemberRoles(
  member: GuildMember,
  gc: GuildConfig,
): Promise<{ ok: boolean; removed: string[] }> {
  const botTop = member.guild.members.me?.roles.highest.position ?? 0;
  const keep: string[] = [];
  const removed: string[] = [];

  for (const role of member.roles.cache.values()) {
    if (role.id === member.guild.id || role.id === gc.roles.blacklist) continue;
    if (role.managed || role.position >= botTop) {
      keep.push(role.id);
    } else {
      removed.push(role.id);
    }
  }

  try {
    await member.roles.set([...keep, gc.roles.blacklist]);
    return { ok: true, removed };
  } catch (e) {
    console.error('[roles] blacklistMemberRoles failed', e);
    return { ok: false, removed: [] };
  }
}

export async function restoreMemberRoles(
  member: GuildMember,
  gc: GuildConfig,
  roleIds: string[],
): Promise<boolean> {
  const botTop = member.guild.members.me?.roles.highest.position ?? 0;
  const toAdd = roleIds.filter((id) => {
    if (id === gc.roles.verified) return false;
    const role = member.guild.roles.cache.get(id);
    return role !== undefined && !role.managed && role.position < botTop;
  });

  if (toAdd.length === 0) return true;

  try {
    await member.roles.add(toAdd);
    return true;
  } catch (e) {
    console.error('[roles] restoreMemberRoles failed', e);
    return false;
  }
}
