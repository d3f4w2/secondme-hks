import { NextRequest, NextResponse } from "next/server";

import { fetchUserContext, refreshSession, runDecisionAnalysis } from "@/lib/secondme";
import {
  getSessionFromRequest,
  isSessionExpiringSoon,
  setSessionCookie,
} from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "请先完成 SecondMe 授权。" }, { status: 401 });
  }

  const payload = (await request.json()) as {
    question?: string;
  };
  const question = payload.question?.trim();

  if (!question) {
    return NextResponse.json({ error: "请输入你想判断的问题。" }, { status: 400 });
  }

  if (question.length > 800) {
    return NextResponse.json({ error: "问题太长了，先控制在 800 字以内。" }, { status: 400 });
  }

  try {
    const activeSession = isSessionExpiringSoon(session)
      ? await refreshSession(session)
      : session;
    const userContext = await fetchUserContext(activeSession.accessToken, activeSession.user);
    const result = await runDecisionAnalysis(activeSession.accessToken, question, userContext);
    const response = NextResponse.json({ result });

    if (activeSession !== session) {
      setSessionCookie(response, activeSession);
    }

    return response;
  } catch {
    return NextResponse.json(
      { error: "这次判断没跑通，请检查 OAuth scope 或稍后重试。" },
      { status: 502 },
    );
  }
}
