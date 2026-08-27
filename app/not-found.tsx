import type { Metadata } from 'next'
import { NotFound, Illustration } from '@/components/ui/not-found'

export const metadata: Metadata = {
  title: 'Page not found',
  // A 404 must never be indexed, or it competes with real pages.
  robots: { index: false, follow: true },
}

export default function NotFoundPage() {
  return (
    <div className="relative flex flex-col w-full justify-center min-h-svh bg-background p-6 md:p-10">
      <div className="relative max-w-5xl mx-auto w-full">
        <Illustration
          className="absolute inset-0 w-full h-[50vh] opacity-[0.04] dark:opacity-[0.03] text-foreground"
          aria-hidden="true"
        />
        <NotFound
          searchAction="/search"
          title="Page not found"
          description="That skill has not been indexed here. Try a search, or head back home."
        />
      </div>
    </div>
  )
}
