import {
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	User,
	GuildMember,
	Client,
	TextChannel,
} from 'discord.js';
import { Application } from './types';
import { verifyQuestions } from './questions';

export function buildApplicationEmbed(
	user: User,
	answers: Record<string, string>,
	number?: number,
	joinMethod?: string,
	joinedTimestamp?: number | null,
): EmbedBuilder {
	const createdTs = Math.floor(user.createdTimestamp / 1000);

	const embed = new EmbedBuilder()
		.setTitle(number ? `Заявка на верификацию №\`${number}\`` : 'Заявка на верификацию')
		.setThumbnail(user.displayAvatarURL())
		.setColor(0xfee75c)
		.setFooter({ text: `ID: ${user.id}` })
		.setTimestamp();

	embed.addFields(
		{ name: 'Участник', value: `<@${user.id}>`, inline: false },
		{ name: 'Дата создания аккаунта', value: `<t:${createdTs}:R>`, inline: true },
		{
			name: 'Дата захода',
			value: joinedTimestamp ? `<t:${Math.floor(joinedTimestamp / 1000)}:R>` : '—',
			inline: true,
		},
		{
			name: 'Способ вступления',
			value: joinMethod?.trim() || 'Неизвестно',
			inline: true,
		},
	);

	verifyQuestions.slice(0, 5).forEach((q) => {
		const rawValue = (answers[q.id] ?? '').trim() || '—';
		const value =
			rawValue === '—'
				? '—'
				: `\`${rawValue.length > 1000 ? rawValue.slice(0, 1000) + '...' : rawValue}\``;

		embed.addFields({ name: q.label, value, inline: false });
	});
	return embed;
}

export function buildAppealEmbed(
	user: User,
	text: string,
	blacklistReason?: string,
	number?: number,
	blacklistType?: string,
): EmbedBuilder {
	const createdTs = Math.floor(user.createdTimestamp / 1000);

	const embed = new EmbedBuilder()
		.setTitle(number ? `Апелляция №\`${number}\`` : 'Апелляция')
		.setThumbnail(user.displayAvatarURL())
		.setColor(0xeb459e)
		.setFooter({ text: `ID: ${user.id}` })
		.setTimestamp();

	embed.addFields(
		{ name: 'Участник', value: `<@${user.id}>`, inline: false },
		{ name: 'Дата создания аккаунта', value: `<t:${createdTs}:R>`, inline: false },
	);

	const reason = (blacklistReason ?? '').trim();
	if (reason) {
		const quoted = reason
			.split('\n')
			.map((line) => `> ${line}`)
			.join('\n');
		const value = quoted.length > 1000 ? quoted.slice(0, 1000) + '…' : quoted;
		embed.addFields({ name: 'Причина ЧС', value });
	}

	if (blacklistType) {
		embed.addFields({ name: 'Тип блокировки', value: blacklistType });
	}

	const rawValue = text.trim() || '—';
	if (rawValue === '—') {
		embed.addFields({ name: 'Текст апелляции', value: '—' });
	} else {
		const truncated = rawValue.length > 1000 ? rawValue.slice(0, 1000) + '...' : rawValue;
		embed.addFields({ name: 'Текст апелляции', value: `\`${truncated}\`` });
	}
	return embed;
}

const PAGE_SIZE = 10;

interface PendingListItem {
	userId: string;
	username: string;
	submittedAt: number;
	reviewMessageUrl?: string;
	number?: number;
	questionChannelId?: string;
}

