import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "EXPO_PUBLIC_",
  client: {
    EXPO_PUBLIC_SERVER_URL: z.url(),
    // "false" forces real login (production). Anything else keeps the dev switcher.
    EXPO_PUBLIC_ALLOW_DEV_SWITCH: z.string().optional(),
  },
  runtimeEnv: {
    EXPO_PUBLIC_SERVER_URL: process.env.EXPO_PUBLIC_SERVER_URL,
    EXPO_PUBLIC_ALLOW_DEV_SWITCH: process.env.EXPO_PUBLIC_ALLOW_DEV_SWITCH,
  },
  emptyStringAsUndefined: true,
});
