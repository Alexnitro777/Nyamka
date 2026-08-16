import { GuildConfig } from './types';
import { getGuildSettings } from './storage';

const cache = new Map<string, GuildConfig | null>();

function required(value: string | undefined, name: string): string {
  if (!value || !value.trim()) {
    throw new Error(`Missing required guild setting: ${name}`);
  }
  return value.trim();
}

function optional(value: string | undefined): string | undefined {
  return value && value.trim() ? value.trim() : undefined;
}

function requiredList(value: string | undefined, name: string): string[] {
  const arr = (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  if (arr.length === 0) {
    throw new Error(`Missing required guild setting: ${name}`);
  }
  return arr;
}

function optionalList(value: string | undefined): string[] | undefined {
  const arr = (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  return arr.length > 0 ? arr : undefined;
}

function build(guildId: string, raw: Record<string, string>): GuildConfig {
  return {
    guildId,
    roles: {
      verified: required(raw['roles.verified'], 'roles.verified'),
      blacklist: required(raw['roles.blacklist'], 'roles.blacklist'),
      blacklistZ: optional(raw['roles.blacklistZ']),
      blacklistA: optional(raw['roles.blacklistA']),
      staff: requiredList(raw['roles.staff'], 'roles.staff'),
      ststaff: requiredList(raw['roles.ststaff'], 'roles.ststaff'),
      roleTag: optional(raw['roles.roleTag']),
      age13_15: optional(raw['roles.age13_15']),
      age16_17: optional(raw['roles.age16_17']),
      age18_20: optional(raw['roles.age18_20']),
      age21plus: optional(raw['roles.age21plus']),
    },
    channels: {
      review: required(raw['channels.review'], 'channels.review'),
      appealReview: required(raw['channels.appealReview'], 'channels.appealReview'),
      welcome: optional(raw['channels.welcome']),
      decisions: optional(raw['channels.decisions']),
      appeal: optional(raw['channels.appeal']),
      tagLog: optional(raw['channels.tagLog']),
      blacklistLog: optional(raw['channels.blacklistLog']),
    },
    questionCategoryId: required(raw['questionCategoryId'], 'questionCategoryId'),
  };
}

export async function getGuildConfig(guildId: string): Promise<GuildConfig | null> {
  if (cache.has(guildId)) {
    return cache.get(guildId) ?? null;
  }

  const raw = await getGuildSettings(guildId);
  if (Object.keys(raw).length === 0) {
    cache.set(guildId, null);
    return null;
  }

  let gc: GuildConfig | null;
  try {
    gc = build(guildId, raw);
  } catch (err) {
    console.error(`[guildConfig] неполная конфигурация для гильдии ${guildId}:`, (err as Error).message);
    gc = null;
  }
  cache.set(guildId, gc);
  return gc;
}

export function invalidateGuildConfig(guildId: string): void {
  cache.delete(guildId);
}
