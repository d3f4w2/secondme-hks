import { createHash } from "node:crypto";

import type { SearchEvidence, Topic, TopicSource, TopicsPayload } from "@/lib/types";
import { fetchBillboardList, searchGlobal } from "@/lib/zhihu-openapi";

const FALLBACK_TOPICS: Topic[] = [
  {
    id: "hot-internship-gap",
    title: "实习越来越卷，非大厂经历还值得继续投吗？",
    summary:
      "热议点集中在实习门槛、转正概率和投入产出比。很多讨论已经从“要不要冲大厂”转向“什么经历真的能换来下一步机会”。",
    heat: "热榜 03",
    link: "https://www.zhihu.com/",
    tags: ["职业选择", "实习", "大厂"],
    entryMode: "hot",
    source: "mock",
    sourceLabel: "知乎热榜回退源",
    updatedAt: "刚刚更新",
  },
  {
    id: "hot-ai-entry-jobs",
    title: "AI 工具越来越强，初级岗位会先被替代吗？",
    summary:
      "争议点不在“会不会替代”，而在“先替代哪类工作、什么能力反而会更值钱”。",
    heat: "热榜 05",
    link: "https://www.zhihu.com/",
    tags: ["AI", "就业", "技能"],
    entryMode: "hot",
    source: "mock",
    sourceLabel: "知乎热榜回退源",
    updatedAt: "2 分钟前",
  },
  {
    id: "hot-study-abroad-return",
    title: "留学回国后竞争更激烈，学历红利还在吗？",
    summary:
      "讨论围绕学历信号、真实岗位匹配和地区差异展开，很多回答开始强调行业、城市和时机的组合判断。",
    heat: "热榜 08",
    link: "https://www.zhihu.com/",
    tags: ["留学", "求职", "城市选择"],
    entryMode: "hot",
    source: "mock",
    sourceLabel: "知乎热榜回退源",
    updatedAt: "5 分钟前",
  },
  {
    id: "hot-freelance-developer",
    title: "独立开发越来越火，现在辞职做个人项目还来得及吗？",
    summary:
      "支持者强调速度和自由，反对者强调现金流和分发能力，核心矛盾是“能力结构是否已经够了”。",
    heat: "热榜 11",
    link: "https://www.zhihu.com/",
    tags: ["独立开发", "副业", "创业"],
    entryMode: "hot",
    source: "mock",
    sourceLabel: "知乎热榜回退源",
    updatedAt: "7 分钟前",
  },
  {
    id: "hot-product-transition",
    title: "从运营转产品经理，是能力升级还是路径误判？",
    summary:
      "讨论从岗位名词争论转向真实业务环境：谁有机会带、谁能给反馈、转岗后第一年最容易踩什么坑。",
    heat: "热榜 14",
    link: "https://www.zhihu.com/",
    tags: ["转行", "产品经理", "运营"],
    entryMode: "hot",
    source: "mock",
    sourceLabel: "知乎热榜回退源",
    updatedAt: "10 分钟前",
  },
];

const FALLBACK_SEARCH_SEED: SearchEvidence[] = [
  {
    id: "fallback-source-1",
    query: "",
    title: "高赞回答通常只展示结果，不展示代价。",
    summary: "看热榜时，最该补的不是新观点，而是建议背后的资源条件和失败成本。",
    link: "https://www.zhihu.com/",
    author: "答主@职业复盘观察者",
    authorityLevel: "中高",
    featuredComment: "没有代价说明的成功经验，默认不具备普遍性。",
    source: "mock",
    sourceLabel: "知乎可信搜回退源",
  },
  {
    id: "fallback-source-2",
    query: "",
    title: "离现场最近的人，不一定最会表达，但最能说明真实门槛。",
    summary: "判断谁值得继续听，先找能把第一步障碍和隐形门槛说具体的人。",
    link: "https://www.zhihu.com/",
    author: "答主@一线岗位亲历者",
    authorityLevel: "高",
    featuredComment: "能讲清第一步怎么做的人，比只讲趋势的人更有参考价值。",
    source: "mock",
    sourceLabel: "知乎可信搜回退源",
  },
  {
    id: "fallback-source-3",
    query: "",
    title: "真正有帮助的建议，通常同时包含正反案例。",
    summary: "如果一个观点只有鼓励、没有反例，那更像情绪感染，不像可执行建议。",
    link: "https://www.zhihu.com/",
    author: "答主@风险过滤派",
    authorityLevel: "中",
    featuredComment: "先看失败样本，再看自己能否承受类似代价。",
    source: "mock",
    sourceLabel: "知乎可信搜回退源",
  },
];

