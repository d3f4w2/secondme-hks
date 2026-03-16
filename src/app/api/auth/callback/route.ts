import { NextRequest, NextResponse } from "next/server";

import { exchangeCodeForSession } from "@/lib/secondme";
import {
  clearOauthStateCookie,
  getOauthStateFromRequest,
  setSessionCookie,
} from "@/lib/session";

function redirectToHome(request: NextRequest, error?: string) {
  const url = new URL("/", request.url);

  if (error) {
    url.searchParams.set("error", error);
  } else {
    url.searchParams.set("connected", "1");
  }

  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return redirectToHome(request, "oauth_denied");
  }

  if (!code) {
    return redirectToHome(request, "missing_code");
  }

  const storedState = getOauthStateFromRequest(request);

  if (!storedState || storedState !== state) {
    return redirectToHome(request, "invalid_state");
  }

  try {
    const session = await exchangeCodeForSession(code);
    const response = redirectToHome(request);

    clearOauthStateCookie(response);
    setSessionCookie(response, session);

    return response;
  } catch {
    return redirectToHome(request, "callback_failed");
  }
}
