import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GuildMember,
  MessageFlags,
} from 'discord.js';
import { ButtonHandler, GuildConfig } from '../types';
import { appealQuestions } from '../questions';
import { getAppeal, getPendingAppeals } from '../storage';
import { db } from '../db';
import * as schema from '../schema';
import { eq, and, desc } from 'drizzle-orm';

const DENY_COOLDOWN_MS = 48 * 60 * 60 * 1000;

const handler: ButtonHandler = {
  customId: 'appeal:start',

  async execute(interaction: ButtonInteraction, gc: GuildConfig): Promise<void> {
    const member = interaction.member as GuildMember | null;
    if (!member) {
      await interaction.reply({
        content: 'Апелляция доступна только участникам в чёрном списке.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    let availableBlacklists: { type: string; label: string; style: ButtonStyle }[] = [];

    if (member.roles.cache.has(gc.roles.blacklist)) {
      availableBlacklists.push({ type: 'ЧСП', label: 'ЧСП', style: ButtonStyle.Danger });
    } else {
      if (gc.roles.blacklistZ && member.roles.cache.has(gc.roles.blacklistZ)) {
        availableBlacklists.push({ type: 'ЧСЗ', label: 'ЧСЗ', style: ButtonStyle.Primary });
      }
      if (gc.roles.blacklistA && member.roles.cache.has(gc.roles.blacklistA)) {
        availableBlacklists.push({ type: 'ЧСА', label: 'ЧСА', style: ButtonStyle.Danger });
      }
    }

    if (availableBlacklists.length === 0) {
      await interaction.reply({
        content: 'Апелляция доступна только участникам в чёрном списке.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const userAppeals = await db.select().from(schema.appeals).where(and(eq(schema.appeals.guildId, interaction.guildId!), eq(schema.appeals.userId, interaction.user.id))).orderBy(desc(schema.appeals.submittedAt));
    const pendingAppeals = userAppeals.filter(a => a.status === 'pending');

    // Filter availableBlacklists by pending and cooldown
    const validBlacklists = [];
    let lastError = 'Ваша апелляция уже на рассмотрении.';

    for (const bl of availableBlacklists) {
      if (pendingAppeals.some(a => a.blacklistType === bl.type || (!a.blacklistType && bl.type === 'ЧСП'))) {
        lastError = 'Ваша апелляция уже на рассмотрении.';
        continue;
      }
      
      const existingAppealForType = userAppeals.find(a => a.blacklistType === bl.type || (!a.blacklistType && bl.type === 'ЧСП'));
      if (
        existingAppealForType?.status === 'denied' &&
        existingAppealForType.resolvedAt &&
        Date.now() < existingAppealForType.resolvedAt + DENY_COOLDOWN_MS
      ) {
        const ts = Math.floor((existingAppealForType.resolvedAt + DENY_COOLDOWN_MS) / 1000);
        lastError = `⛔ Вашу прошлую апелляцию отклонили. Новую можно подать <t:${ts}:R> (<t:${ts}:f>).`;
        continue;
      }
      
      validBlacklists.push(bl);
    }

    if (validBlacklists.length === 0) {
      await interaction.reply({ content: lastError, flags: MessageFlags.Ephemeral });
      return;
    }

    if (validBlacklists.length > 1) {
      // User has multiple blacklist roles, let them choose
      const row = new ActionRowBuilder<ButtonBuilder>();
      for (const bl of validBlacklists) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`appeal:select_type:${bl.type}`)
            .setLabel(bl.label)
            .setStyle(bl.style)
        );
      }
      await interaction.reply({
        content: 'Пожалуйста, выберите тип блокировки, которую вы хотите обжаловать:',
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // User has exactly 1 valid blacklist role
    const selectedType = validBlacklists[0].type;
    const modal = new ModalBuilder().setCustomId(`appeal:submit:${selectedType}`).setTitle(`Апелляция: ${selectedType}`);
    const rows = appealQuestions.slice(0, 5).map((q) => {
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
