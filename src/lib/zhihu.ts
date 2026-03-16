import { createHash } from "node:crypto";

import type { Topic, TopicSource, TopicsPayload } from "@/lib/types";
import { fetchBillboardList } from "@/lib/zhihu-openapi";

const FALLBACK_TOPICS: Topic[] = [
  {
    id: "hot-internship-gap",
    title: "实习越来越卷，非大厂经历还值得继续投吗？",
    summary:
      "热议点集中在实习门槛、转正概率和投入产出比。很多讨论已经从“要不要冲大厂”转向“什么经历真的能换来下一步机会”。",
    heat: "热榜 03",
    link: "https://www.zhihu.com/",
    tags: ["职业选择", "实习", "大厂"],
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
    source: "mock",
    sourceLabel: "知乎热榜回退源",
    updatedAt: "10 分钟前",
  },
];

let hotTopicsCache:
  | {
      expiresAt: number;
      payload: TopicsPayload;
    }
  | undefined;

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
    readString(nested, ["excerpt", "summary", "description", "answer_abstract"]) ||
    readString(item, ["detail_text", "caption"]) ||
    "该议题目前在社区内引发了明显分歧，适合进入多代理讨论。";
  const link =
    readString(nested, ["url", "link"]) ||
    readString(item, ["url", "link"]) ||
    "https://www.zhihu.com/";
  const heat =
    readString(item, ["detail_text", "heat", "metrics", "score"]) ||
    readString(nested, ["heat", "followers"]) ||
    "热度上升中";
  const tags = readTags(nested).length ? readTags(nested) : readTags(item);

  return {
    id: hashId(title + link),
    title,
    summary,
    heat,
    link,
    tags,
    source,
    sourceLabel: source === "zhihu_api" ? "知乎热榜接口" : "知乎热榜回退源",
    updatedAt: "刚刚更新",
  };
}

async function fetchConfiguredTopics(): Promise<Topic[] | null> {
  const payload = await fetchBillboardList(
    Number(process.env.ZHIHU_BILLBOARD_HOURS ?? "12"),
  );
  const raw =
    (Array.isArray(payload.data) && payload.data) ||
    (Array.isArray(payload.list) && payload.list) ||
    [];
  const topics = raw
    .map((item) => normalizeTopicItem(item, "zhihu_api"))
    .filter((item): item is Topic => Boolean(item))
    .slice(0, 10);

  return topics.length ? topics : null;
}

export async function getHotTopics(): Promise<TopicsPayload> {
  if (hotTopicsCache && hotTopicsCache.expiresAt > Date.now()) {
    return hotTopicsCache.payload;
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
      hotTopicsCache = {
        expiresAt: Date.now() + 1000 * 60 * 3,
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
    hotTopicsCache = {
      expiresAt: Date.now() + 1000 * 60,
      payload,
    };
    return payload;
  }

  payload = {
    topics: FALLBACK_TOPICS,
    source: "mock",
    usingFallback: true,
  };
  hotTopicsCache = {
    expiresAt: Date.now() + 1000 * 60,
    payload,
  };

  return payload;
}
