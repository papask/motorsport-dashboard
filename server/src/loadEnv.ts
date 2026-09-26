import path from 'path';

// Local secrets (ANTHROPIC_API_KEY, THREADS_ACCESS_TOKEN, ...) live in server/.env;
// hosts set real env vars. index.ts imports this first, because services read
// their env when they are imported.
try {
  process.loadEnvFile(path.resolve(__dirname, '..', '.env'));
} catch {
  // no .env file
}
