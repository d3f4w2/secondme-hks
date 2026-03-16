import { randomUUID } from "node:crypto";

import {
  generateDiscussionRoom,
  generateFollowUpReply,
} from "@/lib/secondme";
import type {
  AgentParticipant,
  AgentTurn,
  RoomState,
  RoomSummary,
  Topic,
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

function createParticipants(_topic: Topic): AgentParticipant[] {
  return [
    {
      id: "field_operator",
      name: "答主@一线从业者",
      role: "离现场最近的行业实践者代理",
      stance: "优先讲真实门槛、资源和执行成本",
      accent: "ochre",
    },
    {
      id: "mentor_recap",
      name: "答主@过来人复盘",
      role: "经历过类似选择的知乎用户代理",
      stance: "擅长拆解阶段性得失和常见误判",
      accent: "sage",
    },
    {
      id: "framework_writer",
      name: "答主@高赞方法派",
      role: "善于搭框架和抽象判断标准的答主代理",
      stance: "负责把零散观点收束成判断模型",
      accent: "ink",
    },
    {
      id: "risk_editor",
      name: "答主@冷水观察员",
      role: "专门找叙事泡沫和幸存者偏差的代理",
      stance: "负责提醒代价、样本偏差和被忽略的风险",
      accent: "red",
    },
  ];
}

function buildTurn(
  participant: AgentParticipant,
  round: number,
  kind: AgentTurn["kind"],
  message: string,
  evidence: string[],
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
  };
}

function buildMockRoom(topic: Topic, participants: AgentParticipant[], context?: UserContext): RoomState {
  const [field, mentor, method, risk] = participants;
  const userHint = context?.user.name ? `对 ${context.user.name} 这种用户来说，` : "";

  const turns = [
    buildTurn(
      field,
      1,
      "opening",
      `这个话题能上热榜，说明大家争论的不是“要不要做”，而是“谁真的有资格给建议”。从一线看，先看信息是不是来自真正做过这件事的人。`,
      [topic.title, `热度信号：${topic.heat}`],
    ),
    buildTurn(
      mentor,
      1,
      "opening",
      `我同意要先找做过的人，但只听成功样本也会失真。过来人最该补的是路径代价：花了多久、踩了哪些坑、有没有隐形资源。`,
      ["经验复盘比结果展示更有价值"],
    ),
    buildTurn(
      method,
      2,
      "challenge",
      `你们都在强调“谁做过”，但用户真正缺的是判断框架。我会先把问题拆成资源门槛、时间窗口和失败成本，再看谁的回答覆盖得最完整。`,
      ["先看判断维度，再看回答者身份"],
    ),
    buildTurn(
      risk,
      2,
      "challenge",
      `这里最危险的是被高热度叙事带偏。很多热门回答看起来像建议，实际上是在讲自己的好运气。没有代价说明和反例说明的，一律先降权。`,
      ["警惕幸存者偏差", "高热度不等于高可信"],
    ),
    buildTurn(
      field,
      3,
      "bridge",
      `${userHint}最先该追问的是“如果我现在就做，第一步会卡在哪”。能把卡点说具体的人，才比纯观点更值得继续问。`,
      ["优先追问第一步障碍", "具体执行比抽象鼓励更重要"],
    ),
    buildTurn(
      method,
      3,
      "summary",
      `这场讨论可以先收束成一句话：先听离现场最近、又愿意把代价讲清楚的人，再让冷水派帮你过滤掉情绪化和幸存者偏差的建议。`,
      ["可信度来自现场性和代价透明"],
    ),
  ];

  const summary: RoomSummary = {
    topicAngle: "这个热点真正争的是：谁的建议有现场性、可执行性和代价透明度。",
    listenTo: "优先听一线从业者和愿意讲失败细节的过来人，而不是只会给热血结论的人。",
    caution: "最该防的是把单个高赞样本误认为普遍路径，尤其是没有成本说明的成功故事。",
    followUpTargetId: mentor.id,
    followUpTargetName: mentor.name,
    followUpPrompt: "如果我按你说的路径走，第一步最容易踩的坑是什么？我该怎么提前规避？",
    takeaways: [
      "先找真正做过的人，不先找情绪最强的人。",
      "每条建议都要追问时间成本、资源条件和失败代价。",
      "让冷水派代理帮你过滤掉热榜叙事里的幸存者偏差。",
    ],
  };

  return {
    id: randomUUID(),
    topic,
    participants,
    turns,
    summary,
    source: "mock",
    createdAt: Date.now(),
    personalizedFor: context?.user.name,
    status: "ready",
  };
}

function hydrateGeneratedRoom(
  topic: Topic,
  participants: AgentParticipant[],
  generated: Awaited<ReturnType<typeof generateDiscussionRoom>>,
  context?: UserContext,
): RoomState {
  const participantMap = new Map(participants.map((item) => [item.id, item]));
  const turns = generated.turns.map((turn) => {
    const participant = participantMap.get(turn.agentId) ?? participants[0];
    return buildTurn(
      participant,
      turn.round,
      turn.kind,
      turn.message,
      turn.evidence.slice(0, 2),
    );
  });
  const followUpParticipant =
    participantMap.get(generated.summary.followUpTargetId) ?? participants[1] ?? participants[0];

  return {
    id: randomUUID(),
    topic,
    participants,
    turns,
    summary: {
      ...generated.summary,
      followUpTargetId: followUpParticipant.id,
      followUpTargetName: followUpParticipant.name,
      takeaways: generated.summary.takeaways.slice(0, 3),
    },
    source: "generated",
    createdAt: Date.now(),
    personalizedFor: context?.user.name,
    status: "ready",
  };
}

export async function createRoomForTopic(options: {
  topic: Topic;
  accessToken?: string;
  userContext?: UserContext;
}) {
  const participants = createParticipants(options.topic);
  let room = buildMockRoom(options.topic, participants, options.userContext);

  if (options.accessToken) {
    try {
      const generated = await generateDiscussionRoom(
        options.accessToken,
        options.topic,
        participants,
        options.userContext,
      );
      room = hydrateGeneratedRoom(options.topic, participants, generated, options.userContext);
    } catch {
      room = buildMockRoom(options.topic, participants, options.userContext);
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
  let reply = buildTurn(
    participant,
    room.turns.length + 1,
    "follow_up",
    `如果把这件事落到下一步，我会先验证最容易被忽略的门槛，再决定是否继续投入。你可以先把自己的起点、约束和可承受代价讲清楚。`,
    ["先补充个人约束条件", "先验证最低成本试错路径"],
  );

  if (options.accessToken) {
    try {
      const generated = await generateFollowUpReply(
        options.accessToken,
        room.topic,
        participant,
        room.turns,
        options.question,
        options.userContext,
      );
      reply = buildTurn(
        participant,
        room.turns.length + 1,
        "follow_up",
        generated.reply,
        generated.evidence.slice(0, 2),
      );
    } catch {
      reply = buildTurn(
        participant,
        room.turns.length + 1,
        "follow_up",
        `如果你真的要往前走，我建议先把自己的资源边界讲清楚：时间、预算、试错次数和你最怕失去什么。只有这些条件明确了，建议才不会继续空转。`,
        ["追问个人资源边界", "把建议落回具体约束"],
      );
    }
  }

  const nextRoom: RoomState = {
    ...room,
    turns: [...room.turns, reply],
    summary: {
      ...room.summary,
      followUpTargetId: participant.id,
      followUpTargetName: participant.name,
    },
  };

  getRoomStore().set(room.id, nextRoom);

  return nextRoom;
}
