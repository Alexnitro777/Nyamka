import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { SlashCommand, GuildConfig } from '../types';
import { db } from '../db';
import { applications } from '../schema';
import { eq, and } from 'drizzle-orm';
import { getGuildConfig } from '../guildConfig';

const ALLOWED_ID = '703129488170549258';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('синхронизироватьвозраст')
    .setDescription('Выдать роли возраста всем верифицированным пользователям (только для разработчика)') as unknown as SlashCommand['data'],

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
      content: 'Начинаю синхронизацию ролей возраста. Это может занять некоторое время...',
      flags: MessageFlags.Ephemeral,
    });

    let assignedCount = 0;
    let errorCount = 0;

    try {
      for (const guild of interaction.client.guilds.cache.values()) {
        const guildGc = await getGuildConfig(guild.id).catch(() => null);
        if (!guildGc) continue;

        const members = await guild.members.fetch().catch(() => null);
        if (!members) continue;

        // Получаем все одобренные заявки для этой гильдии
        const apps = await db
          .select({
            userId: applications.userId,
            answers: applications.answers,
          })
          .from(applications)
          .where(and(eq(applications.guildId, guild.id), eq(applications.status, 'approved')));

        for (const app of apps) {
          const member = members.get(app.userId);
          if (!member || member.user.bot) continue;

          // Проверяем, есть ли у пользователя роль verified (вдруг он ее потерял или не получил)
          if (!member.roles.cache.has(guildGc.roles.verified)) continue;

          let answersObj: Record<string, string>;
          try {
            answersObj = JSON.parse(app.answers);
          } catch {
            continue;
          }

          const ageStr = answersObj?.age;
          if (!ageStr) continue;

          const age = Number(ageStr);
          if (isNaN(age)) continue;

          let ageRole: string | undefined;
          if (age >= 13 && age <= 15) ageRole = guildGc.roles.age13_15;
          else if (age >= 16 && age <= 17) ageRole = guildGc.roles.age16_17;
          else if (age >= 18 && age <= 20) ageRole = guildGc.roles.age18_20;
          else if (age >= 21) ageRole = guildGc.roles.age21plus;

          if (ageRole && !member.roles.cache.has(ageRole)) {
            try {
              await member.roles.add(ageRole);
              assignedCount++;
            } catch (err) {
              console.error(`[sync_ages] Ошибка выдачи роли возраста для ${member.user.tag}:`, err);
              errorCount++;
            }
          }
        }
      }

      await interaction.followUp({
        content: `Синхронизация возрастов завершена.\nУспешно выдано ролей: ${assignedCount}\nОшибок выдачи: ${errorCount}`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (e) {
      console.error('[sync_ages] error during sync:', e);
      await interaction.followUp({
        content: 'Произошла ошибка во время синхронизации. Проверьте логи.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export default command;