type CacheEntry<T> = {
  expiresAt: number;
  payload: T;
};

type SearchCacheShape = Map<string, CacheEntry<SearchEvidence[]>>;

declare global {
  var __zhaoshuiHotTopicsCache: CacheEntry<TopicsPayload> | undefined;
  var __zhaoshuiSearchCache: SearchCacheShape | undefined;
}

function billboardCacheTtlMs() {
  const raw = Number(process.env.ZHIHU_BILLBOARD_CACHE_TTL_SECONDS ?? "180");
  return Math.max(raw, 30) * 1000;
}

function searchCacheTtlMs() {
  const raw = Number(process.env.ZHIHU_SEARCH_CACHE_TTL_SECONDS ?? "21600");
  return Math.max(raw, 300) * 1000;
}

function maxSearchResults() {
  const raw = Number(process.env.ZHIHU_SEARCH_COUNT ?? "5");
  return Math.min(Math.max(raw, 1), 8);
}

function getSearchCache() {
  if (!globalThis.__zhaoshuiSearchCache) {
    globalThis.__zhaoshuiSearchCache = new Map();
  }

  return globalThis.__zhaoshuiSearchCache;
}

function hashId(input: string) {
  return createHash("sha1").update(input).digest("hex").slice(0, 12);
}

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function firstArray(value: unknown[]) {
  for (const item of value) {
    if (Array.isArray(item)) {
      return item;
    }
  }

  return [];
}

function extractArrayFromPayload(payload: Record<string, unknown>) {
  const data = payload.data;

  if (Array.isArray(data)) {
    return data;
  }

  const nested = data && typeof data === "object" ? (data as Record<string, unknown>) : undefined;

  return firstArray([
    payload.list,
    payload.items,
    payload.results,
    nested?.list,
    nested?.items,
    nested?.results,
    nested?.data,
  ]);
}

function readTags(record: Record<string, unknown>) {
  const raw = record.tags ?? record.topics ?? record.labels;

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }

      if (item && typeof item === "object") {
        return readString(item as Record<string, unknown>, ["name", "title", "label"]);
      }

      return "";
    })
    .filter(Boolean)
    .slice(0, 4);
}

function normalizeTopicItem(rawItem: unknown, source: TopicSource): Topic | null {
  if (!rawItem || typeof rawItem !== "object") {
    return null;
  }

  const item = rawItem as Record<string, unknown>;
  const nested: Record<string, unknown> = (() => {
    if (item.target && typeof item.target === "object") {
      return item.target as Record<string, unknown>;
    }

    if (item.question && typeof item.question === "object") {
      return item.question as Record<string, unknown>;
    }

    return item;
  })();
  const title = readString(nested, ["title", "name"]);

  if (!title) {
    return null;
  }

  const summary =
    readString(nested, ["excerpt", "summary", "description", "answer_abstract", "body"]) ||
    readString(item, ["detail_text", "caption", "body"]) ||
    "该议题目前在社区内引发了明显分歧，适合进入多代理讨论。";
  const link =
    readString(nested, ["url", "link", "link_url"]) ||
    readString(item, ["url", "link", "link_url"]) ||
    "https://www.zhihu.com/";
  const heatScoreRaw =
    (typeof item.heat_score === "number" && item.heat_score) ||
    (typeof nested.heat_score === "number" && nested.heat_score) ||
    undefined;
  const heat =
    readString(item, ["detail_text", "heat", "metrics", "score"]) ||
    readString(nested, ["heat", "followers"]) ||
    (heatScoreRaw ? `热度 ${heatScoreRaw.toLocaleString("zh-CN")}` : "热度上升中");
  const tags = readTags(nested).length ? readTags(nested) : readTags(item);
  const answers = Array.isArray(item.answers) ? item.answers : [];
  const firstAnswer = answers.find((entry) => entry && typeof entry === "object") as
    | Record<string, unknown>
    | undefined;
  const leadAnswer =
    (firstAnswer &&
      (readString(firstAnswer, ["body", "summary", "content_text"]) || "").slice(0, 220)) ||
    undefined;
  const token =
    readString(item, ["token"]) ||
    readString(nested, ["token"]) ||
    undefined;
  const updatedAt =
    readString(item, ["published_time_str"]) ||
    readString(nested, ["published_time_str"]) ||
    "刚刚更新";

  return {
    id: hashId(title + link),
    title,
    summary,
    leadAnswer,
    heat,
    heatScore: heatScoreRaw,
    link,
    token,
    tags,
    entryMode: "hot",
    source,
    sourceLabel: source === "zhihu_api" ? "知乎热榜接口" : "知乎热榜回退源",
    updatedAt,
  };
}

