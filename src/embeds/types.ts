import type {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  EmbedBuilder,
} from 'discord.js';

export interface EmbedMessage {
  embeds: EmbedBuilder[];
  components?: ActionRowBuilder<ButtonBuilder>[];
}

export interface EmbedDefinition {
  name: string;
  description: string;
  build: () => EmbedMessage;
  buttons?: Record<string, (interaction: ButtonInteraction) => Promise<void> | void>;
}
