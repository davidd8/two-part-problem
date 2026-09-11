import { describe, expect, it } from 'vitest'
import {
  advect,
  chord,
  createBoard,
  index,
  neighbours,
  placeMines,
  reveal,
  toCells,
  toggleFlag,
  upgradeBoard,
  type Board,
  type Point,
} from '../game/minesweeper.js'

/** Deterministic rng: a linear congruential generator seeded per test. */
function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const minesAtTick = (board: Board, t: number): Point[] => {
  const out: Point[] = []
  for (let z = 0; z < board.depth; z++)
    for (let y = 0; y < board.height; y++)
      for (let x = 0; x < board.width; x++) {
        const p = { x, y, z, t }
        if (board.mines[index(board, p)]) out.push(p)
      }
  return out
}

const key = (p: Point) => `${p.x},${p.y},${p.z}`

describe('placeMines', () => {
  it('keeps the first click and its neighbours clear and puts the same number of mines at every tick', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const first = { x: 1, y: 2, z: 3, t: 1 }
      const board = placeMines(createBoard('timecube'), first, seeded(seed))
      const safe = new Set([key(first), ...neighbours(board, first).map(key)])
      for (const p of minesAtTick(board, first.t)) expect(safe.has(key(p))).toBe(false)
      for (let t = 0; t < board.ticks; t++) expect(minesAtTick(board, t)).toHaveLength(5)
    }
  })

  it('blows every mine along the wind between ticks, wrapping at the edges', () => {
    const board = placeMines(createBoard('timecube'), { x: 0, y: 0, z: 0, t: 0 }, seeded(7))
    const wind = board.wind as NonNullable<Board['wind']>
    expect(wind.x !== 0 || wind.y !== 0 || wind.z !== 0).toBe(true)
    for (let t = 0; t + 1 < board.ticks; t++) {
      const expected = new Set(minesAtTick(board, t).map((p) => key(advect(board, wind, p, t + 1))))
      expect(new Set(minesAtTick(board, t + 1).map(key))).toEqual(expected)
    }
  })

  it('uses a zero wind for single-tick boards', () => {
    const board = placeMines(createBoard('cube'), { x: 2, y: 2, z: 2, t: 0 }, seeded(3))
    expect(board.wind).toEqual({ x: 0, y: 0, z: 0 })
    expect(minesAtTick(board, 0)).toHaveLength(10)
  })
})

describe('advect', () => {
  it('wraps around the board', () => {
    const board = createBoard('timecube')
    expect(advect(board, { x: 1, y: -1, z: 0 }, { x: 3, y: 0, z: 2, t: 0 }, 1)).toEqual({
      x: 0,
      y: 3,
      z: 2,
      t: 1,
    })
    expect(advect(board, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0, t: 2 }, 0)).toEqual({
      x: 2,
      y: 0,
      z: 0,
      t: 0,
    })
  })
})

describe('reveal', () => {
  it('flood-fills zeros within the tick and never across ticks', () => {
    const board = reveal(createBoard('timecube'), { x: 0, y: 0, z: 0, t: 1 }, seeded(11))
    expect(board.status).toBe('playing')
    expect(board.revealedCount).toBeGreaterThanOrEqual(8) // a corner click guarantees itself and 7 neighbours
    const perTick = board.width * board.height * board.depth
    board.revealed.forEach((r, i) => {
      if (r) expect(Math.floor(i / perTick)).toBe(1)
    })
  })

  it('loses on a mine and wins once every safe cell at every tick is revealed', () => {
    let board = reveal(createBoard('timecube'), { x: 1, y: 1, z: 1, t: 0 }, seeded(5))
    const mine = minesAtTick(board, 2)[0] as Point
    expect(reveal(board, mine, seeded(1)).status).toBe('lost')

    for (let t = 0; t < board.ticks; t++)
      for (let z = 0; z < board.depth; z++)
        for (let y = 0; y < board.height; y++)
          for (let x = 0; x < board.width; x++) {
            const p = { x, y, z, t }
            if (!board.mines[index(board, p)]) board = reveal(board, p, seeded(1))
          }
    expect(board.status).toBe('won')
    expect(board.revealedCount).toBe(64 * 3 - 15)
  })

  it('behaves as classic 2D minesweeper on the beginner preset', () => {
    const board = reveal(createBoard('beginner'), { x: 4, y: 4, z: 0, t: 0 }, seeded(2))
    expect(neighbours(board, { x: 4, y: 4, z: 0, t: 0 })).toHaveLength(8)
    expect(neighbours(board, { x: 0, y: 0, z: 0, t: 0 })).toHaveLength(3)
    expect(minesAtTick(board, 0)).toHaveLength(10)
    expect(board.revealedCount).toBeGreaterThanOrEqual(9)
  })
})

describe('flags and chords', () => {
  it('toggles a flag only on hidden cells, per tick', () => {
    const base = reveal(createBoard('timecube'), { x: 0, y: 0, z: 0, t: 0 }, seeded(9))
    const p = { x: 3, y: 3, z: 3, t: 2 }
    const flagged = toggleFlag(base, p)
    expect(flagged.flagged[index(base, p)]).toBe(true)
    expect(flagged.flagged[index(base, { ...p, t: 1 })]).toBe(false)
    expect(toggleFlag(flagged, p).flagged[index(base, p)]).toBe(false)
    expect(toggleFlag(base, { x: 0, y: 0, z: 0, t: 0 })).toBe(base)
  })

  it('chords once the flags around a number match it', () => {
    const board = reveal(createBoard('timecube'), { x: 0, y: 0, z: 0, t: 0 }, seeded(13))
    const cells = toCells(board)
    // Find a revealed number whose neighbours are all mines or already revealed after flagging.
    let target: Point | undefined
    outer: for (let z = 0; z < 4; z++)
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          const cell = cells[0]?.[z]?.[y]?.[x]
          if (cell?.state === 'revealed' && (cell.adjacentMines ?? 0) > 0) {
            target = { x, y, z, t: 0 }
            break outer
          }
        }
    expect(target).toBeDefined()
    let flagged = board
    const hiddenBefore: Point[] = []
    for (const q of neighbours(board, target as Point)) {
      if (board.mines[index(board, q)]) flagged = toggleFlag(flagged, q)
      else if (!board.revealed[index(board, q)]) hiddenBefore.push(q)
    }
    const after = chord(flagged, target as Point)
    expect(after.status).toBe('playing')
    for (const q of hiddenBefore) expect(after.revealed[index(after, q)]).toBe(true)
  })
})

describe('upgradeBoard', () => {
  it('wraps a legacy 2D board into the flat 4D shape', () => {
    const upgraded = upgradeBoard({
      width: 2,
      height: 2,
      mineCount: 1,
      mines: [
        [false, true],
        [false, false],
      ],
      revealed: [
        [true, false],
        [false, false],
      ],
      flagged: [
        [false, false],
        [false, true],
      ],
      status: 'playing',
      revealedCount: 1,
    })
    expect(upgraded).toMatchObject({ version: 2, depth: 1, ticks: 1, wind: { x: 0, y: 0, z: 0 } })
    expect(upgraded.mines).toEqual([false, true, false, false])
    expect(upgraded.flagged[index(upgraded, { x: 1, y: 1, z: 0, t: 0 })]).toBe(true)
    expect(toCells(upgraded)[0]?.[0]?.[0]?.[0]?.state).toBe('revealed')
  })
})
