import { getSecondMeRedirectUri } from "@/lib/app-config";
import type {
  ActionPlan,
  AgentParticipant,
  AgentTurn,
  AnalysisResult,
  DiscussionGoal,
  SearchEvidence,
  SessionPayload,
  SessionUser,
  Topic,
  UserContext,
} from "@/lib/types";

type WrappedResponse<T> = {
  code: number;
  message?: string;
  data?: T;
};

type TokenResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  scope?: string[];
};

type RoomActSummary = {
  discussionGoal?: Partial<DiscussionGoal>;
  outcomeHeadline?: string;
  keyTension?: string;
  consensus?: string[];
  conflicts?: string[];
  openQuestions?: string[];
  whoToAsk?: Array<{
    agentId?: string;
    agentName?: string;
    why?: string;
    whenToAsk?: string;
  }>;
  recommendedNextStep?: string;
  followUpTargetId?: string;
  followUpPrompt?: string;
  actionPlan?: Partial<ActionPlan>;
};

type RoomActResponse = {
  turns: Array<{
    agentId: string;
    round: number;
    kind: AgentTurn["kind"];
    message: string;
    evidence: string[];
    sourceIds?: string[];
  }>;
  summary: RoomActSummary;
};

type FollowUpActResponse = {
  reply: string;
  evidence: string[];
  sourceIds?: string[];
  suggestion: string;
};

const DEFAULT_API_BASE_URL = "https://api.mindverse.com/gate/lab";
const DEFAULT_OAUTH_URL = "https://go.second.me/oauth/";

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function apiBaseUrl() {
  return process.env.SECONDME_API_BASE_URL ?? DEFAULT_API_BASE_URL;
}

function oauthUrl() {
  return process.env.SECONDME_OAUTH_URL ?? DEFAULT_OAUTH_URL;
}

function tokenEndpoint() {
  return process.env.SECONDME_TOKEN_ENDPOINT ?? `${apiBaseUrl()}/api/oauth/token/code`;
}

function refreshEndpoint() {
  return process.env.SECONDME_REFRESH_ENDPOINT ?? `${apiBaseUrl()}/api/oauth/token/refresh`;
}

function clientId() {
  return requiredEnv("SECONDME_CLIENT_ID");
}

function clientSecret() {
  return requiredEnv("SECONDME_CLIENT_SECRET");
}

function redirectUri() {
  return getSecondMeRedirectUri();
}

async function parseWrappedResponse<T>(response: Response) {
  const payload = (await response.json()) as WrappedResponse<T>;

  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw new Error(payload.message ?? "SecondMe request failed");
  }

  return payload.data;
}

async function fetchWrapped<T>(path: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  return parseWrappedResponse<T>(response);
}

function normalizeUserInfo(data: Record<string, unknown>): SessionUser {
  return {
    userId: String(data.userId ?? ""),
    name: String(data.name ?? "SecondMe 用户"),
    route: typeof data.route === "string" ? data.route : undefined,
    avatar: typeof data.avatar === "string" ? data.avatar : undefined,
    bio: typeof data.bio === "string" ? data.bio : undefined,
    selfIntroduction:
      typeof data.selfIntroduction === "string" ? data.selfIntroduction : undefined,
  };
}

