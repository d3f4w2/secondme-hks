"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import type {
  AgentParticipant,
  RoomState,
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
      <p>{message.text}</p>
    </div>
  );
}

function sourceText(payload: TopicsPayload) {
  return payload.usingFallback ? "知乎热榜回退源" : "知乎热榜接口";
}

function participantClassName(participant: AgentParticipant, selected: boolean) {
  return `participant-chip accent-${participant.accent}${selected ? " is-selected" : ""}`;
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
    initialUser
      ? {
          user: initialUser,
          shades: [],
          softMemory: [],
        }
      : null,
  );
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [isLoadingTopics, setIsLoadingTopics] = useState(true);
  const [isLoadingRoom, setIsLoadingRoom] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(Boolean(initialUser));
  const [isSubmittingFollowUp, setIsSubmittingFollowUp] = useState(false);
  const [followUpAgentId, setFollowUpAgentId] = useState("");
  const [followUpQuestion, setFollowUpQuestion] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadTopics() {
      setIsLoadingTopics(true);
      setTopicsError(null);

      try {
        const response = await fetch("/api/topics", {
          cache: "no-store",
        });
        const payload = (await response.json()) as TopicsPayload & { error?: string };

        if (!response.ok || !payload.topics?.length) {
          throw new Error(payload.error ?? "热榜列表加载失败");
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
          setTopicsError(error instanceof Error ? error.message : "热榜列表加载失败");
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
        const response = await fetch("/api/bootstrap", {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          userContext?: UserContext;
          error?: string;
        };

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
    }, 650);

    return () => {
      window.clearInterval(timer);
    };
  }, [room?.id]);

  useEffect(() => {
    if (!room) {
      return;
    }

    setFollowUpAgentId(room.summary.followUpTargetId);
    setFollowUpError(null);
  }, [room?.id]);

  async function openTopic(topicId: string) {
    setSelectedTopicId(topicId);
    setRoomError(null);
    setFollowUpError(null);
    setIsLoadingRoom(true);

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ topicId }),
      });
      const payload = (await response.json()) as {
        room?: RoomState;
        error?: string;
      };

      if (!response.ok || !payload.room) {
        throw new Error(payload.error ?? "讨论房创建失败");
      }

      setRoom(payload.room);
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : "讨论房创建失败");
    } finally {
      setIsLoadingRoom(false);
    }
  }

  async function handleFollowUpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!room || !followUpAgentId || !followUpQuestion.trim()) {
      setFollowUpError("先选一个代理，再输入具体追问。");
      return;
    }

    setIsSubmittingFollowUp(true);
    setFollowUpError(null);

    try {
      const response = await fetch(`/api/rooms/${room.id}/follow-up`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId: followUpAgentId,
          question: followUpQuestion,
        }),
      });
      const payload = (await response.json()) as {
        room?: RoomState;
        error?: string;
      };

      if (!response.ok || !payload.room) {
        throw new Error(payload.error ?? "追问失败");
      }

      setRoom(payload.room);
      setFollowUpQuestion("");
    } catch (error) {
      setFollowUpError(error instanceof Error ? error.message : "追问失败");
    } finally {
      setIsSubmittingFollowUp(false);
    }
  }

  const selectedTopic = useMemo(
    () => topicsPayload.topics.find((item) => item.id === selectedTopicId) ?? null,
    [topicsPayload.topics, selectedTopicId],
  );
  const visibleTurns = useMemo(
    () => room?.turns.slice(0, visibleTurnCount) ?? [],
    [room, visibleTurnCount],
  );
  const isDiscussionRunning = Boolean(room && visibleTurnCount < room.turns.length);

  return (
    <main className="news-shell">
      <div className="news-aura" />

      <section className="masthead">
        <div className="masthead-copy">
          <p className="eyebrow">Zhihu Reconnect A2A</p>
          <h1>
            找谁
            <span>热点讨论房</span>
          </h1>
          <p className="lead">
            不再只给一个结论，而是让多个知乎用户代理围绕同一热点真实交锋，再告诉你更该听谁。
          </p>
          <div className="meta-row">
            <span>{sourceText(topicsPayload)}</span>
            <span>多代理交锋</span>
            <span>围观 + 追问</span>
          </div>
        </div>

        <div className="control-stack">
          <StatusBanner message={statusMessage} />
          <article className="identity-panel">
            <div>
              <p className="panel-kicker">SecondMe 身份</p>
              <h2>{initialUser ? initialUser.name : "还未连接"}</h2>
              <p>
                {initialUser
                  ? "你可以围观热榜讨论，并在结果出来后向某个代理继续追问。"
                  : "未登录也能围观热榜讨论，登录后可用 SecondMe 个性化追问。"}
              </p>
            </div>
            <div className="identity-actions">
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
            {initialUser && !contextError ? (
              <div className="context-mini">
                <span>{isLoadingContext ? "正在同步你的画像" : "你的画像已接入房间"}</span>
                <span>{userContext?.shades.slice(0, 2).join(" / ") || "暂无兴趣标签"}</span>
              </div>
            ) : null}
          </article>
        </div>
      </section>

      <section className="news-grid">
        <aside className="topic-rail">
          <div className="rail-header">
            <div>
              <p className="eyebrow">今日热榜</p>
              <h2>先选一个正在被讨论的话题</h2>
            </div>
            <span className={`source-pill ${topicsPayload.usingFallback ? "is-fallback" : ""}`}>
              {sourceText(topicsPayload)}
            </span>
          </div>

          {topicsError ? <p className="inline-error">{topicsError}</p> : null}
          {isLoadingTopics ? <p className="empty-copy">正在拉取热榜议题…</p> : null}

          <div className="topic-list">
            {topicsPayload.topics.map((topic) => (
              <button
                key={topic.id}
                type="button"
                className={`topic-card ${selectedTopicId === topic.id ? "is-active" : ""}`}
                onClick={() => void openTopic(topic.id)}
              >
                <div className="topic-card-top">
                  <span>{topic.heat}</span>
                  <span>{topic.updatedAt}</span>
                </div>
                <h3>{topic.title}</h3>
                <p>{topic.summary}</p>
                <div className="topic-tags">
                  {topic.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="room-stage">
          <div className="room-header">
            <div>
              <p className="eyebrow">讨论房</p>
              <h2>{selectedTopic?.title ?? "等待选择话题"}</h2>
              <p>{selectedTopic?.summary ?? "选择左侧热榜后，这里会展开多代理讨论。"}</p>
            </div>
            <div className="room-status">
              <span>{isLoadingRoom ? "正在组房" : isDiscussionRunning ? "Agent 正在交锋" : "房间已收束"}</span>
              <a href={selectedTopic?.link ?? "https://www.zhihu.com/"} target="_blank" rel="noreferrer">
                查看来源
              </a>
            </div>
          </div>

          {roomError ? <p className="inline-error">{roomError}</p> : null}

          <div className="participant-row">
            {(room?.participants ?? []).map((participant) => (
              <button
                key={participant.id}
                type="button"
                className={participantClassName(participant, followUpAgentId === participant.id)}
                onClick={() => setFollowUpAgentId(participant.id)}
              >
                <strong>{participant.name}</strong>
                <span>{participant.role}</span>
              </button>
            ))}
          </div>

          <div className="discussion-stream">
            {!room && !isLoadingRoom ? (
              <div className="empty-state">
                <p className="eyebrow">A2A 房间</p>
                <h3>选一个热点，多个代理才会开始互相回应。</h3>
              </div>
            ) : null}

            {visibleTurns.map((turn) => (
              <article key={turn.id} className="turn-card">
                <div className="turn-topline">
                  <span className="turn-round">第 {turn.round} 轮</span>
                  <div>
                    <h3>{turn.agentName}</h3>
                    <p>{turn.role}</p>
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
                <p>代理正在继续交锋，下一轮发言即将出现。</p>
              </div>
            ) : null}
          </div>

          {room ? (
            <div className="summary-grid">
              <article className="summary-card accent-main">
                <p className="panel-kicker">讨论收束</p>
                <h3>{room.summary.topicAngle}</h3>
                <ul className="summary-list">
                  {room.summary.takeaways.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>

              <article className="summary-card">
                <p className="panel-kicker">更该听谁</p>
                <h3>{room.summary.listenTo}</h3>
              </article>

              <article className="summary-card warning-card">
                <p className="panel-kicker">最该警惕</p>
                <h3>{room.summary.caution}</h3>
              </article>
            </div>
          ) : null}

          {room ? (
            <form className="follow-up-panel" onSubmit={handleFollowUpSubmit}>
              <div className="follow-up-header">
                <div>
                  <p className="eyebrow">继续追问</p>
                  <h2>围观完，再向某个代理补一刀</h2>
                </div>
                <div className="follow-up-hint">
                  <span>推荐对象：{room.summary.followUpTargetName}</span>
                </div>
              </div>

              <div className="follow-up-targets">
                {room.participants.map((participant) => (
                  <button
                    key={participant.id}
                    type="button"
                    className={participantClassName(participant, followUpAgentId === participant.id)}
                    onClick={() => setFollowUpAgentId(participant.id)}
                  >
                    <strong>{participant.name}</strong>
                    <span>{participant.stance}</span>
                  </button>
                ))}
              </div>

              <label className="follow-up-field">
                <span>你的追问</span>
                <textarea
                  value={followUpQuestion}
                  onChange={(event) => setFollowUpQuestion(event.target.value)}
                  placeholder={room.summary.followUpPrompt}
                  rows={4}
                />
              </label>

              {!initialUser ? (
                <p className="inline-note">登录 SecondMe 后，追问会结合你的画像和软记忆生成。</p>
              ) : null}
              {followUpError ? <p className="inline-error">{followUpError}</p> : null}

              <div className="follow-up-actions">
                <button
                  className="primary-button"
                  type="submit"
                  disabled={isSubmittingFollowUp || !room}
                >
                  {isSubmittingFollowUp ? "追问中..." : "向代理追问"}
                </button>
              </div>
            </form>
          ) : null}
        </section>
      </section>
    </main>
  );
}
