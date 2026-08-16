import { ButtonInteraction, MessageFlags } from 'discord.js';
import { ButtonHandler, GuildConfig } from '../types';
import { hasButtonAccess } from '../permissions';
import { listPendingAppeals } from '../storage';
import { buildPendingListView } from '../ui';

const handler: ButtonHandler = {
  customId: /^amnesties:page:\d+$/,

  async execute(interaction: ButtonInteraction, gc: GuildConfig): Promise<void> {
    if (!hasButtonAccess(interaction, gc, 'ststaff')) {
      await interaction.reply({ content: 'Недостаточно прав.', flags: MessageFlags.Ephemeral });
      return;
    }

    const [, , pageRaw] = interaction.customId.split(':');
    const pending = await listPendingAppeals(interaction.guildId!);

    if (pending.length === 0) {
      await interaction.update({
        content: 'Непринятых апелляций нет. 🎉',
        embeds: [],
        components: [],
      });
      return;
    }

    const { embed, row } = buildPendingListView(pending, Number(pageRaw), {
      title: '⚖️ Непринятые апелляции',
      color: 0xeb459e,
      namespace: 'amnesties',
    });

    await interaction.update({ embeds: [embed], components: row ? [row] : [] });
  },
};

export default handler;
