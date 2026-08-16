import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { getGuildConfig } from './guildConfig';
import { blacklistMemberRoles, restoreMemberRoles } from './roles';
import { getApplication, updateApplication, saveApplication, getAppeal, updateAppeal } from './storage';
import { postDecisionMessage, buildResolvedEmbed, buildProcessedButtonRow } from './ui';

async function closeUiMessage(
  client: Client,
  guildId: string,
  reviewMessageUrl: string | undefined,
  questionChannelId: string | undefined,
  label: string,
  color: number,
  kind: 'application' | 'appeal'
) {
  if (reviewMessageUrl) {
    const parsed = reviewMessageUrl.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
    if (parsed) {
      const [, , channelId, messageId] = parsed;
      const reviewChannel = await client.channels.fetch(channelId).catch(() => null);
      if (reviewChannel?.isTextBased()) {
        const msg = await (reviewChannel as TextChannel).messages.fetch(messageId).catch(() => null);
        if (msg && msg.embeds[0]) {
          const resolved = buildResolvedEmbed(
            EmbedBuilder.from(msg.embeds[0]),
            label,
            color,
            client.user!.id
          );
          await msg.edit({
            embeds: [resolved],
            components: [buildProcessedButtonRow(kind)]
          }).catch(() => null);
        }
      }
    }
  }

  if (questionChannelId) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (guild) {
      const questionChannel = await guild.channels.fetch(questionChannelId).catch(() => null);
      await questionChannel?.delete().catch(() => null);
    }
  }
}

export async function applyGlobalBlacklist(client: Client, userId: string, reason: string, reviewerId: string, excludeGuildId?: string): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    if (guild.id === excludeGuildId) continue;
    const gc = await getGuildConfig(guild.id).catch(() => null);
    if (!gc) continue;
    
    const member = await guild.members.fetch(userId).catch(() => null);
    let removedRoles: string[] = [];
    if (member && !member.roles.cache.has(gc.roles.blacklist)) {
      const result = await blacklistMemberRoles(member, gc);
      if (result.ok) removedRoles = result.removed;
    }
    
    const existing = await getApplication(guild.id, userId);
    if (existing) {
      const wasPending = existing.status === 'pending';
      await updateApplication(guild.id, userId, {
        status: 'blacklisted',
        reason,
        reviewerId,
        removedRoles: removedRoles.length ? removedRoles : existing.removedRoles,
        questionChannelId: wasPending ? undefined : existing.questionChannelId,
      });
      if (wasPending) {
        await closeUiMessage(client, guild.id, existing.reviewMessageUrl, existing.questionChannelId, 'Авто-ЧСП (Глобально)', 0x992d22, 'application');
      }
    } else {
      await saveApplication({
        userId,
        username: member ? member.user.tag : 'Unknown',
        guildId: guild.id,
        answers: {},
        submittedAt: Date.now(),
        status: 'blacklisted',
        reason,
        reviewerId,
        removedRoles: removedRoles.length ? removedRoles : undefined,
      });
    }

    const appeal = await getAppeal(guild.id, userId);
    if (appeal && appeal.status === 'pending') {
      await updateAppeal(guild.id, userId, { status: 'denied', reviewerId: client.user!.id, questionChannelId: undefined });
      await closeUiMessage(client, guild.id, appeal.reviewMessageUrl, appeal.questionChannelId, 'Авто-Отказ (Новый ЧС)', 0x992d22, 'appeal');
    }

    await postDecisionMessage(client, gc.channels.blacklistLog, 'application', {
      label: 'Глобальный ЧС',
      color: 0x992d22,
      reviewerId,
      targetUserId: userId,
      reason: { title: 'Причина', text: reason },
      title: 'Автоматическая выдача ЧСП',
    });
  }
}

export async function removeGlobalBlacklist(client: Client, userId: string, excludeGuildId?: string): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    if (guild.id === excludeGuildId) continue;
    const gc = await getGuildConfig(guild.id).catch(() => null);
    if (!gc) continue;

    const existing = await getApplication(guild.id, userId);
    if (existing) {
      await updateApplication(guild.id, userId, { status: 'amnestied', removedRoles: [] });
    }
    
    const appeal = await getAppeal(guild.id, userId);
    if (appeal && appeal.status === 'pending') {
      await updateAppeal(guild.id, userId, { status: 'amnestied', reviewerId: client.user!.id, questionChannelId: undefined });
      await closeUiMessage(client, guild.id, appeal.reviewMessageUrl, appeal.questionChannelId, 'Авто-Амнистия (Глобально)', 0x57f287, 'appeal');
    }
    
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) {
      await member.roles.remove(gc.roles.blacklist).catch(() => null);
      if (existing && existing.removedRoles && existing.removedRoles.length > 0) {
        await restoreMemberRoles(member, gc, existing.removedRoles);
      }
    }

    await postDecisionMessage(client, gc.channels.blacklistLog, 'application', {
      label: 'Снят с ЧС (Глобально)',
      color: 0x57f287,
      reviewerId: client.user!.id,
      targetUserId: userId,
      reason: { title: 'Причина', text: 'Снятие ЧС на другом сервере' },
      title: 'Снятие ЧСП',
    });
  }
}

export async function applyGlobalVerification(client: Client, userId: string, excludeGuildId?: string): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    if (guild.id === excludeGuildId) continue;
    const gc = await getGuildConfig(guild.id).catch(() => null);
    if (!gc) continue;
    
    const existing = await getApplication(guild.id, userId);
    if (existing && existing.status === 'pending') {
      await updateApplication(guild.id, userId, { status: 'approved', reviewerId: client.user!.id, questionChannelId: undefined });
      await closeUiMessage(client, guild.id, existing.reviewMessageUrl, existing.questionChannelId, 'Авто-Принято (Глобально)', 0x57f287, 'application');
    }

    const member = await guild.members.fetch(userId).catch(() => null);
    if (member && !member.roles.cache.has(gc.roles.verified)) {
      await member.roles.add(gc.roles.verified).catch(() => null);
      await postDecisionMessage(client, gc.channels.decisions, 'application', {
        label: 'Авто-Верификация',
        color: 0x57f287,
        reviewerId: client.user!.id,
        targetUserId: userId,
        reason: { title: 'Причина', text: 'Одобрение заявки на другом сервере' },
        title: 'Автоматическая верификация',
      });
    }
  }
}
