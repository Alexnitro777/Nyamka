import { Client, GuildMember, PartialGuildMember, VoiceState } from 'discord.js';
import { getGuildConfig } from './guildConfig';

async function kickBlacklistedFromVoice(
  member: GuildMember | PartialGuildMember,
): Promise<void> {
  if (member.user.bot) return;
  if (!member.voice.channelId) return;

  const full = member.partial ? await member.fetch().catch(() => null) : member;
  if (!full) return;
  if (!full.voice.channelId) return;

  const gc = await getGuildConfig(full.guild.id);
  if (!gc) return;

  if (!full.roles.cache.has(gc.roles.blacklist)) return;

  try {
    await full.voice.disconnect('ЧСП: запрет голосовых каналов');
    console.log(`[voiceKick] отключён от голосового ${full.user.tag} (${full.id})`);
  } catch (e) {
    console.error(`[voiceKick] не удалось отключить ${full.id}:`, e);
  }
}

export function registerVoiceKick(client: Client): void {
  client.on('voiceStateUpdate', (_oldState: VoiceState, newState: VoiceState) => {
    if (!newState.channelId || !newState.member) return;
    void kickBlacklistedFromVoice(newState.member).catch((e) =>
      console.error('[voiceKick] voiceStateUpdate handler failed', e),
    );
  });

  client.on('guildMemberUpdate', (_oldMember, newMember) => {
    void kickBlacklistedFromVoice(newMember).catch((e) =>
      console.error('[voiceKick] guildMemberUpdate handler failed', e),
    );
  });
}
