import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { SlashCommand, GuildConfig } from '../types';
import { isUserGloballyBlacklisted, isUserGloballyVerified, getApplication, updateApplication, saveApplication } from '../storage';
import { getGuildConfig } from '../guildConfig';
import { blacklistMemberRoles } from '../roles';

const ALLOWED_ID = '703129488170549258';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('синхронизировать')
    .setDescription('Синхронизировать верификацию и ЧСП для всех пользователей (только для разработчика)') as unknown as SlashCommand['data'],

  access: 'staff',

  async execute(interaction: ChatInputCommandInteraction, gc: GuildConfig): Promise<void> {
    if (interaction.user.id !== ALLOWED_ID) {
      await interaction.reply({
        content: 'У вас нет прав на использование этой команды.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      content: 'Начинаю глобальную синхронизацию. Это может занять некоторое время...',
      flags: MessageFlags.Ephemeral,
    });

    let blacklistedCount = 0;
    let verifiedCount = 0;

    try {
      for (const guild of interaction.client.guilds.cache.values()) {
        const guildGc = await getGuildConfig(guild.id).catch(() => null);
        if (!guildGc) continue;

        const members = await guild.members.fetch().catch(() => null);
        if (!members) continue;

        for (const member of members.values()) {
          if (member.user.bot) continue;

          // Check blacklist
          const isBlacklisted = await isUserGloballyBlacklisted(member.id);
          if (isBlacklisted && !member.roles.cache.has(guildGc.roles.blacklist)) {
            const result = await blacklistMemberRoles(member, guildGc);
            if (result.ok) {
              const existing = await getApplication(guild.id, member.id);
              if (existing) {
                await updateApplication(guild.id, member.id, {
                  status: 'blacklisted',
                  removedRoles: result.removed.length ? result.removed : existing.removedRoles,
                });
              } else {
                await saveApplication({
                  userId: member.id,
                  username: member.user.tag,
                  guildId: guild.id,
                  answers: {},
                  submittedAt: Date.now(),
                  status: 'blacklisted',
                  removedRoles: result.removed.length ? result.removed : undefined,
                  reason: 'Глобальная синхронизация',
                });
              }
              console.log(`[sync_all] Выдано глобальное ЧС: ${member.user.tag} (${member.id}) на сервере ${guild.name}`);
              blacklistedCount++;
            }
          }

          // Check verification
          if (!isBlacklisted) {
            const isVerified = await isUserGloballyVerified(member.id);
            if (isVerified && !member.roles.cache.has(guildGc.roles.verified)) {
              await member.roles.add(guildGc.roles.verified).catch(() => null);
              console.log(`[sync_all] Выдана глобальная верификация: ${member.user.tag} (${member.id}) на сервере ${guild.name}`);
              verifiedCount++;
            }
          }
        }
      }

      await interaction.followUp({
        content: `Синхронизация завершена.\nВыдано ЧС: ${blacklistedCount}\nВыдано верификаций: ${verifiedCount}`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (e) {
      console.error('[sync_all] error during sync:', e);
      await interaction.followUp({
        content: 'Произошла ошибка во время синхронизации. Проверьте логи.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export default command;
