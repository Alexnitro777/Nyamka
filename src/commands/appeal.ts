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
    .setName('апелляция')
    .setDescription('Разместить сообщение с кнопкой апелляции в текущем канале')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) as unknown as SlashCommand['data'],

  access: 'owner',

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: 'Команду нужно запускать в текстовом канале.', flags: MessageFlags.Ephemeral });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🔓 Подать апелляцию')
      .setColor(0xeb459e)
      .setDescription(
        'Если ты считаешь, что был добавлен в чёрный список по ошибке —\n' +
        'ты можешь подать апелляцию. Команда модерации рассмотрит её вручную.\n\n' +
        '> 💜 Апелляции рассматриваются живой администрацией, а не ботом.\n' +
        '> Чем **подробнее** и спокойнее ты опишешь ситуацию — тем выше шансы.',
      )
      .addFields(
        {
          name: '📝 Что писать в апелляции?',
          value:
            '• **Конкретно:** за что, по твоему мнению, был выдан ЧС.\n' +
            '• Что ты понял и как изменилась ситуация.\n' +
            '• Почему стоит дать тебе второй шанс.',
        },
        {
          name: '🛑 Чего не писать?',
          value:
            '• Оскорблений и угроз — это сразу отказ.\n' +
            '• Шантажа и манипуляций — то же самое.\n' +
            '• Шаблонных отписок — нужна конкретика.',
        },
        {
          name: '⚠️ Перед отправкой',
          value:
            '🔒 **Открой личные сообщения** — без них бот не сможет прислать тебе результат рассмотрения.\n' +
            '⏳ **Терпение** — апелляции рассматриваются не моментально.\n' +
            '🔁 **Одна заявка за раз** — пока предыдущая апелляция не рассмотрена, новую отправить нельзя.\n' +
            '⛔ **Задержка после отказа** — если апелляцию отклонили, новую можно подать через **48 ч.**',
        },
      )
      .setFooter({ text: 'Нажми кнопку ниже, чтобы открыть форму апелляции' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('appeal:start')
        .setLabel('Подать апелляцию')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🟣'),
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: 'Сообщение апелляции размещено.', flags: MessageFlags.Ephemeral });
  },
};

export default command;
