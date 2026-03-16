import { NextRequest, NextResponse } from "next/server";

import { fetchUserContext, refreshSession } from "@/lib/secondme";
import {
  getSessionFromRequest,
  isSessionExpiringSoon,
  setSessionCookie,
} from "@/lib/session";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const activeSession = isSessionExpiringSoon(session)
      ? await refreshSession(session)
      : session;
    const userContext = await fetchUserContext(activeSession.accessToken, activeSession.user);
    const response = NextResponse.json({ userContext });

    if (activeSession !== session) {
      setSessionCookie(response, activeSession);
    }

    return response;
  } catch {
    return NextResponse.json(
      { error: "授权数据同步失败，请重新登录 SecondMe。" },
      { status: 502 },
    );
  }
}
