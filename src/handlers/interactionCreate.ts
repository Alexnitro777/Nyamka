import { Interaction, MessageFlags } from 'discord.js';
import { BotClient } from '../types';
import { hasCommandAccess } from '../permissions';
import { getGuildConfig } from '../guildConfig';

const NOT_CONFIGURED = '⚠️ Бот не настроен на этом сервере. Обратитесь к администрации.';
const GUILD_ONLY = 'Действие доступно только на сервере.';

export async function handleInteraction(client: BotClient, interaction: Interaction): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;

      if (!interaction.inGuild()) {
        await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
        return;
      }

      const gc = await getGuildConfig(interaction.guildId);
      if (!gc) {
        await interaction.reply({ content: NOT_CONFIGURED, flags: MessageFlags.Ephemeral });
        return;
      }

      const required = cmd.access ?? 'owner';
      if (!hasCommandAccess(interaction, gc, required)) {
        await interaction.reply({
          content: '⛔ У тебя нет доступа к этой команде.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await cmd.execute(interaction, gc);
      return;
    }

    if (interaction.isButton()) {
      for (const handler of client.buttons.values()) {
        const match =
          handler.customId instanceof RegExp
            ? handler.customId.test(interaction.customId)
            : handler.customId === interaction.customId;
        if (match) {
          if (!interaction.inGuild()) {
            await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
            return;
          }
          const gc = await getGuildConfig(interaction.guildId);
          if (!gc) {
            await interaction.reply({ content: NOT_CONFIGURED, flags: MessageFlags.Ephemeral });
            return;
          }
          await handler.execute(interaction, gc);
          return;
        }
      }
    }

    if (interaction.isAutocomplete()) {
      if (interaction.commandName === 'запостить') {
        const { embedsMap } = await import('../embeds/registry');
        const focused = interaction.options.getFocused().toLowerCase();
        const choices = [...embedsMap.values()]
          .filter((e) => e.name.toLowerCase().includes(focused))
          .slice(0, 25)
          .map((e) => ({ name: `${e.name} — ${e.description}`.slice(0, 100), value: e.name }));
        await interaction.respond(choices).catch(() => null);
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      for (const handler of client.modals.values()) {
        const match =
          handler.customId instanceof RegExp
            ? handler.customId.test(interaction.customId)
            : handler.customId === interaction.customId;
        if (match) {
          if (!interaction.inGuild()) {
            await interaction.reply({ content: GUILD_ONLY, flags: MessageFlags.Ephemeral });
            return;
          }
          const gc = await getGuildConfig(interaction.guildId);
          if (!gc) {
            await interaction.reply({ content: NOT_CONFIGURED, flags: MessageFlags.Ephemeral });
            return;
          }
          await handler.execute(interaction, gc);
          return;
        }
      }
    }
  } catch (err) {
    console.error('Interaction error:', err);
    if (!interaction.isRepliable()) return;
    const message = 'Произошла ошибка при обработке.';
    if (interaction.isMessageComponent() && (interaction.deferred || interaction.replied)) {
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => null);
    } else if (interaction.deferred) {
      await interaction.editReply({ content: message }).catch(() => null);
    } else if (interaction.replied) {
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => null);
    } else {
      await interaction
        .reply({ content: message, flags: MessageFlags.Ephemeral })
        .catch(() => null);
    }
  }
}
