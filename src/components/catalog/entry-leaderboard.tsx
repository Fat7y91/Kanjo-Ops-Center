import type { EntryLeaderboard } from "@/lib/catalog/merchants";

/**
 * Rep product-entry leaderboard.
 *
 * Entry volume is the rep's own contribution, so the panel ranks people rather
 * than merchants. Rows are a plain list (no interactivity), which keeps it
 * renderable straight from the server component.
 */
export function EntryLeaderboard({ board }: { board: EntryLeaderboard }) {
  return (
    <section className="panel cat-leaderboard">
      <div className="panel-head">
        <div>
          <p className="eyebrow">إدخال المنتجات</p>
          <h2>أعلى المناديب إدخالاً</h2>
        </div>
        <span className="badge">{board.attributed} منتج مُسجَّل</span>
      </div>

      {board.rows.length === 0 ? (
        <p className="empty-state">لا توجد منتجات مُسجَّلة باسم مندوب بعد.</p>
      ) : (
        <ol className="cat-leaderboard-list">
          {board.rows.map((row) => (
            <li key={`${row.repId ?? row.name}-${row.rank}`}>
              <span className="cat-leaderboard-rank">{row.rank}</span>
              <span className="cat-leaderboard-main">
                <strong>{row.name}</strong>
                <span className="cat-leaderboard-bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(row.share, 4)}%` }} />
                </span>
              </span>
              <span className="cat-leaderboard-side">
                <strong>{row.count}</strong>
                <span>{row.share}%</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {board.unattributed > 0 ? (
        <p className="cat-leaderboard-note">
          {board.unattributed} منتج سابق بدون مندوب مُسجَّل — خارج الترتيب.
        </p>
      ) : null}
    </section>
  );
}
