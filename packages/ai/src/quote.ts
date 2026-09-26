/*
 * Quote matching for the shopper's own brief (SDD §10.1, A1). The check is
 * the same idea as the one the evidence layer runs on merchant text: a claim
 * that says "you said this" has to point at words the shopper actually wrote.
 *
 * Briefs are typed by hand, so matching folds case as well as whitespace and
 * Unicode form. The stored quote is always the verbatim brief substring.
 */

type Folded = {
  text: string;
  /** Start offset in the original string for each folded character. */
  start: number[];
  /** End offset in the original string for each folded character. */
  end: number[];
};

function fold(input: string): Folded {
  const chars: string[] = [];
  const start: number[] = [];
  const end: number[] = [];
  let i = 0;
  for (const ch of input) {
    const from = i;
    i += ch.length;
    if (/\s/u.test(ch)) {
      if (chars.length > 0 && chars[chars.length - 1] !== " ") {
        chars.push(" ");
        start.push(from);
        end.push(i);
      }
      continue;
    }
    for (const unit of ch.normalize("NFKC").toLowerCase()) {
      chars.push(unit);
      start.push(from);
      end.push(i);
    }
  }
  while (chars[chars.length - 1] === " ") {
    chars.pop();
    start.pop();
    end.pop();
  }
  return { text: chars.join(""), start, end };
}

export type QuoteMatch = { quote: string; span: [number, number] };

/**
 * Locates `quote` in `source`, returning the verbatim source text and its
 * `[start, end)` offsets. Null when the words are not there.
 */
export function locateQuote(source: string, quote: string): QuoteMatch | null {
  const haystack = fold(source);
  const needle = fold(quote).text;
  if (!needle) return null;
  const at = haystack.text.indexOf(needle);
  if (at < 0) return null;
  const from = haystack.start[at];
  const to = haystack.end[at + needle.length - 1];
  if (from === undefined || to === undefined) return null;
  return { quote: source.slice(from, to), span: [from, to] };
}
