import { ButtonInteraction, MessageFlags } from 'discord.js';
import { ButtonHandler, GuildConfig } from '../types';
import { hasButtonAccess } from '../permissions';
import { listPendingApplications } from '../storage';
import { buildPendingListView } from '../ui';

const handler: ButtonHandler = {
  customId: /^forms:page:\d+$/,

  async execute(interaction: ButtonInteraction, gc: GuildConfig): Promise<void> {
    if (!hasButtonAccess(interaction, gc, 'staff')) {
      await interaction.reply({ content: 'Недостаточно прав.', flags: MessageFlags.Ephemeral });
      return;
    }

    const [, , pageRaw] = interaction.customId.split(':');
    const pending = await listPendingApplications(interaction.guildId!);

    if (pending.length === 0) {
      await interaction.update({ content: 'Непринятых анкет нет. 🎉', embeds: [], components: [] });
      return;
    }

    const { embed, row } = buildPendingListView(pending, Number(pageRaw), {
      title: '📝 Непринятые анкеты',
      color: 0xfee75c,
      namespace: 'forms',
    });

    await interaction.update({ embeds: [embed], components: row ? [row] : [] });
  },
};

export default handler;
