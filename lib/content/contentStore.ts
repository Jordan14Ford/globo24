import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  DigestRecord,
  DigestStoreFile,
  StoryRecord,
  StoryStoreFile,
} from "../../types/content";
import type { MasterCuratedOutput, RegionalPipelineOutput } from "../../types/pipeline";

const STORIES_PATH = path.join(process.cwd(), "data", "stories.json");
const DIGESTS_PATH = path.join(process.cwd(), "data", "digests.json");

function ensureDir(filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function atomicWrite<T>(filePath: string, data: T): void {
  ensureDir(filePath);
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  renameSync(tmp, filePath);
}

function loadStories(filePath = STORIES_PATH): StoryStoreFile {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as StoryStoreFile;
    if (parsed?.version !== 1 || !Array.isArray(parsed.stories)) return { version: 1, stories: [] };
    return parsed;
  } catch {
    return { version: 1, stories: [] };
  }
}

function loadDigests(filePath = DIGESTS_PATH): DigestStoreFile {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as DigestStoreFile;
    if (parsed?.version !== 1 || !Array.isArray(parsed.digests)) return { version: 1, digests: [] };
    return parsed;
  } catch {
    return { version: 1, digests: [] };
  }
}

function keepLast<T>(rows: T[], n: number): T[] {
  return rows.length > n ? rows.slice(-n) : rows;
}

function storyMax(): number {
  const v = Number(process.env.STORY_HISTORY_MAX ?? 5000);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 5000;
}

function digestMax(): number {
  const v = Number(process.env.DIGEST_HISTORY_MAX ?? 1000);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 1000;
}

export function loadStoryRecords(): StoryRecord[] {
  return loadStories().stories;
}

export function loadDigestRecords(): DigestRecord[] {
  return loadDigests().digests;
}

interface PersistArgs {
  runId: string;
  pipelineMode: "topics" | "regions";
  payload: MasterCuratedOutput | RegionalPipelineOutput;
  slice?: boolean;
  sliceTopics?: string[];
  artifactsRelPath?: string;
}

export function persistStoriesAndDigest(args: PersistArgs): void {
  const digestId = args.runId;
  const capturedAt = new Date().toISOString();
  const stories: StoryRecord[] = [];
  const sectionCounts: Record<string, number> = {};

  if ("sections" in args.payload) {
    for (const [sectionId, arr] of Object.entries(args.payload.sections)) {
      sectionCounts[sectionId] = arr.length;
      arr.forEach((a, i) =>
        stories.push({
          storyId: `${digestId}:${sectionId}:${i}`,
          runId: args.runId,
          digestId,
          pipelineMode: "topics",
          sectionId,
          sectionLabel: sectionId,
          title: a.title,
          link: a.link,
          summary: a.summary,
          publishedAt: a.publishedAt,
          domain: a.domain,
          sourceFeedName: a.sourceFeedName,
          capturedAt,
        })
      );
    }
  } else {
    for (const region of args.payload.regions) {
      sectionCounts[region.regionId] = region.topStories.length;
      region.topStories.forEach((a, i) =>
        stories.push({
          storyId: `${digestId}:${region.regionId}:${i}`,
          runId: args.runId,
          digestId,
          pipelineMode: "regions",
          sectionId: region.regionId,
          sectionLabel: region.regionName,
          title: a.title,
          link: a.link,
          summary: a.summary,
          publishedAt: a.publishedAt,
          domain: a.domain,
          sourceFeedName: a.sourceFeedName,
          capturedAt,
        })
      );
    }
  }

  const digest: DigestRecord = {
    digestId,
    runId: args.runId,
    pipelineMode: args.pipelineMode,
    generatedAt: args.payload.generatedAt,
    storyCount: stories.length,
    sectionCounts,
    curatedBy: "sections" in args.payload ? args.payload.curatedBy : undefined,
    slice: args.slice,
    sliceTopics: args.sliceTopics,
    artifactsRelPath: args.artifactsRelPath,
    capturedAt,
  };

  const storyFile = loadStories();
  storyFile.stories.push(...stories);
  storyFile.stories = keepLast(storyFile.stories, storyMax());
  atomicWrite(STORIES_PATH, storyFile);

  const digestFile = loadDigests();
  digestFile.digests.push(digest);
  digestFile.digests = keepLast(digestFile.digests, digestMax());
  atomicWrite(DIGESTS_PATH, digestFile);
}
