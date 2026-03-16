export type SessionUser = {
  userId: string;
  name: string;
  route?: string;
  avatar?: string;
  bio?: string;
  selfIntroduction?: string;
};

export type SessionPayload = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: SessionUser;
};

export type UserContext = {
  user: SessionUser;
  shades: string[];
  softMemory: Array<{
    title: string;
    summary: string;
  }>;
};

export type AnalysisResult = {
  questionType: string;
  shouldListenTo: Array<{
    who: string;
    reason: string;
  }>;
  avoidFirst: Array<{
    who: string;
    reason: string;
  }>;
  nextStep: {
    who: string;
    why: string;
    prompt: string;
  };
  confidenceNote: string;
};

export type TopicSource = "zhihu_api" | "mock";

export type SearchEvidence = {
  id: string;
  query: string;
  title: string;
  summary: string;
  link: string;
  author?: string;
  authorityLevel?: string;
  featuredComment?: string;
  source: TopicSource;
  sourceLabel: string;
};

export type Topic = {
  id: string;
  title: string;
  summary: string;
  heat: string;
  link: string;
  tags: string[];
  source: TopicSource;
  sourceLabel: string;
  updatedAt: string;
};

export type AgentParticipant = {
  id: string;
  name: string;
  role: string;
  stance: string;
  accent: "ochre" | "sage" | "ink" | "red";
};

export type AgentTurnKind =
  | "opening"
  | "challenge"
  | "bridge"
  | "summary"
  | "follow_up";

export type AgentTurn = {
  id: string;
  agentId: string;
  agentName: string;
  role: string;
  kind: AgentTurnKind;
  round: number;
  message: string;
  evidence: string[];
  sourceIds: string[];
};

export type RoomSummary = {
  topicAngle: string;
  listenTo: string;
  caution: string;
  followUpTargetId: string;
  followUpTargetName: string;
  followUpPrompt: string;
  takeaways: string[];
};

export type RoomState = {
  id: string;
  topic: Topic;
  participants: AgentParticipant[];
  turns: AgentTurn[];
  summary: RoomSummary;
  searchEvidence: SearchEvidence[];
  searchSource: TopicSource;
  source: "generated" | "mock";
  createdAt: number;
  personalizedFor?: string;
  status: "ready";
};

export type TopicsPayload = {
  topics: Topic[];
  source: TopicSource;
  usingFallback: boolean;
};
