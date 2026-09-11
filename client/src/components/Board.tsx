import type { Cell, Game } from '@app/shared'

import type { Point } from '../lib/useGame.js'

interface Props {
  game: Game
  onReveal: (p: Point) => void
  onFlag: (p: Point) => void
  onChord: (p: Point) => void
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
 * The classic 2D grid, used for single-layer, single-tick boards. Left click
 * reveals, right click flags, and clicking a revealed number chords. Cells are
 * buttons so the board is keyboard reachable.
 */
export function Board({ game, onReveal, onFlag, onChord }: Props) {
  const over = game.status !== 'playing'
  const grid = game.cells[0]?.[0] ?? []

  return (
    <div
      className={`board board-${game.status}`}
      role="grid"
      aria-label={`Minesweeper board, ${game.width} by ${game.height}`}
      style={{ gridTemplateColumns: `repeat(${game.width}, var(--cell))` }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {grid.map((cells, row) =>
        cells.map((cell, col) => {
          const p: Point = { x: col, y: row, z: 0, t: 0 }
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
              onClick={() => (cell.state === 'revealed' ? onChord(p) : onReveal(p))}
              onContextMenu={(event) => {
                event.preventDefault()
                if (cell.state !== 'revealed') onFlag(p)
              }}
              onKeyDown={(event) => {
                if (event.key === 'f' || event.key === 'F') {
                  event.preventDefault()
                  if (cell.state !== 'revealed') onFlag(p)
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
