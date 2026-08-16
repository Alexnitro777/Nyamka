import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  ActionRowBuilder,
  GuildMember,
  MessageFlags,
} from 'discord.js';
import { ButtonHandler, GuildConfig } from '../types';
import { verifyQuestions } from '../questions';
import { getApplication, isUserGloballyVerified } from '../storage';
import { postDecisionMessage } from '../ui';

const handler: ButtonHandler = {
  customId: 'verify:start',

  async execute(interaction: ButtonInteraction, gc: GuildConfig): Promise<void> {
    const member = interaction.member as GuildMember | null;
    if (member && member.roles.cache.has(gc.roles.blacklist)) {
      await interaction.reply({
        content: 'Вы находитесь в чёрном списке. Используйте канал апелляции.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const existing = await getApplication(interaction.guildId!, interaction.user.id);
    if (existing?.status === 'pending') {
      await interaction.reply({ content: 'Ваша заявка уже на рассмотрении.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (member?.roles.cache.has(gc.roles.verified)) {
      await interaction.reply({ content: 'Вы уже верифицированы.', flags: MessageFlags.Ephemeral });
      return;
    }

    const isVerified = await isUserGloballyVerified(interaction.user.id);
    if (isVerified && member) {
      await member.roles.add(gc.roles.verified).catch(() => null);
      await postDecisionMessage(interaction.client, gc.channels.decisions, 'application', {
        label: 'Авто-Верификация',
        color: 0x57f287,
        reviewerId: interaction.client.user!.id,
        targetUserId: interaction.user.id,
        reason: { title: 'Причина', text: 'Уже верифицирован на другом сервере проекта' },
        title: 'Автоматическая верификация',
      });
      await interaction.reply({ content: 'Вы были автоматически верифицированы, так как уже прошли проверку на другом сервере проекта.', flags: MessageFlags.Ephemeral });
      return;
    }

    const modal = new ModalBuilder().setCustomId('verify:submit').setTitle('Анкета верификации');

    const rows = verifyQuestions.slice(0, 5).map((q) => {
      const input = new TextInputBuilder()
        .setCustomId(q.id)
        .setLabel(q.label)
        .setStyle(q.style)
        .setRequired(q.required);
      if (q.minLength) input.setMinLength(q.minLength);
      if (q.maxLength) input.setMaxLength(q.maxLength);
      if (q.placeholder) input.setPlaceholder(q.placeholder);
      return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
    });

    modal.addComponents(...rows);
    await interaction.showModal(modal);
  },
};

export default handler;
