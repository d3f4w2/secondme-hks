import { NextResponse } from "next/server";

import { getHotTopics } from "@/lib/zhihu";

export async function GET() {
  try {
    const payload = await getHotTopics();
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "获取知乎热榜失败。" },
      { status: 502 },
    );
  }
}
