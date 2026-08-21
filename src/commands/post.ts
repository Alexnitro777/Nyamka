import {
  ChannelType,
  SlashCommandBuilder,
  TextBasedChannel,
  MessageFlags,
} from 'discord.js';
import { SlashCommand } from '../types';
import { embedsMap } from '../embeds/registry';

const command: SlashCommand = {
  access: 'owner',
  data: new SlashCommandBuilder()
    .setName('запостить')
    .setDescription('Опубликовать готовый embed по имени')
    .addStringOption((opt) =>
      opt
        .setName('название')
        .setDescription('Какой embed отправить')
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addChannelOption((opt) =>
      opt
        .setName('канал')
        .setDescription('Канал назначения (по умолчанию — текущий)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    ) as unknown as SlashCommand['data'],
  execute: async (interaction) => {
    const name = interaction.options.getString('название', true);
    const def = embedsMap.get(name);

    if (!def) {
      await interaction.reply({
        content: `❌ Embed «${name}» не найден.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const target = (interaction.options.getChannel('канал') ?? interaction.channel) as
      | TextBasedChannel
      | null;

    if (!target || !target.isTextBased() || !('send' in target)) {
      await interaction.reply({
        content: '❌ Не получилось отправить: выбери текстовый канал.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const { embeds: embedList, components } = def.build();
      await target.send({ embeds: embedList, components: components ?? [] });
      await interaction.reply({
        content: `✅ Embed «${name}» отправлен в <#${target.id}>.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      console.error('Ошибка при отправке embed-а:', err);
      await interaction.reply({
        content: `❌ Ошибка при отправке: ${err instanceof Error ? err.message : String(err)}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export default command;
