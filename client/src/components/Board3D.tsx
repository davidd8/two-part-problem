import { useEffect, useRef } from 'react'
import type { Game } from '@app/shared'
import type { BoardScene } from '../lib/scene.js'
import type { Point } from '../lib/useGame.js'

interface Props {
  game: Game
  tick: number
  cut: number
  onReveal: (p: Point) => void
  onFlag: (p: Point) => void
  onChord: (p: Point) => void
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/**
 * Mounts the Three.js scene for a 3D board. The scene module is loaded lazily
 * so the classic 2D game never pays for it, and so jsdom never touches WebGL.
 */
export function Board3D({ game, tick, cut, onReveal, onFlag, onChord }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const scene = useRef<BoardScene | null>(null)
  const handlers = useRef({ onReveal, onFlag, onChord })
  handlers.current = { onReveal, onFlag, onChord }
  const latest = useRef({ game, tick, cut })
  latest.current = { game, tick, cut }

  useEffect(() => {
    const el = container.current
    if (!el || !hasWebGL()) return
    let disposed = false
    let observer: ResizeObserver | null = null

    void import('../lib/scene.js').then(({ BoardScene }) => {
      if (disposed) return
      const instance = new BoardScene(el, {
        onReveal: (p) => handlers.current.onReveal(p),
        onFlag: (p) => handlers.current.onFlag(p),
        onChord: (p) => handlers.current.onChord(p),
      })
      scene.current = instance
      instance.update(latest.current.game, latest.current.tick, latest.current.cut)
      observer = new ResizeObserver(() => instance.resize())
      observer.observe(el)
    })

    return () => {
      disposed = true
      observer?.disconnect()
      scene.current?.dispose()
      scene.current = null
    }
  }, [])

  useEffect(() => {
    scene.current?.update(game, tick, cut)
  }, [game, tick, cut])

  if (!hasWebGL()) {
    return <p className="empty">This board needs WebGL, which your browser does not provide.</p>
  }

  return (
    <div
      ref={container}
      className={`board3d board-${game.status}`}
      role="img"
      aria-label={`Minesweeper cube, ${game.width} by ${game.height} by ${game.depth}, tick ${tick + 1} of ${game.ticks}`}
    />
  )
}
