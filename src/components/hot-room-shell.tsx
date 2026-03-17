"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import type {
  AgentParticipant,
  ArgumentEdge,
  ArgumentNode,
  ArgumentNodeStage,
  RecommendedAgent,
  RoomState,
  SearchEvidence,
  SessionUser,
  Topic,
  TopicsPayload,
  UserContext,
} from "@/lib/types";

type HotRoomShellProps = {
  initialUser: SessionUser | null;
  statusMessage?: {
    type: "success" | "error";
    text: string;
  };
};

type WorkspaceView = "overview" | "debate" | "evidence" | "followup";

const VIEW_ORDER = ["overview", "debate", "evidence", "followup"] as const;
const VIEW_META: Record<WorkspaceView, { label: string; hint: string }> = {
  overview: { label: "总览", hint: "先看结论、找谁、下一步" },
  debate: { label: "讨论", hint: "按阶段查看代理如何交锋" },
  evidence: { label: "证据", hint: "只保留当前最相关的来源" },
  followup: { label: "追问", hint: "选人后继续追问并刷新结果" },
};

const STAGE_ORDER = ["brief", "collision", "resolution", "action"] as const;
const SAMPLE_QUESTIONS = [
  "现在转向独立开发还来得及吗？",
  "非大厂背景还有必要继续卷实习吗？",
  "AI 时代应该优先学工具还是优先做项目？",
];

const STAGE_META: Record<(typeof STAGE_ORDER)[number], { label: string; hint: string }> = {
  brief: { label: "问题拆解", hint: "先定义目标与真实门槛。" },
  collision: { label: "观点碰撞", hint: "不同答主视角开始交锋。" },
  resolution: { label: "收束结果", hint: "把分歧压缩成判断。" },
  action: { label: "行动出口", hint: "收束到找谁和怎么做。" },
};

const TURN_KIND_LABEL: Record<string, string> = {
  opening: "开场拆题",
  challenge: "提出反驳",
  bridge: "尝试收束",
  summary: "结论压缩",
  follow_up: "继续追问",
};

const RELATION_LABEL: Record<ArgumentEdge["relation"], string> = {
  supports: "支撑",
  rebuts: "反驳",
  questions: "追问",
  bridges: "收束",
  grounds: "引用",
  unlocks: "导向",
};

function sourceText(payload: TopicsPayload) {
  return payload.usingFallback ? "知乎热榜回退源" : "知乎热榜接口";
}

function participantClassName(participant: AgentParticipant, selected: boolean) {
  return `participant-card accent-${participant.accent}${selected ? " is-selected" : ""}`;
}

function nodeClassName(node: ArgumentNode, selectedAgentId: string) {
  const classes = ["argument-node", `node-${node.type}`, `stage-${node.stage}`, `emphasis-${node.emphasis}`];

  if (selectedAgentId && node.agentId) {
    classes.push(node.agentId === selectedAgentId ? "is-focused" : "is-muted");
  }

  return classes.join(" ");
}

function resolveNodeBadge(node: ArgumentNode) {
  switch (node.type) {
    case "goal":
      return "讨论目标";
    case "claim":
      return "观点";
    case "challenge":
      return "反驳";
    case "synthesis":
      return "收束";
    case "decision":
      return "结论";
    case "action":
      return "行动";
    case "question":
      return "追问";
    case "evidence":
      return "证据";
    default:
      return "节点";
  }
}

function describeRelation(edge: ArgumentEdge, nodeMap: Map<string, ArgumentNode>) {
  const from = nodeMap.get(edge.from);
  const to = nodeMap.get(edge.to);

  if (!from || !to) {
    return RELATION_LABEL[edge.relation];
  }

  return `${from.title} ${RELATION_LABEL[edge.relation]} ${to.title}`;
}

function stageProgressText(visible: number, total: number) {
  if (!total) {
    return "等待生成";
  }

  if (visible >= total) {
    return "已收束";
  }

  return `${visible}/${total} 已展开`;
}

function StatusBanner({
  message,
}: {
  message?: {
    type: "success" | "error";
    text: string;
  };
}) {
  if (!message) {
    return null;
  }

  return (
    <div className={`status-banner ${message.type === "error" ? "is-error" : ""}`}>
      <span className="status-dot" />
      <div>
        <p className="status-label">同步状态</p>
        <p>{message.text}</p>
      </div>
    </div>
  );
}

