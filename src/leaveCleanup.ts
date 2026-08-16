import { Client, Guild, GuildMember, PartialGuildMember } from 'discord.js';
import {
  getApplication,
  getAppeal,
  markApplicationLeft,
  markAppealLeft,
  updateApplication,
  updateAppeal,
} from './storage';
import { buildLeftServerButtonRow } from './ui';

interface ParsedMessageUrl {
  guildId: string;
  channelId: string;
  messageId: string;
}

function parseMessageUrl(url: string): ParsedMessageUrl | null {
  const m = url.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
  if (!m) return null;
  return { guildId: m[1], channelId: m[2], messageId: m[3] };
}

async function markReviewMessageLeft(
  guild: Guild,
  reviewMessageUrl: string | undefined,
): Promise<void> {
  if (!reviewMessageUrl) return;
  const parsed = parseMessageUrl(reviewMessageUrl);
  if (!parsed) return;

  const channel = await guild.channels.fetch(parsed.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const message = await channel.messages.fetch(parsed.messageId).catch(() => null);
  if (!message) return;

  await message
    .edit({ components: [buildLeftServerButtonRow()] })
    .catch((e) => console.error('[leaveCleanup] failed to edit review message', e));
}

async function deleteQuestionChannel(
  guild: Guild,
  channelId: string | undefined,
): Promise<void> {
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  await channel
    ?.delete('Участник покинул сервер с неразобранной заявкой')
    .catch((e) => console.error('[leaveCleanup] failed to delete question channel', e));
}

async function handleMemberRemove(
  member: GuildMember | PartialGuildMember,
): Promise<void> {
  const guild = member.guild;
  if (!guild) return;
  const guildId = guild.id;
  const userId = member.id;

  const app = await getApplication(guildId, userId);
  if (app && app.status === 'pending' && (await markApplicationLeft(guildId, userId))) {

    await markReviewMessageLeft(guild, app.reviewMessageUrl);
    if (app.questionChannelId) {
      await deleteQuestionChannel(guild, app.questionChannelId);
      await updateApplication(guildId, userId, { questionChannelId: undefined });
    }
  }

  const appeal = await getAppeal(guildId, userId);
  if (appeal && appeal.status === 'pending' && (await markAppealLeft(guildId, userId))) {

    await markReviewMessageLeft(guild, appeal.reviewMessageUrl);
    if (appeal.questionChannelId) {
      await deleteQuestionChannel(guild, appeal.questionChannelId);
      await updateAppeal(guildId, userId, { questionChannelId: undefined });
    }
  }
}

export function registerLeaveCleanupEvents(client: Client): void {
  client.on('guildMemberRemove', (member) => {
    void handleMemberRemove(member).catch((e) =>
      console.error('[leaveCleanup] handler failed', e),
    );
  });
}
