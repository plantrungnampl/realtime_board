import type { BoardMember } from "@/features/boards/types";

const MENTION_PATTERN = /(^|\s)@([a-zA-Z0-9_]{1,50})/g;

export function extractMentionIds(
  content: string,
  members: BoardMember[],
): string[] {
  if (!content.trim()) return [];
  const usernameMap = new Map(
    members.map((member) => [member.user.username.toLowerCase(), member.user.id]),
  );
  const unique = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = MENTION_PATTERN.exec(content)) !== null) {
    const username = match[2]?.toLowerCase();
    if (!username) continue;
    const id = usernameMap.get(username);
    if (id) {
      unique.add(id);
    }
  }
  return Array.from(unique);
}
