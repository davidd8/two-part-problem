import { DIFFICULTIES } from '@app/shared'
import type { Cell, Difficulty, GameStatus, MoveInput, Wind } from '@app/shared'

/**
 * Pure Minesweeper rules for a W×H×D board played across T ticks. No SQL, no
 * HTTP: the repository persists `Board` as JSON and the route hands moves in.
 * Every function returns a new board.
 *
 * Numbers count the 26 spatial neighbours at the same tick. Every tick holds
 * the same mines shifted by the game's wind vector, wrapping at the edges.
 */

export interface Point {
  x: number
  y: number
  z: number
  t: number
}

export interface Board {
  version: 2
  width: number
  height: number
  depth: number
  ticks: number
  /** Mines per tick. */
  mineCount: number
  /** Null until the first reveal places the mines; zero vector when ticks = 1. */
  wind: Wind | null
  /** Flat grids indexed by `index()`. `mines` is empty until the first reveal. */
  mines: boolean[]
  revealed: boolean[]
  flagged: boolean[]
  status: GameStatus
  /** Safe cells revealed so far across every tick; one point each. */
  revealedCount: number
}

export type Rng = () => number

export const cellCount = (board: Board): number =>
  board.width * board.height * board.depth * board.ticks

export const index = (board: Board, p: Point): number =>
  ((p.t * board.depth + p.z) * board.height + p.y) * board.width + p.x

export const inBounds = (board: Board, p: Point): boolean =>
  p.x >= 0 &&
  p.x < board.width &&
  p.y >= 0 &&
  p.y < board.height &&
  p.z >= 0 &&
  p.z < board.depth &&
  p.t >= 0 &&
  p.t < board.ticks

export function createBoard(difficulty: Difficulty): Board {
  const { width, height, depth, ticks, mines } = DIFFICULTIES[difficulty]
  const size = width * height * depth * ticks
  return {
    version: 2,
    width,
    height,
    depth,
    ticks,
    mineCount: mines,
    wind: null,
    mines: [],
    revealed: new Array<boolean>(size).fill(false),
    flagged: new Array<boolean>(size).fill(false),
    status: 'playing',
    revealedCount: 0,
  }
}

/** The 26 (fewer at an edge) spatial neighbours at the same tick. */
export function neighbours(board: Board, p: Point): Point[] {
  const out: Point[] = []
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0 && dz === 0) continue
        const q = { x: p.x + dx, y: p.y + dy, z: p.z + dz, t: p.t }
        if (inBounds(board, q)) out.push(q)
      }
    }
  }
  return out
}

export const hasMines = (board: Board): boolean => board.mines.length > 0

const isMine = (board: Board, p: Point): boolean => board.mines[index(board, p)] ?? false
const isRevealed = (board: Board, p: Point): boolean => board.revealed[index(board, p)] ?? false
const isFlagged = (board: Board, p: Point): boolean => board.flagged[index(board, p)] ?? false

export function adjacentMines(board: Board, p: Point): number {
  if (!hasMines(board)) return 0
  return neighbours(board, p).filter((q) => isMine(board, q)).length
}

const mod = (n: number, m: number): number => ((n % m) + m) % m

/** Where a mine at `p` (any tick) sits at tick `t` under the wind, wrapping at the edges. */
export function advect(board: Board, wind: Wind, p: Point, t: number): Point {
  const steps = t - p.t
  return {
    x: mod(p.x + wind.x * steps, board.width),
    y: mod(p.y + wind.y * steps, board.height),
    z: mod(p.z + wind.z * steps, board.depth),
    t,
  }
}

function pickWind(board: Board, rng: Rng): Wind {
  if (board.ticks === 1) return { x: 0, y: 0, z: 0 }
  const axis = () => Math.floor(rng() * 3) - 1
  for (;;) {
    const wind = { x: axis(), y: axis(), z: axis() }
    // A wind along a dimension of size 1 goes nowhere, so it does not count as motion.
    const moves =
      (wind.x !== 0 && board.width > 1) ||
      (wind.y !== 0 && board.height > 1) ||
      (wind.z !== 0 && board.depth > 1)
    if (moves) return wind
  }
}

/**
 * Places the mines at the tick of the first click, keeping that cell and its
 * neighbours clear, then derives every other tick by blowing them along the
 * wind. Translation is one-to-one, so each tick has exactly `mineCount` mines.
 */
export function placeMines(board: Board, first: Point, rng: Rng): Board {
  const perTick = board.width * board.height * board.depth
  const safe = new Set<number>([index(board, { ...first, t: 0 })])
  for (const q of neighbours(board, first)) safe.add(index(board, { ...q, t: 0 }))

  const candidates: number[] = []
  for (let i = 0; i < perTick; i++) if (!safe.has(i)) candidates.push(i)

  // Fisher–Yates over just the first `mineCount` positions.
  for (let i = 0; i < board.mineCount; i++) {
    const j = i + Math.floor(rng() * (candidates.length - i))
    const a = candidates[i] ?? 0
    candidates[i] = candidates[j] ?? 0
    candidates[j] = a
  }

  const wind = pickWind(board, rng)
  const mines = new Array<boolean>(cellCount(board)).fill(false)
  for (const flat of candidates.slice(0, board.mineCount)) {
    const origin: Point = {
      x: flat % board.width,
      y: Math.floor(flat / board.width) % board.height,
      z: Math.floor(flat / (board.width * board.height)),
      t: first.t,
    }
    for (let t = 0; t < board.ticks; t++) {
      mines[index(board, advect(board, wind, origin, t))] = true
    }
  }
  return { ...board, wind, mines }
}

