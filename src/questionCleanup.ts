import { Client, Guild } from 'discord.js';
import {
  listApplicationsWithQuestionChannel,
  listAppealsWithQuestionChannel,
} from './storage';
import { restoreReviewButton } from './questionRestore';

const QUESTION_TTL_MS = 2 * 24 * 60 * 60_000;

const SWEEP_INTERVAL_MS = Math.min(
  5 * 60_000,
  Math.max(10_000, Math.floor(QUESTION_TTL_MS / 4)),
);

async function sweepQuestionChannel(
  client: Client,
  guild: Guild,
  now: number,
  channelId: string,
  ttlDelete: boolean,
): Promise<void> {
  const channel = await guild.channels.fetch(channelId).catch(() => null);

  if (!channel) {
    await restoreReviewButton(client, channelId);
    return;
  }

  if (!ttlDelete) return;

  const createdAt = channel.createdTimestamp;
  if (createdAt === null) return;
  if (now - createdAt < QUESTION_TTL_MS) return;

  await channel
    .delete('Автоудаление: вопрос не закрыли вовремя')
    .catch((e) => {
      console.error('[questionCleanup] не удалось удалить канал', e);
      return null;
    });

  await restoreReviewButton(client, channelId);
}

async function sweep(client: Client): Promise<void> {
  const now = Date.now();

  for (const guild of client.guilds.cache.values()) {
    const applicationChannelIds = (await listApplicationsWithQuestionChannel(guild.id))
      .map((entry) => entry.questionChannelId)
      .filter((id): id is string => Boolean(id));
    const appealChannelIds = (await listAppealsWithQuestionChannel(guild.id))
      .map((entry) => entry.questionChannelId)
      .filter((id): id is string => Boolean(id));

    for (const channelId of applicationChannelIds) {
      await sweepQuestionChannel(client, guild, now, channelId, true);
    }
    for (const channelId of appealChannelIds) {
      await sweepQuestionChannel(client, guild, now, channelId, false);
    }
  }
}

export function registerQuestionCleanup(client: Client): void {
  const run = (): void => {
    void sweep(client).catch((e) =>
      console.error('[questionCleanup] ошибка прохода', e),
    );
  };

  client.once('ready', () => {
    console.log(
      `[questionCleanup] включено: TTL=${Math.round(QUESTION_TTL_MS / 3_600_000)} ч, ` +
        `проверка каждые ${Math.round(SWEEP_INTERVAL_MS / 1000)} с`,
    );
    run();
    setInterval(run, SWEEP_INTERVAL_MS);
  });
}
