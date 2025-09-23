/** Detects the system-declined out-of-scope reply to show a chip. */
export function isOutOfScope(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes("professional avatar") && t.includes("happy to talk");
}
