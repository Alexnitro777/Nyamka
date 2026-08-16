import { ActionRowBuilder, ButtonBuilder, Client, TextChannel } from 'discord.js';
import {
  getApplicationByQuestionChannel,
  getAppealByQuestionChannel,
  updateApplication,
  updateAppeal,
} from './storage';
import { buildReviewButtons, buildAppealReviewButtons } from './ui';

async function editReviewMessage(
  client: Client,
  reviewMessageUrl: string | undefined,
  row: ActionRowBuilder<ButtonBuilder>,
): Promise<void> {
  if (!reviewMessageUrl) return;

  const parts = reviewMessageUrl.split('/');
  const messageId = parts[parts.length - 1];
  const channelId = parts[parts.length - 2];
  if (!messageId || !channelId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const message = await (channel as TextChannel).messages.fetch(messageId).catch(() => null);
  if (!message) return;

  await message.edit({ components: [row] }).catch((e) => {
    console.error('[questionRestore] не удалось восстановить кнопку', e);
    return null;
  });
}

export async function restoreReviewButton(client: Client, channelId: string): Promise<void> {
  const app = await getApplicationByQuestionChannel(channelId);
  if (app) {
    await updateApplication(app.guildId, app.userId, { questionChannelId: undefined });
    if (app.status === 'pending') {
      await editReviewMessage(client, app.reviewMessageUrl, buildReviewButtons(app.userId));
    }
    return;
  }

  const appeal = await getAppealByQuestionChannel(channelId);
  if (appeal) {
    await updateAppeal(appeal.guildId, appeal.userId, { questionChannelId: undefined });
    if (appeal.status === 'pending') {
      await editReviewMessage(
        client,
        appeal.reviewMessageUrl,
        buildAppealReviewButtons(appeal.userId),
      );
    }
  }
}
