export function parseTags(input: string): string[] {
  const tags = input
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.toLowerCase());
  return Array.from(new Set(tags)).slice(0, 25);
}

