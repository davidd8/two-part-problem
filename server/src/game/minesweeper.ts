import { DIFFICULTIES } from '@app/shared'
import type { Cell, Difficulty, GameStatus, MoveInput } from '@app/shared'

/**
 * Pure Minesweeper rules. No SQL, no HTTP: the repository persists `Board`
 * as JSON and the route hands moves in. Every function returns a new board.
 */

export interface Board {
  width: number
  height: number
  mineCount: number
  /** Row-major grids. `mines` is empty until the first reveal places them. */
  mines: boolean[][]
  revealed: boolean[][]
  flagged: boolean[][]
  status: GameStatus
  /** Safe cells revealed so far; one point each. */
  revealedCount: number
}

export type Rng = () => number

const grid = <T>(height: number, width: number, value: T): T[][] =>
  Array.from({ length: height }, () => Array.from({ length: width }, () => value))

// Index access with noUncheckedIndexedAccess: out-of-range reads are simply false.
const at = (cells: boolean[][], row: number, col: number): boolean => cells[row]?.[col] ?? false
const set = (cells: boolean[][], row: number, col: number, value: boolean): void => {
  const line = cells[row]
  if (line) line[col] = value
}

export function createBoard(difficulty: Difficulty): Board {
  const { width, height, mines } = DIFFICULTIES[difficulty]
  return {
    width,
    height,
    mineCount: mines,
    mines: [],
    revealed: grid(height, width, false),
    flagged: grid(height, width, false),
    status: 'playing',
    revealedCount: 0,
  }
}

export const inBounds = (board: Board, row: number, col: number): boolean =>
  row >= 0 && row < board.height && col >= 0 && col < board.width

function neighbours(board: Board, row: number, col: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const r = row + dr
      const c = col + dc
      if (inBounds(board, r, c)) out.push([r, c])
    }
  }
  return out
}

export const hasMines = (board: Board): boolean => board.mines.length > 0

export function adjacentMines(board: Board, row: number, col: number): number {
  if (!hasMines(board)) return 0
  return neighbours(board, row, col).filter(([r, c]) => at(board.mines, r, c)).length
}

/**
 * Places mines everywhere except the first-clicked cell and its neighbours, so
 * the opening move always reveals an area rather than a lone number or a mine.
 */
export function placeMines(board: Board, safeRow: number, safeCol: number, rng: Rng): Board {
  const safe = new Set<number>([safeRow * board.width + safeCol])
  for (const [r, c] of neighbours(board, safeRow, safeCol)) safe.add(r * board.width + c)

  const candidates: number[] = []
  for (let i = 0; i < board.width * board.height; i++) if (!safe.has(i)) candidates.push(i)

  // Fisher–Yates over just the first `mineCount` positions.
  for (let i = 0; i < board.mineCount; i++) {
    const j = i + Math.floor(rng() * (candidates.length - i))
    const a = candidates[i] ?? 0
    candidates[i] = candidates[j] ?? 0
    candidates[j] = a
  }

  const mines = grid(board.height, board.width, false)
  for (const index of candidates.slice(0, board.mineCount)) {
    set(mines, Math.floor(index / board.width), index % board.width, true)
  }
  return { ...board, mines }
}

const clone = (board: Board): Board => ({
  ...board,
  revealed: board.revealed.map((row) => [...row]),
  flagged: board.flagged.map((row) => [...row]),
})

/** Reveals a cell in place on an already-cloned board, flood-filling zeros. */
function revealInto(board: Board, row: number, col: number): void {
  const stack: Array<[number, number]> = [[row, col]]
  while (stack.length > 0) {
    const [r, c] = stack.pop() as [number, number]
    if (at(board.revealed, r, c) || at(board.flagged, r, c)) continue
    set(board.revealed, r, c, true)

    if (at(board.mines, r, c)) {
      board.status = 'lost'
      continue
    }

    board.revealedCount += 1
    if (adjacentMines(board, r, c) === 0) {
      for (const next of neighbours(board, r, c)) stack.push(next)
    }
  }
}

function settle(board: Board): Board {
  if (board.status === 'playing') {
    const safeCells = board.width * board.height - board.mineCount
    if (board.revealedCount === safeCells) board.status = 'won'
  }
  return board
}

export function reveal(board: Board, row: number, col: number, rng: Rng): Board {
  if (board.status !== 'playing' || !inBounds(board, row, col)) return board
  if (at(board.revealed, row, col) || at(board.flagged, row, col)) return board

  const next = clone(hasMines(board) ? board : placeMines(board, row, col, rng))
  revealInto(next, row, col)
  return settle(next)
}

export function toggleFlag(board: Board, row: number, col: number): Board {
  if (board.status !== 'playing' || !inBounds(board, row, col)) return board
  if (at(board.revealed, row, col)) return board

  const next = clone(board)
  set(next.flagged, row, col, !at(next.flagged, row, col))
  return next
}

/**
 * Reveals every unflagged neighbour of a revealed number once the player has
 * flagged exactly that many cells around it. Misplaced flags lose the game.
 */
export function chord(board: Board, row: number, col: number): Board {
  if (board.status !== 'playing' || !inBounds(board, row, col)) return board
  if (!at(board.revealed, row, col)) return board

  const around = neighbours(board, row, col)
  const flags = around.filter(([r, c]) => at(board.flagged, r, c)).length
  if (flags === 0 || flags !== adjacentMines(board, row, col)) return board

  const next = clone(board)
  for (const [r, c] of around) {
    if (next.status !== 'playing') break
    if (!at(next.revealed, r, c) && !at(next.flagged, r, c)) revealInto(next, r, c)
  }
  return settle(next)
}

export function applyMove(board: Board, move: MoveInput, rng: Rng): Board {
  switch (move.action) {
    case 'reveal':
      return reveal(board, move.row, move.col, rng)
    case 'flag':
      return toggleFlag(board, move.row, move.col)
    case 'chord':
      return chord(board, move.row, move.col)
  }
}

export const flagsPlaced = (board: Board): number =>
  board.flagged.reduce((sum, row) => sum + row.filter(Boolean).length, 0)

/** One point per safe cell, plus on a win: ten per mine minus one per second, never negative. */
export function computeScore(board: Board, elapsedMs: number | null): number {
  let score = board.revealedCount
  if (board.status === 'won') {
    const seconds = Math.floor((elapsedMs ?? 0) / 1000)
    score += Math.max(0, board.mineCount * 10 - seconds)
  }
  return score
}

/** The player's view: mines are only disclosed once the game has ended. */
export function toCells(board: Board): Cell[][] {
  const over = board.status !== 'playing'
  return board.revealed.map((rowCells, r) =>
    rowCells.map((isRevealed, c) => {
      const mine = at(board.mines, r, c)
      return {
        state: isRevealed ? 'revealed' : at(board.flagged, r, c) ? 'flagged' : 'hidden',
        adjacentMines: isRevealed && !mine ? adjacentMines(board, r, c) : null,
        mine: over && mine,
      }
    }),
  )
}
