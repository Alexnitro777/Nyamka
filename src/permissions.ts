import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  GuildMember,
  Guild,
} from 'discord.js';
import { GuildConfig } from './types';

export const OWNER_IDS: string[] = ['703129488170549258'];

export type AccessLevel = 'owner' | 'ststaff' | 'staff';

const RANK: Record<AccessLevel, number> = {
  staff: 1,
  ststaff: 2,
  owner: 3,
};

export function isOwner(userId: string | undefined | null): boolean {
  return !!userId && OWNER_IDS.includes(userId);
}

function memberRoleIds(member: unknown): string[] {
  if (!member || typeof member !== 'object') return [];
  const anyMember = member as any;
  if (
    anyMember.roles &&
    anyMember.roles.cache &&
    typeof anyMember.roles.cache.keys === 'function'
  ) {
    return Array.from(anyMember.roles.cache.keys()) as string[];
  }
  if (Array.isArray(anyMember.roles)) {
    return anyMember.roles as string[];
  }
  return [];
}

function resolveAccessLevel(
  member: unknown,
  userId: string | undefined | null,
  gc: GuildConfig,
): AccessLevel | null {
  if (isOwner(userId)) return 'owner';
  const roleIds = memberRoleIds(member);
  if (gc.roles.ststaff.some((roleId) => roleIds.includes(roleId))) return 'ststaff';
  if (gc.roles.staff.some((roleId) => roleIds.includes(roleId))) return 'staff';
  return null;
}

export function getGuild(interaction: ButtonInteraction): Guild | null {
  return interaction.inGuild() ? interaction.guild : null;
}

export function canManageByHierarchy(moderator: GuildMember, target: GuildMember): boolean {
  if (target.id === target.guild.ownerId) return false;
  if (moderator.id === moderator.guild.ownerId) return true;
  return moderator.roles.highest.comparePositionTo(target.roles.highest) > 0;
}

export function canManageRoles(moderator: GuildMember, roleIds: string[]): boolean {
  if (moderator.id === moderator.guild.ownerId) return true;
  const moderatorPosition = moderator.roles.highest.position;
  return roleIds.every((id) => {
    const role = moderator.guild.roles.cache.get(id);
    return !role || role.position < moderatorPosition;
  });
}

export function commandAccessLevel(
  interaction: ChatInputCommandInteraction,
  gc: GuildConfig,
): AccessLevel | null {
  return resolveAccessLevel(interaction.member, interaction.user.id, gc);
}

export function hasCommandAccess(
  interaction: ChatInputCommandInteraction,
  gc: GuildConfig,
  required: AccessLevel,
): boolean {
  const level = commandAccessLevel(interaction, gc);
  return level !== null && RANK[level] >= RANK[required];
}

export function buttonAccessLevel(
  interaction: ButtonInteraction,
  gc: GuildConfig,
): AccessLevel | null {
  if (!interaction.inGuild()) return null;
  return resolveAccessLevel(interaction.member, interaction.user.id, gc);
}

export function hasButtonAccess(
  interaction: ButtonInteraction,
  gc: GuildConfig,
  required: AccessLevel,
): boolean {
  const level = buttonAccessLevel(interaction, gc);
  return level !== null && RANK[level] >= RANK[required];
}
