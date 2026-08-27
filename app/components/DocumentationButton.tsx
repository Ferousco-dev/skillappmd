'use client'

import { useRouter } from 'next/navigation'
import SpecularButton from './SpecularButton'
import { useTheme } from './useTheme'

/**
 * SpecularButton paints its edge in WebGL from explicit colour props, so it
 * cannot inherit a CSS custom property. This wrapper feeds it the right palette
 * for the active theme.
 */
export default function DocumentationButton() {
  const dark = useTheme() === 'dark'
  const router = useRouter()

  return (
    <SpecularButton
      size="sm"
      radius={999}
      textColor={dark ? '#f3f3f6' : '#111116'}
      lineColor={dark ? '#ffffff' : '#111116'}
      baseColor={dark ? '#4a4a55' : '#b9b9c4'}
      intensity={dark ? 1.35 : 1.15}
      shineSize={12}
      shineFade={38}
      thickness={1.1}
      proximity={260}
      onClick={() => router.push('/docs')}
    >
      Documentation
    </SpecularButton>
  )
}
