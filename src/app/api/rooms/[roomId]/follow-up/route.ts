import { NextRequest, NextResponse } from "next/server";

import { appendFollowUpToRoom } from "@/lib/rooms";
import { resolveRequestContext } from "@/lib/route-session";
import { setSessionCookie } from "@/lib/session";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await context.params;
  const payload = (await request.json()) as {
    agentId?: string;
    question?: string;
  };

  if (!payload.agentId || !payload.question?.trim()) {
    return NextResponse.json({ error: "追问对象和内容都不能为空。" }, { status: 400 });
  }

  const requestContext = await resolveRequestContext(request);

  try {
    const room = await appendFollowUpToRoom({
      roomId,
      agentId: payload.agentId,
      question: payload.question.trim(),
      accessToken: requestContext.activeSession?.accessToken,
      userContext: requestContext.userContext ?? undefined,
    });
    const response = NextResponse.json({ room });

    if (
      requestContext.initialSession &&
      requestContext.activeSession &&
      requestContext.initialSession !== requestContext.activeSession
    ) {
      setSessionCookie(response, requestContext.activeSession);
    }

    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "ROOM_NOT_FOUND") {
      return NextResponse.json({ error: "房间不存在。" }, { status: 404 });
    }

    return NextResponse.json({ error: "追问失败，请稍后再试。" }, { status: 502 });
  }
}
