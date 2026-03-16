"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import type { AnalysisResult, SessionUser, UserContext } from "@/lib/types";

type AppShellProps = {
  initialUser: SessionUser | null;
  statusMessage?: {
    type: "success" | "error";
    text: string;
  };
};

const SAMPLE_QUESTIONS = [
  "最近这个很火的副业建议，我到底该先听哪类人的？",
  "我在考虑转行做产品经理，这件事应该先问谁？",
  "家里人让我买某个理财产品，我现在更该信谁的判断？",
];

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

function ResultBlock({ result }: { result: AnalysisResult }) {
  return (
    <section className="result-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">判断结果</p>
          <h2>先听谁，再决定问谁</h2>
        </div>
        <div className="stamp">判断中</div>
      </div>

      <div className="result-grid">
        <article className="result-card">
          <p className="result-label">问题类型</p>
          <h3>{result.questionType}</h3>
        </article>

        <article className="result-card accent-card">
          <p className="result-label">下一步行动</p>
          <h3>{result.nextStep.who}</h3>
          <p>{result.nextStep.why}</p>
          <blockquote>{result.nextStep.prompt}</blockquote>
        </article>
      </div>

      <div className="result-columns">
        <article className="result-list-card">
          <p className="result-label">该听谁</p>
          <ul>
            {result.shouldListenTo.map((item) => (
              <li key={`${item.who}-${item.reason}`}>
                <h3>{item.who}</h3>
                <p>{item.reason}</p>
              </li>
            ))}
          </ul>
        </article>

        <article className="result-list-card warning-card">
          <p className="result-label">别先信谁</p>
          <ul>
            {result.avoidFirst.map((item) => (
              <li key={`${item.who}-${item.reason}`}>
                <h3>{item.who}</h3>
                <p>{item.reason}</p>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <article className="confidence-note">
        <p className="result-label">判断边界</p>
        <p>{result.confidenceNote}</p>
      </article>
    </section>
  );
}

export function AppShell({ initialUser, statusMessage }: AppShellProps) {
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState<UserContext | null>(
    initialUser
      ? {
          user: initialUser,
          shades: [],
          softMemory: [],
        }
      : null,
  );
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(Boolean(initialUser));
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          throw new Error(payload.error ?? "无法拉取授权数据");
        }

        if (!cancelled) {
          setContext(payload.userContext);
        }
      } catch (error) {
        if (!cancelled) {
          setContextError(error instanceof Error ? error.message : "授权数据加载失败");
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

  const memoryPreview = useMemo(
    () => context?.softMemory?.slice(0, 4) ?? [],
    [context?.softMemory],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!question.trim()) {
      setSubmitError("先输入一个真实问题，再让系统判断。");
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question,
        }),
      });
      const payload = (await response.json()) as {
        result?: AnalysisResult;
        error?: string;
      };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? "分析失败");
      }

      setResult(payload.result);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "系统暂时没能给出判断");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="shell">
      <div className="shell-backdrop" />
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">SecondMe Judgment Copilot</p>
          <h1>找谁</h1>
          <p className="hero-intro">
            你缺的往往不是更多答案，而是更快判断这件事该听谁、该找谁问。
          </p>
          <p className="hero-body">
            `找谁` 会把 SecondMe 的用户画像、兴趣标签和软记忆变成判断上下文，用结构化结果帮你收敛下一步。
          </p>
          <div className="hero-meta">
            <span>现实问题</span>
            <span>专业分歧</span>
            <span>热点判断</span>
          </div>
        </div>

        <div className="hero-side">
          <StatusBanner message={statusMessage} />
          {initialUser ? (
            <div className="identity-card">
              <p className="identity-label">已连接 SecondMe</p>
              <h2>{context?.user.name ?? initialUser.name}</h2>
              <p>
                {context?.user.selfIntroduction ??
                  context?.user.bio ??
                  "已授权基础信息，正在准备你的判断上下文。"}
              </p>
              <div className="identity-actions">
                <a className="ghost-button" href="/api/auth/logout">
                  退出授权
                </a>
              </div>
            </div>
          ) : (
            <div className="identity-card">
              <p className="identity-label">先完成授权</p>
              <h2>把你的 SecondMe 记忆接进来</h2>
              <p>登录后系统会读取基础资料、兴趣标签和软记忆，再进入判断工作台。</p>
              <div className="identity-actions">
                <a className="primary-button" href="/api/auth/login">
                  使用 SecondMe 登录
                </a>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="workspace-grid">
        <aside className="context-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">上下文</p>
              <h2>你当前的判断底稿</h2>
            </div>
            <div className="stamp">MVP</div>
          </div>

          {!initialUser ? (
            <div className="empty-panel">
              <p>授权后，这里会显示你的兴趣标签和软记忆摘要，帮助结果更贴近你。</p>
            </div>
          ) : (
            <>
              <div className="info-strip">
                <span>{isLoadingContext ? "正在拉取授权数据" : "资料已同步"}</span>
                <span>{context?.user.route ? `@${context.user.route}` : "SecondMe 用户"}</span>
              </div>

              {contextError ? <p className="error-text">{contextError}</p> : null}

              <div className="tag-cloud">
                {(context?.shades.length ? context.shades : ["等待兴趣标签"]).map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>

              <div className="memory-stack">
                <div className="section-title">
                  <h3>软记忆切片</h3>
                  <span>{memoryPreview.length} 条</span>
                </div>
                {memoryPreview.length ? (
                  memoryPreview.map((item) => (
                    <article className="memory-card" key={`${item.title}-${item.summary}`}>
                      <h4>{item.title}</h4>
                      <p>{item.summary}</p>
                    </article>
                  ))
                ) : (
                  <article className="memory-card placeholder">
                    <h4>等待软记忆</h4>
                    <p>如果你的 SecondMe 账号暂时没有公开软记忆，这里会保持为空。</p>
                  </article>
                )}
              </div>
            </>
          )}
        </aside>

        <section className="workbench-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">工作台</p>
              <h2>描述一件你现在拿不准的事</h2>
            </div>
            <div className="workflow-steps">
              <span>输入问题</span>
              <span>判断可信人群</span>
              <span>给出下一步</span>
            </div>
          </div>

          <form className="question-form" onSubmit={handleSubmit}>
            <label className="question-field">
              <span>你的问题</span>
              <textarea
                name="question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="例如：我准备辞职转行做独立开发，这件事现在应该优先听谁的建议？"
                rows={7}
              />
            </label>

            <div className="sample-list">
              {SAMPLE_QUESTIONS.map((item) => (
                <button key={item} type="button" onClick={() => setQuestion(item)}>
                  {item}
                </button>
              ))}
            </div>

            {submitError ? <p className="error-text">{submitError}</p> : null}

            <div className="form-actions">
              <button className="primary-button" disabled={isSubmitting || !initialUser} type="submit">
                {isSubmitting ? "判断中..." : "开始判断"}
              </button>
              {!initialUser ? <span>需要先授权才能调用 SecondMe 分析。</span> : null}
            </div>
          </form>

          {result ? (
            <ResultBlock result={result} />
          ) : (
            <div className="empty-result">
              <p className="eyebrow">结果区</p>
              <h3>这里会输出“该听谁”和“下一步找谁问”</h3>
              <p>首版固定返回结构化结果，方便你在演示里快速讲清楚产品价值闭环。</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
