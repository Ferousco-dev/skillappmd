import { cursorImage } from './CursorIcons'

/**
 * Publishes the cursor images as custom properties on :root.
 *
 * Native `cursor: url(...)` is used rather than a JavaScript element chasing
 * the pointer: it never lags behind the true pointer position, and it keeps
 * working while a drag is in flight. Rendered on the server, so there is no
 * client bundle and no flash of the default arrow on load.
 *
 * Both palettes are emitted because the images are serialised SVG strings and
 * cannot read a CSS custom property. The theme attribute selects between them.
 */
function block(selector: string, dark: boolean) {
  return [
    `${selector}{`,
    `--cur-default:${cursorImage('pointer', { dark })};`,
    `--cur-click:${cursorImage('click', { dark })};`,
    `--cur-drag:${cursorImage('click', { filled: true, dark })};`,
    '}',
  ].join('')
}

export default function CursorStyles() {
  const css = block(':root', false) + block(":root[data-theme='dark']", true)
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
