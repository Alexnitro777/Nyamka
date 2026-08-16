import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { SlashCommand, GuildConfig } from '../types';
import { listPendingAppeals } from '../storage';
import { buildPendingListView } from '../ui';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('амнистии')
    .setDescription('Показать все непринятые апелляции')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames) as unknown as SlashCommand['data'],

  access: 'ststaff',

  async execute(interaction: ChatInputCommandInteraction, _gc: GuildConfig): Promise<void> {
    const pending = await listPendingAppeals(interaction.guildId!);

    if (pending.length === 0) {
      await interaction.reply({
        content: 'Непринятых апелляций нет. 🎉',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { embed, row } = buildPendingListView(pending, 0, {
      title: '⚖️ Непринятые апелляции',
      color: 0xeb459e,
      namespace: 'amnesties',
    });

    await interaction.reply({
      embeds: [embed],
      components: row ? [row] : [],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
