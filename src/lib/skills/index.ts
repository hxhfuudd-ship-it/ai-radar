import type { Skill } from './types';
import { repoReaderSkill } from './repo-reader';
import { summarizerSkill } from './summarizer';
import { comparatorSkill } from './comparator';

const skillRegistry = new Map<string, Skill>();

function register(skill: Skill) {
  skillRegistry.set(skill.name, skill);
}

register(repoReaderSkill);
register(summarizerSkill);
register(comparatorSkill);

export function getSkill(name: string): Skill | undefined {
  return skillRegistry.get(name);
}

export function listSkills(): Skill[] {
  return Array.from(skillRegistry.values());
}

export { type Skill } from './types';
