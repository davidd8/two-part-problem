import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Cell, Game } from '@app/shared'
import type { Point } from './useGame.js'

/**
 * Imperative Three.js view of one time slice of a 3D board. React owns the
 * game state and calls `update()`; this class owns the WebGL objects.
 *
 * Every cube is one instance of a single InstancedMesh. Hidden cubes are solid,
 * flagged cubes are tinted, revealed numbers shrink to a translucent core with
 * a number sprite, and revealed zeros disappear so the interior opens up.
 */

export interface SceneHandlers {
  onReveal: (p: Point) => void
  onFlag: (p: Point) => void
  onChord: (p: Point) => void
}

const CELL = 1
const GAP = 0.12
const COLORS = {
  hidden: new THREE.Color('#3a4358'),
  hover: new THREE.Color('#556184'),
  flagged: new THREE.Color('#e5a33d'),
  mine: new THREE.Color('#f2777a'),
  mineWon: new THREE.Color('#4fbf8a'),
  hit: new THREE.Color('#ff3b3b'),
}
const NUMBER_COLORS = [
  '#6ea8fe',
  '#4fbf8a',
  '#f2777a',
  '#b48ead',
  '#d08770',
  '#88c0d0',
  '#e6e8ee',
  '#8b93a7',
]

const numberTextures = new Map<number, THREE.CanvasTexture>()
function numberTexture(n: number): THREE.CanvasTexture {
  const cached = numberTextures.get(n)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    // A dark disc behind the digit reads as "an opened cell" from any angle.
    ctx.fillStyle = 'rgba(18, 21, 28, 0.9)'
    ctx.beginPath()
    ctx.arc(64, 64, 58, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = NUMBER_COLORS[(n - 1) % NUMBER_COLORS.length] ?? '#fff'
    ctx.font = 'bold 84px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(n), 64, 70)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  numberTextures.set(n, texture)
  return texture
}

const numberMaterials = new Map<number, THREE.SpriteMaterial>()
function numberMaterial(n: number): THREE.SpriteMaterial {
  const cached = numberMaterials.get(n)
  if (cached) return cached
  const material = new THREE.SpriteMaterial({ map: numberTexture(n), transparent: true })
  numberMaterials.set(n, material)
  return material
}

export class BoardScene {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private mesh: THREE.InstancedMesh | null = null
  private sprites: THREE.Sprite[] = []
  private readonly spritePool: THREE.Sprite[] = []
  private game: Game | null = null
  private tick = 0
  private cut = 0
  private hovered: number | null = null
  private pressed: { x: number; y: number; button: number } | null = null
  private frame = 0
  private readonly tmpMatrix = new THREE.Matrix4()
  private readonly tmpColor = new THREE.Color()
  private disposed = false

  constructor(
    private readonly container: HTMLElement,
    private readonly handlers: SceneHandlers,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.enablePan = false
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: null,
    }

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.4))
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(4, 8, 6)
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0xffffff, 0.6)
    fill.position.set(-6, -3, -4)
    this.scene.add(fill)

    const el = this.renderer.domElement
    el.addEventListener('pointerdown', this.onPointerDown)
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('pointerleave', this.onPointerLeave)
    el.addEventListener('contextmenu', (event) => event.preventDefault())

    this.resize()
    this.loop()
  }

  /** Re-styles every cube from the game view. Cheap enough to call on every state change. */
  update(game: Game, tick: number, cut: number): void {
    const rebuilt = !this.game || this.game.id !== game.id
    this.game = game
    this.tick = tick
    this.cut = cut
    if (rebuilt) this.buildMesh(game)
    this.restyle()
  }

  resize(): void {
    const width = this.container.clientWidth || 1
    const height = this.container.clientHeight || 1
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.controls.dispose()
    this.mesh?.geometry.dispose()
    ;(this.mesh?.material as THREE.Material | undefined)?.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private loop = () => {
    if (this.disposed) return
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    this.frame = requestAnimationFrame(this.loop)
  }

  private buildMesh(game: Game) {
    if (this.mesh) {
      this.scene.remove(this.mesh)
      this.mesh.geometry.dispose()
      ;(this.mesh.material as THREE.Material).dispose()
    }
    for (const sprite of this.sprites) this.scene.remove(sprite)
    this.spritePool.push(...this.sprites)
    this.sprites = []

    const count = game.width * game.height * game.depth
    const geometry = new THREE.BoxGeometry(CELL - GAP, CELL - GAP, CELL - GAP)
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.55,
      metalness: 0.05,
      transparent: true,
      opacity: 1,
    })
    this.mesh = new THREE.InstancedMesh(geometry, material, count)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.scene.add(this.mesh)

    // Frame the board: the centre at the origin, the camera pulled back by its size.
    const radius = Math.hypot(game.width, game.height, game.depth) * 0.5 * CELL
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) + 1
    this.camera.position.set(distance * 0.62, distance * 0.5, distance * 0.62)
    this.controls.target.set(0, 0, 0)
    this.controls.minDistance = radius + 0.5
    this.controls.maxDistance = distance * 2.5
    this.controls.update()
  }

  /** Position of a cell in world space; y is flipped so row 0 is at the top. */
  private position(p: { x: number; y: number; z: number }): THREE.Vector3 {
    const g = this.game as Game
    return new THREE.Vector3(
      (p.x - (g.width - 1) / 2) * CELL,
      ((g.height - 1) / 2 - p.y) * CELL,
      (p.z - (g.depth - 1) / 2) * CELL,
    )
  }

  private instanceId(p: { x: number; y: number; z: number }): number {
    const g = this.game as Game
    return (p.z * g.height + p.y) * g.width + p.x
  }

  private pointOf(id: number): Point {
    const g = this.game as Game
    return {
      x: id % g.width,
      y: Math.floor(id / g.width) % g.height,
      z: Math.floor(id / (g.width * g.height)),
      t: this.tick,
    }
  }

  private cellAt(p: { x: number; y: number; z: number }): Cell | undefined {
    return this.game?.cells[this.tick]?.[p.z]?.[p.y]?.[p.x]
  }

  /** Cubes with z at or beyond the cut line are removed so the interior is reachable. */
  private isCut(p: { z: number }): boolean {
    const g = this.game as Game
    return p.z >= g.depth - this.cut
  }

  private restyle() {
    const game = this.game
    const mesh = this.mesh
    if (!game || !mesh) return
    const over = game.status !== 'playing'
    const hover = this.hovered === null ? null : this.pointOf(this.hovered)
    const near = new Set<number>()
    if (hover) {
      for (let dz = -1; dz <= 1; dz++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const q = { x: hover.x + dx, y: hover.y + dy, z: hover.z + dz }
            if (
              q.x >= 0 &&
              q.x < game.width &&
              q.y >= 0 &&
              q.y < game.height &&
              q.z >= 0 &&
              q.z < game.depth
            )
              near.add(this.instanceId(q))
          }
    }

    for (const sprite of this.sprites) this.scene.remove(sprite)
    this.spritePool.push(...this.sprites)
    this.sprites = []

    for (let z = 0; z < game.depth; z++)
      for (let y = 0; y < game.height; y++)
        for (let x = 0; x < game.width; x++) {
          const p = { x, y, z }
          const id = this.instanceId(p)
          const cell = this.cellAt(p) as Cell
          const pos = this.position(p)
          let scale = 1
          let color = COLORS.hidden

          if (this.isCut(p)) {
            scale = 0
          } else if (cell.mine) {
            color =
              game.status === 'won'
                ? COLORS.mineWon
                : cell.state === 'revealed'
                  ? COLORS.hit
                  : COLORS.mine
          } else if (cell.state === 'flagged') {
            color = COLORS.flagged
          } else if (cell.state === 'revealed') {
            // Opened cells lose their cube: zeros vanish, numbers float as a sprite
            // so they read from any angle and never occlude themselves.
            scale = 0
            if (cell.adjacentMines) {
              const sprite = this.spritePool.pop() ?? new THREE.Sprite()
              sprite.material = numberMaterial(cell.adjacentMines)
              sprite.position.copy(pos)
              sprite.scale.setScalar(0.72)
              sprite.userData.id = id
              this.scene.add(sprite)
              this.sprites.push(sprite)
            }
          } else if (!over && near.has(id)) {
            color = COLORS.hover
          }

          this.tmpMatrix.makeScale(scale, scale, scale).setPosition(pos)
          mesh.setMatrixAt(id, this.tmpMatrix)
          mesh.setColorAt(id, this.tmpColor.copy(color))
        }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  private pick(event: PointerEvent): number | null {
    if (!this.mesh) return null
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hit = this.raycaster.intersectObjects([this.mesh, ...this.sprites], false)[0]
    if (!hit) return null
    const id =
      hit.object instanceof THREE.Sprite ? (hit.object.userData.id as number) : hit.instanceId
    if (id === undefined) return null
    // Instances scaled to zero still have a matrix; make sure this one is visible.
    const p = this.pointOf(id)
    const cell = this.cellAt(p)
    if (!cell || this.isCut(p)) return null
    if (cell.state === 'revealed' && !cell.adjacentMines && !cell.mine) return null
    return id
  }

  private onPointerDown = (event: PointerEvent) => {
    this.pressed = { x: event.clientX, y: event.clientY, button: event.button }
  }

  private onPointerUp = (event: PointerEvent) => {
    const pressed = this.pressed
    this.pressed = null
    if (!pressed || !this.game || this.game.status !== 'playing') return
    // A drag orbits the camera; only a still click acts on a cube.
    if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 5) return
    const id = this.pick(event)
    if (id === null) return
    const p = this.pointOf(id)
    const cell = this.cellAt(p) as Cell
    if (pressed.button === 2) {
      if (cell.state !== 'revealed') this.handlers.onFlag(p)
    } else if (pressed.button === 0) {
      if (cell.state === 'revealed') this.handlers.onChord(p)
      else this.handlers.onReveal(p)
    }
  }

  private onPointerMove = (event: PointerEvent) => {
    if (this.pressed) return
    const id = this.pick(event)
    if (id !== this.hovered) {
      this.hovered = id
      this.renderer.domElement.style.cursor = id === null ? 'grab' : 'pointer'
      this.restyle()
    }
  }

  private onPointerLeave = () => {
    if (this.hovered !== null) {
      this.hovered = null
      this.restyle()
    }
  }
}
