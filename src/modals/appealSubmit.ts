import { ModalSubmitInteraction, TextChannel, MessageFlags } from 'discord.js';
import { ModalHandler, GuildConfig } from '../types';
import { appealQuestions } from '../questions';
import { getApplication, getAppeal, getPendingAppeals, reserveAppeal, nextAppealNumber } from '../storage';
import { db } from '../db';
import * as schema from '../schema';
import { eq, and, desc } from 'drizzle-orm';
import { buildAppealEmbed, buildAppealReviewButtons } from '../ui';

const DENY_COOLDOWN_MS = 48 * 60 * 60 * 1000;

const handler: ModalHandler = {
	customId: /^appeal:submit:(.+)$/,

	async execute(interaction: ModalSubmitInteraction, gc: GuildConfig): Promise<void> {
		const [, type] = interaction.customId.split('submit:');
		const text = appealQuestions
			.slice(0, 5)
			.map((q) => {
				try {
					return interaction.fields.getTextInputValue(q.id);
				} catch {
					return '';
				}
			})
			.map((value) => value.trim())
			.filter((value) => value.length > 0)
			.join('\n\n');

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const guildId = interaction.guildId!;
		const member = await interaction.guild?.members
			.fetch(interaction.user.id)
			.catch(() => null);
		if (!member) {
			await interaction.editReply({
				content: 'Апелляция доступна только участникам в чёрном списке.',
			});
			return;
		}

		// We already checked roles in appeal:start, but let's just make sure they still have SOME blacklist role.
		const hasBlacklist = member.roles.cache.has(gc.roles.blacklist);
		const hasBlacklistZ = gc.roles.blacklistZ ? member.roles.cache.has(gc.roles.blacklistZ) : false;
		const hasBlacklistA = gc.roles.blacklistA ? member.roles.cache.has(gc.roles.blacklistA) : false;
		
		if (!hasBlacklist && !hasBlacklistZ && !hasBlacklistA) {
			await interaction.editReply({
				content: 'Апелляция доступна только участникам в чёрном списке.',
			});
			return;
		}

		const userAppeals = await db.select().from(schema.appeals).where(and(eq(schema.appeals.guildId, guildId), eq(schema.appeals.userId, interaction.user.id))).orderBy(desc(schema.appeals.submittedAt));
		const pendingAppeals = userAppeals.filter(a => a.status === 'pending');
		
		if (pendingAppeals.some(a => a.blacklistType === type || (!a.blacklistType && type === 'ЧСП'))) {
			await interaction.editReply({ content: 'Ваша апелляция на этот тип блокировки уже на рассмотрении.' });
			return;
		}

		const existingAppealForType = userAppeals.find(a => a.blacklistType === type || (!a.blacklistType && type === 'ЧСП'));
		// Check cooldown only if the latest appeal for this type is denied
		if (
			existingAppealForType?.status === 'denied' &&
			existingAppealForType.resolvedAt &&
			Date.now() < existingAppealForType.resolvedAt + DENY_COOLDOWN_MS
		) {
			const ts = Math.floor((existingAppealForType.resolvedAt + DENY_COOLDOWN_MS) / 1000);
			await interaction.editReply({
				content: `⛔ Вашу прошлую апелляцию отклонили. Новую можно подать <t:${ts}:R> (<t:${ts}:f>).`,
			});
			return;
		}

		const application = await getApplication(guildId, interaction.user.id);
		const blacklistReason =
			application?.status === 'blacklisted' ? application.reason : undefined;

		const channel = await interaction.client.channels
			.fetch(gc.channels.appealReview)
			.catch(() => null);
		if (!channel || !channel.isTextBased()) {
			console.error('[appealSubmit] appeal review channel unavailable:', gc.channels.appealReview);
			await interaction.editReply({
				content: '❌ Не удалось отправить апелляцию: канал модерации недоступен. Сообщите администрации.',
			});
			return;
		}

		const number = await nextAppealNumber(guildId);
		
		let pingText = type;
		if (type === 'ЧСП') pingText = `<@&${gc.roles.blacklist}>`;
		else if (type === 'ЧСЗ' && gc.roles.blacklistZ) pingText = `<@&${gc.roles.blacklistZ}>`;
		else if (type === 'ЧСА' && gc.roles.blacklistA) pingText = `<@&${gc.roles.blacklistA}>`;

		// Pass the blacklist type directly to the embed builder
		const embed = buildAppealEmbed(interaction.user, text, blacklistReason, number, pingText);

		const row = buildAppealReviewButtons(interaction.user.id, undefined, type);

		const msg = await (channel as TextChannel)
			.send({ embeds: [embed], components: [row] })
			.catch((e) => {
				console.error('[appealSubmit] failed to post appeal message:', e);
				return null;
			});

		if (!msg) {
			await interaction.editReply({
				content: '❌ Не удалось отправить апелляцию модерации. Попробуйте позже или сообщите администрации.',
			});
			return;
		}

		let reserved = false;
		try {
			reserved = await reserveAppeal({
				userId: interaction.user.id,
				guildId,
				username: interaction.user.tag,
				text,
				submittedAt: Date.now(),
				status: 'pending',
				reviewMessageUrl: msg.url,
				blacklistReason,
				blacklistType: type,
				number,
			});
		} catch (err) {
			console.error('[appealSubmit] reserveAppeal error:', err);
		}

		if (!reserved) {
			await msg.delete().catch(() => null);
			await interaction.editReply({ content: 'Произошла ошибка или ваша апелляция уже на рассмотрении.' });
			return;
		}


		await interaction.editReply({
			content: '✅ Апелляция отправлена. Ожидайте решения модерации.',
		});
	},
};

export default handler;
