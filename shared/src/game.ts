import { z } from 'zod'

/**
 * Minesweeper contract. The server owns the board and applies moves; the client
 * only ever sees the view returned here, so mine positions stay hidden until the
 * game is over.
 */

export const difficultySchema = z.enum([
  'beginner',
  'intermediate',
  'expert',
  'cube',
  'timecube',
  'river',
  'storm',
])
export type Difficulty = z.infer<typeof difficultySchema>

export interface BoardSize {
  width: number
  height: number
  depth: number
  /** Time slices. Mines move between ticks; each tick holds `mines` of them. */
  ticks: number
  mines: number
}

/** Classic 2D presets are depth 1, ticks 1; the rest are 3D, with or without time. */
export const DIFFICULTIES: Record<Difficulty, BoardSize> = {
  beginner: { width: 9, height: 9, depth: 1, ticks: 1, mines: 10 },
  intermediate: { width: 16, height: 16, depth: 1, ticks: 1, mines: 40 },
  expert: { width: 30, height: 16, depth: 1, ticks: 1, mines: 99 },
  cube: { width: 5, height: 5, depth: 5, ticks: 1, mines: 10 },
  timecube: { width: 4, height: 4, depth: 4, ticks: 3, mines: 5 },
  river: { width: 5, height: 5, depth: 5, ticks: 4, mines: 12 },
  storm: { width: 6, height: 6, depth: 6, ticks: 5, mines: 25 },
}

export const cellStateSchema = z.enum(['hidden', 'revealed', 'flagged'])
export type CellState = z.infer<typeof cellStateSchema>

export const cellSchema = z.object({
  state: cellStateSchema,
  /** Mines among the 26 spatial neighbours at this tick. Only known once revealed. */
  adjacentMines: z.number().int().min(0).max(26).nullable(),
  /** Only ever true after the game has ended; hidden mines are reported as false. */
  mine: z.boolean(),
})
export type Cell = z.infer<typeof cellSchema>

export const gameStatusSchema = z.enum(['playing', 'won', 'lost'])
export type GameStatus = z.infer<typeof gameStatusSchema>

/** The per-tick displacement every mine makes. Components are -1, 0 or 1. */
export const windSchema = z.object({
  x: z.number().int().min(-1).max(1),
  y: z.number().int().min(-1).max(1),
  z: z.number().int().min(-1).max(1),
})
export type Wind = z.infer<typeof windSchema>

export const gameSchema = z.object({
  id: z.number().int().positive(),
  difficulty: difficultySchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  depth: z.number().int().positive(),
  ticks: z.number().int().positive(),
  /** Mines per tick. */
  mines: z.number().int().positive(),
  status: gameStatusSchema,
  /** Indexed cells[t][z][y][x]. */
  cells: z.array(z.array(z.array(z.array(cellSchema)))),
  /** Total flags across every tick. */
  flagsPlaced: z.number().int().min(0),
  /** Flags at each tick, so "mines remaining" can be shown per tick. */
  flagsByTick: z.array(z.number().int().min(0)),
  /** How the mines move between ticks. Disclosed only once the game is over. */
  wind: windSchema.nullable(),
  /** One point per safe cell revealed, plus a time bonus on a win. */
  score: z.number().int().min(0),
  /** Set by the first reveal; the timer runs from here. */
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  elapsedMs: z.number().int().min(0).nullable(),
  createdAt: z.string(),
})
export type Game = z.infer<typeof gameSchema>

export const createGameSchema = z.object({
  difficulty: difficultySchema.default('beginner'),
})
export type CreateGameInput = z.infer<typeof createGameSchema>

export const moveActionSchema = z.enum(['reveal', 'flag', 'chord'])
export type MoveAction = z.infer<typeof moveActionSchema>

export const moveSchema = z.object({
  action: moveActionSchema,
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  z: z.number().int().min(0),
  t: z.number().int().min(0),
})
export type MoveInput = z.infer<typeof moveSchema>

export const scoreEntrySchema = z.object({
  gameId: z.number().int().positive(),
  difficulty: difficultySchema,
  status: gameStatusSchema,
  score: z.number().int().min(0),
  elapsedMs: z.number().int().min(0).nullable(),
  finishedAt: z.string(),
})
export type ScoreEntry = z.infer<typeof scoreEntrySchema>

export const gameStatsSchema = z.object({
  played: z.number().int().min(0),
  won: z.number().int().min(0),
  topScores: z.array(scoreEntrySchema),
  /** Fastest win per difficulty, in milliseconds. Absent until that difficulty has been won. */
  bestTimes: z.partialRecord(difficultySchema, z.number().int().min(0)),
})
export type GameStats = z.infer<typeof gameStatsSchema>
