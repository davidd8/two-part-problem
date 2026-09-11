import type { Wind } from '@app/shared'
import { Board } from './components/Board.js'
import { Board3D } from './components/Board3D.js'
import { Scoreboard } from './components/Scoreboard.js'
import { StatusBar } from './components/StatusBar.js'
import { TimeBar } from './components/TimeBar.js'
import { useGame } from './lib/useGame.js'

export function App() {
  const {
    game,
    stats,
    difficulty,
    loading,
    error,
    elapsedMs,
    tick,
    setTick,
    cut,
    setCut,
    newGame,
    reveal,
    flag,
    chord,
    dismissError,
  } = useGame()

  const flat = game !== null && game.depth === 1 && game.ticks === 1

  return (
    <main className="app game-app">
      <header>
        <h1>Minesweeper</h1>
        <p className="subtitle">
          Left click to reveal · right click (or F) to flag · click a number to chord · drag to
          orbit · ← → to travel in time
        </p>
      </header>

      <StatusBar
        game={game}
        difficulty={difficulty}
        tick={tick}
        elapsedMs={elapsedMs}
        onNewGame={newGame}
      />

      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={dismissError}>dismiss</button>
        </div>
      )}

      {loading || !game ? (
        <p className="empty">Loading…</p>
      ) : (
        <>
          <p className="outcome" role="status" aria-live="polite">
            {game.status === 'won' &&
              `You cleared the board in ${formatOutcomeTime(elapsedMs)} for ${game.score} points.`}
            {game.status === 'lost' && `You hit a mine. ${game.score} points this round.`}
            {game.status !== 'playing' && game.ticks > 1 && ` ${describeWind(game.wind)}`}
          </p>
          <TimeBar game={game} tick={tick} cut={cut} onTick={setTick} onCut={setCut} />
          {flat ? (
            <Board game={game} onReveal={reveal} onFlag={flag} onChord={chord} />
          ) : (
            <Board3D
              game={game}
              tick={tick}
              cut={cut}
              onReveal={reveal}
              onFlag={flag}
              onChord={chord}
            />
          )}
        </>
      )}

      <Scoreboard stats={stats} />
    </main>
  )
}

function formatOutcomeTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  return seconds === 1 ? '1 second' : `${seconds} seconds`
}

function describeWind(wind: Wind | null): string {
  if (!wind) return ''
  const parts = (['x', 'y', 'z'] as const)
    .filter((axis) => wind[axis] !== 0)
    .map((axis) => `${wind[axis] > 0 ? '+' : '−'}${axis}`)
  return parts.length === 0 ? 'The mines stood still.' : `The wind was blowing ${parts.join(' ')}.`
}
