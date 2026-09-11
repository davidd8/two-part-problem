import type { Cell, Game } from '@app/shared'

interface Props {
  game: Game
  onReveal: (row: number, col: number) => void
  onFlag: (row: number, col: number) => void
  onChord: (row: number, col: number) => void
}

function cellLabel(cell: Cell, row: number, col: number): string {
  const where = `row ${row + 1}, column ${col + 1}`
  if (cell.state === 'flagged') return `Flagged, ${where}`
  if (cell.state === 'hidden') return `Hidden, ${where}`
  if (cell.mine) return `Mine, ${where}`
  return `${cell.adjacentMines ?? 0} adjacent mines, ${where}`
}

function cellText(cell: Cell): string {
  if (cell.state === 'flagged') return '🚩'
  if (cell.mine) return '💣' // only ever true once the game is over
  if (cell.state === 'hidden') return ''
  return cell.adjacentMines ? String(cell.adjacentMines) : ''
}

/**
 * The grid. Left click reveals, right click flags, and clicking a revealed
 * number chords. Cells are buttons so the board is keyboard reachable.
 */
export function Board({ game, onReveal, onFlag, onChord }: Props) {
  const over = game.status !== 'playing'

  return (
    <div
      className={`board board-${game.status}`}
      role="grid"
      aria-label={`Minesweeper board, ${game.width} by ${game.height}`}
      style={{ gridTemplateColumns: `repeat(${game.width}, var(--cell))` }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {game.cells.map((cells, row) =>
        cells.map((cell, col) => {
          const classes = ['cell', cell.state]
          if (cell.mine) classes.push('mine')
          if (cell.state === 'revealed' && cell.adjacentMines)
            classes.push(`n${cell.adjacentMines}`)
          return (
            <button
              key={`${row}-${col}`}
              type="button"
              className={classes.join(' ')}
              role="gridcell"
              aria-label={cellLabel(cell, row, col)}
              disabled={over}
              onClick={() => (cell.state === 'revealed' ? onChord(row, col) : onReveal(row, col))}
              onContextMenu={(event) => {
                event.preventDefault()
                if (cell.state !== 'revealed') onFlag(row, col)
              }}
              onKeyDown={(event) => {
                if (event.key === 'f' || event.key === 'F') {
                  event.preventDefault()
                  if (cell.state !== 'revealed') onFlag(row, col)
                }
              }}
            >
              {cellText(cell)}
            </button>
          )
        }),
      )}
    </div>
  )
}
