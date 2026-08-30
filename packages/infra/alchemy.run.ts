import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { config } from "dotenv";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

config({ path: "./.env" });
config({ path: "../../apps/server/.env" });

export const server = Cloudflare.Worker("server", {
  main: "../../apps/server/src/index.ts",
  compatibility: {
    flags: ["nodejs_compat"],
  },
  env: {
    APP_ENV: Config.string("APP_ENV"),
    DATABASE_URL: Config.redacted("DATABASE_URL"),
    APP_DATABASE_URL: Config.redacted("APP_DATABASE_URL"),
    CORS_ORIGIN: Config.string("CORS_ORIGIN"),
    // OPK photo storage (Supabase Storage). Optional: unset = photo upload disabled.
    SUPABASE_URL: Config.string("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: Config.redacted("SUPABASE_SERVICE_ROLE_KEY"),
    BETTER_AUTH_SECRET: Config.redacted("BETTER_AUTH_SECRET"),
    BETTER_AUTH_URL: Cloudflare.Worker.URL,
  },
  dev: {
    port: 3000,
  },
});

export type ServerEnv = Cloudflare.InferEnv<typeof server>;

export default Alchemy.Stack(
  "ttc",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const serverWorker = yield* server;

    return {
      server: serverWorker.url,
    };
  }),
);
