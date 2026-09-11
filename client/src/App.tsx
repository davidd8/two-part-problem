import { Board } from './components/Board.js'
import { Scoreboard } from './components/Scoreboard.js'
import { StatusBar } from './components/StatusBar.js'
import { useGame } from './lib/useGame.js'

export function App() {
  const {
    game,
    stats,
    difficulty,
    loading,
    error,
    elapsedMs,
    newGame,
    reveal,
    flag,
    chord,
    dismissError,
  } = useGame()

  return (
    <main className="app game-app">
      <header>
        <h1>Minesweeper</h1>
        <p className="subtitle">
          Left click to reveal · right click (or F) to flag · click a number to chord
        </p>
      </header>

      <StatusBar game={game} difficulty={difficulty} elapsedMs={elapsedMs} onNewGame={newGame} />

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
          </p>
          <Board game={game} onReveal={reveal} onFlag={flag} onChord={chord} />
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
