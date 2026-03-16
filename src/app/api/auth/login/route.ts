import { NextRequest, NextResponse } from "next/server";

import { buildAuthorizationUrl } from "@/lib/secondme";
import { createOauthState, setOauthStateCookie } from "@/lib/session";

export async function GET(_request: NextRequest) {
  const state = createOauthState();
  const response = NextResponse.redirect(buildAuthorizationUrl(state));

  setOauthStateCookie(response, state);

  return response;
}
