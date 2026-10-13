/**
 * Line splitting shared by the form and the export, so the two cannot disagree.
 *
 * A `repeatOf` question is saved as `${id}__${i}`, where `i` is the index of the
 * parent answer's line AS THE FORM COUNTED IT: split on newlines, trimmed,
 * blanks dropped. The export used to count the parent with a comma split as
 * well, so a client who typed "Belper, Alfreton" on one line got Alfreton's
 * villages (and every later area's) attached to the wrong town. Index by
 * `parentLines`, then expand each line with `splitItems`.
 */
export const parentLines = (raw: unknown): string[] =>
  String(raw ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

/** Bullets and stray numbering typed on a phone. */
export const cleanItem = (l: string) =>
  l.trim().replace(/^[-*•]\s*/, "").replace(/^\d+[.)]\s*/, "").trim();

/** One parent line expanded on commas: "Belper, Alfreton" -> ["Belper", "Alfreton"]. */
export const splitItems = (line: string): string[] =>
  line.split(",").map(cleanItem).filter(Boolean);
