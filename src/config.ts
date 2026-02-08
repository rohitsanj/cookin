function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function loadConfig() {
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    databasePath: process.env.DATABASE_PATH || './data/cookin.db',

    twilio: {
      accountSid: requireEnv('TWILIO_ACCOUNT_SID'),
      authToken: requireEnv('TWILIO_AUTH_TOKEN'),
      whatsappNumber: requireEnv('TWILIO_WHATSAPP_NUMBER'), // e.g. "whatsapp:+14155238886"
    },

    llm: {
      provider: requireEnv('LLM_PROVIDER') as 'openai' | 'anthropic' | 'google' | 'openai-compatible',
      apiKey: requireEnv('LLM_API_KEY'),
      model: requireEnv('LLM_MODEL'),
      baseUrl: process.env.LLM_BASE_URL || undefined,
    },
  };
}

export type Config = ReturnType<typeof loadConfig>;
export const config = loadConfig();
