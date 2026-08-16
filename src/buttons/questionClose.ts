import { ButtonInteraction, MessageFlags } from 'discord.js';
import { ButtonHandler, GuildConfig } from '../types';
import { hasButtonAccess } from '../permissions';
import { restoreReviewButton } from '../questionRestore';

const handler: ButtonHandler = {
  customId: /^question:close:\d+$/,

  async execute(interaction: ButtonInteraction, gc: GuildConfig): Promise<void> {
    if (!hasButtonAccess(interaction, gc, 'staff')) {
      await interaction.reply({ content: 'Недостаточно прав.', flags: MessageFlags.Ephemeral });
      return;
    }

    const [, , channelId] = interaction.customId.split(':');
    await interaction.reply({ content: 'Удаляю канал...', flags: MessageFlags.Ephemeral });

    const channel = await interaction.guild?.channels.fetch(channelId).catch(() => null);
    const deleted = channel
      ? await channel
          .delete()
          .then(() => true)
          .catch((e) => {
            console.error('[questionClose] failed to delete channel', e);
            return false;
          })
      : true;

    if (deleted) {
      await restoreReviewButton(interaction.client, channelId);
    } else {
      await interaction
        .editReply({ content: '❌ Не удалось удалить канал — проверьте права бота.' })
        .catch(() => null);
    }
  },
};

export default handler;
