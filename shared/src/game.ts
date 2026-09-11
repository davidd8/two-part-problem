import { z } from 'zod'

/**
 * Minesweeper contract. The server owns the board and applies moves; the client
 * only ever sees the view returned here, so mine positions stay hidden until the
 * game is over.
 */

export const difficultySchema = z.enum(['beginner', 'intermediate', 'expert'])
export type Difficulty = z.infer<typeof difficultySchema>

export const DIFFICULTIES: Record<Difficulty, { width: number; height: number; mines: number }> = {
  beginner: { width: 9, height: 9, mines: 10 },
  intermediate: { width: 16, height: 16, mines: 40 },
  expert: { width: 30, height: 16, mines: 99 },
}

export const cellStateSchema = z.enum(['hidden', 'revealed', 'flagged'])
export type CellState = z.infer<typeof cellStateSchema>

export const cellSchema = z.object({
  state: cellStateSchema,
  /** Number of neighbouring mines. Only known once the cell is revealed. */
  adjacentMines: z.number().int().min(0).max(8).nullable(),
  /** Only ever true after the game has ended; hidden mines are reported as false. */
  mine: z.boolean(),
})
export type Cell = z.infer<typeof cellSchema>

export const gameStatusSchema = z.enum(['playing', 'won', 'lost'])
export type GameStatus = z.infer<typeof gameStatusSchema>

export const gameSchema = z.object({
  id: z.number().int().positive(),
  difficulty: difficultySchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mines: z.number().int().positive(),
  status: gameStatusSchema,
  /** Row-major: cells[row][col]. */
  cells: z.array(z.array(cellSchema)),
  flagsPlaced: z.number().int().min(0),
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
  row: z.number().int().min(0),
  col: z.number().int().min(0),
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
