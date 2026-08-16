import { TextInputStyle } from 'discord.js';

export interface Question {
  id: string;
  label: string;
  style: TextInputStyle;
  required: boolean;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
}


export const verifyQuestions: Question[] = [
  {
    id: 'source',
    label: 'Откуда узнал о сервере?',
    style: TextInputStyle.Paragraph,
    required: true,
    minLength: 10,
    maxLength: 1000,
    placeholder: 'Конкретно от кого, с какого сервера или социальной сети.',
  },
  {
    id: 'expectations',
    label: 'Что ожидаешь от сервера?',
    style: TextInputStyle.Paragraph,
    required: true,
    minLength: 10,
    maxLength: 1000,
    placeholder: 'Расскажи своими словами: ищу друзей, тиммейтов, общения и т.д.',
  },
  {
    id: 'age',
    label: 'Сколько тебе лет?',
    style: TextInputStyle.Short,
    required: true,
    maxLength: 3,
    placeholder: 'Укажи свой реальный возраст числом.',
  },
  {
    id: 'community',
    label: 'Твое отношение к фурри/фембой сообществу?',
    style: TextInputStyle.Paragraph,
    required: true,
    minLength: 10,
    maxLength: 1000,
    placeholder: 'Как относишься к сообществу и относишь ли себя к нему — отвечай честно.',
  },
  {
    id: 'rules',
    label: 'Правила прочитаны и приняты?',
    style: TextInputStyle.Short,
    required: true,
    maxLength: 30,
    placeholder: 'Достаточно короткого «да», но это значит, что ты с ними ознакомился.',
  },
];

export const appealQuestions: Question[] = [
  {
    id: 'text',
    label: 'Текст апелляции',
    style: TextInputStyle.Paragraph,
    required: true,
    minLength: 50,
    maxLength: 2000,
    placeholder: 'Опиши спокойно: за что, как ты понял ситуацию и почему стоит дать второй шанс.',
  },
];
