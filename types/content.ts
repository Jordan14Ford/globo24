import type { CuratedBy } from "./pipeline";

export interface StoryRecord {
  storyId: string;
  runId: string;
  digestId: string;
  pipelineMode: "topics" | "regions";
  sectionId: string;
  sectionLabel: string;
  title: string;
  link: string;
  summary: string;
  publishedAt: string | null;
  domain: string;
  sourceFeedName: string;
  capturedAt: string;
}

export interface DigestRecord {
  digestId: string;
  runId: string;
  pipelineMode: "topics" | "regions";
  generatedAt: string;
  storyCount: number;
  sectionCounts: Record<string, number>;
  curatedBy?: CuratedBy | "openai" | "keyword_fallback";
  slice?: boolean;
  sliceTopics?: string[];
  artifactsRelPath?: string;
  capturedAt: string;
}

export interface StoryStoreFile {
  version: 1;
  stories: StoryRecord[];
}

export interface DigestStoreFile {
  version: 1;
  digests: DigestRecord[];
}
