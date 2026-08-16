import {
	ButtonInteraction,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	PermissionFlagsBits,
	MessageFlags,
	TextChannel,
} from 'discord.js';
import { ButtonHandler, GuildConfig } from '../types';
import {
	getAppeal,
	claimAppeal,
	updateAppeal,
	claimAppealQuestionChannel,
	getApplication,
	updateApplication,
	getPendingAppeals,
} from '../storage';
import {
	buildResolvedEmbed,
	buildDmEmbed,
	postDecisionMessage,
	buildProcessedButtonRow,
	buildAppealReviewButtons,
} from '../ui';
import { hasButtonAccess, getGuild } from '../permissions';
import { restoreMemberRoles } from '../roles';
import { removeGlobalBlacklist } from '../sync';

const DENY_COOLDOWN_MS = 48 * 60 * 60 * 1000;

const handler: ButtonHandler = {
	customId: /^appeal:(amnesty|confirm_amnesty|deny|confirm_deny|cancel|question):\d+(?:_[a-zA-Zа-яА-Я0-9]+)?$/,

	async execute(interaction: ButtonInteraction, gc: GuildConfig): Promise<void> {
		if (!hasButtonAccess(interaction, gc, 'ststaff')) {
			await interaction.reply({ content: 'Недостаточно прав.', flags: MessageFlags.Ephemeral });
			return;
		}

		const [, action, idAndType] = interaction.customId.split(':');
		const [userId, blacklistType] = idAndType.split('_');
		if (action === 'cancel') {
			await interaction.update({
				content: '❌ Действие отменено.',
				components: [],
			});
			return;
		}

		const guildId = interaction.guildId!;

		const appealsRows = await getPendingAppeals(guildId, userId);
		const appeal = appealsRows.find(a => blacklistType ? a.blacklistType === blacklistType : true) || (await getAppeal(guildId, userId));
		if (!appeal) {
			await interaction.reply({ content: 'Апелляция не найдена.', flags: MessageFlags.Ephemeral });
			return;
		}

		if (appeal.status !== 'pending') {
			await interaction.reply({
				content: `Апелляция уже обработана (${appeal.status}).`,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (action === 'amnesty') {
			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId(`appeal:confirm_amnesty:${idAndType}`)
					.setLabel('Подтвердить')
					.setStyle(ButtonStyle.Success)
					.setEmoji('✅'),
				new ButtonBuilder()
					.setCustomId(`appeal:cancel:${idAndType}`)
					.setLabel('Отмена')
					.setStyle(ButtonStyle.Secondary)
					.setEmoji('❌'),
			);
			await interaction.reply({
				content: `❓ Вы действительно хотите **принять амнистию** пользователя <@${userId}>?`,
				components: [row],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (action === 'deny') {
			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId(`appeal:confirm_deny:${idAndType}`)
					.setLabel('Подтвердить')
					.setStyle(ButtonStyle.Danger)
					.setEmoji('⛔'),
				new ButtonBuilder()
					.setCustomId(`appeal:cancel:${idAndType}`)
					.setLabel('Отмена')
					.setStyle(ButtonStyle.Secondary)
					.setEmoji('❌'),
			);
			await interaction.reply({
				content: `❓ Вы действительно хотите **отклонить амнистию** пользователя <@${userId}>?`,
				components: [row],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (action === 'question') {
			const guild = getGuild(interaction);
			if (!guild) {
				await interaction.reply({
					content: 'Действие доступно только на сервере.',
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			await interaction.deferUpdate();

			if (appeal.questionChannelId) {
				const existing = await guild.channels.fetch(appeal.questionChannelId).catch(() => null);
				if (existing) {
					await interaction.followUp({
						content: `Канал с вопросом уже существует: <#${existing.id}>.`,
						flags: MessageFlags.Ephemeral,
					});
					return;
				}
			}

			const member = await guild.members.fetch(userId).catch(() => null);
			if (!member) {
				await interaction.followUp({
					content: 'Пользователь покинул сервер.',
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			const channel = await guild.channels.create({
				name: `вопрос-${member.user.username}`.slice(0, 90),
				type: ChannelType.GuildText,
				parent: gc.questionCategoryId,
				permissionOverwrites: [
					{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
					{
						id: userId,
						allow: [
							PermissionFlagsBits.ViewChannel,
							PermissionFlagsBits.SendMessages,
							PermissionFlagsBits.ReadMessageHistory,
						],
					},
					...gc.roles.ststaff.map((roleId) => ({
						id: roleId,
						allow: [
							PermissionFlagsBits.ViewChannel,
							PermissionFlagsBits.SendMessages,
							PermissionFlagsBits.ReadMessageHistory,
						],
					})),
				],
			});

			const claimed = await claimAppealQuestionChannel(guildId, userId, channel.id, appeal.questionChannelId ?? null);
			if (!claimed) {
				await channel.delete('Дублирующий канал-вопрос').catch(() => null);
				const fresh = await getAppeal(guildId, userId);
				await interaction.followUp({
					content: fresh?.questionChannelId
						? `Канал с вопросом уже существует: <#${fresh.questionChannelId}>.`
						: 'Канал с вопросом уже создаётся.',
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			const embed = new EmbedBuilder()
				.setTitle('Уточнение по апелляции')
				.setDescription(
					`<@${userId}>, у модерации появился вопрос по вашей апелляции.\n` +
						'Ответьте здесь. Кнопки ниже — для модерации.',
				)
				.setColor(0x5865f2);

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setLabel('Перейти к апелляции')
					.setStyle(ButtonStyle.Link)
					.setURL(appeal.reviewMessageUrl ?? interaction.message.url),
				new ButtonBuilder()
					.setCustomId(`question:close:${channel.id}`)
					.setLabel('Закрыть вопрос')
					.setStyle(ButtonStyle.Danger)
					.setEmoji('🗑️'),
			);

			const mentionUserIds = [...new Set([userId, interaction.user.id])];
			const pingMsg = await channel.send({
				content: mentionUserIds.map((id) => `<@${id}>`).join(' '),
				allowedMentions: { users: mentionUserIds },
			});
			await channel.send({ embeds: [embed], components: [row] });
			await pingMsg.delete().catch(() => null);

			await interaction.editReply({
				components: [buildAppealReviewButtons(userId, channel.url, blacklistType)],
			});
			return;
		}

		await interaction.deferUpdate();

		const realAction = action === 'confirm_amnesty' ? 'amnesty' : 'deny';
		const newStatus = realAction === 'amnesty' ? 'amnestied' : 'denied';
		const claimed = await claimAppeal(guildId, userId, newStatus, interaction.user.id, undefined, Date.now(), blacklistType);
		if (!claimed) {
			const fresh = await getAppeal(guildId, userId);
			await interaction.editReply({
				content: `Апелляция уже обработана (${fresh?.status ?? 'не найдена'}).`,
				components: [],
			});
			return;
		}

		const reviewUrl = appeal.reviewMessageUrl ?? (interaction.message.flags.has(MessageFlags.Ephemeral) ? undefined : interaction.message.url);

		const guild = getGuild(interaction);
		const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;

		let warning: string | undefined;
		if (realAction === 'amnesty') {
			let roleToRemove: string | undefined = undefined;
			if (appeal.blacklistType === 'ЧСП') roleToRemove = gc.roles.blacklist;
			else if (appeal.blacklistType === 'ЧСЗ') roleToRemove = gc.roles.blacklistZ;
			else if (appeal.blacklistType === 'ЧСА') roleToRemove = gc.roles.blacklistA;

			let removed = false;
			if (roleToRemove && member) {
				removed = await member.roles
					.remove(roleToRemove)
					.then(() => true)
					.catch((e) => {
						console.error('[appealReview] roles.remove failed', e);
						return false;
					});
			} else {
				// fallback if not mapped
				removed = await member?.roles.remove(gc.roles.blacklist).then(() => true).catch(() => false) ?? false;
			}

			if (member && !removed) {
				warning = `⚠️ Не удалось снять роль ЧС (${appeal.blacklistType ?? 'ЧСП'}) — проверьте иерархию ролей бота.`;
			}
			const application = await getApplication(guildId, userId);
			if (member && application?.removedRoles?.length) {
				const restored = await restoreMemberRoles(member, gc, application.removedRoles);
				if (!restored) {
					warning = warning
						? `${warning}\n⚠️ Не удалось вернуть часть ролей.`
						: '⚠️ Не удалось вернуть часть ролей — проверьте иерархию ролей бота.';
				}
			}
			if (application) {
				await updateApplication(guildId, userId, { status: 'amnestied', removedRoles: [] });
			}
			if (appeal.blacklistType === 'ЧСП') {
				await removeGlobalBlacklist(interaction.client, userId, guildId);
			}
			let dmTextAccept = 'С вас снят чёрный список.';
			let dmTextDenyPrefix = 'Ваша апелляция отклонена.';

			if (appeal.blacklistType === 'ЧСП') {
				dmTextAccept = 'С вас снят черный список проекта.';
				dmTextDenyPrefix = 'Ваша апелляция на снятие черного списка проекта отклонена.';
			} else if (appeal.blacklistType === 'ЧСЗ') {
				dmTextAccept = 'С вас снят черный список знакомств.';
				dmTextDenyPrefix = 'Ваша апелляция на снятие черного списка знакомств отклонена.';
			} else if (appeal.blacklistType === 'ЧСА') {
				dmTextAccept = 'С вас снят черный список администрации.';
				dmTextDenyPrefix = 'Ваша апелляция на снятие черного списка администрации отклонена.';
			}

			await member
				?.send({
					embeds: [
						buildDmEmbed(
							'✅ Амнистия принята',
							dmTextAccept,
							0x57f287,
						),
					],
				})
				.catch(() => null);
		} else {
			let dmTextDenyPrefix = 'Ваша апелляция отклонена.';
			if (appeal.blacklistType === 'ЧСП') {
				dmTextDenyPrefix = 'Ваша апелляция на снятие черного списка проекта отклонена.';
			} else if (appeal.blacklistType === 'ЧСЗ') {
				dmTextDenyPrefix = 'Ваша апелляция на снятие черного списка знакомств отклонена.';
			} else if (appeal.blacklistType === 'ЧСА') {
				dmTextDenyPrefix = 'Ваша апелляция на снятие черного списка администрации отклонена.';
			}

			const ts = Math.floor((Date.now() + DENY_COOLDOWN_MS) / 1000);
			await member
				?.send({
					embeds: [
						buildDmEmbed(
							'❌ В амнистии отказано',
							`${dmTextDenyPrefix} ЧС сохраняется.\n\nВы сможете подать новую апелляцию <t:${ts}:R> (<t:${ts}:f>).`,
							0xed4245,
						),
					],
				})
				.catch(() => null);
		}

		if (reviewUrl) {
			const parsed = reviewUrl.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
			if (parsed) {
				const [, , channelId, messageId] = parsed;
				const reviewChannel = await interaction.client.channels.fetch(channelId).catch(() => null);
				if (reviewChannel?.isTextBased()) {
					const msg = await (reviewChannel as TextChannel).messages.fetch(messageId).catch(() => null);
					if (msg && msg.embeds[0]) {
						const resolved = buildResolvedEmbed(
							EmbedBuilder.from(msg.embeds[0]),
							realAction === 'amnesty' ? 'Амнистия принята' : 'В амнистии отказано',
							realAction === 'amnesty' ? 0x57f287 : 0xed4245,
							interaction.user.id,
						);
						await msg.edit({
							embeds: [resolved],
							components: [buildProcessedButtonRow('appeal')],
						});
					}
				}
			}
		}

		await postDecisionMessage(interaction.client, gc.channels.decisions, 'appeal', {
			label: realAction === 'amnesty' ? 'Амнистия принята' : 'В амнистии отказано',
			color: realAction === 'amnesty' ? 0x57f287 : 0xed4245,
			reviewerId: interaction.user.id,
			targetUserId: userId,
			reviewMessageUrl: reviewUrl,
			number: appeal.number,
		});

		if (appeal.questionChannelId && guild) {
			const questionChannel = await guild.channels.fetch(appeal.questionChannelId).catch(() => null);
			await questionChannel?.delete().catch((e) => {
				console.error('[appealReview] failed to delete question channel', e);
				return null;
			});
			await updateAppeal(guildId, userId, { questionChannelId: undefined }, blacklistType);
		}

		let statusText = realAction === 'amnesty'
			? `✅ Амнистия пользователя <@${userId}> принята.`
			: `❌ Амнистия пользователя <@${userId}> отклонена.`;
		if (warning) {
			statusText = `${statusText}\n${warning}`;
		}

		await interaction.editReply({
			content: statusText,
			components: [],
		});
	},
};

export default handler;