const clone = (board: Board): Board => ({
  ...board,
  revealed: [...board.revealed],
  flagged: [...board.flagged],
})

/** Reveals a cell in place on an already-cloned board, flood-filling zeros within the tick. */
function revealInto(board: Board, start: Point): void {
  const stack: Point[] = [start]
  while (stack.length > 0) {
    const p = stack.pop() as Point
    const i = index(board, p)
    if (board.revealed[i] || board.flagged[i]) continue
    board.revealed[i] = true

    if (board.mines[i]) {
      board.status = 'lost'
      continue
    }

    board.revealedCount += 1
    if (adjacentMines(board, p) === 0) {
      for (const q of neighbours(board, p)) stack.push(q)
    }
  }
}

function settle(board: Board): Board {
  if (board.status === 'playing') {
    const safeCells = cellCount(board) - board.mineCount * board.ticks
    if (board.revealedCount === safeCells) board.status = 'won'
  }
  return board
}

export function reveal(board: Board, p: Point, rng: Rng): Board {
  if (board.status !== 'playing' || !inBounds(board, p)) return board
  if (isRevealed(board, p) || isFlagged(board, p)) return board

  const next = clone(hasMines(board) ? board : placeMines(board, p, rng))
  revealInto(next, p)
  return settle(next)
}

export function toggleFlag(board: Board, p: Point): Board {
  if (board.status !== 'playing' || !inBounds(board, p)) return board
  if (isRevealed(board, p)) return board

  const next = clone(board)
  next.flagged[index(board, p)] = !isFlagged(board, p)
  return next
}

/**
 * Reveals every unflagged neighbour of a revealed number once the player has
 * flagged exactly that many cells around it. Misplaced flags lose the game.
 */
export function chord(board: Board, p: Point): Board {
  if (board.status !== 'playing' || !inBounds(board, p)) return board
  if (!isRevealed(board, p)) return board

  const around = neighbours(board, p)
  const flags = around.filter((q) => isFlagged(board, q)).length
  if (flags === 0 || flags !== adjacentMines(board, p)) return board

  const next = clone(board)
  for (const q of around) {
    if (next.status !== 'playing') break
    if (!isRevealed(next, q) && !isFlagged(next, q)) revealInto(next, q)
  }
  return settle(next)
}

export function applyMove(board: Board, move: MoveInput, rng: Rng): Board {
  const p: Point = { x: move.x, y: move.y, z: move.z, t: move.t }
  switch (move.action) {
    case 'reveal':
      return reveal(board, p, rng)
    case 'flag':
      return toggleFlag(board, p)
    case 'chord':
      return chord(board, p)
  }
}

export function flagsByTick(board: Board): number[] {
  const perTick = board.width * board.height * board.depth
  const counts = new Array<number>(board.ticks).fill(0)
  board.flagged.forEach((flag, i) => {
    if (flag) counts[Math.floor(i / perTick)] = (counts[Math.floor(i / perTick)] ?? 0) + 1
  })
  return counts
}

export const flagsPlaced = (board: Board): number => board.flagged.filter(Boolean).length

/** One point per safe cell, plus on a win: ten per mine per tick minus one per second, never negative. */
export function computeScore(board: Board, elapsedMs: number | null): number {
  let score = board.revealedCount
  if (board.status === 'won') {
    const seconds = Math.floor((elapsedMs ?? 0) / 1000)
    score += Math.max(0, board.mineCount * board.ticks * 10 - seconds)
  }
  return score
}

/** The player's view, cells[t][z][y][x]. Mines are only disclosed once the game has ended. */
export function toCells(board: Board): Cell[][][][] {
  const over = board.status !== 'playing'
  const cells: Cell[][][][] = []
  for (let t = 0; t < board.ticks; t++) {
    const tick: Cell[][][] = []
    for (let z = 0; z < board.depth; z++) {
      const layer: Cell[][] = []
      for (let y = 0; y < board.height; y++) {
        const row: Cell[] = []
        for (let x = 0; x < board.width; x++) {
          const p = { x, y, z, t }
          const mine = isMine(board, p)
          const revealed = isRevealed(board, p)
          row.push({
            state: revealed ? 'revealed' : isFlagged(board, p) ? 'flagged' : 'hidden',
            adjacentMines: revealed && !mine ? adjacentMines(board, p) : null,
            mine: over && mine,
          })
        }
        layer.push(row)
      }
      tick.push(layer)
    }
    cells.push(tick)
  }
  return cells
}

/** Shape stored by the original 2D engine: row-major grids, no depth or ticks. */
interface LegacyBoard {
  width: number
  height: number
  mineCount: number
  mines: boolean[][]
  revealed: boolean[][]
  flagged: boolean[][]
  status: GameStatus
  revealedCount: number
}

/** Accepts either shape from the database and returns the current one. */
export function upgradeBoard(stored: Board | LegacyBoard): Board {
  if ('version' in stored && stored.version === 2) return stored
  const legacy = stored as LegacyBoard
  const flatten = (rows: boolean[][]) => rows.flat()
  const hasMines = legacy.mines.length > 0
  return {
    version: 2,
    width: legacy.width,
    height: legacy.height,
    depth: 1,
    ticks: 1,
    mineCount: legacy.mineCount,
    wind: hasMines ? { x: 0, y: 0, z: 0 } : null,
    mines: flatten(legacy.mines),
    revealed: flatten(legacy.revealed),
    flagged: flatten(legacy.flagged),
    status: legacy.status,
    revealedCount: legacy.revealedCount,
  }
}
