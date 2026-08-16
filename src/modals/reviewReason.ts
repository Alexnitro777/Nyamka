import { ModalSubmitInteraction, EmbedBuilder, TextChannel, MessageFlags } from 'discord.js';
import { ModalHandler, GuildConfig } from '../types';
import { getApplication, claimApplication, updateApplication } from '../storage';
import { buildResolvedEmbed, buildDmEmbed, postDecisionMessage, buildProcessedButtonRow } from '../ui';
import { blacklistMemberRoles } from '../roles';

const handler: ModalHandler = {
  customId: /^review:reason:(reject|blacklist):\d+$/,

  async execute(interaction: ModalSubmitInteraction, gc: GuildConfig): Promise<void> {
    const [, , action, userId] = interaction.customId.split(':');
    const reason = interaction.fields.getTextInputValue('reason').trim();
    const guildId = interaction.guildId!;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const app = await getApplication(guildId, userId);
    if (!app) {
      await interaction.editReply({ content: 'Заявка не найдена.' });
      return;
    }

    const newStatus = action === 'blacklist' ? 'blacklisted' : 'rejected';
    const claimed = await claimApplication(guildId, userId, newStatus, interaction.user.id, reason);
    if (!claimed) {
      const fresh = await getApplication(guildId, userId);
      await interaction.editReply({
        content: `Заявка уже обработана (${fresh?.status ?? 'не найдена'}).`,
      });
      return;
    }


    const guild = interaction.guild;
    const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;

    let blacklistWarning: string | undefined;
    if (action === 'blacklist') {
      if (member) {
        const { ok, removed } = await blacklistMemberRoles(member, gc);
        if (!ok) {
          blacklistWarning = '⚠️ Не удалось обновить роли (ЧС) — проверьте иерархию ролей бота.';
        }
        await updateApplication(guildId, userId, { removedRoles: removed });
      }
      await member
        ?.send({
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
    } else {
      await member
        ?.send({
          embeds: [
            buildDmEmbed(
              '❌ Заявка отклонена',
              `Причина: \`${reason}\`\n\nВы можете подать новую заявку.`,
              0xed4245,
            ),
          ],
        })
        .catch(() => null);
    }

    if (app.reviewMessageUrl) {
      const parsed = app.reviewMessageUrl.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
      if (parsed) {
        const [, , channelId, messageId] = parsed;
        const reviewChannel = await interaction.client.channels.fetch(channelId).catch(() => null);
        if (reviewChannel?.isTextBased()) {
          const msg = await (reviewChannel as TextChannel).messages.fetch(messageId).catch(() => null);
          if (msg && msg.embeds[0]) {
            const resolved = buildResolvedEmbed(
              EmbedBuilder.from(msg.embeds[0]),
              action === 'blacklist' ? 'ЧС' : 'Отклонено',
              action === 'blacklist' ? 0x992d22 : 0xed4245,
              interaction.user.id,
              {
                title: action === 'blacklist' ? 'Причина ЧС' : 'Причина отклонения',
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

    await postDecisionMessage(interaction.client, gc.channels.decisions, 'application', {
      label: action === 'blacklist' ? 'ЧС' : 'Отклонено',
      color: action === 'blacklist' ? 0x992d22 : 0xed4245,
      reviewerId: interaction.user.id,
      targetUserId: userId,
      reviewMessageUrl: app.reviewMessageUrl,
      reason: {
        title: action === 'blacklist' ? 'Причина ЧС' : 'Причина отклонения',
        text: reason,
      },
      number: app.number,
    });

    if (app.questionChannelId) {
      const questionChannel = await interaction.guild?.channels
        .fetch(app.questionChannelId)
        .catch(() => null);
      await questionChannel?.delete().catch((e) => {
        console.error('[reviewReason] failed to delete question channel', e);
        return null;
      });
      await updateApplication(guildId, userId, { questionChannelId: undefined });
    }

    const baseReply = action === 'blacklist' ? 'Участник добавлен в ЧС.' : 'Заявка отклонена.';
    await interaction.editReply({
      content: blacklistWarning ? `${baseReply}\n${blacklistWarning}` : baseReply,
    });
  },
};

export default handler;
