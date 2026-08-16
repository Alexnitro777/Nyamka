import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { initAppConfig, getAppConfig } from './config';
import { BotClient } from './types';
import { loadCommands, loadButtons, loadModals } from './handlers/loader';
import { handleInteraction } from './handlers/interactionCreate';
import { initStorage } from './storage';
import { closeDb } from './db';
import { registerTagRoleEvents, syncAllTagRoles } from './roleTag';
import { registerLeaveCleanupEvents } from './leaveCleanup';
import { registerBlacklistEnforcement } from './blacklistEnforce';
import { registerQuestionCleanup } from './questionCleanup';
import { registerApplicationCleanup } from './applicationCleanup';
import { registerInviteTracker } from './inviteTracker';
import { registerVoiceKick } from './voiceKick';
import { registerVerificationEnforcement } from './verificationEnforce';
import { registerCommandsForGuild, buildCommandBodies } from './commandRegistration';
import { invalidateGuildConfig } from './guildConfig';

async function bootstrap(): Promise<void> {
  console.log('[boot] starting...');
  console.log('[boot] node', process.version);

  await initStorage();
  console.log('[boot] storage ready');

  await initAppConfig();
  const appConfig = getAppConfig();
  console.log('[boot] token present:', Boolean(appConfig.token));
  console.log('[boot] clientId present:', Boolean(appConfig.clientId));

  await buildCommandBodies();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildInvites,
      GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [Partials.GuildMember],
  }) as BotClient;

  client.commands = new Collection();
  client.buttons = new Collection();
  client.modals = new Collection();

  await loadCommands(client);
  await loadButtons(client);
  await loadModals(client);
  console.log('[boot] handlers loaded, logging in...');

  registerTagRoleEvents(client);

  registerLeaveCleanupEvents(client);

  registerBlacklistEnforcement(client);
  registerVerificationEnforcement(client);

  registerQuestionCleanup(client);

  registerApplicationCleanup(client);

  registerInviteTracker(client);

  registerVoiceKick(client);

  client.once('ready', (c) => {
    console.log(`Logged in as ${c.user.tag}`);
    void (async () => {
      for (const guild of c.guilds.cache.values()) {
        await registerCommandsForGuild(guild.id).catch((e) =>
          console.error('[commands] не удалось зарегистрировать команды для', guild.id, e),
        );
      }
    })();
    void syncAllTagRoles(c);
  });

  client.on('guildCreate', (guild) => {
    invalidateGuildConfig(guild.id);
    void registerCommandsForGuild(guild.id).catch((e) =>
      console.error('[commands] не удалось зарегистрировать команды для новой гильдии', guild.id, e),
    );
  });

  client.on('error', (err) => console.error('[client error]', err));
  client.on('shardError', (err) => console.error('[shard error]', err));

  client.on('interactionCreate', (interaction) => handleInteraction(client, interaction));

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] received ${signal}, closing...`);
    await client.destroy();
    await closeDb();
    process.exit(0);
  };
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      void shutdown(sig);
    });
  }

  await client.login(appConfig.token);
}

bootstrap().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
