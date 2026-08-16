import { ModalSubmitInteraction, GuildMember, MessageFlags, EmbedBuilder, TextChannel } from 'discord.js';
import { ModalHandler, GuildConfig } from '../types';
import { getApplication, updateApplication, saveApplication } from '../storage';
import { buildDmEmbed, postDecisionMessage, buildResolvedEmbed, buildProcessedButtonRow } from '../ui';
import { blacklistMemberRoles } from '../roles';
import { canManageByHierarchy } from '../permissions';
import { applyGlobalBlacklist } from '../sync';

const handler: ModalHandler = {
  customId: /^chsp:reason:\d+$/,

  async execute(interaction: ModalSubmitInteraction, gc: GuildConfig): Promise<void> {
    const [, , userId] = interaction.customId.split(':');
    const reason = interaction.fields.getTextInputValue('reason').trim();

    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        content: 'Команду нужно запускать на сервере.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!reason) {
      await interaction.reply({
        content: 'Укажите причину занесения в ЧС.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guild.id;
    const user = await interaction.client.users.fetch(userId).catch(() => null);
    if (!user) {
      await interaction.editReply({ content: 'Пользователь не найден в Discord.' });
      return;
    }

    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    const existing = await getApplication(guildId, userId);

    if (member && member.roles.cache.has(gc.roles.blacklist)) {
      await interaction.editReply({ content: 'Участник уже находится в чёрном списке на сервере.' });
      return;
    }
    if (existing?.status === 'blacklisted') {
      await interaction.editReply({ content: 'Участник уже находится в чёрном списке в базе данных.' });
      return;
    }

    const moderator = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (member && (!moderator || !canManageByHierarchy(moderator as GuildMember, member))) {
      await interaction.editReply({
        content: 'Нельзя занести в чёрный список участника, чья роль выше вашей или равна ей.',
      });
      return;
    }

    let rolesOk = true;
    let removed: string[] = [];
    if (member) {
      const res = await blacklistMemberRoles(member, gc);
      rolesOk = res.ok;
      removed = res.removed;
    }
    if (existing) {
      await updateApplication(guildId, userId, {
        status: 'blacklisted',
        reason,
        reviewerId: interaction.user.id,
        removedRoles: removed,
      });

      if (existing.status === 'pending' || existing.status === 'amnestied') {
        if (existing.reviewMessageUrl) {
          const parsed = existing.reviewMessageUrl.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
          if (parsed) {
            const [, , channelId, messageId] = parsed;
            const reviewChannel = await interaction.client.channels.fetch(channelId).catch(() => null);
            if (reviewChannel?.isTextBased()) {
              const msg = await (reviewChannel as TextChannel).messages.fetch(messageId).catch(() => null);
              if (msg && msg.embeds[0]) {
                const resolved = buildResolvedEmbed(
                  EmbedBuilder.from(msg.embeds[0]),
                  'ЧС',
                  0x992d22,
                  interaction.user.id,
                  {
                    title: 'Причина ЧС',
                    text: reason,
                  },
                );
                await msg
                  .edit({ embeds: [resolved], components: [buildProcessedButtonRow('application')] })
                  .catch(() => null);
              }
            }
          }
        }

        if (existing.questionChannelId) {
          const questionChannel = await interaction.guild?.channels
            .fetch(existing.questionChannelId)
            .catch(() => null);
          await questionChannel?.delete().catch((e) => {
            console.error('[chspReason] failed to delete question channel', e);
            return null;
          });
          await updateApplication(guildId, userId, { questionChannelId: undefined });
        }
      }
    } else {
      await saveApplication({
        userId,
        username: user.tag,
        guildId,
        answers: {},
        submittedAt: Date.now(),
        status: 'blacklisted',
        reason,
        reviewerId: interaction.user.id,
        removedRoles: removed,
      });
    }


    await user
      .send({
        embeds: [
          buildDmEmbed(
            '🚫 Вы добавлены в чёрный список',
            `Причина: \`${reason}\`\n\nВы можете подать апелляцию в ${
              gc.channels.appeal ? `<#${gc.channels.appeal}>` : 'соответствующем канале'
            }.`,
            0x992d22,
          ),
        ],
      })
      .catch(() => null);

    await postDecisionMessage(interaction.client, gc.channels.blacklistLog, 'application', {
      label: 'ЧС',
      color: 0x992d22,
      reviewerId: interaction.user.id,
      targetUserId: userId,
      reason: { title: 'Причина ЧС', text: reason },
      number: existing?.number,
      title: 'Выдача ЧСП',
    });

    await applyGlobalBlacklist(interaction.client, userId, reason, interaction.user.id, guildId);

    const baseReply = `Участник <@${userId}> добавлен в ЧС.`;
    await interaction.editReply({
      content: rolesOk
        ? baseReply
        : `${baseReply}\n⚠️ Не удалось снять все роли — проверьте иерархию ролей бота.`,
    });
  },
};

export default handler;
