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
  contentType?: string;
  contentId?: string;
  author?: string;
  authorityLevel?: string;
  featuredComment?: string;
  voteUpCount?: number;
  commentCount?: number;
  source: TopicSource;
  sourceLabel: string;
};

export type Topic = {
  id: string;
  title: string;
  summary: string;
  leadAnswer?: string;
  heat: string;
  heatScore?: number;
  link: string;
  token?: string;
  tags: string[];
  entryMode?: "hot" | "custom";
  originalQuestion?: string;
  source: TopicSource;
  sourceLabel: string;
  updatedAt: string;
};

export type AgentSourceBinding = {
  kind: "zhihu_author" | "synthesized";
  displayName: string;
  descriptor: string;
  whySelected: string;
  evidenceIds: string[];
};

export type AgentParticipant = {
  id: string;
  name: string;
  role: string;
  stance: string;
  persona: string;
  debateStyle: string;
  contribution: string;
  source: AgentSourceBinding;
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

export type DiscussionGoal = {
  headline: string;
  userNeed: string;
  successSignal: string;
  personalizedAngle: string;
};

export type ActionPlanStep = {
  id: string;
  title: string;
  why: string;
  howToStart: string;
  risk: string;
  owner: string;
};

export type ActionPlan = {
  headline: string;
  firstMove: string;
  steps: ActionPlanStep[];
  riskChecks: string[];
  validationQuestions: string[];
};

export type RecommendedAgent = {
  agentId: string;
  agentName: string;
  why: string;
  whenToAsk: string;
};

export type ArgumentNodeType =
  | "goal"
  | "claim"
  | "challenge"
  | "synthesis"
  | "decision"
  | "action"
  | "question"
  | "evidence";

export type ArgumentNodeStage = "brief" | "collision" | "resolution" | "action";

export type ArgumentNode = {
  id: string;
  type: ArgumentNodeType;
  stage: ArgumentNodeStage;
  title: string;
  summary: string;
  order: number;
  emphasis: "core" | "support" | "risk";
  agentId?: string;
  agentName?: string;
  sourceIds: string[];
};

export type ArgumentEdgeRelation =
  | "supports"
  | "rebuts"
  | "questions"
  | "bridges"
  | "grounds"
  | "unlocks";

export type ArgumentEdge = {
  id: string;
  from: string;
  to: string;
  relation: ArgumentEdgeRelation;
  label: string;
  order: number;
};

export type FollowUpRecord = {
  id: string;
  question: string;
  targetAgentId: string;
  targetAgentName: string;
  replyTurnId?: string;
  createdAt: number;
};

export type RoomSummary = {
  discussionGoal: DiscussionGoal;
  outcomeHeadline: string;
  keyTension: string;
  consensus: string[];
  conflicts: string[];
  openQuestions: string[];
  whoToAsk: RecommendedAgent[];
  recommendedNextStep: string;
  followUpTargetId: string;
  followUpTargetName: string;
  followUpPrompt: string;
  actionPlan: ActionPlan;
};

export type RoomState = {
  id: string;
  topic: Topic;
  participants: AgentParticipant[];
  turns: AgentTurn[];
  summary: RoomSummary;
  argumentNodes: ArgumentNode[];
  argumentEdges: ArgumentEdge[];
  searchEvidence: SearchEvidence[];
  followUps: FollowUpRecord[];
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