function normalizeShades(data: unknown) {
  const raw: unknown[] = (() => {
    if (
      data &&
      typeof data === "object" &&
      "shades" in data &&
      Array.isArray((data as { shades?: unknown[] }).shades)
    ) {
      return (data as { shades: unknown[] }).shades;
    }

    return Array.isArray(data) ? data : [];
  })();

  return raw
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return (
          (typeof record.name === "string" && record.name) ||
          (typeof record.label === "string" && record.label) ||
          (typeof record.title === "string" && record.title) ||
          (typeof record.content === "string" && record.content) ||
          ""
        );
      }

      return "";
    })
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeSoftMemory(data: unknown) {
  const raw: unknown[] = (() => {
    if (
      data &&
      typeof data === "object" &&
      "list" in data &&
      Array.isArray((data as { list?: unknown[] }).list)
    ) {
      return (data as { list: unknown[] }).list;
    }

    return Array.isArray(data) ? data : [];
  })();

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const title =
        (typeof record.title === "string" && record.title) ||
        (typeof record.keyword === "string" && record.keyword) ||
        (typeof record.tag === "string" && record.tag) ||
        "记忆片段";
      const summary =
        (typeof record.summary === "string" && record.summary) ||
        (typeof record.content === "string" && record.content) ||
        (typeof record.text === "string" && record.text) ||
        (typeof record.memory === "string" && record.memory) ||
        "";

      if (!summary) {
        return null;
      }

      return {
        title,
        summary: summary.slice(0, 120),
      };
    })
    .filter((item): item is { title: string; summary: string } => Boolean(item))
    .slice(0, 6);
}

function readStreamContentLine(line: string) {
  try {
    const parsed = JSON.parse(line) as {
      choices?: Array<{ delta?: { content?: string } }>;
    };
    return parsed.choices?.[0]?.delta?.content ?? "";
  } catch {
    return "";
  }
}

function extractJsonObject(content: string) {
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("Act API did not return JSON");
  }

  return content.slice(firstBrace, lastBrace + 1);
}

function describeUserContext(context?: UserContext) {
  if (!context) {
    return "当前用户未登录 SecondMe，请优先围绕公共议题进行讨论。";
  }

  const shades = context.shades.length ? context.shades.join("、") : "暂无";
  const memory =
    context.softMemory.length > 0
      ? context.softMemory
          .slice(0, 3)
          .map((item) => `${item.title}：${item.summary}`)
          .join("；")
      : "暂无";

  return [
    `围观用户：${context.user.name}`,
    `兴趣标签：${shades}`,
    `相关软记忆：${memory}`,
  ].join("\n");
}

function describeSearchEvidence(searchEvidence: SearchEvidence[]) {
  if (!searchEvidence.length) {
    return "暂无知乎可信搜证据。";
  }

  return searchEvidence
    .map((item) => {
      const meta = [
        item.author ? `作者：${item.author}` : "",
        item.authorityLevel ? `authority_level：${item.authorityLevel}` : "",
        `来源：${item.sourceLabel}`,
      ]
        .filter(Boolean)
        .join("｜");

      return [
        `${item.id}`,
        `标题：${item.title}`,
        `摘要：${item.summary}`,
        meta,
        item.featuredComment ? `精选评论：${item.featuredComment}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

export async function runStructuredAct<T>(
  accessToken: string,
  message: string,
  actionControl: string,
) {
  const response = await fetch(`${apiBaseUrl()}/api/secondme/act/stream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      actionControl,
    }),
    cache: "no-store",
  });

  if (!response.ok || !response.body) {
    throw new Error("Act API request failed");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let combined = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    const lines = decoder.decode(value, { stream: true }).split("\n");

    for (const line of lines) {
      if (!line.startsWith("data: ")) {
        continue;
      }

      const data = line.slice(6).trim();

      if (!data || data === "[DONE]") {
        continue;
      }

      combined += readStreamContentLine(data);
    }
  }

  return JSON.parse(extractJsonObject(combined)) as T;
}

export function buildAuthorizationUrl(state: string) {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    state,
  });

  return `${oauthUrl()}?${params.toString()}`;
}

export async function exchangeCodeForSession(code: string): Promise<SessionPayload> {
  const response = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: clientId(),
      client_secret: clientSecret(),
    }),
    cache: "no-store",
  });

  const token = await parseWrappedResponse<TokenResponse>(response);
  const userInfo = await fetchWrapped<Record<string, unknown>>(
    "/api/secondme/user/info",
    token.accessToken,
  );

  return {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: Date.now() + token.expiresIn * 1000,
    user: normalizeUserInfo(userInfo),
  };
}

