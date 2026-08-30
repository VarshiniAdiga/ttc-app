// Two fake, pre-linked users driving the dev login shim (Phase 0).
// The Phase 1 seed inserts profile/couple rows using these exact ids.
export const DEV_USERS = {
  her: { id: "11111111-1111-1111-1111-111111111111", label: "Her" },
  him: { id: "22222222-2222-2222-2222-222222222222", label: "Him" },
} as const;

export type DevRole = keyof typeof DEV_USERS;
