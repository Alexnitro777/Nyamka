import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { SlashCommand, GuildConfig } from '../types';
import { listPendingApplications } from '../storage';
import { buildPendingListView } from '../ui';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('анкеты')
    .setDescription('Показать все непринятые анкеты на верификацию')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames) as unknown as SlashCommand['data'],

  access: 'staff',

  async execute(interaction: ChatInputCommandInteraction, _gc: GuildConfig): Promise<void> {
    const pending = await listPendingApplications(interaction.guildId!);

    if (pending.length === 0) {
      await interaction.reply({
        content: 'Непринятых анкет нет. 🎉',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { embed, row } = buildPendingListView(pending, 0, {
      title: '📝 Непринятые анкеты',
      color: 0xfee75c,
      namespace: 'forms',
    });

    await interaction.reply({
      embeds: [embed],
      components: row ? [row] : [],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
