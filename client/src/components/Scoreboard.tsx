import { DIFFICULTIES, type Difficulty, type GameStats } from '@app/shared'
import { formatElapsed } from '../lib/useGame.js'

interface Props {
  stats: GameStats | null
}

export function Scoreboard({ stats }: Props) {
  if (!stats) return null
  const levels = Object.keys(DIFFICULTIES) as Difficulty[]

  return (
    <section className="scoreboard" aria-label="Scoreboard">
      <h2>Scoreboard</h2>
      <p className="record">
        Played {stats.played} · Won {stats.won}
        {stats.played > 0 && ` · ${Math.round((stats.won / stats.played) * 100)}% win rate`}
      </p>

      <div className="scoreboard-columns">
        <div>
          <h3>Top scores</h3>
          {stats.topScores.length === 0 ? (
            <p className="empty">Finish a game to get on the board.</p>
          ) : (
            <ol className="top-scores">
              {stats.topScores.map((entry) => (
                <li key={entry.gameId}>
                  <span className="score">{entry.score}</span>
                  <span className="meta">
                    {entry.difficulty} · {entry.status}
                    {entry.elapsedMs !== null && ` · ${formatElapsed(entry.elapsedMs)}`}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <h3>Best times</h3>
          <ul className="best-times">
            {levels.map((level) => (
              <li key={level}>
                <span className="meta">{level}</span>
                <span className="score">
                  {stats.bestTimes[level] === undefined
                    ? '—'
                    : formatElapsed(stats.bestTimes[level] as number)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
