import type { Difficulty, Game, GameStats, GameStatus, ScoreEntry } from '@app/shared'
import type { Db } from '../db/index.js'
import { computeScore, flagsPlaced, toCells, type Board } from '../game/minesweeper.js'

interface GameRow {
  id: number
  difficulty: Difficulty
  width: number
  height: number
  mines: number
  status: GameStatus
  board: string
  score: number
  started_at: string | null
  finished_at: string | null
  elapsed_ms: number | null
  created_at: string
}

/** A game plus the engine state it was loaded with; routes apply moves to `board`. */
export interface StoredGame {
  game: Game
  board: Board
}

function toStoredGame(row: GameRow): StoredGame {
  const board = JSON.parse(row.board) as Board
  return {
    board,
    game: {
      id: row.id,
      difficulty: row.difficulty,
      width: row.width,
      height: row.height,
      mines: row.mines,
      status: row.status,
      cells: toCells(board),
      flagsPlaced: flagsPlaced(board),
      score: row.score,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      elapsedMs: row.elapsed_ms,
      createdAt: row.created_at,
    },
  }
}

const COLUMNS =
  'id, difficulty, width, height, mines, status, board, score, started_at, finished_at, elapsed_ms, created_at'

export function createGame(db: Db, difficulty: Difficulty, board: Board): StoredGame {
  const row = db
    .prepare<Record<string, unknown>, GameRow>(
      `INSERT INTO games (difficulty, width, height, mines, board)
       VALUES (:difficulty, :width, :height, :mines, :board)
       RETURNING ${COLUMNS}`,
    )
    .get({
      difficulty,
      width: board.width,
      height: board.height,
      mines: board.mineCount,
      board: JSON.stringify(board),
    })
  return toStoredGame(row as GameRow)
}

export function getGame(db: Db, id: number): StoredGame | undefined {
  const row = db
    .prepare<{ id: number }, GameRow>(`SELECT ${COLUMNS} FROM games WHERE id = :id`)
    .get({ id })
  return row ? toStoredGame(row) : undefined
}

/**
 * Persists the board after a move. Starts the clock on the first reveal and
 * stops it, scoring the game, when the status leaves `playing`.
 */
export function saveMove(db: Db, stored: StoredGame, board: Board): StoredGame {
  const now = new Date()
  const startedAt = stored.game.startedAt ?? (board.revealedCount > 0 ? now.toISOString() : null)

  let finishedAt = stored.game.finishedAt
  let elapsedMs = stored.game.elapsedMs
  if (board.status !== 'playing' && finishedAt === null) {
    finishedAt = now.toISOString()
    elapsedMs = startedAt ? Math.max(0, now.getTime() - new Date(startedAt).getTime()) : 0
  }

  const row = db
    .prepare<Record<string, unknown>, GameRow>(
      `UPDATE games
       SET board = :board, status = :status, score = :score,
           started_at = :startedAt, finished_at = :finishedAt, elapsed_ms = :elapsedMs
       WHERE id = :id
       RETURNING ${COLUMNS}`,
    )
    .get({
      id: stored.game.id,
      board: JSON.stringify(board),
      status: board.status,
      score: computeScore(board, elapsedMs),
      startedAt,
      finishedAt,
      elapsedMs,
    })
  return toStoredGame(row as GameRow)
}

interface ScoreRow {
  game_id: number
  difficulty: Difficulty
  status: GameStatus
  score: number
  elapsed_ms: number | null
  finished_at: string
}

const toScoreEntry = (row: ScoreRow): ScoreEntry => ({
  gameId: row.game_id,
  difficulty: row.difficulty,
  status: row.status,
  score: row.score,
  elapsedMs: row.elapsed_ms,
  finishedAt: row.finished_at,
})

export function getStats(db: Db, topN = 5): GameStats {
  const totals = db
    .prepare<[], { played: number; won: number }>(
      `SELECT count(*) AS played, coalesce(sum(status = 'won'), 0) AS won
       FROM games WHERE status <> 'playing'`,
    )
    .get() as { played: number; won: number }

  const topScores = db
    .prepare<{ limit: number }, ScoreRow>(
      `SELECT id AS game_id, difficulty, status, score, elapsed_ms, finished_at
       FROM games WHERE status <> 'playing'
       ORDER BY score DESC, elapsed_ms ASC, id ASC
       LIMIT :limit`,
    )
    .all({ limit: topN })
    .map(toScoreEntry)

  const bestTimes: GameStats['bestTimes'] = {}
  for (const row of db
    .prepare<[], { difficulty: Difficulty; best: number }>(
      `SELECT difficulty, min(elapsed_ms) AS best
       FROM games WHERE status = 'won' AND elapsed_ms IS NOT NULL
       GROUP BY difficulty`,
    )
    .all()) {
    bestTimes[row.difficulty] = row.best
  }

  return { played: totals.played, won: totals.won, topScores, bestTimes }
}
