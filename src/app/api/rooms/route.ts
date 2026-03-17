import { NextRequest, NextResponse } from "next/server";

import { createRoomForTopic } from "@/lib/rooms";
import { resolveRequestContext } from "@/lib/route-session";
import { setSessionCookie } from "@/lib/session";
import { createTopicFromQuestion, getHotTopics } from "@/lib/zhihu";

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as {
    topicId?: string;
    question?: string;
  };

  if (!payload.topicId && !payload.question?.trim()) {
    return NextResponse.json({ error: "缺少 topicId 或 question。" }, { status: 400 });
  }

  const requestContext = await resolveRequestContext(request);
  let topic;
  let evidence;

  if (payload.question?.trim()) {
    const questionPayload = await createTopicFromQuestion(payload.question.trim());
    topic = questionPayload.topic;
    evidence = questionPayload.evidence;
  } else {
    const topicsPayload = await getHotTopics();
    topic = topicsPayload.topics.find((item) => item.id === payload.topicId);

    if (!topic) {
      return NextResponse.json({ error: "未找到对应话题。" }, { status: 404 });
    }
  }

  const room = await createRoomForTopic({
    topic,
    searchEvidence: evidence,
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
