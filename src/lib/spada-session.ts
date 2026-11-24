import "server-only";

import { cookies } from "next/headers";
import { EncryptJWT, jwtDecrypt } from "jose";

const COOKIE_NAME = "paanz_spada_session";
const MAX_AGE = 60 * 60 * 24 * 7;

export interface SpadaSession {
  nim: string;
  name: string;
  cookieHeader: string;
  connectedAt: string;
}

function encryptionKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET belum diatur.");
  return new TextEncoder().encode(secret);
}

export async function readSpadaSession(): Promise<SpadaSession | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtDecrypt(token, encryptionKey());
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) return null;
    if (
      typeof payload.nim !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.cookieHeader !== "string" ||
      typeof payload.connectedAt !== "string"
    ) {
      return null;
    }
    return {
      nim: payload.nim,
      name: payload.name,
      cookieHeader: payload.cookieHeader,
      connectedAt: payload.connectedAt,
    };
  } catch {
    return null;
  }
}

export async function writeSpadaSession(session: SpadaSession) {
  const token = await new EncryptJWT({
    nim: session.nim,
    name: session.name,
    cookieHeader: session.cookieHeader,
    connectedAt: session.connectedAt,
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .encrypt(encryptionKey());

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSpadaSession() {
  (await cookies()).delete(COOKIE_NAME);
}
