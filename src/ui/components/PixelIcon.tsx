/**
 * 小さな汎用アイコン（Phase 14）。
 *
 * 著作権のあるアセットは使わない。手書きの inline SVG のみ。
 * `stroke-linecap="square"` / `shape-rendering="crispEdges"` で
 * ブロックっぽい質感を出す（実ピクセルアートは同梱しない）。
 */

export const PIXEL_ICON_NAMES = [
  'home',
  'map',
  'creel',
  'book',
  'menu',
  'fish',
  'coin',
  'heart',
  'person',
  'trophy',
  'drop',
  'star',
  'lock',
] as const
export type PixelIconName = (typeof PIXEL_ICON_NAMES)[number]

export type PixelIconProps = {
  readonly name: PixelIconName
  readonly size?: number
  readonly className?: string
}

const PATHS: Readonly<Record<PixelIconName, string>> = {
  home: 'M3 11 L12 4 L21 11 M6 10 V20 H18 V10 M10 20 V14 H14 V20',
  map: 'M4 5 L9 3 L15 5 L20 3 V19 L15 21 L9 19 L4 21 Z M9 3 V19 M15 5 V21',
  creel: 'M5 9 H19 L17 21 H7 Z M8 9 V5 H16 V9 M9 13 H15 M9 17 H15',
  book: 'M4 4 H12 V20 H4 Z M12 4 H20 V20 H12 Z M7 8 H9 M15 8 H17',
  menu: 'M4 6 H20 M4 12 H20 M4 18 H20',
  fish: 'M3 12 C6 7 13 6 18 9 L21 6 V18 L18 15 C13 18 6 17 3 12 Z M16 11.5 H16.01',
  coin: 'M12 3 A9 9 0 1 0 12.01 3 Z M9 12 H15 M12 9 V15',
  heart: 'M12 20 C6 15 3 11.5 3 8 A4.5 4.5 0 0 1 12 6.5 A4.5 4.5 0 0 1 21 8 C21 11.5 18 15 12 20 Z',
  person: 'M12 4 A4 4 0 1 0 12.01 4 Z M4 21 C4 15 8 13 12 13 C16 13 20 15 20 21',
  trophy:
    'M6 4 H18 V9 A6 6 0 0 1 6 9 Z M4 6 H6 V9 A3 3 0 0 1 4 6 Z M18 6 H20 A3 3 0 0 1 18 9 Z M12 15 V19 M8 21 H16',
  drop: 'M12 3 C16 9 19 12.5 19 16 A7 7 0 0 1 5 16 C5 12.5 8 9 12 3 Z',
  star: 'M12 3 L14.5 9.5 L21 10 L16 14.2 L17.6 21 L12 17.3 L6.4 21 L8 14.2 L3 10 L9.5 9.5 Z',
  lock: 'M6 11 H18 V21 H6 Z M8 11 V7 A4 4 0 0 1 16 7 V11',
}

export const PixelIcon = ({ name, size = 22, className }: PixelIconProps) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="square"
    strokeLinejoin="miter"
    shapeRendering="crispEdges"
    aria-hidden="true"
    focusable="false"
  >
    <path d={PATHS[name]} />
  </svg>
)
