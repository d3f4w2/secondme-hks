import { NextRequest, NextResponse } from "next/server";

import { createRoomForTopic } from "@/lib/rooms";
import { resolveRequestContext } from "@/lib/route-session";
import { setSessionCookie } from "@/lib/session";
import { getHotTopics } from "@/lib/zhihu";

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as {
    topicId?: string;
  };

  if (!payload.topicId) {
    return NextResponse.json({ error: "缺少 topicId。" }, { status: 400 });
  }

  const topicsPayload = await getHotTopics();
  const topic = topicsPayload.topics.find((item) => item.id === payload.topicId);

  if (!topic) {
    return NextResponse.json({ error: "未找到对应话题。" }, { status: 404 });
  }

  const requestContext = await resolveRequestContext(request);
  const room = await createRoomForTopic({
    topic,
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
}
