import { useEffect } from 'react'
import type { Game } from '@app/shared'

interface Props {
  game: Game
  tick: number
  cut: number
  onTick: (tick: number) => void
  onCut: (cut: number) => void
}

/**
 * Time travel and the depth cut-away. Left and right arrow keys step through
 * ticks; the slider hides layers from the far side so inner cubes are reachable.
 */
export function TimeBar({ game, tick, cut, onTick, onCut }: Props) {
  useEffect(() => {
    if (game.ticks === 1) return
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /INPUT|SELECT|TEXTAREA/.test(event.target.tagName))
        return
      if (event.key === 'ArrowLeft') onTick(tick - 1)
      if (event.key === 'ArrowRight') onTick(tick + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [game.ticks, tick, onTick])

  if (game.ticks === 1 && game.depth === 1) return null

  return (
    <div className="time-bar">
      {game.ticks > 1 && (
        <div className="ticks" role="group" aria-label="Time">
          <button
            type="button"
            onClick={() => onTick(tick - 1)}
            disabled={tick === 0}
            aria-label="Earlier"
          >
            ◀
          </button>
          {Array.from({ length: game.ticks }, (_, t) => (
            <button
              key={t}
              type="button"
              className={t === tick ? 'tick active' : 'tick'}
              aria-pressed={t === tick}
              onClick={() => onTick(t)}
            >
              t{t + 1}
              <small>{game.mines - (game.flagsByTick[t] ?? 0)}</small>
            </button>
          ))}
          <button
            type="button"
            onClick={() => onTick(tick + 1)}
            disabled={tick === game.ticks - 1}
            aria-label="Later"
          >
            ▶
          </button>
        </div>
      )}
      {game.depth > 1 && (
        <label className="cut">
          Cut away
          <input
            type="range"
            min={0}
            max={game.depth - 1}
            value={cut}
            onChange={(event) => onCut(Number(event.target.value))}
            aria-label="Layers to cut away"
          />
          <span>
            {cut} of {game.depth}
          </span>
        </label>
      )}
    </div>
  )
}
