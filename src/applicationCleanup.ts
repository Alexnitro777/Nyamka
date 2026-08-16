import { Client, EmbedBuilder, Guild, TextChannel } from 'discord.js';
import { Application, GuildConfig } from './types';
import { getGuildConfig } from './guildConfig';
import {
  listPendingApplications,
  claimApplication,
  updateApplication,
  getApplication,
} from './storage';
import {
  buildDmEmbed,
  buildResolvedEmbed,
  buildAutoClosedButtonRow,
  postDecisionMessage,
} from './ui';

const APPLICATION_TTL_MS = 2 * 24 * 60 * 60_000;

const SWEEP_INTERVAL_MS = Math.min(
  5 * 60_000,
  Math.max(10_000, Math.floor(APPLICATION_TTL_MS / 4)),
);

const AUTO_CLOSE_REASON = 'Переподайте заявку на верификацию';
const AUTO_CLOSE_LABEL = 'Закрыто автоматически';
const AUTO_CLOSE_COLOR = 0x99aab5;

async function deleteQuestionChannel(guild: Guild, app: Application): Promise<void> {
  if (!app.questionChannelId) return;
  const channel = await guild.channels.fetch(app.questionChannelId).catch(() => null);
  await channel
    ?.delete('Автозакрытие анкеты: истёк срок рассмотрения')
    .catch((e) => {
      console.error('[applicationCleanup] не удалось удалить канал вопроса', e);
      return null;
    });
  await updateApplication(app.guildId, app.userId, { questionChannelId: undefined });
}

async function markReviewMessageResolved(
  client: Client,
  reviewMessageUrl: string | undefined,
  reviewerId: string,
): Promise<void> {
  if (!reviewMessageUrl) return;
  const parsed = reviewMessageUrl.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
  if (!parsed) return;

  const [, , channelId, messageId] = parsed;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const msg = await (channel as TextChannel).messages.fetch(messageId).catch(() => null);
  if (!msg || !msg.embeds[0]) return;

  const resolved = buildResolvedEmbed(
    EmbedBuilder.from(msg.embeds[0]),
    AUTO_CLOSE_LABEL,
    AUTO_CLOSE_COLOR,
    reviewerId,
  );
  await msg
    .edit({ embeds: [resolved], components: [buildAutoClosedButtonRow()] })
    .catch((e) => {
      console.error('[applicationCleanup] не удалось обновить сообщение ревью', e);
      return null;
    });
}

async function closeExpiredApplication(
  client: Client,
  guild: Guild,
  gc: GuildConfig,
  app: Application,
): Promise<void> {
  const reviewerId = client.user?.id ?? guild.client.user?.id ?? guild.id;

  const claimed = await claimApplication(app.guildId, app.userId, 'expired', reviewerId, AUTO_CLOSE_REASON);
  if (!claimed) return;


  const fresh = (await getApplication(app.guildId, app.userId)) ?? app;

  await deleteQuestionChannel(guild, fresh);
  await markReviewMessageResolved(client, fresh.reviewMessageUrl, reviewerId);

  const member = await guild.members.fetch(app.userId).catch(() => null);
  await member
    ?.send({
      embeds: [buildDmEmbed('⌛ Заявка закрыта', `${AUTO_CLOSE_REASON}.`, AUTO_CLOSE_COLOR)],
    })
    .catch(() => null);

  await postDecisionMessage(client, gc.channels.decisions, 'application', {
    label: AUTO_CLOSE_LABEL,
    color: AUTO_CLOSE_COLOR,
    reviewerId,
    targetUserId: app.userId,
    reviewMessageUrl: fresh.reviewMessageUrl,
    reason: { title: 'Причина', text: AUTO_CLOSE_REASON },
    number: fresh.number,
  });
}

async function sweep(client: Client): Promise<void> {
  const now = Date.now();

  for (const guild of client.guilds.cache.values()) {
    const gc = await getGuildConfig(guild.id);
    if (!gc) continue;

    const apps = await listPendingApplications(guild.id);
    for (const app of apps) {
      if (now - app.submittedAt < APPLICATION_TTL_MS) continue;
      await closeExpiredApplication(client, guild, gc, app).catch((e) =>
        console.error('[applicationCleanup] не удалось закрыть анкету', app.userId, e),
      );
    }
  }
}

export function registerApplicationCleanup(client: Client): void {
  const run = (): void => {
    void sweep(client).catch((e) =>
      console.error('[applicationCleanup] ошибка прохода', e),
    );
  };

  client.once('ready', () => {
    console.log(
      `[applicationCleanup] включено: TTL=${Math.round(APPLICATION_TTL_MS / 3_600_000)} ч, ` +
        `проверка каждые ${Math.round(SWEEP_INTERVAL_MS / 1000)} с`,
    );
    run();
    setInterval(run, SWEEP_INTERVAL_MS);
  });
}
