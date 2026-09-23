// Tiny module-level flag deciding how the plain apiFetch() authenticates:
//   dev  → send x-dev-user-id (the dev user-switcher, non-production only)
//   real → send the verified Better Auth session cookie
// Kept out of React so apiFetch (which isn't a hook) can read it synchronously.
// The SessionProvider flips it based on whether a real session exists.
let realMode = false;
export function setRealMode(v: boolean) {
  realMode = v;
}
export function isRealMode() {
  return realMode;
}
