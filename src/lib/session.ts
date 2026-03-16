import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import type { SessionPayload } from "@/lib/types";

const SESSION_COOKIE_NAME = "zhaoshui_session";
const OAUTH_STATE_COOKIE_NAME = "zhaoshui_oauth_state";

function getSessionKey() {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("Missing SESSION_SECRET");
  }

  return createHash("sha256").update(secret).digest();
}

function encode(value: Buffer) {
  return value.toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url");
}

export function createOauthState() {
  return randomBytes(24).toString("base64url");
}

export function sealSession(session: SessionPayload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSessionKey(), iv);
  const payload = Buffer.from(JSON.stringify(session), "utf8");
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv, tag, encrypted].map(encode).join(".");
}

export function unsealSession(value: string) {
  try {
    const [iv, tag, encrypted] = value.split(".");

    if (!iv || !tag || !encrypted) {
      return null;
    }

    const decipher = createDecipheriv("aes-256-gcm", getSessionKey(), decode(iv));
    decipher.setAuthTag(decode(tag));
    const payload = Buffer.concat([
      decipher.update(decode(encrypted)),
      decipher.final(),
    ]);
    const parsed = JSON.parse(payload.toString("utf8")) as SessionPayload;

    if (!parsed.accessToken || !parsed.refreshToken || !parsed.user?.userId) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function setSessionCookie(response: NextResponse, session: SessionPayload) {
  response.cookies.set(SESSION_COOKIE_NAME, sealSession(session), cookieOptions(60 * 60 * 24 * 30));
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.delete(SESSION_COOKIE_NAME);
  response.cookies.delete(OAUTH_STATE_COOKIE_NAME);
}

export function setOauthStateCookie(response: NextResponse, state: string) {
  response.cookies.set(OAUTH_STATE_COOKIE_NAME, state, cookieOptions(60 * 10));
}

export function clearOauthStateCookie(response: NextResponse) {
  response.cookies.delete(OAUTH_STATE_COOKIE_NAME);
}

export function getSessionFromRequest(request: NextRequest) {
  const value = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return value ? unsealSession(value) : null;
}

export async function getSessionFromCookies() {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE_NAME)?.value;
  return value ? unsealSession(value) : null;
}

export function getOauthStateFromRequest(request: NextRequest) {
  return request.cookies.get(OAUTH_STATE_COOKIE_NAME)?.value ?? null;
}

export function isSessionExpiringSoon(session: SessionPayload, withinSeconds = 90) {
  return session.expiresAt <= Date.now() + withinSeconds * 1000;
}
