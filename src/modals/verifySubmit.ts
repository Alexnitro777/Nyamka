import { ModalSubmitInteraction, TextChannel, MessageFlags } from 'discord.js';
import { ModalHandler, GuildConfig } from '../types';
import { verifyQuestions } from '../questions';
import { getApplication, reserveApplication, nextApplicationNumber, getJoinMethod, saveApplication } from '../storage';
import { buildApplicationEmbed, buildReviewButtons, buildDmEmbed, postDecisionMessage } from '../ui';
import { blacklistMemberRoles } from '../roles';

const handler: ModalHandler = {
  customId: 'verify:submit',

  async execute(interaction: ModalSubmitInteraction, gc: GuildConfig): Promise<void> {
    const answers: Record<string, string> = {};
    for (const q of verifyQuestions.slice(0, 5)) {
      try {
        answers[q.id] = interaction.fields.getTextInputValue(q.id);
      } catch {
        answers[q.id] = '';
      }
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const age = (answers.age ?? '').trim();
    const ageNumber = Number(age);
    if (!/^\d+$/.test(age) || ageNumber > 99) {
      await interaction.editReply({
        content: '❌ В поле «Сколько вам лет?» укажите реальный возраст числом. Заполните анкету заново.',
      });
      return;
    }
    answers.age = age;

    const guildId = interaction.guildId!;
    const existing = await getApplication(guildId, interaction.user.id);
    if (existing?.status === 'pending') {
      await interaction.editReply({ content: 'Ваша заявка уже на рассмотрении.' });
      return;
    }

    const submitter = await interaction.guild?.members
      .fetch(interaction.user.id)
      .catch(() => null);
    if (submitter?.roles.cache.has(gc.roles.blacklist)) {
      await interaction.editReply({
        content: 'Вы находитесь в чёрном списке. Используйте канал апелляции.',
      });
      return;
    }

    if (submitter?.roles.cache.has(gc.roles.verified)) {
      await interaction.editReply({ content: 'Вы уже верифицированы.' });
      return;
    }

    if (ageNumber < 13) {
      const reason = 'Автовыдача ЧСП: возраст менее 13 лет';
      let removedRoles: string[] | undefined;
      if (submitter) {
        const { removed } = await blacklistMemberRoles(submitter, gc);
        removedRoles = removed;
      }

      const number = await nextApplicationNumber(guildId);
      const joinMethod = await getJoinMethod(guildId, interaction.user.id);

      await saveApplication({
        userId: interaction.user.id,
        username: interaction.user.tag,
        guildId,
        answers,
        submittedAt: Date.now(),
        status: 'blacklisted',
        reason,
        reviewerId: interaction.client.user?.id ?? interaction.user.id,
        removedRoles,
        number,
        joinMethod,
      });


      await submitter
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

      const logChannel = gc.channels.blacklistLog ?? gc.channels.decisions;
      await postDecisionMessage(interaction.client, logChannel, 'application', {
        label: 'ЧС',
        color: 0x992d22,
        reviewerId: interaction.client.user?.id ?? interaction.user.id,
        targetUserId: interaction.user.id,
        reason: { title: 'Причина ЧС', text: reason },
        number,
        title: 'Автовыдача ЧСП',
      });

      await interaction.editReply({
        content: '🚫 Вы были автоматически внесены в чёрный список, так как указали возраст менее 13 лет.',
      });
      return;
    }

    const joinMethod = await getJoinMethod(guildId, interaction.user.id);

    const channel = await interaction.client.channels.fetch(gc.channels.review).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      console.error('[verifySubmit] review channel unavailable:', gc.channels.review);
      await interaction.editReply({
        content: '❌ Не удалось отправить заявку: канал модерации недоступен. Сообщите администрации.',
      });
      return;
    }

    const number = await nextApplicationNumber(guildId);
    const embed = buildApplicationEmbed(
      interaction.user,
      answers,
      number,
      joinMethod,
      submitter?.joinedTimestamp ?? null,
    );
    const buttons = buildReviewButtons(interaction.user.id);

    const msg = await (channel as TextChannel)
      .send({ embeds: [embed], components: [buttons] })
      .catch((e) => {
        console.error('[verifySubmit] failed to post review message:', e);
        return null;
      });

    if (!msg) {
      await interaction.editReply({
        content: '❌ Не удалось отправить заявку модерации. Попробуйте позже или сообщите администрации.',
      });
      return;
    }

    let reserved = false;
    try {
      reserved = await reserveApplication({
        userId: interaction.user.id,
        username: interaction.user.tag,
        guildId,
        answers,
        submittedAt: Date.now(),
        status: 'pending',
        reviewMessageUrl: msg.url,
        number,
        joinMethod,
      });
    } catch (err) {
      console.error('[verifySubmit] reserveApplication error:', err);
    }

    if (!reserved) {
      await msg.delete().catch(() => null);
      await interaction.editReply({ content: 'Произошла ошибка или ваша заявка уже на рассмотрении.' });
      return;
    }


    await interaction.editReply({
      content: '✅ Анкета отправлена. Ожидайте решения модерации.',
    });
  },
};

export default handler;
