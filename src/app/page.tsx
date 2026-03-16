import { HotRoomShell } from "@/components/hot-room-shell";
import { getSessionFromCookies } from "@/lib/session";

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveStatusMessage(searchParams: SearchParams) {
  const connected = firstValue(searchParams.connected);
  const error = firstValue(searchParams.error);

  if (connected === "1") {
    return {
      type: "success" as const,
      text: "SecondMe 已连接，你现在可以围观并追问热榜讨论房。",
    };
  }

  if (!error) {
    return undefined;
  }

  const messages: Record<string, string> = {
    oauth_denied: "SecondMe 授权被取消了，可以重新发起登录。",
    missing_code: "回调里没有收到授权码，请重新登录一次。",
    invalid_state: "登录状态校验失败，请重新发起授权。",
    callback_failed: "处理授权回调时失败了，请稍后重试。",
  };

  return {
    type: "error" as const,
    text: messages[error] ?? "授权过程失败了，请重新发起登录。",
  };
}

export default async function Home(props: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const searchParams = await Promise.resolve(props.searchParams ?? {});
  const session = await getSessionFromCookies();

  return (
    <HotRoomShell
      initialUser={session?.user ?? null}
      statusMessage={resolveStatusMessage(searchParams)}
    />
  );
}