function normalizeSearchEvidence(
  rawItem: unknown,
  source: TopicSource,
  query: string,
): SearchEvidence | null {
  if (!rawItem || typeof rawItem !== "object") {
    return null;
  }

  const item = rawItem as Record<string, unknown>;
  const target =
    asRecord(item.target) ||
    asRecord(item.question) ||
    asRecord(item.answer) ||
    asRecord(item.article) ||
    item;
  const authorRecord = asRecord(target.author) || asRecord(item.author);
  const selectedComment =
    asRecord(item.selected_comment) || asRecord(target.selected_comment);
  const title =
    readString(target, ["title", "name"]) ||
    readString(item, ["title", "name"]);

  if (!title) {
    return null;
  }

  const summary =
    readString(target, ["excerpt", "summary", "answer_abstract", "description", "content_text"]) ||
    readString(item, ["summary", "excerpt", "description", "content_text"]) ||
    "这条知乎内容可以作为当前议题的补充参考。";
  const link =
    readString(target, ["url", "link"]) ||
    readString(item, ["url", "link"]) ||
    "https://www.zhihu.com/";
  const author =
    (authorRecord && readString(authorRecord, ["name", "headline"])) ||
    readString(item, ["author_name"]);
  const authorityLevel =
    (authorRecord && readString(authorRecord, ["authority_level", "authorityLevel", "level"])) ||
    readString(item, ["authority_level", "authorityLevel"]);
  const featuredComment =
    (selectedComment && readString(selectedComment, ["content", "summary", "excerpt"])) ||
    (Array.isArray(item.comment_info_list) &&
      item.comment_info_list.find((entry) => entry && typeof entry === "object") &&
      readString(
        item.comment_info_list.find((entry) => entry && typeof entry === "object") as Record<
          string,
          unknown
        >,
        ["content"],
      )) ||
    readString(item, ["selected_comment", "featured_comment"]);
  const voteUpCount =
    (typeof item.vote_up_count === "number" && item.vote_up_count) ||
    (typeof target.vote_up_count === "number" && target.vote_up_count) ||
    undefined;
  const commentCount =
    (typeof item.comment_count === "number" && item.comment_count) ||
    (typeof target.comment_count === "number" && target.comment_count) ||
    undefined;
  const contentType =
    readString(item, ["content_type", "type"]) ||
    readString(target, ["content_type", "type"]) ||
    undefined;
  const contentId =
    readString(item, ["content_id", "token"]) ||
    readString(target, ["content_id", "token"]) ||
    undefined;

  return {
    id: hashId(`${query}:${title}:${link}`),
    query,
    title,
    summary,
    link,
    contentType,
    contentId,
    author: author || undefined,
    authorityLevel: authorityLevel || undefined,
    featuredComment: featuredComment || undefined,
    voteUpCount,
    commentCount,
    source,
    sourceLabel: source === "zhihu_api" ? "知乎可信搜" : "知乎可信搜回退源",
  };
}

function buildFallbackSearchEvidence(query: string) {
  return FALLBACK_SEARCH_SEED.map((item) => ({
    ...item,
    id: hashId(`${query}:${item.title}`),
    query,
  }));
}

