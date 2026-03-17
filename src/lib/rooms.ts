import { randomUUID } from "node:crypto";

import { generateDiscussionRoom, generateFollowUpReply } from "@/lib/secondme";
import { getCredibleSearchEvidence } from "@/lib/zhihu";
import type {
  ActionPlan,
  ActionPlanStep,
  AgentParticipant,
  AgentTurn,
  ArgumentEdge,
  ArgumentNode,
  DiscussionGoal,
  FollowUpRecord,
  RoomState,
  RoomSummary,
  SearchEvidence,
  Topic,
  TopicSource,
  UserContext,
} from "@/lib/types";

type RoomStoreShape = {
  rooms: Map<string, RoomState>;
};

declare global {
  var __zhaoshuiRooms: RoomStoreShape | undefined;
}

function getRoomStore() {
  if (!globalThis.__zhaoshuiRooms) {
    globalThis.__zhaoshuiRooms = {
      rooms: new Map<string, RoomState>(),
    };
  }

  return globalThis.__zhaoshuiRooms.rooms;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readMaybeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringList(value: unknown, fallback: string[], max = fallback.length || 3) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value
    .map((item) => (typeof item === "string" && item.trim() ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, max);

  return items.length ? items : fallback;
}

const PARTICIPANT_TEMPLATES: Array<
  Omit<AgentParticipant, "name" | "source">
> = [
  {
    id: "field_operator",
    role: "把问题拖回现场门槛的人",
    stance: "先讲真实门槛、资源条件和可执行性",
    persona: "离现场最近，不追求好听，优先说清第一步会卡在哪里。",
    debateStyle: "喜欢拿真实门槛和具体操作拆穿空泛结论。",
    contribution: "负责把讨论拉回现实约束和最低可行动作。",
    accent: "ochre",
  },
  {
    id: "mentor_recap",
    role: "把经验翻译成代价清单的人",
    stance: "擅长拆解阶段性得失和隐藏成本",
    persona: "经历过类似路径，习惯从得失和常见误判里给提醒。",
    debateStyle: "会追问时间、代价、样本偏差和心理预期。",
    contribution: "负责补齐路径成本、失败样本和复盘视角。",
    accent: "sage",
  },
  {
    id: "framework_writer",
    role: "把争论收束成判断框架的人",
    stance: "先定义判断标准，再给出次序和行动框架",
    persona: "不急着站队，先把问题拆成维度、顺序和验证方式。",
    debateStyle: "偏爱定义标准、梳理前提、收束共识。",
    contribution: "负责把分散观点压缩成可执行的论证结构。",
    accent: "ink",
  },
  {
    id: "risk_editor",
    role: "专门指出代价和盲区的人",
    stance: "优先暴露代价、反例、撤退条件和被忽略的风险",
    persona: "对热度、成功案例和情绪化叙事天然不信任。",
    debateStyle: "擅长质疑前提、举反例、追问最坏情况。",
    contribution: "负责提醒幸存者偏差和行动的止损条件。",
    accent: "red",
  },
];

function cleanAuthorName(author?: string) {
  if (!author) {
    return undefined;
  }

  return author.replace(/^答主@/, "").trim() || undefined;
}

function scoreEvidence(evidence: SearchEvidence) {
  return (evidence.voteUpCount ?? 0) * 2 + (evidence.commentCount ?? 0);
}

function buildAuthorBuckets(searchEvidence: SearchEvidence[]) {
  const buckets = new Map<
    string,
    {
      authorName: string;
      evidence: SearchEvidence[];
      score: number;
    }
  >();

  for (const item of searchEvidence) {
    const authorName = cleanAuthorName(item.author);

    if (!authorName) {
      continue;
    }

    const current = buckets.get(authorName);

    if (current) {
      current.evidence.push(item);
      current.score += scoreEvidence(item);
      continue;
    }

    buckets.set(authorName, {
      authorName,
      evidence: [item],
      score: scoreEvidence(item),
    });
  }

  return Array.from(buckets.values()).sort((left, right) => right.score - left.score);
}

function sourceDescriptor(evidence: SearchEvidence) {
  const parts = [
    evidence.contentType ? `知乎${evidence.contentType}` : "知乎回答",
    evidence.authorityLevel ? `authority_level:${evidence.authorityLevel}` : "",
  ].filter(Boolean);

  return parts.join(" · ");
}

function sourceReason(bucket: { authorName: string; evidence: SearchEvidence[] }, templateId: string) {
  const lead = bucket.evidence[0];

  switch (templateId) {
    case "field_operator":
      return `${bucket.authorName} 的内容更贴近一线经验，适合作为“先看真实门槛”的代表来源。`;
    case "mentor_recap":
      return `${bucket.authorName} 的内容更像经验复盘和路径总结，适合补齐代价与常见误判。`;
    case "framework_writer":
      return `${bucket.authorName} 的表达更适合被抽象成判断框架，用来压缩分歧。`;
    case "risk_editor":
      return `${bucket.authorName} 的内容更适合作为风险视角来源，用来提醒反例和止损条件。`;
    default:
      return `${bucket.authorName} 的知乎内容为该代理提供了主要参考。`;
  }
}

function buildSourceBoundParticipant(
  template: (typeof PARTICIPANT_TEMPLATES)[number],
  bucket?: {
    authorName: string;
    evidence: SearchEvidence[];
    score: number;
  },
): AgentParticipant {
  if (!bucket) {
    return {
      ...template,
      name: `答主@${template.role.replace(/的人$/, "")}`,
      source: {
        kind: "synthesized",
        displayName: "综合知乎讨论样本",
        descriptor: "综合角色代理",
        whySelected: "当前没有足够可区分的真实作者样本，因此保留为综合代理角色。",
        evidenceIds: [],
      },
    };
  }

  const lead = bucket.evidence[0];

  return {
    ...template,
    name: `答主@${bucket.authorName}`,
    persona: `${template.persona} 当前主要参考知乎用户 ${bucket.authorName} 的真实表达。`,
    source: {
      kind: "zhihu_author",
      displayName: bucket.authorName,
      descriptor: sourceDescriptor(lead),
      whySelected: sourceReason(bucket, template.id),
      evidenceIds: bucket.evidence.slice(0, 2).map((item) => item.id),
    },
  };
}

function createParticipants(_topic: Topic, searchEvidence: SearchEvidence[]): AgentParticipant[] {
  const authorBuckets = buildAuthorBuckets(searchEvidence);

  return PARTICIPANT_TEMPLATES.map((template, index) =>
    buildSourceBoundParticipant(template, authorBuckets[index]),
  );
}

function buildTurn(
  participant: AgentParticipant,
  round: number,
  kind: AgentTurn["kind"],
  message: string,
  evidence: string[],
  sourceIds: string[],
): AgentTurn {
  return {
    id: randomUUID(),
    agentId: participant.id,
    agentName: participant.name,
    role: participant.role,
    kind,
    round,
    message,
    evidence,
    sourceIds,
  };
}

function mergeSearchEvidence(existing: SearchEvidence[], incoming: SearchEvidence[]) {
  const map = new Map(existing.map((item) => [item.id, item]));

  for (const item of incoming) {
    map.set(item.id, item);
  }

  return Array.from(map.values());
}

function resolveSearchSource(searchEvidence: SearchEvidence[]): TopicSource {
  return searchEvidence.some((item) => item.source === "zhihu_api") ? "zhihu_api" : "mock";
}

function buildTopicSearchQuery(topic: Topic) {
  return [topic.originalQuestion ?? topic.title, topic.leadAnswer, ...topic.tags.slice(0, 2)]
    .filter(Boolean)
    .join(" ");
}

function buildFollowUpSearchQuery(topic: Topic, question: string, context?: UserContext) {
  return [
    topic.originalQuestion ?? topic.title,
    question,
    ...topic.tags.slice(0, 2),
    ...(context?.shades.slice(0, 2) ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}

function pickSourceIds(searchEvidence: SearchEvidence[], count = 2) {
  return searchEvidence.slice(0, count).map((item) => item.id);
}

function pickFollowUpTarget(participants: AgentParticipant[], preferredId?: string) {
  return (
    participants.find((item) => item.id === preferredId) ??
    participants.find((item) => item.id === "mentor_recap") ??
    participants[0]
  );
}

function buildWhoToAsk(participants: AgentParticipant[]) {
  const [first, second, third] = participants;

  return [first, second, third]
    .filter((item): item is AgentParticipant => Boolean(item))
    .map((participant, index) => ({
      agentId: participant.id,
      agentName: participant.name,
      why:
        index === 0
          ? `${participant.source.displayName} 代表了这类问题最值得先听的一线视角，能最快帮你确认真实门槛。`
          : index === 1
            ? `${participant.source.displayName} 更适合补齐路径成本和常见误判，避免只听到乐观叙事。`
            : `${participant.source.displayName} 更适合帮助你把零散观点压成判断框架，决定下一步怎么做。`,
      whenToAsk:
        index === 0
          ? "当你还没搞清楚第一步门槛时先问。"
          : index === 1
            ? "当你已经想行动，但还没算清代价时再问。"
            : "当你拿到若干信息后，需要收束判断时再问。",
    }));
}

function buildDiscussionGoal(topic: Topic, context?: UserContext): DiscussionGoal {
  const personalizedAngle = context
    ? [
        `这场讨论需要结合 ${context.user.name} 的兴趣标签和软记忆，而不是给一份公共模板。`,
        context.shades.length ? `当前优先参考的兴趣侧重：${context.shades.slice(0, 3).join("、")}` : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "先用公共视角把冲突拆清，再判断哪些前提需要用户补充。";

  return {
    headline: `围绕“${topic.title}”做一场能收束到行动的讨论，而不是继续堆观点。`,
    userNeed: "用户需要看清这件事现在值不值得做、先试什么、以及代价最可能从哪里冒出来。",
    successSignal: "讨论结束后，用户能拿走第一步动作、验证指标和最重要的止损条件。",
    personalizedAngle,
  };
}

function buildActionPlan(topic: Topic, searchEvidence: SearchEvidence[], context?: UserContext): ActionPlan {
  const firstEvidence = searchEvidence[0]?.title ?? "第一步门槛";
  const secondEvidence = searchEvidence[1]?.title ?? "路径代价";

  const steps: ActionPlanStep[] = [
    {
      id: "constraint-scan",
      title: "先写清你的真实边界",
      why: "这场讨论最大的分歧来自资源和代价假设不一致，先把边界写清，后面的建议才不会漂。",
      howToStart: "用 10 分钟列出你当前可投入的时间、预算、可接受试错次数，以及最不能承受的损失。",
      risk: "如果直接拿别人的成功路径套自己，最后会把“观点问题”误判成“能力问题”。",
      owner: context?.user.name ?? "你自己",
    },
    {
      id: "minimum-test",
      title: "做一次最低成本验证",
      why: `把讨论从抽象观点拉回事实，重点验证“${firstEvidence}”到底是不是你当前的真实门槛。`,
      howToStart: `在 72 小时内设计一个最小动作，只验证一个核心假设，例如先跑一轮试投、访谈、样本测试或最小原型。`,
      risk: "如果一口气投入太大，你会在还没获得反馈之前先被成本压垮。",
      owner: context?.user.name ?? "你自己",
    },
    {
      id: "promote-or-stop",
      title: "提前设定升级与止损条件",
      why: `讨论里最有价值的提醒不是鼓励，而是“什么时候继续、什么时候撤退”。用“${secondEvidence}”去定义标准。`,
      howToStart: "写下这轮验证成功的 2 个信号和必须停止的 2 个信号，做完后立刻复盘，不拖延到情绪发酵。",
      risk: "如果没有撤退条件，后续每一轮投入都会被情绪和沉没成本绑架。",
      owner: "你 + 讨论实验室",
    },
  ];

  return {
    headline: "把这场讨论沉淀成一轮可执行验证。",
    firstMove: "今天先把你的资源边界写清，然后只设计一个 72 小时内能完成的最小验证动作。",
    steps,
    riskChecks: [
      "不要把高赞样本默认当成可复制路径。",
      "不要在约束还没写清时做长期承诺。",
      "不要把一次试错的反馈和长期能力结论混为一谈。",
    ],
    validationQuestions: [
      "如果我现在就开始，第一步最可能暴露出的假设错误是什么？",
      "这件事失败一次之后，我还能承受继续验证的成本吗？",
      "如果结果一般，我是该继续迭代，还是该马上停下来换路径？",
    ],
  };
}

function buildDefaultSummary(
  topic: Topic,
  participants: AgentParticipant[],
  searchEvidence: SearchEvidence[],
  context?: UserContext,
  preferredTargetId?: string,
): RoomSummary {
  const followUpTarget = pickFollowUpTarget(participants, preferredTargetId);

  return {
    discussionGoal: buildDiscussionGoal(topic, context),
    outcomeHeadline: `先别急着表态，先用一次低成本验证，把“${topic.title}”从观点之争变成事实反馈。`,
    keyTension: "真正的冲突不在于观点站队，而在于第一步门槛、真实代价和撤退条件是否清楚。",
    consensus: [
      "先让离现场最近的人把第一步门槛说具体。",
      "每条建议都必须补齐时间、资源和失败代价。",
      "讨论的终点不是结论，而是一轮可以执行的验证动作。",
    ],
    conflicts: [
      "应该先行动拿反馈，还是继续补信息再行动。",
      "热度和高赞经验能否代表普通人的真实路径。",
    ],
    openQuestions: [
      "你的时间、预算和不可接受代价分别是什么？",
      "如果第一次试错结果一般，你会继续投入还是立即止损？",
    ],
    whoToAsk: buildWhoToAsk(participants),
    recommendedNextStep: "先完成一轮最小验证，再把结果带回讨论实验室继续收束下一步。",
    followUpTargetId: followUpTarget.id,
    followUpTargetName: followUpTarget.name,
    followUpPrompt: "如果我按这个路径先试一次，第一步最容易暴露出的假设错误是什么？我该怎么提前规避？",
    actionPlan: buildActionPlan(topic, searchEvidence, context),
  };
}

function normalizeGoal(value: unknown, fallback: DiscussionGoal): DiscussionGoal {
  if (!isRecord(value)) {
    return fallback;
  }

  return {
    headline: readMaybeString(value.headline) ?? fallback.headline,
    userNeed: readMaybeString(value.userNeed) ?? fallback.userNeed,
    successSignal: readMaybeString(value.successSignal) ?? fallback.successSignal,
    personalizedAngle: readMaybeString(value.personalizedAngle) ?? fallback.personalizedAngle,
  };
}

function normalizeActionPlan(value: unknown, fallback: ActionPlan): ActionPlan {
  if (!isRecord(value)) {
    return fallback;
  }

  const rawSteps = Array.isArray(value.steps) ? value.steps : [];
  const steps = fallback.steps.map((base, index) => {
    const raw = rawSteps[index];

    if (!isRecord(raw)) {
      return base;
    }

    return {
      id: base.id,
      title: readMaybeString(raw.title) ?? base.title,
      why: readMaybeString(raw.why) ?? base.why,
      howToStart: readMaybeString(raw.howToStart) ?? base.howToStart,
      risk: readMaybeString(raw.risk) ?? base.risk,
      owner: readMaybeString(raw.owner) ?? base.owner,
    };
  });

  return {
    headline: readMaybeString(value.headline) ?? fallback.headline,
    firstMove: readMaybeString(value.firstMove) ?? fallback.firstMove,
    steps,
    riskChecks: readStringList(value.riskChecks, fallback.riskChecks, 3),
    validationQuestions: readStringList(value.validationQuestions, fallback.validationQuestions, 3),
  };
}

function normalizeGeneratedSummary(
  topic: Topic,
  participants: AgentParticipant[],
  searchEvidence: SearchEvidence[],
  rawSummary: unknown,
  context?: UserContext,
): RoomSummary {
  const fallback = buildDefaultSummary(topic, participants, searchEvidence, context);

  if (!isRecord(rawSummary)) {
    return fallback;
  }

  const followUpTarget = pickFollowUpTarget(
    participants,
    readMaybeString(rawSummary.followUpTargetId) ?? fallback.followUpTargetId,
  );
  const rawWhoToAsk = Array.isArray(rawSummary.whoToAsk) ? rawSummary.whoToAsk : [];
  const fallbackWhoToAsk = fallback.whoToAsk;
  const whoToAsk = fallbackWhoToAsk.map((base, index) => {
    const raw = rawWhoToAsk[index];

    if (!isRecord(raw)) {
      return base;
    }

    return {
      agentId: readMaybeString(raw.agentId) ?? base.agentId,
      agentName: readMaybeString(raw.agentName) ?? base.agentName,
      why: readMaybeString(raw.why) ?? base.why,
      whenToAsk: readMaybeString(raw.whenToAsk) ?? base.whenToAsk,
    };
  });

  return {
    discussionGoal: normalizeGoal(rawSummary.discussionGoal, fallback.discussionGoal),
    outcomeHeadline: readMaybeString(rawSummary.outcomeHeadline) ?? fallback.outcomeHeadline,
    keyTension: readMaybeString(rawSummary.keyTension) ?? fallback.keyTension,
    consensus: readStringList(rawSummary.consensus, fallback.consensus, 3),
    conflicts: readStringList(rawSummary.conflicts, fallback.conflicts, 3),
    openQuestions: readStringList(rawSummary.openQuestions, fallback.openQuestions, 3),
    whoToAsk,
    recommendedNextStep:
      readMaybeString(rawSummary.recommendedNextStep) ?? fallback.recommendedNextStep,
    followUpTargetId: followUpTarget.id,
    followUpTargetName: followUpTarget.name,
    followUpPrompt: readMaybeString(rawSummary.followUpPrompt) ?? fallback.followUpPrompt,
    actionPlan: normalizeActionPlan(rawSummary.actionPlan, fallback.actionPlan),
  };
}

function typeForTurnKind(kind: AgentTurn["kind"]): ArgumentNode["type"] {
  if (kind === "challenge") {
    return "challenge";
  }

  if (kind === "bridge" || kind === "summary") {
    return "synthesis";
  }

  if (kind === "follow_up") {
    return "action";
  }

  return "claim";
}

function stageForTurnKind(kind: AgentTurn["kind"]): ArgumentNode["stage"] {
  if (kind === "opening") {
    return "brief";
  }

  if (kind === "challenge") {
    return "collision";
  }

  if (kind === "bridge" || kind === "summary") {
    return "resolution";
  }

  return "action";
}

function emphasisForTurn(turn: AgentTurn, participant: AgentParticipant): ArgumentNode["emphasis"] {
  if (turn.kind === "challenge" || participant.accent === "red") {
    return "risk";
  }

  if (turn.kind === "summary" || turn.kind === "follow_up") {
    return "core";
  }

  return "support";
}

function labelForRelation(relation: ArgumentEdge["relation"]) {
  switch (relation) {
    case "supports":
      return "支撑";
    case "rebuts":
      return "反驳";
    case "questions":
      return "追问";
    case "bridges":
      return "收束";
    case "grounds":
      return "引用";
    case "unlocks":
      return "导向";
    default:
      return "关联";
  }
}

function buildArgumentGraph(
  turns: AgentTurn[],
  participants: AgentParticipant[],
  searchEvidence: SearchEvidence[],
  summary: RoomSummary,
  followUps: FollowUpRecord[],
) {
  const nodes: ArgumentNode[] = [];
  const edges: ArgumentEdge[] = [];
  const participantMap = new Map(participants.map((item) => [item.id, item]));
  const evidenceMap = new Map(searchEvidence.map((item) => [item.id, item]));
  const evidenceNodeIds = new Map<string, string>();
  const questionNodeIds: string[] = [];
  const followUpByReplyId = new Map(
    followUps
      .filter((item) => item.replyTurnId)
      .map((item) => [item.replyTurnId as string, item]),
  );

  const goalNodeId = "goal-node";
  nodes.push({
    id: goalNodeId,
    type: "goal",
    stage: "brief",
    title: "讨论目标",
    summary: summary.discussionGoal.headline,
    order: 0,
    emphasis: "core",
    sourceIds: [],
  });

  let previousTurnNodeId: string | undefined;
  let lastClaimNodeId: string | undefined;
  let summaryTurnNodeId: string | undefined;
  let summaryTurnOrder = turns.length || 1;

  turns.forEach((turn, index) => {
    const participant = participantMap.get(turn.agentId) ?? participants[0];
    const turnOrder = index + 1;
    const questionRecord = followUpByReplyId.get(turn.id);
    let questionNodeId: string | undefined;

    if (questionRecord) {
      questionNodeId = `question:${questionRecord.id}`;
      nodes.push({
        id: questionNodeId,
        type: "question",
        stage: "action",
        title: `追问 · ${questionRecord.targetAgentName}`,
        summary: questionRecord.question,
        order: turnOrder - 0.15,
        emphasis: "support",
        sourceIds: [],
      });
      questionNodeIds.push(questionNodeId);
    }

    const nodeId = `turn:${turn.id}`;
    const nodeType = typeForTurnKind(turn.kind);
    const nodeStage = stageForTurnKind(turn.kind);
    const title =
      turn.kind === "summary"
        ? `收束 · ${turn.agentName}`
        : turn.kind === "follow_up"
          ? `回应 · ${turn.agentName}`
          : turn.agentName;

    nodes.push({
      id: nodeId,
      type: nodeType,
      stage: nodeStage,
      title,
      summary: turn.message,
      order: turnOrder,
      emphasis: emphasisForTurn(turn, participant),
      agentId: turn.agentId,
      agentName: turn.agentName,
      sourceIds: turn.sourceIds,
    });

    if (turn.kind === "opening") {
      edges.push({
        id: `edge:${goalNodeId}:${nodeId}`,
        from: goalNodeId,
        to: nodeId,
        relation: "unlocks",
        label: "拉开讨论",
        order: turnOrder,
      });
    } else if (turn.kind === "challenge" && lastClaimNodeId) {
      edges.push({
        id: `edge:${nodeId}:${lastClaimNodeId}`,
        from: nodeId,
        to: lastClaimNodeId,
        relation: "rebuts",
        label: "提出反驳",
        order: turnOrder,
      });
    } else if (turn.kind === "bridge" && previousTurnNodeId) {
      edges.push({
        id: `edge:${nodeId}:${previousTurnNodeId}`,
        from: nodeId,
        to: previousTurnNodeId,
        relation: "bridges",
        label: "尝试收束",
        order: turnOrder,
      });
    } else if (turn.kind === "summary" && previousTurnNodeId) {
      edges.push({
        id: `edge:${nodeId}:${previousTurnNodeId}`,
        from: nodeId,
        to: previousTurnNodeId,
        relation: "supports",
        label: "凝结前文",
        order: turnOrder,
      });
      summaryTurnNodeId = nodeId;
      summaryTurnOrder = turnOrder;
    } else if (questionNodeId) {
      edges.push({
        id: `edge:${questionNodeId}:${nodeId}`,
        from: questionNodeId,
        to: nodeId,
        relation: "questions",
        label: "继续追问",
        order: turnOrder,
      });
    } else if (previousTurnNodeId) {
      edges.push({
        id: `edge:${previousTurnNodeId}:${nodeId}`,
        from: previousTurnNodeId,
        to: nodeId,
        relation: "supports",
        label: "继续推进",
        order: turnOrder,
      });
    }

    for (const sourceId of turn.sourceIds) {
      const evidence = evidenceMap.get(sourceId);

      if (!evidence) {
        continue;
      }

      if (!evidenceNodeIds.has(sourceId)) {
        const evidenceNodeId = `evidence:${sourceId}`;
        evidenceNodeIds.set(sourceId, evidenceNodeId);
        nodes.push({
          id: evidenceNodeId,
          type: "evidence",
          stage: nodeStage,
          title: evidence.title,
          summary: evidence.summary,
          order: turnOrder - 0.05,
          emphasis: "support",
          sourceIds: [sourceId],
        });
      }

      const evidenceNodeId = evidenceNodeIds.get(sourceId) as string;
      edges.push({
        id: `edge:${evidenceNodeId}:${nodeId}`,
        from: evidenceNodeId,
        to: nodeId,
        relation: "grounds",
        label: labelForRelation("grounds"),
        order: turnOrder,
      });
    }

    previousTurnNodeId = nodeId;

    if (turn.kind !== "challenge" && turn.kind !== "follow_up") {
      lastClaimNodeId = nodeId;
    }
  });

  const decisionNodeId = "decision-node";
  nodes.push({
    id: decisionNodeId,
    type: "decision",
    stage: "resolution",
    title: "讨论收束",
    summary: summary.outcomeHeadline,
    order: summaryTurnOrder + 0.2,
    emphasis: "core",
    sourceIds: [],
  });

  if (summaryTurnNodeId) {
    edges.push({
      id: `edge:${summaryTurnNodeId}:${decisionNodeId}`,
      from: summaryTurnNodeId,
      to: decisionNodeId,
      relation: "supports",
      label: "形成结论",
      order: summaryTurnOrder + 0.2,
    });
  } else if (previousTurnNodeId) {
    edges.push({
      id: `edge:${previousTurnNodeId}:${decisionNodeId}`,
      from: previousTurnNodeId,
      to: decisionNodeId,
      relation: "supports",
      label: "导向结论",
      order: summaryTurnOrder + 0.2,
    });
  }

  const actionNodeId = "action-node";
  nodes.push({
    id: actionNodeId,
    type: "action",
    stage: "action",
    title: "行动方案",
    summary: summary.actionPlan.firstMove,
    order: summaryTurnOrder + 0.45,
    emphasis: "core",
    sourceIds: [],
  });
  edges.push({
    id: `edge:${decisionNodeId}:${actionNodeId}`,
    from: decisionNodeId,
    to: actionNodeId,
    relation: "unlocks",
    label: "导出行动",
    order: summaryTurnOrder + 0.45,
  });

  for (const questionNodeId of questionNodeIds) {
    edges.push({
      id: `edge:${actionNodeId}:${questionNodeId}`,
      from: actionNodeId,
      to: questionNodeId,
      relation: "unlocks",
      label: "继续深挖",
      order: summaryTurnOrder + 0.5,
    });
  }

  return {
    nodes: nodes.sort((left, right) => left.order - right.order),
    edges: edges.sort((left, right) => left.order - right.order),
  };
}

function composeRoomState(options: {
  id?: string;
  topic: Topic;
  participants: AgentParticipant[];
  turns: AgentTurn[];
  summary: RoomSummary;
  searchEvidence: SearchEvidence[];
  followUps?: FollowUpRecord[];
  source: "generated" | "mock";
  context?: UserContext;
  createdAt?: number;
}) {
  const followUps = options.followUps ?? [];
  const graph = buildArgumentGraph(
    options.turns,
    options.participants,
    options.searchEvidence,
    options.summary,
    followUps,
  );

  return {
    id: options.id ?? randomUUID(),
    topic: options.topic,
    participants: options.participants,
    turns: options.turns,
    summary: options.summary,
    argumentNodes: graph.nodes,
    argumentEdges: graph.edges,
    searchEvidence: options.searchEvidence,
    followUps,
    searchSource: resolveSearchSource(options.searchEvidence),
    source: options.source,
    createdAt: options.createdAt ?? Date.now(),
    personalizedFor: options.context?.user.name,
    status: "ready" as const,
  } satisfies RoomState;
}

function buildMockTurns(
  topic: Topic,
  participants: AgentParticipant[],
  searchEvidence: SearchEvidence[],
  context?: UserContext,
) {
  const [field, mentor, method, risk] = participants;
  const [sourceA, sourceB, sourceC] = searchEvidence;
  const userHint = context?.user.name ? `对 ${context.user.name} 这种用户来说，` : "";

  return [
    buildTurn(
      field,
      1,
      "opening",
      `我先把问题拖回现场：讨论“${topic.title}”时，第一步不是表态，而是搞清楚真正的门槛是不是就在眼前。先把第一步会卡在哪说具体，否则所有建议都只是观点装饰。`,
      [topic.title, sourceA?.title ?? "先找真实门槛"],
      pickSourceIds(searchEvidence, 2),
    ),
    buildTurn(
      mentor,
      1,
      "opening",
      "我同意先找门槛，但还得补成本。很多人听到成功经验就直接代入自己，结果半年后才发现真正消耗自己的不是能力，而是时间、反馈周期和资源空窗。",
      [sourceB?.summary ?? "先补路径成本", sourceB?.featuredComment ?? "不要只听成功样本"],
      sourceB ? [sourceB.id] : pickSourceIds(searchEvidence, 1),
    ),
    buildTurn(
      method,
      2,
      "challenge",
      "你们都在描述现象，但用户最后要的是决策，不是复述经验。我会先把判断标准定下来：门槛是否真实、代价是否可承受、验证周期是否足够短，然后再决定该不该做。",
      ["先定判断标准", sourceC?.title ?? "需要结构化框架"],
      sourceC ? [sourceC.id] : pickSourceIds(searchEvidence, 1),
    ),
    buildTurn(
      risk,
      2,
      "challenge",
      "我还要再加一刀：没有止损条件的建议，一律先降权。热度只会放大情绪，不会帮你承担代价。最危险的不是没开始，而是在没有撤退线的情况下越投越深。",
      [sourceA?.featuredComment ?? "警惕幸存者偏差", "没有撤退线就不是方案"],
      sourceA ? [sourceA.id] : pickSourceIds(searchEvidence, 1),
    ),
    buildTurn(
      field,
      3,
      "bridge",
      `${userHint}如果要把讨论变成动作，我建议先做一次最低成本验证：只验证第一步门槛，不先追求完整结果。能把第一步跑通的人，比继续围观更多观点的人更快接近真实答案。`,
      ["先做一次最小验证", sourceB?.title ?? "先跑通第一步"],
      pickSourceIds(searchEvidence, 2),
    ),
    buildTurn(
      method,
      3,
      "summary",
      "这场讨论可以先收束成一个实验室结论：别急着选立场，先用一轮短周期验证，把门槛、代价和止损线都写清。讨论的价值不是提供统一答案，而是提供下一步行动结构。",
      ["把冲突沉淀成行动结构", sourceC?.summary ?? "收束到行动"],
      pickSourceIds(searchEvidence, 2),
    ),
  ];
}

function buildMockRoom(
  topic: Topic,
  participants: AgentParticipant[],
  searchEvidence: SearchEvidence[],
  context?: UserContext,
) {
  const turns = buildMockTurns(topic, participants, searchEvidence, context);
  const summary = buildDefaultSummary(topic, participants, searchEvidence, context);

  return composeRoomState({
    topic,
    participants,
    turns,
    summary,
    searchEvidence,
    source: "mock",
    context,
  });
}

function hydrateGeneratedRoom(
  topic: Topic,
  participants: AgentParticipant[],
  searchEvidence: SearchEvidence[],
  generated: Awaited<ReturnType<typeof generateDiscussionRoom>>,
  context?: UserContext,
) {
  const participantMap = new Map(participants.map((item) => [item.id, item]));
  const fallbackSourceIds = pickSourceIds(searchEvidence, 2);
  const turns = generated.turns.map((turn) => {
    const participant = participantMap.get(turn.agentId) ?? participants[0];
    return buildTurn(
      participant,
      turn.round,
      turn.kind,
      turn.message,
      turn.evidence.slice(0, 2),
      (turn.sourceIds?.length ? turn.sourceIds : fallbackSourceIds).slice(0, 2),
    );
  });
  const summary = normalizeGeneratedSummary(
    topic,
    participants,
    searchEvidence,
    generated.summary,
    context,
  );

  return composeRoomState({
    topic,
    participants,
    turns,
    summary,
    searchEvidence,
    source: "generated",
    context,
  });
}

export async function createRoomForTopic(options: {
  topic: Topic;
  searchEvidence?: SearchEvidence[];
  accessToken?: string;
  userContext?: UserContext;
}) {
  const initialEvidence =
    options.searchEvidence ??
    (await getCredibleSearchEvidence(buildTopicSearchQuery(options.topic))).evidence;
  const participants = createParticipants(options.topic, initialEvidence);
  let room = buildMockRoom(
    options.topic,
    participants,
    initialEvidence,
    options.userContext,
  );

  if (options.accessToken) {
    try {
      const generated = await generateDiscussionRoom(
        options.accessToken,
        options.topic,
        participants,
        initialEvidence,
        options.userContext,
      );
      room = hydrateGeneratedRoom(
        options.topic,
        participants,
        initialEvidence,
        generated,
        options.userContext,
      );
    } catch {
      room = buildMockRoom(
        options.topic,
        participants,
        initialEvidence,
        options.userContext,
      );
    }
  }

  getRoomStore().set(room.id, room);

  return room;
}

export function getRoomById(roomId: string) {
  return getRoomStore().get(roomId) ?? null;
}

export async function appendFollowUpToRoom(options: {
  roomId: string;
  agentId: string;
  question: string;
  accessToken?: string;
  userContext?: UserContext;
}) {
  const room = getRoomById(options.roomId);

  if (!room) {
    throw new Error("ROOM_NOT_FOUND");
  }

  const participant =
    room.participants.find((item) => item.id === options.agentId) ?? room.participants[0];
  const searchPayload = await getCredibleSearchEvidence(
    buildFollowUpSearchQuery(room.topic, options.question, options.userContext),
  );
  const mergedEvidence = mergeSearchEvidence(room.searchEvidence, searchPayload.evidence);
  let reply = buildTurn(
    participant,
    room.turns.length + 1,
    "follow_up",
    "先别继续加码投入，先把你当前最想验证的假设单独拎出来。只要第一轮验证能确认真实门槛和代价，你就能决定是继续、转向还是立刻止损。",
    ["先把追问压缩成一个可验证假设", "先拿到最短路径反馈"],
    pickSourceIds(searchPayload.evidence, 2),
  );

  if (options.accessToken) {
    try {
      const generated = await generateFollowUpReply(
        options.accessToken,
        room.topic,
        participant,
        room.turns,
        options.question,
        mergedEvidence,
        options.userContext,
      );
      reply = buildTurn(
        participant,
        room.turns.length + 1,
        "follow_up",
        generated.reply,
        [generated.suggestion, ...generated.evidence].filter(Boolean).slice(0, 2),
        (generated.sourceIds?.length ? generated.sourceIds : pickSourceIds(searchPayload.evidence, 2)).slice(
          0,
          2,
        ),
      );
    } catch {
      reply = buildTurn(
        participant,
        room.turns.length + 1,
        "follow_up",
        "如果你真的打算往前走，我建议先把这次追问变成一条最小验证：只检验一个假设，限定时长和代价，并提前写好继续或停止的标准。这样讨论才会转化为真实决策能力。",
        ["追问要沉淀成下一轮验证", "先定继续与停止标准"],
        pickSourceIds(searchPayload.evidence, 2),
      );
    }
  }

  const nextFollowUp: FollowUpRecord = {
    id: randomUUID(),
    question: options.question.trim(),
    targetAgentId: participant.id,
    targetAgentName: participant.name,
    replyTurnId: reply.id,
    createdAt: Date.now(),
  };
  const nextSummary: RoomSummary = {
    ...room.summary,
    followUpTargetId: participant.id,
    followUpTargetName: participant.name,
    followUpPrompt: `如果我继续沿着这条路径验证，下一个必须补齐的前提是什么？`,
    recommendedNextStep: "把这次追问得到的新前提加入下一轮验证，再回到实验室继续收束。",
  };
  const nextRoom = composeRoomState({
    id: room.id,
    topic: room.topic,
    participants: room.participants,
    turns: [...room.turns, reply],
    summary: nextSummary,
    searchEvidence: mergedEvidence,
    followUps: [...room.followUps, nextFollowUp],
    source: room.source,
    context: options.userContext,
    createdAt: room.createdAt,
  });

  getRoomStore().set(room.id, nextRoom);

  return nextRoom;
}
