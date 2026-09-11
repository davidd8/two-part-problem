import { useCallback, useEffect, useRef, useState } from 'react'
import type { Difficulty, Game, GameStats, MoveInput } from '@app/shared'

/** A cell address: x across, y down, z into the board, t the time slice. */
export interface Point {
  x: number
  y: number
  z: number
  t: number
}
import { api, ApiRequestError } from './api.js'

const STORAGE_KEY = 'minesweeper.gameId'

function readStoredId(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const id = raw ? Number(raw) : NaN
    return Number.isInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

function storeId(id: number | null) {
  try {
    if (id === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, String(id))
  } catch {
    // Storage is a convenience; the game still works without it.
  }
}

/**
 * Owns the current game, the scoreboard, and the running clock. A reload
 * resumes the game in progress via the id kept in localStorage.
 */
export function useGame(initialDifficulty: Difficulty = 'beginner') {
  const [game, setGame] = useState<Game | null>(null)
  const [stats, setStats] = useState<GameStats | null>(null)
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  /** Time slice being viewed. */
  const [tick, setTick] = useState(0)
  /** Depth layers hidden from the top so the interior of a 3D board is reachable. */
  const [cut, setCut] = useState(0)
  // Serialises moves so a fast double-click cannot race two requests.
  const busy = useRef(false)

  const fail = (err: unknown) =>
    setError(err instanceof Error ? err.message : 'Something went wrong')

  const refreshStats = useCallback(async () => {
    try {
      setStats(await api.getGameStats())
    } catch (err) {
      fail(err)
    }
  }, [])

  const newGame = useCallback(
    async (nextDifficulty: Difficulty = difficulty) => {
      try {
        const created = await api.createGame({ difficulty: nextDifficulty })
        storeId(created.id)
        setDifficulty(nextDifficulty)
        setGame(created)
        setTick(0)
        setCut(0)
        setError(null)
      } catch (err) {
        fail(err)
      } finally {
        setLoading(false)
      }
    },
    [difficulty],
  )

  // On mount: resume the stored game if it is still in play, else start one.
  useEffect(() => {
    let cancelled = false
    const resume = async () => {
      const id = readStoredId()
      if (id !== null) {
        try {
          const existing = await api.getGame(id)
          if (cancelled) return
          setDifficulty(existing.difficulty)
          setGame(existing)
          setLoading(false)
          return
        } catch (err) {
          if (!(err instanceof ApiRequestError && err.status === 404)) {
            if (!cancelled) fail(err)
          }
          storeId(null)
        }
      }
      if (!cancelled) await newGame(initialDifficulty)
    }
    void resume()
    void refreshStats()
    return () => {
      cancelled = true
    }
    // Mount-only: later games are started explicitly through newGame.
  }, [])

  // Tick once a second while the clock is running.
  const running = game?.status === 'playing' && game.startedAt !== null
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running])

  const move = useCallback(
    async (input: MoveInput) => {
      if (!game || game.status !== 'playing' || busy.current) return
      busy.current = true
      try {
        const next = await api.makeMove(game.id, input)
        setGame(next)
        setNow(Date.now())
        setError(null)
        if (next.status !== 'playing') await refreshStats()
      } catch (err) {
        fail(err)
      } finally {
        busy.current = false
      }
    },
    [game, refreshStats],
  )

  const elapsedMs =
    game === null || game.startedAt === null
      ? 0
      : (game.elapsedMs ?? Math.max(0, now - new Date(game.startedAt).getTime()))

  const ticks = game?.ticks ?? 1
  const depth = game?.depth ?? 1

  return {
    game,
    stats,
    difficulty,
    loading,
    error,
    elapsedMs,
    tick: Math.min(tick, ticks - 1),
    setTick: (next: number) => setTick(Math.max(0, Math.min(ticks - 1, next))),
    cut: Math.min(cut, depth - 1),
    setCut: (next: number) => setCut(Math.max(0, Math.min(depth - 1, next))),
    newGame,
    reveal: (p: Point) => move({ action: 'reveal', ...p }),
    flag: (p: Point) => move({ action: 'flag', ...p }),
    chord: (p: Point) => move({ action: 'chord', ...p }),
    dismissError: () => setError(null),
  }
}

export const formatElapsed = (ms: number): string => {
  const total = Math.floor(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
