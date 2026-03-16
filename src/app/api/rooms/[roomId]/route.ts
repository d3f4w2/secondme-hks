import { NextRequest, NextResponse } from "next/server";

import { getRoomById } from "@/lib/rooms";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await context.params;
  const room = getRoomById(roomId);

  if (!room) {
    return NextResponse.json({ error: "房间不存在。" }, { status: 404 });
  }

  return NextResponse.json({ room });
}
