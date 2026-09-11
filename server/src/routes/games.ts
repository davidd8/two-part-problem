import { Router } from 'express'
import { z } from 'zod'
import { createGameSchema, moveSchema } from '@app/shared'
import type { Db } from '../db/index.js'
import * as games from '../repositories/games.js'
import { applyMove, createBoard, inBounds } from '../game/minesweeper.js'
import { HttpError } from '../middleware/errors.js'

const idParamSchema = z.object({ id: z.coerce.number().int().positive() })

export function gamesRouter(db: Db): Router {
  const router = Router()

  router.post('/', (req, res) => {
    const { difficulty } = createGameSchema.parse(req.body ?? {})
    res.status(201).json(games.createGame(db, difficulty, createBoard(difficulty)).game)
  })

  // Declared before /:id so "stats" is not parsed as an id.
  router.get('/stats', (_req, res) => res.json(games.getStats(db)))

  router.get('/:id', (req, res) => {
    const { id } = idParamSchema.parse(req.params)
    const stored = games.getGame(db, id)
    if (!stored) throw HttpError.notFound(`Game ${id} not found`)
    res.json(stored.game)
  })

  router.post('/:id/moves', (req, res) => {
    const { id } = idParamSchema.parse(req.params)
    const move = moveSchema.parse(req.body)
    const stored = games.getGame(db, id)
    if (!stored) throw HttpError.notFound(`Game ${id} not found`)
    if (stored.game.status !== 'playing') {
      throw new HttpError(409, `Game ${id} is already ${stored.game.status}`, 'game_over')
    }
    if (!inBounds(stored.board, move.row, move.col)) {
      throw HttpError.badRequest(`Cell (${move.row}, ${move.col}) is off the board`)
    }

    const board = applyMove(stored.board, move, Math.random)
    res.json(games.saveMove(db, stored, board).game)
  })

  return router
}