export function buildPendingListView(
	items: PendingListItem[],
	requestedPage: number,
	opts: { title: string; color: number; namespace: string },
): { embed: EmbedBuilder; row?: ActionRowBuilder<ButtonBuilder> } {
	const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
	const page = Math.min(Math.max(0, requestedPage), pages - 1);
	const start = page * PAGE_SIZE;
	const slice = items.slice(start, start + PAGE_SIZE);

	const lines = slice.map((item, i) => {
		const idx = start + i;
		const ts = Math.floor(item.submittedAt / 1000);
		const link = item.reviewMessageUrl ? ` — [перейти](${item.reviewMessageUrl})` : '';
		const num = item.number ? `№\`${item.number}\`` : `\`${idx + 1}.\``;
		const question = item.questionChannelId
			? ` • <#${item.questionChannelId}>`
			: '';
		return `**${num}** <@${item.userId}> (${item.username}) — <t:${ts}:R>${link}${question}`;
	});

	const embed = new EmbedBuilder()
		.setTitle(`${opts.title} — ${items.length}`)
		.setColor(opts.color)
		.setDescription(lines.join('\n').slice(0, 4096))
		.setFooter({ text: `Страница ${page + 1}/${pages}` });

	let row: ActionRowBuilder<ButtonBuilder> | undefined;
	if (pages > 1) {
		row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`${opts.namespace}:page:${page - 1}`)
				.setLabel('◀ Назад')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(page <= 0),
			new ButtonBuilder()
				.setCustomId(`${opts.namespace}:pageinfo`)
				.setLabel(`${page + 1} / ${pages}`)
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(true),
			new ButtonBuilder()
				.setCustomId(`${opts.namespace}:page:${page + 1}`)
				.setLabel('Вперёд ▶')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(page >= pages - 1),
		);
	}

	return { embed, row };
}


export function buildReviewButtons(
	userId: string,
	questionChannelUrl?: string,
): ActionRowBuilder<ButtonBuilder> {
	const questionButton = questionChannelUrl
		? new ButtonBuilder()
				.setLabel('Перейти к вопросу')
				.setStyle(ButtonStyle.Link)
				.setURL(questionChannelUrl)
				.setEmoji('❓')
		: new ButtonBuilder()
				.setCustomId(`review:question:${userId}`)
				.setLabel('Задать вопрос')
				.setStyle(ButtonStyle.Primary)
				.setEmoji('❓');

	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`review:approve:${userId}`)
			.setLabel('Принять')
			.setStyle(ButtonStyle.Success)
			.setEmoji('✅'),
		new ButtonBuilder()
			.setCustomId(`review:reject:${userId}`)
			.setLabel('Отклонить')
			.setStyle(ButtonStyle.Danger)
			.setEmoji('❌'),
		questionButton,
		new ButtonBuilder()
			.setCustomId(`review:blacklist:${userId}`)
			.setLabel('ЧС')
			.setStyle(ButtonStyle.Secondary)
			.setEmoji('🚫'),
	);
}

export function buildAppealReviewButtons(
	userId: string,
	questionChannelUrl?: string,
	blacklistType?: string,
): ActionRowBuilder<ButtonBuilder> {
	const idSuffix = blacklistType ? `${userId}_${blacklistType}` : userId;

	const questionButton = questionChannelUrl
		? new ButtonBuilder()
				.setLabel('Перейти к вопросу')
				.setStyle(ButtonStyle.Link)
				.setURL(questionChannelUrl)
				.setEmoji('❓')
		: new ButtonBuilder()
				.setCustomId(`appeal:question:${idSuffix}`)
				.setLabel('Задать вопрос')
				.setStyle(ButtonStyle.Primary)
				.setEmoji('❓');

	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`appeal:amnesty:${idSuffix}`)
			.setLabel('Принять амнистию')
			.setStyle(ButtonStyle.Success)
			.setEmoji('✅'),
		new ButtonBuilder()
			.setCustomId(`appeal:deny:${idSuffix}`)
			.setLabel('Отказать в амнистии')
			.setStyle(ButtonStyle.Danger)
			.setEmoji('❌'),
		questionButton,
	);
}

export function buildResolvedEmbed(
	original: EmbedBuilder,
	label: string,
	color: number,
	reviewerId: string,
	reason?: { title: string; text: string },
): EmbedBuilder {
	const embed = EmbedBuilder.from(original.data).setColor(color).addFields({
		name: label,
		value: `<@${reviewerId}>`,
		inline: Boolean(reason),
	});
	if (reason) {
		const text = reason.text.trim();
		const value = text ? `\`${text.length > 1000 ? text.slice(0, 1000) + '...' : text}\`` : '—';
		embed.addFields({ name: reason.title, value, inline: true });
	}
	return embed;
}

