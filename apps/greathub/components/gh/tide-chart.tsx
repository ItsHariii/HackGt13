/** "Catches this season": one cell per day, darker as more happened. */
export function TideChart({ counts }: { counts: readonly number[] }) {
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const level = (n: number) =>
    n === 0 ? 0 : Math.min(5, Math.ceil((n / max) * 5));
  return (
    <figure className="gh-tide">
      <div
        className="gh-tide-grid"
        role="img"
        aria-label={`${total} catches and orders in the last ${counts.length} days`}
      >
        {counts.map((n, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional days
          <span key={i} className={`t${level(n)}`} />
        ))}
      </div>
      <figcaption className="gh-tide-legend">
        <span>Low tide</span>
        {[0, 1, 2, 3, 4, 5].map((l) => (
          <span key={l} className={`t${l}`} aria-hidden="true" />
        ))}
        <span>High tide</span>
        <span className="gh-code gh-tide-total">
          {total} catch{total === 1 ? "" : "es"}
        </span>
      </figcaption>
    </figure>
  );
}
