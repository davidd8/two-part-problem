import { DIFFICULTIES, type Difficulty, type Game } from '@app/shared'
import { formatElapsed } from '../lib/useGame.js'

interface Props {
  game: Game | null
  difficulty: Difficulty
  /** Time slice being viewed; the mine counter is per tick. */
  tick: number
  elapsedMs: number
  onNewGame: (difficulty: Difficulty) => void
}

function describe(level: Difficulty): string {
  const { width, height, depth, ticks, mines } = DIFFICULTIES[level]
  const size = depth > 1 ? `${width}×${height}×${depth}` : `${width}×${height}`
  const time = ticks > 1 ? ` · ${ticks} ticks` : ''
  return `${level} (${size}${time}, ${mines} mines)`
}

const FACES: Record<Game['status'], string> = { playing: '🙂', won: '😎', lost: '😵' }
const LABELS: Record<Game['status'], string> = {
  playing: 'Playing',
  won: 'You won!',
  lost: 'Boom!',
}

export function StatusBar({ game, difficulty, tick, elapsedMs, onNewGame }: Props) {
  const status = game?.status ?? 'playing'
  const minesLeft = game ? game.mines - (game.flagsByTick[tick] ?? 0) : 0

  return (
    <div className="status-bar">
      <div className="counters">
        <span className="counter" title="Mines remaining">
          💣 {minesLeft}
        </span>
        <span className="counter" title="Time">
          ⏱ {formatElapsed(elapsedMs)}
        </span>
        <span className="counter" title="Score">
          ★ {game?.score ?? 0}
        </span>
      </div>

      <button
        type="button"
        className="face"
        onClick={() => onNewGame(difficulty)}
        aria-label={`${LABELS[status]} — start a new game`}
        title="New game"
      >
        {FACES[status]}
      </button>

      <div className="controls">
        <label className="difficulty">
          Difficulty
          <select
            value={difficulty}
            onChange={(event) => onNewGame(event.target.value as Difficulty)}
          >
            {(Object.keys(DIFFICULTIES) as Difficulty[]).map((level) => (
              <option key={level} value={level}>
                {describe(level)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="new-game" onClick={() => onNewGame(difficulty)}>
          New game
        </button>
      </div>
    </div>
  )
}
