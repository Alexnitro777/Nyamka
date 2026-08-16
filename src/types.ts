import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  Client,
  Collection,
} from 'discord.js';

export interface GuildConfig {
  guildId: string;
  roles: {
    verified: string;
    blacklist: string;
    blacklistZ?: string;
    blacklistA?: string;
    staff: string[];
    ststaff: string[];
    roleTag?: string;
    age13_15?: string;
    age16_17?: string;
    age18_20?: string;
    age21plus?: string;
  };
  channels: {
    review: string;
    appealReview: string;
    welcome?: string;
    decisions?: string;
    appeal?: string;
    tagLog?: string;
    blacklistLog?: string;
  };
  questionCategoryId: string;
}

export interface SlashCommand {
  data: Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;
  access?: 'owner' | 'ststaff' | 'staff';
  execute: (interaction: ChatInputCommandInteraction, gc: GuildConfig) => Promise<void>;
}

export interface ButtonHandler {
  customId: string | RegExp;
  execute: (interaction: ButtonInteraction, gc: GuildConfig) => Promise<void>;
}

export interface ModalHandler {
  customId: string | RegExp;
  execute: (interaction: ModalSubmitInteraction, gc: GuildConfig) => Promise<void>;
}

export interface BotClient extends Client {
  commands: Collection<string, SlashCommand>;
  buttons: Collection<string, ButtonHandler>;
  modals: Collection<string, ModalHandler>;
}

export type ApplicationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'blacklisted'
  | 'amnestied'
  | 'left'
  | 'expired';

export type AppealStatus = 'pending' | 'amnestied' | 'denied' | 'left';

export interface Application {
  userId: string;
  username: string;
  guildId: string;
  answers: Record<string, string>;
  submittedAt: number;
  status: ApplicationStatus;
  reviewMessageUrl?: string;
  reviewerId?: string;
  reason?: string;
  questionChannelId?: string;
  number?: number;
  joinMethod?: string;
  removedRoles?: string[];
}

export interface Appeal {
  userId: string;
  guildId: string;
  username: string;
  text: string;
  submittedAt: number;
  status: AppealStatus;
  reviewMessageUrl?: string;
  reviewerId?: string;
  reason?: string;
  resolvedAt?: number;
  questionChannelId?: string;
  blacklistReason?: string;
  blacklistType?: string;
  number?: number;
}