function buildSearchCacheKey(query: string) {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildQuestionTags(question: string, evidence: SearchEvidence[]) {
  const tags = ["自定义问题"];
  const contentTag = evidence.find((item) => item.contentType)?.contentType;
  const authorTag = evidence.find((item) => item.author)?.author;

  if (contentTag) {
    tags.push(contentTag);
  }

  if (authorTag) {
    tags.push(authorTag.replace(/^答主@/, ""));
  }

  if (question.includes("职业") || question.includes("求职")) {
    tags.push("职业判断");
  } else if (question.includes("创业") || question.includes("项目")) {
    tags.push("项目判断");
  } else if (question.includes("学习")) {
    tags.push("学习决策");
  }

  return Array.from(new Set(tags)).slice(0, 4);
}

async function fetchConfiguredTopics(): Promise<Topic[] | null> {
  const payload = await fetchBillboardList(
    Number(process.env.ZHIHU_BILLBOARD_TOP_CNT ?? "20"),
    Number(process.env.ZHIHU_BILLBOARD_PUBLISH_IN_HOURS ?? "48"),
  );
  const raw = extractArrayFromPayload(payload as unknown as Record<string, unknown>);
  const topics = raw
    .map((item) => normalizeTopicItem(item, "zhihu_api"))
    .filter((item): item is Topic => Boolean(item))
    .slice(0, 10);

  return topics.length ? topics : null;
}

export async function getHotTopics(): Promise<TopicsPayload> {
  const cache = globalThis.__zhaoshuiHotTopicsCache;

  if (cache && cache.expiresAt > Date.now()) {
    return cache.payload;
  }

  let payload: TopicsPayload;

  try {
    const configuredTopics = await fetchConfiguredTopics();

    if (configuredTopics) {
      payload = {
        topics: configuredTopics,
        source: "zhihu_api",
        usingFallback: false,
      };
      globalThis.__zhaoshuiHotTopicsCache = {
        expiresAt: Date.now() + billboardCacheTtlMs(),
        payload,
      };
      return payload;
    }
  } catch {
    payload = {
      topics: FALLBACK_TOPICS,
      source: "mock",
      usingFallback: true,
    };
    globalThis.__zhaoshuiHotTopicsCache = {
      expiresAt: Date.now() + 60_000,
      payload,
    };
    return payload;
  }

  payload = {
    topics: FALLBACK_TOPICS,
    source: "mock",
    usingFallback: true,
  };
  globalThis.__zhaoshuiHotTopicsCache = {
    expiresAt: Date.now() + 60_000,
    payload,
  };

  return payload;
}

export async function getCredibleSearchEvidence(query: string) {
  const normalizedQuery = buildSearchCacheKey(query);
  const cache = getSearchCache().get(normalizedQuery);

  if (cache && cache.expiresAt > Date.now()) {
    return {
      evidence: cache.payload,
      source: cache.payload.some((item) => item.source === "zhihu_api") ? "zhihu_api" : "mock",
      usingFallback: cache.payload.every((item) => item.source === "mock"),
    } as const;
  }

  let evidence: SearchEvidence[];

  try {
    const payload = await searchGlobal(normalizedQuery, maxSearchResults());
    const raw = extractArrayFromPayload(payload);

    evidence = raw
      .map((item) => normalizeSearchEvidence(item, "zhihu_api", normalizedQuery))
      .filter((item): item is SearchEvidence => Boolean(item))
      .slice(0, maxSearchResults());

    if (!evidence.length) {
      evidence = buildFallbackSearchEvidence(normalizedQuery);
    }
  } catch {
    evidence = buildFallbackSearchEvidence(normalizedQuery);
  }

  getSearchCache().set(normalizedQuery, {
    expiresAt: Date.now() + searchCacheTtlMs(),
    payload: evidence,
  });

  return {
    evidence,
    source: evidence.some((item) => item.source === "zhihu_api") ? "zhihu_api" : "mock",
    usingFallback: evidence.every((item) => item.source === "mock"),
  } as const;
}

export async function createTopicFromQuestion(question: string) {
  const normalizedQuestion = question.trim();
  const searchPayload = await getCredibleSearchEvidence(normalizedQuestion);
  const lead = searchPayload.evidence[0];
  const topic: Topic = {
    id: `question-${hashId(normalizedQuestion)}`,
    title: normalizedQuestion,
    summary:
      lead?.summary ??
      "这是一个由用户主动发起的真实问题，系统会去知乎检索相近讨论并组织多代理交锋。",
    leadAnswer: lead?.featuredComment ?? lead?.summary,
    heat: "用户问题",
    heatScore: undefined,
    link: lead?.link ?? "https://www.zhihu.com/",
    token: lead?.contentId,
    tags: buildQuestionTags(normalizedQuestion, searchPayload.evidence),
    entryMode: "custom",
    originalQuestion: normalizedQuestion,
    source: searchPayload.source,
    sourceLabel: searchPayload.source === "zhihu_api" ? "知乎问题检索" : "问题检索回退源",
    updatedAt: "刚刚创建",
  };

  return {
    topic,
    evidence: searchPayload.evidence,
    source: searchPayload.source,
    usingFallback: searchPayload.usingFallback,
  } as const;
}
