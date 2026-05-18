type ExternalSkillSourceLike = {
  name: string;
  path: string;
  source: string;
};

const BLOCKED_EXTERNAL_SOURCE_NAMES = [/gemini/i, /claude/i, /anthropic/i];
const BLOCKED_EXTERNAL_SOURCE_PATHS = /[\\/]\.(gemini|claude)([\\/]|$)|anthropic/i;

export const isVisibleExternalSkillSource = (source: ExternalSkillSourceLike): boolean => {
  if (BLOCKED_EXTERNAL_SOURCE_NAMES.some((pattern) => pattern.test(source.name) || pattern.test(source.source))) {
    return false;
  }

  return !BLOCKED_EXTERNAL_SOURCE_PATHS.test(source.path);
};

export const filterVisibleExternalSkillSources = <T extends ExternalSkillSourceLike>(sources: T[]): T[] =>
  sources.filter(isVisibleExternalSkillSource);
