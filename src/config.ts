function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function loadConfig() {
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    databasePath: process.env.DATABASE_PATH || './data/cookin.db',

    llm: {
      provider: requireEnv('LLM_PROVIDER') as 'openai' | 'anthropic' | 'google' | 'openai-compatible',
      apiKey: requireEnv('LLM_API_KEY'),
      model: requireEnv('LLM_MODEL'),
      baseUrl: process.env.LLM_BASE_URL || undefined,
    },

    mealPlanLlm: {
      provider: (process.env.MEAL_PLAN_LLM_PROVIDER || process.env.LLM_PROVIDER) as 'openai' | 'anthropic' | 'google' | 'openai-compatible',
      apiKey: process.env.MEAL_PLAN_LLM_API_KEY || requireEnv('LLM_API_KEY'),
      model: process.env.MEAL_PLAN_LLM_MODEL || requireEnv('LLM_MODEL'),
      baseUrl: process.env.MEAL_PLAN_LLM_BASE_URL || process.env.LLM_BASE_URL || undefined,
    },

    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
  };
}

export type Config = ReturnType<typeof loadConfig>;
export const config = loadConfig();