export async function refreshSession(session: SessionPayload): Promise<SessionPayload> {
  const response = await fetch(refreshEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
    }),
    cache: "no-store",
  });

  const token = await parseWrappedResponse<TokenResponse>(response);

  return {
    ...session,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken || session.refreshToken,
    expiresAt: Date.now() + token.expiresIn * 1000,
  };
}

export async function fetchUserContext(accessToken: string, fallbackUser?: SessionUser) {
  const [infoResult, shadesResult, memoryResult] = await Promise.allSettled([
    fetchWrapped<Record<string, unknown>>("/api/secondme/user/info", accessToken),
    fetchWrapped<unknown>("/api/secondme/user/shades", accessToken),
    fetchWrapped<unknown>("/api/secondme/user/softmemory?pageNo=1&pageSize=6", accessToken),
  ]);

  const user =
    infoResult.status === "fulfilled"
      ? normalizeUserInfo(infoResult.value)
      : fallbackUser ?? {
          userId: "unknown",
          name: "SecondMe 用户",
        };

  return {
    user,
    shades: shadesResult.status === "fulfilled" ? normalizeShades(shadesResult.value) : [],
    softMemory:
      memoryResult.status === "fulfilled" ? normalizeSoftMemory(memoryResult.value) : [],
  } satisfies UserContext;
}

function buildDecisionMessage(question: string, context: UserContext) {
  const shades = context.shades.length ? context.shades.join("、") : "暂无可用标签";
  const memory =
    context.softMemory.length > 0
      ? context.softMemory
          .map((item, index) => `${index + 1}. ${item.title}：${item.summary}`)
          .join("\n")
      : "暂无可用软记忆";

  return [
    "应用名：讨论实验室",
    `用户名称：${context.user.name}`,
    `用户自我介绍：${context.user.selfIntroduction ?? context.user.bio ?? "暂无"}`,
    `用户兴趣标签：${shades}`,
    `用户软记忆：\n${memory}`,
    `用户问题：${question}`,
    "请基于这些信息，判断这个问题更应该听谁、别先信谁，并给出可立即执行的下一步建议。",
  ].join("\n\n");
}

function buildDecisionActionControl() {
  return [
    "你是“讨论实验室”的判断引擎。",
    "仅输出合法 JSON 对象，不要解释，不要 Markdown，不要代码块。",
    "请使用中文输出。",
    "输出结构：",
    JSON.stringify(
      {
        questionType: "问题类型",
        shouldListenTo: [
          {
            who: "应该优先听的第一类人",
            reason: "原因",
          },
          {
            who: "应该优先听的第二类人",
            reason: "原因",
          },
          {
            who: "应该优先听的第三类人",
            reason: "原因",
          },
        ],
        avoidFirst: [
          {
            who: "不建议先信的类型",
            reason: "原因",
          },
        ],
        nextStep: {
          who: "下一步应该找谁问",
          why: "为什么先找这类人",
          prompt: "可以直接复制去问对方的一句话",
        },
        confidenceNote: "一句提醒，说明判断的边界或注意事项",
      },
      null,
      2,
    ),
    "要求：shouldListenTo 固定返回 3 项，avoidFirst 返回 1 到 2 项，所有 reason 都要具体。",
  ].join("\n");
}

function buildRoomMessage(
  topic: Topic,
  participants: AgentParticipant[],
  searchEvidence: SearchEvidence[],
  context?: UserContext,
) {
  const participantLines = participants
    .map(
      (item) =>
        `- ${item.id} / ${item.name}：${item.role}；立场：${item.stance}；来源：${item.source.displayName}（${item.source.descriptor}）；为何选它：${item.source.whySelected}`,
    )
    .join("\n");

  return [
    "你要模拟一场面向真实决策的多代理讨论实验室。",
    `议题标题：${topic.title}`,
    `议题摘要：${topic.summary}`,
    `热榜首条回答摘要：${topic.leadAnswer ?? "暂无"}`,
    `热度：${topic.heat}`,
    `标签：${topic.tags.join("、") || "暂无"}`,
    `来源：${topic.sourceLabel}`,
    "参与代理如下：",
    participantLines,
    describeUserContext(context),
    "以下是供代理引用的知乎可信搜证据池：",
    describeSearchEvidence(searchEvidence),
    "请让代理之间真实互相回应、补充和质疑，而不是各说各话。",
  ].join("\n\n");
}

