import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import { SlashCommand } from '../types';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('верификация')
    .setDescription('Разместить сообщение с кнопкой верификации в текущем канале')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) as unknown as SlashCommand['data'],

  access: 'owner',

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: 'Команду нужно запускать в текстовом канале.', flags: MessageFlags.Ephemeral });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('➕ Добро пожаловать!')
      .setColor(0x9b59b6)
      .setDescription(
        'Чтобы получить доступ к серверу, заполни анкету ниже.\n' +
        'Это займёт пару минут и поможет нам узнать тебя получше.\n\n' +
        '> 💜 Все анкеты проверяет живая администрация, а не бот.\n' +
        '> Пожалуйста, отвечай на вопросы **как можно подробнее** — это ускорит процесс одобрения.\n' +
        '> ⏳ *Если твою заявку не рассмотрели в течение 48 часов, ты сможешь отправить её повторно.*'
      )
      .addFields(
        {
          name: '❓ 1 — Откуда узнал о сервере?',
          value:
            'Укажи конкретно: от кого, с какого сервера, ресурса или социальной сети.\n' +
            'Ответы вроде «от друга» или «в интернете» без деталей — отклоняются.',
        },
        {
          name: '💭 2 — Что ожидаешь от сервера?',
          value: 'Расскажи своими словами: ищу друзей, тиммейтов, общение и т.д.',
        },
        {
          name: '🎂 3 — Сколько тебе лет?',
          value: 'Укажи свой реальный возраст.',
        },
        {
          name: '🦊 4 — Отношение к фурри/фембой сообществу?',
          value:
            'Как относишься к комьюнити и относишь ли себя к нему — отвечай максимально честно.',
        },
        {
          name: '📜 5 — Правила прочитаны и приняты?',
          value: 'Достаточно короткого «да», но это значит, что ты с ними внимательно ознакомился.',
        },
      )
      .setFooter({ text: 'Нажми кнопку ниже, чтобы открыть анкету' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('verify:start')
        .setLabel('Пройти верификацию')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🟢'),
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: 'Сообщение верификации размещено.', flags: MessageFlags.Ephemeral });
  },
};

export default command;
