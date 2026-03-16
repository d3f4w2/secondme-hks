import { NextRequest, NextResponse } from "next/server";

import { clearSessionCookie } from "@/lib/session";

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url));

  clearSessionCookie(response);

  return response;
}