function buildRoomActionControl(participants: AgentParticipant[], searchEvidence: SearchEvidence[]) {
  return [
    "你是讨论实验室的编排器。",
    "仅输出合法 JSON 对象，不要解释，不要 Markdown。",
    "请用中文输出。",
    "必须让代理之间出现引用、反驳、补充、纠偏和收束，体现真实 A2A 过程。",
    `agentId 只能使用以下值：${participants.map((item) => item.id).join("、")}`,
    `sourceIds 只能使用以下值：${searchEvidence.map((item) => item.id).join("、") || "无"}`,
    "输出结构：",
    JSON.stringify(
      {
        turns: [
          {
            agentId: participants[0]?.id ?? "agent_1",
            round: 1,
            kind: "opening",
            message: "代理发言内容",
            evidence: ["发言依据一", "发言依据二"],
            sourceIds: [searchEvidence[0]?.id ?? "source_1"],
          },
        ],
        summary: {
          discussionGoal: {
            headline: "这场讨论要解决什么",
            userNeed: "用户真正想拿走什么",
            successSignal: "什么结果算讨论成功",
            personalizedAngle: "这场讨论如何结合用户处境",
          },
          outcomeHeadline: "一句话给出本场讨论收束后的结论",
          keyTension: "一句话说明这场争论真正的冲突是什么",
          consensus: ["已形成的第一条共识", "已形成的第二条共识", "已形成的第三条共识"],
          conflicts: ["尚未完全解决的第一条分歧", "尚未完全解决的第二条分歧"],
          openQuestions: ["下一轮还需要补的第一个问题", "下一轮还需要补的第二个问题"],
          whoToAsk: [
            {
              agentId: participants[0]?.id ?? "agent_1",
              agentName: participants[0]?.name ?? "代理一",
              why: "为什么先找这个代理",
              whenToAsk: "什么时候应该先问它",
            },
            {
              agentId: participants[1]?.id ?? "agent_2",
              agentName: participants[1]?.name ?? "代理二",
              why: "为什么第二个找它",
              whenToAsk: "什么时候应该补问它",
            },
            {
              agentId: participants[2]?.id ?? "agent_3",
              agentName: participants[2]?.name ?? "代理三",
              why: "为什么最后找它",
              whenToAsk: "什么时候适合收束时问它",
            },
          ],
          recommendedNextStep: "用户现在最值得执行的下一步",
          followUpTargetId: participants[0]?.id ?? "agent_1",
          followUpPrompt: "用户下一步可以直接追问该代理的一句话",
          actionPlan: {
            headline: "把本场讨论沉淀成什么行动方案",
            firstMove: "用户现在第一步该做什么",
            steps: [
              {
                title: "行动步骤一",
                why: "为什么先做这一步",
                howToStart: "怎么启动",
                risk: "最大的风险",
                owner: "谁来做",
              },
              {
                title: "行动步骤二",
                why: "为什么接着做这一步",
                howToStart: "怎么启动",
                risk: "最大的风险",
                owner: "谁来做",
              },
              {
                title: "行动步骤三",
                why: "为什么最后做这一步",
                howToStart: "怎么启动",
                risk: "最大的风险",
                owner: "谁来做",
              },
            ],
            riskChecks: ["需要警惕的风险一", "需要警惕的风险二", "需要警惕的风险三"],
            validationQuestions: ["需要验证的问题一", "需要验证的问题二", "需要验证的问题三"],
          },
        },
      },
      null,
      2,
    ),
    "要求：",
    "- turns 固定返回 6 条。",
    "- 至少包含 1 条 challenge 和 1 条 bridge。",
    "- 每条 message 60 到 110 个中文字符。",
    "- 每条 turns 至少引用 1 条 sourceIds。",
    "- evidence 返回 1 到 2 条，必须具体，不要空泛。",
    "- summary 必须体现讨论目标、收束结论、未解分歧和行动方案，而不是只给观点总结。",
    "- whoToAsk 必须返回 3 项，明确先问谁、为什么问、什么时候问。",
  ].join("\n");
}

