import { promises as fs } from 'fs';
import path from 'path';
import { BotClient, SlashCommand, ButtonHandler, ModalHandler } from '../types';

async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
      .filter((f) => !f.endsWith('.d.ts'))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

export async function loadCommands(client: BotClient): Promise<void> {
  const files = await listFiles(path.join(__dirname, '..', 'commands'));
  for (const file of files) {
    const mod = await import(file);
    const cmd: SlashCommand = mod.default;
    client.commands.set(cmd.data.name, cmd);
  }
}

export async function loadButtons(client: BotClient): Promise<void> {
  const files = await listFiles(path.join(__dirname, '..', 'buttons'));
  for (const file of files) {
    const mod = await import(file);
    const handler: ButtonHandler = mod.default;
    const key = handler.customId instanceof RegExp ? handler.customId.source : handler.customId;
    client.buttons.set(key, handler);
  }
}

export async function loadModals(client: BotClient): Promise<void> {
  const files = await listFiles(path.join(__dirname, '..', 'modals'));
  for (const file of files) {
    const mod = await import(file);
    const handler: ModalHandler = mod.default;
    const key = handler.customId instanceof RegExp ? handler.customId.source : handler.customId;
    client.modals.set(key, handler);
  }
}

import { loadEmbeds, embedsMap } from '../embeds/registry';

export async function loadEmbedButtons(client: BotClient): Promise<void> {
  await loadEmbeds();
  for (const def of embedsMap.values()) {
    if (def.buttons) {
      for (const [customId, handler] of Object.entries(def.buttons)) {
        if (client.buttons.has(customId)) {
          throw new Error(`Duplicate button customId: ${customId} from embed ${def.name}`);
        }
        client.buttons.set(customId, {
          customId,
          execute: async (interaction) => {
            await handler(interaction);
          },
        });
      }
    }
  }
}
