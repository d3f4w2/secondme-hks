import { fetchUserContext, refreshSession } from "@/lib/secondme";
import { getSessionFromRequest, isSessionExpiringSoon } from "@/lib/session";
import type { SessionPayload, UserContext } from "@/lib/types";
import type { NextRequest } from "next/server";

export async function resolveRequestContext(request: NextRequest): Promise<{
  initialSession: SessionPayload | null;
  activeSession: SessionPayload | null;
  userContext: UserContext | null;
}> {
  const session = getSessionFromRequest(request);

  if (!session) {
    return {
      initialSession: null,
      activeSession: null,
      userContext: null,
    };
  }

  const activeSession = isSessionExpiringSoon(session)
    ? await refreshSession(session)
    : session;
  const userContext = await fetchUserContext(activeSession.accessToken, activeSession.user).catch(
    () => null,
  );

  return {
    initialSession: session,
    activeSession,
    userContext,
  };
}