function buildFollowUpMessage(
  topic: Topic,
  participant: AgentParticipant,
  turns: AgentTurn[],
  question: string,
  searchEvidence: SearchEvidence[],
  context?: UserContext,
) {
  const discussion = turns
    .slice(-4)
    .map((turn) => `${turn.agentName}：${turn.message}`)
    .join("\n");

  return [
    `当前议题：${topic.title}`,
    `议题摘要：${topic.summary}`,
    `热榜首条回答摘要：${topic.leadAnswer ?? "暂无"}`,
    `用户选中的追问对象：${participant.name}，角色：${participant.role}，立场：${participant.stance}`,
    `最近几轮讨论：\n${discussion}`,
    describeUserContext(context),
    "以下是补充的知乎可信搜证据池：",
    describeSearchEvidence(searchEvidence),
    `用户追问：${question}`,
    "请你代表这个代理，基于现有讨论、自身立场和知乎证据给出一次回应。",
  ].join("\n\n");
}

function buildFollowUpActionControl(searchEvidence: SearchEvidence[]) {
  return [
    "你要代表指定代理回答追问。",
    "仅输出合法 JSON 对象，不要解释，不要 Markdown。",
    "请用中文输出。",
    `sourceIds 只能使用以下值：${searchEvidence.map((item) => item.id).join("、") || "无"}`,
    "输出结构：",
    JSON.stringify(
      {
        reply: "代理的回答内容",
        evidence: ["引用讨论中的依据", "补充的新依据"],
        sourceIds: [searchEvidence[0]?.id ?? "source_1"],
        suggestion: "建议用户接下来怎么继续问或怎么验证",
      },
      null,
      2,
    ),
    "要求：reply 80 到 140 个中文字符，sourceIds 至少返回 1 条。",
  ].join("\n");
}

export async function runDecisionAnalysis(accessToken: string, question: string, context: UserContext) {
  const parsed = await runStructuredAct<AnalysisResult>(
    accessToken,
    buildDecisionMessage(question, context),
    buildDecisionActionControl(),
  );

  return {
    questionType: parsed.questionType,
    shouldListenTo: parsed.shouldListenTo.slice(0, 3),
    avoidFirst: parsed.avoidFirst.slice(0, 2),
    nextStep: parsed.nextStep,
    confidenceNote: parsed.confidenceNote,
  } satisfies AnalysisResult;
}

export async function generateDiscussionRoom(
  accessToken: string,
  topic: Topic,
  participants: AgentParticipant[],
  searchEvidence: SearchEvidence[],
  context?: UserContext,
) {
  return runStructuredAct<RoomActResponse>(
    accessToken,
    buildRoomMessage(topic, participants, searchEvidence, context),
    buildRoomActionControl(participants, searchEvidence),
  );
}

export async function generateFollowUpReply(
  accessToken: string,
  topic: Topic,
  participant: AgentParticipant,
  turns: AgentTurn[],
  question: string,
  searchEvidence: SearchEvidence[],
  context?: UserContext,
) {
  return runStructuredAct<FollowUpActResponse>(
    accessToken,
    buildFollowUpMessage(topic, participant, turns, question, searchEvidence, context),
    buildFollowUpActionControl(searchEvidence),
  );
}
