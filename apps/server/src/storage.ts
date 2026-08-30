import { env } from "@ttc/env/server";

// OPK photos go to a PRIVATE Supabase Storage bucket, one object per user+day.
// Optional: with no service-role key set, storage is disabled and OPK text
// logging still works. Enable by setting SUPABASE_SERVICE_ROLE_KEY in .dev.vars.
const BUCKET = "opk";

export function storageEnabled(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

function authHeaders(): Record<string, string> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY as string;
  return { Authorization: `Bearer ${key}`, apikey: key };
}

async function ensureBucket(): Promise<void> {
  // Idempotent: creating an existing bucket 4xx's, which we ignore.
  await fetch(`${env.SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
}

export async function uploadOpkPhoto(
  userId: string,
  date: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  await ensureBucket();
  const objectPath = `${userId}/${date}`;
  const res = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`,
    {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": contentType, "x-upsert": "true" },
      body: bytes as unknown as BodyInit,
    },
  );
  if (!res.ok) throw new Error(`storage upload failed: ${res.status} ${await res.text()}`);
  return `${BUCKET}/${objectPath}`;
}

// Short-lived signed URL so the private object can be shown to its owner only.
export async function signedOpkUrl(storedPath: string, expiresIn = 3600): Promise<string> {
  const objectPath = storedPath.replace(new RegExp(`^${BUCKET}/`), "");
  const res = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${objectPath}`,
    {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn }),
    },
  );
  if (!res.ok) throw new Error(`sign failed: ${res.status} ${await res.text()}`);
  const { signedURL } = (await res.json()) as { signedURL: string };
  return `${env.SUPABASE_URL}/storage/v1${signedURL}`;
}