export function buildDmEmbed(title: string, description: string, color: number): EmbedBuilder {
	return new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
}

export function buildWelcomeEmbed(member: GuildMember): EmbedBuilder {
	const { guild, user } = member;

	return new EmbedBuilder()
		.setTitle('🎉  Добро пожаловать!')
		.setDescription(
			`Добро пожаловать, <@${user.id}>, на **${guild.name}**! Мы рады, что вы присоединились к нам для общения.`,
		)
		.setThumbnail(user.displayAvatarURL())
		.setColor(0x57f287)
		.setFooter({ text: guild.name, iconURL: guild.iconURL() ?? undefined })
		.setTimestamp();
}

export type ReviewAction = 'approve' | 'reject' | 'question' | 'blacklist';

export type DecisionKind = 'application' | 'appeal';

export function buildProcessedButtonRow(kind: DecisionKind): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`decision:processed:${kind}`)
			.setLabel(kind === 'appeal' ? 'Апелляция обработана' : 'Анкета обработана')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true),
	);
}

export function buildLeftServerButtonRow(): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId('decision:left')
			.setLabel('Покинул сервер')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true),
	);
}

export function buildAutoClosedButtonRow(): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId('decision:expired')
			.setLabel('Закрыто автоматически')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true),
	);
}

export function buildDecisionLinkRow(
	kind: DecisionKind,
	reviewMessageUrl?: string,
): ActionRowBuilder<ButtonBuilder> | undefined {
	if (!reviewMessageUrl) return undefined;
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setLabel(kind === 'appeal' ? 'Открыть апелляцию' : 'Открыть анкету')
			.setStyle(ButtonStyle.Link)
			.setURL(reviewMessageUrl),
	);
}

export function buildDecisionEmbed(
	kind: DecisionKind,
	label: string,
	color: number,
	reviewerId: string,
	targetUserId: string,
	number?: number,
	reason?: { title: string; text: string },
	titleOverride?: string,
): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setTitle(
			titleOverride
				? number
					? `${titleOverride} №\`${number}\``
					: titleOverride
				: kind === 'appeal'
					? number
						? `Решение по апелляции №\`${number}\``
						: 'Решение по апелляции'
					: number
						? `Решение по заявке №\`${number}\``
						: 'Решение по заявке',
		)
		.setColor(color)
		.addFields({ name: 'Участник', value: `<@${targetUserId}>`, inline: true });

	if (reason) {
		embed.addFields({
			name: reason.title,
			value: reason.text ? `\`${reason.text}\`` : '—',
			inline: true,
		});
	} else {
		embed.addFields({ name: 'Решение', value: label, inline: true });
	}

	embed
		.addFields({ name: 'Модератор', value: `<@${reviewerId}>`, inline: false })
		.setFooter({ text: `ID: ${targetUserId}` })
		.setTimestamp();

	return embed;
}

export async function postDecisionMessage(
	client: Client,
	channelId: string | undefined,
	kind: DecisionKind,
	opts: {
		label: string;
		color: number;
		reviewerId: string;
		targetUserId: string;
		reviewMessageUrl?: string;
		reason?: { title: string; text: string };
		number?: number;
		title?: string;
	},
): Promise<void> {
	if (!channelId) return;
	try {
		const channel = await client.channels.fetch(channelId).catch(() => null);
		if (!channel || !channel.isTextBased()) {
			console.error('[decision] decisions channel unavailable:', channelId);
			return;
		}
		const embed = buildDecisionEmbed(
			kind,
			opts.label,
			opts.color,
			opts.reviewerId,
			opts.targetUserId,
			opts.number,
			opts.reason,
			opts.title,
		);
		const linkRow = buildDecisionLinkRow(kind, opts.reviewMessageUrl);
		await (channel as TextChannel).send({
			embeds: [embed],
			components: linkRow ? [linkRow] : [],
		});
	} catch (e) {
		console.error('[decision] failed to post decision message', e);
	}
}
