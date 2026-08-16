import { getAppConfigValue, setAppConfigValue } from './storage';

export interface AppConfig {
  token: string;
  clientId: string;
}

let cached: AppConfig | null = null;

async function resolve(key: string, envName: string): Promise<string> {
  const fromDb = await getAppConfigValue(key);
  if (fromDb && fromDb.trim()) return fromDb.trim();

  const fromEnv = process.env[envName];
  if (fromEnv && fromEnv.trim()) {
    const value = fromEnv.trim();
    await setAppConfigValue(key, value);
    return value;
  }

  throw new Error(
    `Missing ${key}. Insert it into the app_config table (key='${key}'), ` +
      `or set ${envName} once so the bot can persist it.`,
  );
}

export async function initAppConfig(): Promise<void> {
  const token = await resolve('token', 'BOT_TOKEN');
  const clientId = await resolve('clientId', 'CLIENT_ID');
  cached = { token, clientId };
}

export function getAppConfig(): AppConfig {
  if (!cached) {
    throw new Error('App config not initialized. Call initAppConfig() before getAppConfig().');
  }
  return cached;
}
