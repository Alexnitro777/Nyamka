import { Client, GuildMember, PartialGuildMember } from 'discord.js';
import { isUserGloballyBlacklisted, getApplication, updateApplication, saveApplication } from './storage';
import { getGuildConfig } from './guildConfig';
import { postDecisionMessage } from './ui';

async function enforceBlacklistOnJoin(
  member: GuildMember | PartialGuildMember,
): Promise<void> {
  if (member.user.bot) return;

  const full = member.partial ? await member.fetch().catch(() => null) : member;
  if (!full) return;

  const gc = await getGuildConfig(full.guild.id);
  if (!gc) return;

  const isBlacklisted = await isUserGloballyBlacklisted(full.id);
  if (!isBlacklisted) return;

  if (full.roles.cache.has(gc.roles.blacklist)) return;

  try {
    await full.roles.add(gc.roles.blacklist, 'Возврат в ЧС при перезаходе');
    
    const existing = await getApplication(full.guild.id, full.id);
    if (existing) {
      await updateApplication(full.guild.id, full.id, { status: 'blacklisted' });
    } else {
      await saveApplication({
        userId: full.id,
        username: full.user.tag,
        guildId: full.guild.id,
        answers: {},
        submittedAt: Date.now(),
        status: 'blacklisted',
        reason: 'Глобальный ЧС при входе'
      });
    }

    await postDecisionMessage(full.client, gc.channels.blacklistLog, 'application', {
      label: 'Авто-ЧС',
      color: 0x992d22,
      reviewerId: full.client.user!.id,
      targetUserId: full.id,
      reason: { title: 'Причина', text: 'Глобальный ЧС при входе' },
      title: 'Автоматическая выдача ЧСП',
    });

    console.log(`[blacklistEnforce] возвращена роль ЧС ${full.user.tag} (${full.id})`);
  } catch (e) {
    console.error(`[blacklistEnforce] не удалось вернуть роль ЧС для ${full.id}:`, e);
  }
}

export function registerBlacklistEnforcement(client: Client): void {
  client.on('guildMemberAdd', (member) => {
    void enforceBlacklistOnJoin(member).catch((e) =>
      console.error('[blacklistEnforce] handler failed', e),
    );
  });
}
