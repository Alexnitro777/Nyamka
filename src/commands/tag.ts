import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  Collection,
  Guild,
  GuildMember,
} from 'discord.js';
import { SlashCommand, GuildConfig } from '../types';
import { hasServerTag, getPrimaryGuild } from '../roleTag';

const MEMBERS_TTL_MS = 5 * 60 * 1000;
const lastFullFetch = new Map<string, number>();

async function getGuildMembers(
  guild: Guild,
): Promise<Collection<string, GuildMember>> {
  const last = lastFullFetch.get(guild.id) ?? 0;
  const fresh = Date.now() - last < MEMBERS_TTL_MS;

  if (fresh && guild.members.cache.size > 1) {
    return guild.members.cache;
  }

  try {
    const members = await guild.members.fetch();
    lastFullFetch.set(guild.id, Date.now());
    return members;
  } catch (err) {
    if (guild.members.cache.size > 0) {
      console.warn(
        '[tag] members.fetch ограничен по частоте, используем кэш:',
        (err as Error).message,
      );
      return guild.members.cache;
    }
    throw err;
  }
}

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('тег')
    .setDescription('Статистика по тегу сервера: сколько участников его носят')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames) as unknown as SlashCommand['data'],

  access: 'staff',

  async execute(interaction: ChatInputCommandInteraction, _gc: GuildConfig): Promise<void> {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        content: 'Команду нужно запускать на сервере.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    const guild = interaction.guild;
    const members = await getGuildMembers(guild);

    let withTag = 0;
    let humans = 0;
    let tagText: string | null = null;

    for (const member of members.values()) {
      if (member.user.bot) continue;
      humans += 1;
      if (hasServerTag(member.user, guild.id)) {
        withTag += 1;
        if (!tagText) {
          tagText = getPrimaryGuild(member.user)?.tag ?? null;
        }
      }
    }

    const percent = humans > 0 ? ((withTag / humans) * 100).toFixed(1) : '0.0';

    const embed = new EmbedBuilder()
      .setTitle('🏷️ Тег сервера')
      .setColor(0x9b59b6)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .setDescription(
        tagText
          ? `Текущий тег сервера: \`${tagText}\`.`
          : 'Показывает, сколько участников носят тег этого сервера.',
      )
      .addFields(
        { name: '🎗️ Носят тег сервера', value: `**${withTag}**`, inline: true },
        { name: '👥 Всего участников', value: `**${humans}**`, inline: true },
        { name: '📊 Доля', value: `**${percent}%**`, inline: true },
      )
      .setFooter({ text: 'Боты в подсчёте не учитываются' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