function EvidenceCard({ evidence }: { evidence: SearchEvidence }) {
  return (
    <article className="evidence-card">
      <div className="evidence-meta">
        <span>{evidence.sourceLabel}</span>
        {evidence.authorityLevel ? <span>authority_level: {evidence.authorityLevel}</span> : null}
        {evidence.contentType ? <span>{evidence.contentType}</span> : null}
      </div>
      <h3>{evidence.title}</h3>
      <p>{evidence.summary}</p>
      {evidence.featuredComment ? <blockquote>{evidence.featuredComment}</blockquote> : null}
      <div className="evidence-footer">
        <span>{evidence.author ?? "匿名来源"}</span>
        {typeof evidence.voteUpCount === "number" ? <span>赞同 {evidence.voteUpCount}</span> : null}
        {typeof evidence.commentCount === "number" ? <span>评论 {evidence.commentCount}</span> : null}
      </div>
      <a className="evidence-link" href={evidence.link} target="_blank" rel="noreferrer">
        查看原文
      </a>
    </article>
  );
}

function GraphNode({
  node,
  evidenceMap,
  selectedAgentId,
}: {
  node: ArgumentNode;
  evidenceMap: Map<string, SearchEvidence>;
  selectedAgentId: string;
}) {
  const citations = node.sourceIds
    .map((sourceId) => evidenceMap.get(sourceId))
    .filter((item): item is SearchEvidence => Boolean(item));

  return (
    <article className={nodeClassName(node, selectedAgentId)}>
      <div className="node-head">
        <span className="node-badge">{resolveNodeBadge(node)}</span>
        {node.agentName ? <span className="node-agent">{node.agentName}</span> : null}
      </div>
      <h3>{node.title}</h3>
      <p>{node.summary}</p>
      {citations.length ? (
        <div className="node-citations">
          {citations.slice(0, 2).map((item) => (
            <a key={`${node.id}-${item.id}`} href={item.link} target="_blank" rel="noreferrer" className="citation-chip">
              {item.title}
            </a>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function WhoToAskCard({
  recommendation,
  participant,
  selected,
  onSelect,
}: {
  recommendation: RecommendedAgent;
  participant: AgentParticipant | null;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" className={`ask-card ${selected ? "is-selected" : ""}`} onClick={onSelect}>
      <div className="ask-card-head">
        <span>优先找谁</span>
        <strong>{recommendation.agentName}</strong>
      </div>
      <p>{recommendation.why}</p>
      <div className="ask-card-meta">
        <span>{recommendation.whenToAsk}</span>
        {participant ? <span>来源：{participant.source.displayName}</span> : null}
      </div>
    </button>
  );
}

export function HotRoomShell({ initialUser, statusMessage }: HotRoomShellProps) {
  const [topicsPayload, setTopicsPayload] = useState<TopicsPayload>({
    topics: [],
    source: "mock",
    usingFallback: true,
  });
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [visibleTurnCount, setVisibleTurnCount] = useState(0);
  const [userContext, setUserContext] = useState<UserContext | null>(
    initialUser ? { user: initialUser, shades: [], softMemory: [] } : null,
  );
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [isLoadingTopics, setIsLoadingTopics] = useState(true);
  const [isLoadingRoom, setIsLoadingRoom] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(Boolean(initialUser));
  const [isSubmittingFollowUp, setIsSubmittingFollowUp] = useState(false);
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [customQuestion, setCustomQuestion] = useState("");
  const [activeView, setActiveView] = useState<WorkspaceView>("overview");
  const [selectedStage, setSelectedStage] = useState<ArgumentNodeStage>("brief");
  const [isContextOpen, setIsContextOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadTopics() {
      setIsLoadingTopics(true);
      setTopicsError(null);

      try {
        const response = await fetch("/api/topics", { cache: "no-store" });
        const payload = (await response.json()) as TopicsPayload & { error?: string };

        if (!response.ok || !payload.topics?.length) {
          throw new Error(payload.error ?? "议题列表加载失败");
        }

        if (cancelled) {
          return;
        }

        setTopicsPayload({
          topics: payload.topics,
          source: payload.source,
          usingFallback: payload.usingFallback,
        });
        setSelectedTopicId(payload.topics[0].id);
        void openTopic(payload.topics[0].id);
      } catch (error) {
        if (!cancelled) {
          setTopicsError(error instanceof Error ? error.message : "议题列表加载失败");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTopics(false);
        }
      }
    }

    void loadTopics();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!initialUser) {
      return;
    }

    let cancelled = false;

    async function loadContext() {
      setIsLoadingContext(true);
      setContextError(null);

      try {
        const response = await fetch("/api/bootstrap", { cache: "no-store" });
        const payload = (await response.json()) as { userContext?: UserContext; error?: string };

        if (!response.ok || !payload.userContext) {
          throw new Error(payload.error ?? "SecondMe 上下文加载失败");
        }

        if (!cancelled) {
          setUserContext(payload.userContext);
        }
      } catch (error) {
        if (!cancelled) {
          setContextError(error instanceof Error ? error.message : "SecondMe 上下文加载失败");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingContext(false);
        }
      }
    }

    void loadContext();
    return () => {
      cancelled = true;
    };
  }, [initialUser]);

  useEffect(() => {
    if (!room) {
      return;
    }

    setVisibleTurnCount(0);
    const timer = window.setInterval(() => {
      setVisibleTurnCount((current) => {
        if (!room || current >= room.turns.length) {
          window.clearInterval(timer);
          return current;
        }

        return current + 1;
      });
    }, 520);

    return () => window.clearInterval(timer);
  }, [room?.id]);

  useEffect(() => {
    if (!room) {
      return;
    }

    setSelectedAgentId(room.summary.followUpTargetId);
    setSelectedStage(room.argumentNodes[room.argumentNodes.length - 1]?.stage ?? "brief");
    setActiveView("overview");
    setFollowUpError(null);
  }, [room?.id]);

  async function createRoom(payload: { topicId?: string; question?: string }) {
    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as { room?: RoomState; error?: string };

    if (!response.ok || !data.room) {
      throw new Error(data.error ?? "讨论实验室创建失败");
    }

    return data.room;
  }

  async function openTopic(topicId: string) {
    setSelectedTopicId(topicId);
    setRoomError(null);
    setQuestionError(null);
    setFollowUpError(null);
    setIsLoadingRoom(true);

    try {
      setRoom(await createRoom({ topicId }));
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : "讨论实验室创建失败");
    } finally {
      setIsLoadingRoom(false);
    }
  }

  async function handleQuestionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!customQuestion.trim()) {
      setQuestionError("先输入一个你真正想解决的问题。");
      return;
    }

    setQuestionError(null);
    setRoomError(null);
    setSelectedTopicId(null);
    setIsSubmittingQuestion(true);
    setIsLoadingRoom(true);

    try {
      setRoom(await createRoom({ question: customQuestion.trim() }));
    } catch (error) {
      setQuestionError(error instanceof Error ? error.message : "创建问题讨论失败");
    } finally {
      setIsSubmittingQuestion(false);
      setIsLoadingRoom(false);
    }
  }

  async function handleFollowUpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!room || !selectedAgentId || !followUpQuestion.trim()) {
      setFollowUpError("先选一个代理，再把你想继续验证的问题写具体。");
      return;
    }

    setIsSubmittingFollowUp(true);
    setFollowUpError(null);

    try {
      const response = await fetch(`/api/rooms/${room.id}/follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: selectedAgentId, question: followUpQuestion }),
      });
      const payload = (await response.json()) as { room?: RoomState; error?: string };

      if (!response.ok || !payload.room) {
        throw new Error(payload.error ?? "继续追问失败");
      }

      setRoom(payload.room);
      setFollowUpQuestion("");
    } catch (error) {
      setFollowUpError(error instanceof Error ? error.message : "继续追问失败");
    } finally {
      setIsSubmittingFollowUp(false);
    }
  }

  const selectedTopic = useMemo(
    () => topicsPayload.topics.find((item) => item.id === selectedTopicId) ?? null,
    [topicsPayload.topics, selectedTopicId],
  );
  const activeTopic: Topic | null = room?.topic ?? selectedTopic;
  const visibleTurns = useMemo(() => room?.turns.slice(0, visibleTurnCount) ?? [], [room, visibleTurnCount]);
  const visibleNodeThreshold = visibleTurnCount + 0.6;
  const visibleNodes = useMemo(
    () => room?.argumentNodes.filter((item) => item.order <= visibleNodeThreshold) ?? [],
    [room?.argumentNodes, visibleNodeThreshold],
  );
  const visibleNodeMap = useMemo(() => new Map(visibleNodes.map((item) => [item.id, item])), [visibleNodes]);
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((item) => item.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => room?.argumentEdges.filter((item) => visibleNodeIds.has(item.from) && visibleNodeIds.has(item.to)) ?? [],
    [room?.argumentEdges, visibleNodeIds],
  );
  const selectedParticipant = useMemo(
    () => room?.participants.find((item) => item.id === selectedAgentId) ?? room?.participants[0] ?? null,
    [room?.participants, selectedAgentId],
  );
  const participantMap = useMemo(
    () => new Map(room?.participants.map((item) => [item.id, item]) ?? []),
    [room?.participants],
  );
  const isDiscussionRunning = Boolean(room && visibleTurnCount < room.turns.length);
  const evidenceMap = useMemo(
    () => new Map(room?.searchEvidence.map((item) => [item.id, item]) ?? []),
    [room?.searchEvidence],
  );
  const visibleEvidence = useMemo(() => {
    const usedIds = new Set(visibleNodes.flatMap((item) => item.sourceIds).filter((item) => evidenceMap.has(item)));
    const cited = Array.from(usedIds)
      .map((id) => evidenceMap.get(id))
      .filter((item): item is SearchEvidence => Boolean(item));

    return [...cited, ...(room?.searchEvidence ?? []).filter((item) => !usedIds.has(item.id))].slice(0, 6);
  }, [evidenceMap, room?.searchEvidence, visibleNodes]);
  const stageStats = useMemo(
    () =>
      STAGE_ORDER.map((stage) => ({
        stage,
        label: STAGE_META[stage].label,
        hint: STAGE_META[stage].hint,
        total: room?.argumentNodes.filter((item) => item.stage === stage).length ?? 0,
        visible: visibleNodes.filter((item) => item.stage === stage).length,
      })),
    [room?.argumentNodes, visibleNodes],
  );
  const selectedStageNodes = useMemo(
    () => visibleNodes.filter((item) => item.stage === selectedStage),
    [visibleNodes, selectedStage],
  );
  const selectedStageEdges = useMemo(
    () =>
      visibleEdges.filter((item) => {
        const from = visibleNodeMap.get(item.from);
        const to = visibleNodeMap.get(item.to);

        return from?.stage === selectedStage || to?.stage === selectedStage;
      }),
    [selectedStage, visibleEdges, visibleNodeMap],
  );
  const transcriptPreview = useMemo(() => {
    const recent = visibleTurns.slice(-6);

    if (!selectedAgentId) {
      return recent;
    }

    const focused = recent.filter((item) => item.agentId === selectedAgentId);
    return focused.length >= 2 ? focused : recent;
  }, [selectedAgentId, visibleTurns]);
  const focusEvidence = useMemo(() => {
    if (!selectedStageNodes.length) {
      return visibleEvidence;
    }

    const stageSourceIds = new Set(selectedStageNodes.flatMap((item) => item.sourceIds));
    const focused = visibleEvidence.filter((item) => stageSourceIds.has(item.id));

    return focused.length ? focused : visibleEvidence;
  }, [selectedStageNodes, visibleEvidence]);
  const contextShades = userContext?.shades.length ? userContext.shades : ["等待兴趣标签"];
  const topMemories = useMemo(() => userContext?.softMemory.slice(0, 4) ?? [], [userContext?.softMemory]);
  const contextStatus = initialUser
    ? isLoadingContext
      ? "SecondMe 正在同步你的画像"
      : "SecondMe 画像已接入讨论"
    : "未登录也能体验基础讨论";

  return (
    <main className="studio-shell">
      <div className="studio-backdrop" />
      <div className="studio-gridlines" />

      <section className="command-hero">
        <article className="hero-copy-panel">
          <p className="eyebrow">Zhihu x SecondMe A2A</p>
          <h1>
            先收束判断
            <span>再决定该问谁，如何行动。</span>
          </h1>
          <p className="hero-lead">
            把热点问题和你自己的真实问题放进一个层级清晰的讨论舱。系统先给结果，再允许你按阶段滑入细节，而不是把所有信息一次性砸到眼前。
          </p>
          <div className="hero-metrics">
            <span>{sourceText(topicsPayload)}</span>
            <span>热点 + 自定义双入口</span>
            <span>结果优先，细节后置</span>
            <span>多代理真实交锋</span>
          </div>
        </article>

        <div className="hero-stack">
          <StatusBanner message={statusMessage} />

          <article className="hero-card composer-card">
            <div className="section-topline">
              <div>
                <p className="panel-kicker">用户问题入口</p>
                <h2>输入你真正想解决的问题</h2>
              </div>
            </div>
            <form className="hero-form" onSubmit={handleQuestionSubmit}>
              <label className="form-field">
                <span>你的问题</span>
                <textarea
                  className="glass-textarea"
                  value={customQuestion}
                  onChange={(event) => setCustomQuestion(event.target.value)}
                  placeholder="例如：现在转向独立开发还来得及吗？我应该先去问哪类人，先验证什么？"
                  rows={4}
                />
              </label>
              <div className="sample-row">
                {SAMPLE_QUESTIONS.map((item) => (
                  <button key={item} type="button" className="sample-chip" onClick={() => setCustomQuestion(item)}>
                    {item}
                  </button>
                ))}
              </div>
              {questionError ? <p className="inline-error">{questionError}</p> : null}
              <div className="form-actions">
                <button className="primary-button" type="submit" disabled={isSubmittingQuestion}>
                  {isSubmittingQuestion ? "正在检索知乎并搭建讨论..." : "用我的问题开始讨论"}
                </button>
              </div>
            </form>
          </article>

          <article className="hero-card identity-card">
            <div className="section-topline">
              <div>
                <p className="panel-kicker">SecondMe 身份</p>
                <h2>{initialUser ? initialUser.name : "还未连接"}</h2>
              </div>
              {initialUser ? (
                <button
                  type="button"
                  className="toggle-button"
                  aria-expanded={isContextOpen}
                  onClick={() => setIsContextOpen((current) => !current)}
                >
                  {isContextOpen ? "收起画像" : "展开画像"}
                </button>
              ) : null}
            </div>
            <p className="soft-copy">
              {initialUser
                ? "登录后，讨论目标、追问顺序和行动建议会结合你的画像与软记忆重排。"
                : "未登录也能围观讨论，但登录后系统会针对你的处境重新收束结果。"}
            </p>
            <div className="context-pills">
              <span>{contextStatus}</span>
              <span>{contextShades.slice(0, 2).join(" / ")}</span>
            </div>
            <div className="form-actions">
              {initialUser ? (
                <a className="ghost-button" href="/api/auth/logout">
                  退出授权
                </a>
              ) : (
                <a className="primary-button" href="/api/auth/login">
                  用 SecondMe 登录
                </a>
              )}
            </div>
            {contextError ? <p className="inline-error">{contextError}</p> : null}
          </article>
        </div>
      </section>

      <section className="studio-layout">
        <aside className="navigator-rail">
          <article className="rail-card">
            <div className="section-topline">
              <div>
                <p className="eyebrow">热点入口</p>
                <h2>先挑题，再进入讨论</h2>
              </div>
              <span className={`source-pill ${topicsPayload.usingFallback ? "is-fallback" : ""}`}>
                {sourceText(topicsPayload)}
              </span>
            </div>
            {topicsError ? <p className="inline-error">{topicsError}</p> : null}
            {isLoadingTopics ? <p className="soft-copy">正在加载知乎热点…</p> : null}
            <div className="topic-carousel">
              {topicsPayload.topics.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  className={`topic-tile ${selectedTopicId === topic.id ? "is-active" : ""}`}
                  onClick={() => void openTopic(topic.id)}
                >
                  <div className="topic-card-top">
                    <span>{topic.heat}</span>
                    <span>{topic.updatedAt}</span>
                  </div>
                  <h3>{topic.title}</h3>
                  <p>{topic.summary}</p>
                  {topic.leadAnswer ? <blockquote>{topic.leadAnswer.slice(0, 72)}...</blockquote> : null}
                  <div className="topic-tags">
                    {topic.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </article>

          <article className={`rail-card context-card ${isContextOpen ? "is-open" : ""}`}>
            <div className="section-topline">
              <div>
                <p className="eyebrow">你的上下文</p>
                <h2>默认退到二级视图</h2>
              </div>
              <button
                type="button"
                className="toggle-button"
                aria-expanded={isContextOpen}
                onClick={() => setIsContextOpen((current) => !current)}
              >
                {isContextOpen ? "收起" : "展开"}
              </button>
            </div>
            <div className="context-pills">
              <span>{contextStatus}</span>
              <span>{topMemories.length} 条软记忆摘要</span>
            </div>
            {isContextOpen ? (
              <div className="context-drawer">
                {contextError ? <p className="inline-error">{contextError}</p> : null}
                <div className="topic-tags">
                  {contextShades.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
                <div className="memory-grid">
                  {topMemories.length ? (
                    topMemories.map((item) => (
                      <article className="memory-card" key={`${item.title}-${item.summary}`}>
                        <h3>{item.title}</h3>
                        <p>{item.summary}</p>
                      </article>
                    ))
                  ) : (
                    <article className="memory-card">
                      <h3>暂无软记忆</h3>
                      <p>如果 SecondMe 当前没有可公开的软记忆，这里会保持简洁，不和主判断抢焦点。</p>
                    </article>
                  )}
                </div>
              </div>
            ) : (
              <p className="soft-copy">
                这些兴趣标签和记忆只在你需要时展开，默认不和当前问题、结论、行动方案争抢注意力。
              </p>
            )}
          </article>
        </aside>

        <section className="workspace-shell">
          <article className="workspace-header">
            <div className="section-topline">
              <div>
                <p className="eyebrow">当前问题</p>
                <h2>{activeTopic?.title ?? "等待选择问题"}</h2>
              </div>
              <div className="question-chips">
                <span>{isLoadingRoom ? "正在搭建讨论" : isDiscussionRunning ? "代理正在交锋" : "本轮讨论已收束"}</span>
                <span>{activeTopic?.entryMode === "custom" ? "用户问题入口" : "知乎热点入口"}</span>
              </div>
            </div>
            <p className="workspace-summary">
              {activeTopic?.summary ??
                "选择一个热点，或者输入你自己的问题。系统会先到知乎找相近讨论，再组织多答主代理交锋。"}
            </p>
            {roomError ? <p className="inline-error">{roomError}</p> : null}
            <div className="question-recap">
              <span>{room ? `${room.participants.length} 位代理入场` : "等待讨论启动"}</span>
              <span>{room ? `${room.searchEvidence.length} 条来源支撑` : "热点与自定义问题双入口"}</span>
              {activeTopic?.link ? (
                <a href={activeTopic.link} target="_blank" rel="noreferrer">
                  查看原始来源
                </a>
              ) : null}
            </div>
          </article>

          {room ? (
            <article className="spotlight-card">
              <div className="spotlight-copy">
                <p className="panel-kicker">系统先给的收束</p>
                <h3>{room.summary.outcomeHeadline}</h3>
                <p>{room.summary.recommendedNextStep}</p>
                <div className="spotlight-chips">
                  <span>{room.summary.actionPlan.firstMove}</span>
                  <span>建议先找：{room.summary.followUpTargetName}</span>
                  <span>{room.followUps.length} 次继续追问</span>
                </div>
              </div>
              <div className="spotlight-aside">
                <p className="panel-kicker">判断焦点</p>
                <h4>{room.summary.keyTension}</h4>
                <p>
                  {selectedParticipant
                    ? `${selectedParticipant.name} 当前是你最该盯住的代理。`
                    : "切换到讨论视图，可以按阶段跟踪代理之间的分歧如何被压缩。"}
                </p>
              </div>
            </article>
          ) : (
            <article className="spotlight-card is-empty">
              <div className="spotlight-copy">
                <p className="panel-kicker">结果区</p>
                <h3>结论会先出现，细节不会一次性压上来</h3>
                <p>等讨论启动后，这里优先展示“该问谁”“为什么”“第一步做什么”，再把过程与证据分层展开。</p>
              </div>
            </article>
          )}

          <nav className="view-switcher" aria-label="工作台视图">
            {VIEW_ORDER.map((view) => (
              <button
                key={view}
                type="button"
                className={`view-button ${activeView === view ? "is-active" : ""}`}
                aria-pressed={activeView === view}
                onClick={() => setActiveView(view)}
              >
                <span>{VIEW_META[view].label}</span>
                <small>{VIEW_META[view].hint}</small>
              </button>
            ))}
          </nav>

          {!room ? (
            <section className="view-panel">
              <div className="empty-state">
                <p className="eyebrow">讨论尚未开始</p>
                <h3>先选一个问题，工作台才会进入结果优先的视图。</h3>
                <p>启动后你可以按总览、讨论、证据、追问四个窗口切换，而不是一直往下滚整面内容。</p>
              </div>
            </section>
          ) : null}

          {room && activeView === "overview" ? (
            <section className="view-panel overview-panel">
              <div className="overview-grid">
                <article className="story-card">
                  <p className="panel-kicker">为什么这么找</p>
                  <h3>{room.summary.keyTension}</h3>
                  <ul className="result-list">
                    {room.summary.consensus.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>

                <article className="story-card warning-tone">
                  <p className="panel-kicker">还没彻底解决什么</p>
                  <ul className="result-list">
                    {room.summary.conflicts.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <div className="open-questions">
                    {room.summary.openQuestions.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                </article>

                <article className="story-card who-panel">
                  <div className="section-topline">
                    <div>
                      <p className="panel-kicker">找谁</p>
                      <h2>如果你只问三类人，先问这三位</h2>
                    </div>
                  </div>
                  <div className="who-grid">
                    {room.summary.whoToAsk.map((item) => (
                      <WhoToAskCard
                        key={item.agentId}
                        recommendation={item}
                        participant={participantMap.get(item.agentId) ?? null}
                        selected={selectedAgentId === item.agentId}
                        onSelect={() => setSelectedAgentId(item.agentId)}
                      />
                    ))}
                  </div>
                </article>
              </div>

              <article className="story-card action-panel">
                <div className="section-topline">
                  <div>
                    <p className="panel-kicker">怎么做</p>
                    <h2>{room.summary.actionPlan.headline}</h2>
                  </div>
                  <span className="panel-badge">{room.summary.actionPlan.firstMove}</span>
                </div>
                <div className="action-track">
                  {room.summary.actionPlan.steps.map((step, index) => (
                    <article key={step.id} className="action-step-card">
                      <span className="step-index">0{index + 1}</span>
                      <h3>{step.title}</h3>
                      <p>{step.why}</p>
                      <div className="step-notes">
                        <span>怎么开始：{step.howToStart}</span>
                        <span>风险：{step.risk}</span>
                        <span>执行者：{step.owner}</span>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="support-grid">
                  <article className="support-card">
                    <p className="panel-kicker">风险检查</p>
                    <ul className="result-list">
                      {room.summary.actionPlan.riskChecks.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                  <article className="support-card">
                    <p className="panel-kicker">下一轮验证题</p>
                    <ul className="result-list">
                      {room.summary.actionPlan.validationQuestions.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                </div>
              </article>
            </section>
          ) : null}

          {room && activeView === "debate" ? (
            <section className="view-panel debate-panel">
              <article className="story-card stage-panel">
                <div className="section-topline">
                  <div>
                    <p className="panel-kicker">讨论阶段</p>
                    <h2>先按阶段看，不再把整张图同时铺开</h2>
                  </div>
                  <span className="panel-badge">已展开 {visibleTurns.length}/{room.turns.length} 条发言</span>
                </div>
                <div className="stage-rail">
                  {stageStats.map((item) => (
                    <button
                      key={item.stage}
                      type="button"
                      className={`stage-pill ${selectedStage === item.stage ? "is-active" : ""}`}
                      onClick={() => setSelectedStage(item.stage)}
                    >
                      <strong>{item.label}</strong>
                      <span>{item.hint}</span>
                      <small>{stageProgressText(item.visible, item.total)}</small>
                    </button>
                  ))}
                </div>
              </article>

              <div className="debate-grid">
                <article className="story-card participant-panel">
                  <div className="section-topline">
                    <div>
                      <p className="panel-kicker">当前代理</p>
                      <h2>{selectedParticipant?.name ?? "等待选择"}</h2>
                    </div>
                  </div>
                  <p className="soft-copy">
                    {selectedParticipant?.persona ??
                      "选择一个代理后，你会看到它在当前阶段的观点、论证节点，以及最近几轮发言。"}
                  </p>
                  <div className="participant-grid">
                    {room.participants.map((participant) => (
                      <button
                        key={participant.id}
                        type="button"
                        className={participantClassName(participant, selectedAgentId === participant.id)}
                        onClick={() => setSelectedAgentId(participant.id)}
                      >
                        <div className="participant-head">
                          <strong>{participant.name}</strong>
                          <span>{participant.role}</span>
                        </div>
                        <p>{participant.persona}</p>
                        <div className="participant-meta">
                          <span>{participant.debateStyle}</span>
                          <span>来源：{participant.source.displayName}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </article>

                <article className="story-card map-panel">
                  <div className="section-topline">
                    <div>
                      <p className="panel-kicker">{STAGE_META[selectedStage].label}</p>
                      <h2>{STAGE_META[selectedStage].hint}</h2>
                    </div>
                  </div>
                  {selectedStageEdges.length ? (
                    <div className="relation-strip">
                      {selectedStageEdges.slice(-8).map((edge) => (
                        <span key={edge.id} className={`relation-pill relation-${edge.relation}`}>
                          {describeRelation(edge, visibleNodeMap)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="node-stack">
                    {selectedStageNodes.length ? (
                      selectedStageNodes.map((node) => (
                        <GraphNode
                          key={node.id}
                          node={node}
                          evidenceMap={evidenceMap}
                          selectedAgentId={selectedAgentId}
                        />
                      ))
                    ) : (
                      <div className="empty-state compact-empty">
                        <p className="eyebrow">阶段尚未展开</p>
                        <h3>等讨论推进到这一阶段，节点才会出现。</h3>
                      </div>
                    )}
                  </div>
                </article>
              </div>

              <article className="story-card transcript-panel">
                <div className="section-topline">
                  <div>
                    <p className="panel-kicker">最近几轮交锋</p>
                    <h2>用滑动窗口看关键发言，不看整面长列表</h2>
                  </div>
                </div>
                <div className="transcript-rail">
                  {transcriptPreview.map((turn) => (
                    <article key={turn.id} className={`transcript-card kind-${turn.kind}`}>
                      <div className="transcript-head">
                        <span className="turn-round">第 {turn.round} 轮</span>
                        <div>
                          <h3>{turn.agentName}</h3>
                          <p>{TURN_KIND_LABEL[turn.kind] ?? turn.kind}</p>
                        </div>
                      </div>
                      <p className="turn-message">{turn.message}</p>
                      <div className="evidence-list">
                        {turn.evidence.map((item) => (
                          <span key={`${turn.id}-${item}`}>{item}</span>
                        ))}
                      </div>
                    </article>
                  ))}
                  {room && isDiscussionRunning ? (
                    <div className="stream-progress">
                      <span className="pulse-dot" />
                      <p>新的交锋节点正在生成，流程会继续向后展开。</p>
                    </div>
                  ) : null}
                </div>
              </article>
            </section>
          ) : null}

          {room && activeView === "evidence" ? (
            <section className="view-panel evidence-panel-shell">
              <article className="story-card evidence-summary">
                <div className="section-topline">
                  <div>
                    <p className="panel-kicker">来源视图</p>
                    <h2>只把当前阶段最相关的证据放上来</h2>
                  </div>
                  <span className="panel-badge">{focusEvidence.length} 条当前相关来源</span>
                </div>
                <p className="soft-copy">
                  现在优先展示和「{STAGE_META[selectedStage].label}」直接有关的来源。如果该阶段还没有足够引用，就回退到本轮最关键的知乎内容。
                </p>
              </article>
              <div className="evidence-grid">
                {focusEvidence.map((item) => (
                  <EvidenceCard key={item.id} evidence={item} />
                ))}
              </div>
            </section>
          ) : null}

          {room && activeView === "followup" ? (
            <section className="view-panel followup-panel-shell">
              <article className="story-card participant-panel">
                <div className="section-topline">
                  <div>
                    <p className="panel-kicker">继续追问谁</p>
                    <h2>先选一个代理，再把问题挂回讨论</h2>
                  </div>
                </div>
                <p className="soft-copy">
                  当前推荐继续追问：{room.summary.followUpTargetName}。你也可以改选别的代理，系统会基于新的追问刷新结果。
                </p>
                <div className="participant-grid">
                  {room.participants.map((participant) => (
                    <button
                      key={participant.id}
                      type="button"
                      className={participantClassName(participant, selectedAgentId === participant.id)}
                      onClick={() => setSelectedAgentId(participant.id)}
                    >
                      <div className="participant-head">
                        <strong>{participant.name}</strong>
                        <span>{participant.source.displayName}</span>
                      </div>
                      <p>{participant.debateStyle}</p>
                    </button>
                  ))}
                </div>
              </article>

              <form className="story-card follow-form" onSubmit={handleFollowUpSubmit}>
                <div className="section-topline">
                  <div>
                    <p className="panel-kicker">继续深挖</p>
                    <h2>把追问写具体一点</h2>
                  </div>
                  <span className="panel-badge">{selectedParticipant?.name ?? "等待选择代理"}</span>
                </div>
                <label className="form-field">
                  <span>你的追问</span>
                  <textarea
                    className="glass-textarea"
                    value={followUpQuestion}
                    onChange={(event) => setFollowUpQuestion(event.target.value)}
                    placeholder={room.summary.followUpPrompt}
                    rows={5}
                  />
                </label>
                {!initialUser ? (
                  <p className="inline-note">登录 SecondMe 后，系统会按你的画像重新排序谁更值得先问。</p>
                ) : null}
                {followUpError ? <p className="inline-error">{followUpError}</p> : null}
                <div className="form-actions">
                  <button className="primary-button" type="submit" disabled={isSubmittingFollowUp || !room}>
                    {isSubmittingFollowUp ? "正在把问题挂回讨论..." : "继续追问并更新结果"}
                  </button>
                </div>
              </form>
            </section>
          ) : null}
        </section>
      </section>
    </main>
  );
}
