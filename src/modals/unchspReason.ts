import { ModalSubmitInteraction, GuildMember, MessageFlags, EmbedBuilder, TextChannel } from 'discord.js';
import { ModalHandler, GuildConfig } from '../types';
import { getApplication, updateApplication, getAppeal, updateAppeal } from '../storage';
import { buildDmEmbed, postDecisionMessage, buildResolvedEmbed, buildProcessedButtonRow } from '../ui';
import { restoreMemberRoles } from '../roles';
import { canManageByHierarchy, canManageRoles } from '../permissions';
import { removeGlobalBlacklist } from '../sync';

const handler: ModalHandler = {
  customId: /^unchsp:reason:\d+$/,

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
        content: 'Укажите причину снятия ЧС.',
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

    const isBlacklistedInGuild = member?.roles.cache.has(gc.roles.blacklist);
    const isBlacklistedInDb = existing?.status === 'blacklisted';

    if (!isBlacklistedInGuild && !isBlacklistedInDb) {
      await interaction.editReply({ content: 'Участник не находится в чёрном списке.' });
      return;
    }

    const moderator = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const toRestore = existing?.removedRoles ?? [];
    if (member) {
      if (!moderator || !canManageByHierarchy(moderator as GuildMember, member) || !canManageRoles(moderator as GuildMember, toRestore)) {
        await interaction.editReply({
          content: 'Нельзя снять с чёрного списка участника, чьи роли выше ваших или равны им.',
        });
        return;
      }
    }

    const warnings: string[] = [];

    if (member) {
      const roleRemoved = await member.roles
        .remove(gc.roles.blacklist)
        .then(() => true)
        .catch((e) => {
          console.error('[unchspReason] roles.remove failed', e);
          return false;
        });
      if (!roleRemoved) {
        warnings.push('⚠️ Не удалось снять роль ЧС — проверьте иерархию ролей бота.');
      }
    }

    if (member && toRestore.length > 0) {
      const restored = await restoreMemberRoles(member, gc, toRestore);
      if (!restored) {
        warnings.push('⚠️ Не удалось вернуть часть ролей — проверьте иерархию ролей бота.');
      }
    }
    if (existing) {
      await updateApplication(guildId, userId, { status: 'amnestied', removedRoles: [] });
    }

    const appeal = await getAppeal(guildId, userId);

    if (appeal && appeal.status === 'pending') {
      await updateAppeal(guildId, userId, {
        status: 'amnestied',
        reviewerId: interaction.user.id,
        reason,
        resolvedAt: Date.now(),
      });

      if (appeal.reviewMessageUrl) {
        const parsed = appeal.reviewMessageUrl.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
        if (parsed) {
          const [, , channelId, messageId] = parsed;
          const reviewChannel = await interaction.client.channels.fetch(channelId).catch(() => null);
          if (reviewChannel?.isTextBased()) {
            const msg = await (reviewChannel as TextChannel).messages.fetch(messageId).catch(() => null);
            if (msg && msg.embeds[0]) {
              const resolved = buildResolvedEmbed(
                EmbedBuilder.from(msg.embeds[0]),
                'Амнистия принята',
                0x57f287,
                interaction.user.id,
              );
              await msg
                .edit({ embeds: [resolved], components: [buildProcessedButtonRow('appeal')] })
                .catch(() => null);
            }
          }
        }
      }

      if (appeal.questionChannelId) {
        const questionChannel = await interaction.guild?.channels
          .fetch(appeal.questionChannelId)
          .catch(() => null);
        await questionChannel?.delete().catch((e) => {
          console.error('[unchspReason] failed to delete question channel', e);
          return null;
        });
        await updateAppeal(guildId, userId, { questionChannelId: undefined });
      }
    }

    await user
      .send({
        embeds: [
          buildDmEmbed(
            '✅ С вас снят чёрный список',
            'Модерация сняла вас с чёрного списка. Вы можете снова пользоваться сервером.',
            0x57f287,
          ),
        ],
      })
      .catch(() => null);

    await postDecisionMessage(interaction.client, gc.channels.blacklistLog, 'application', {
      label: 'Снят с ЧС',
      color: 0x57f287,
      reviewerId: interaction.user.id,
      targetUserId: userId,
      reason: { title: 'Причина снятия ЧС', text: reason },
      number: existing?.number,
      title: 'Снятие ЧСП',
    });

    await removeGlobalBlacklist(interaction.client, userId, guildId);

    const baseReply = `Участник <@${userId}> снят с ЧС.`;
    await interaction.editReply({
      content: warnings.length ? `${baseReply}\n${warnings.join('\n')}` : baseReply,
    });
  },
};

export default handler;
