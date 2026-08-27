// Nested rectangles sharing a common baseline and right edge. Each step starts
// one column further right and stands one row taller, so the silhouette climbs
// to the right while every box stays drawn in full.
const CELL_W = 80
const CELL_H = 100
const EDGE = 4

type StepClusterProps = {
  count?: number
}

export default function StepCluster({ count = 9 }: StepClusterProps) {
  const width = count * CELL_W
  const height = count * CELL_H

  const steps = Array.from({ length: count }, (_, index) => ({
    x: index * CELL_W,
    y: height - (index + 1) * CELL_H,
    width: width - index * CELL_W,
    height: (index + 1) * CELL_H,
  }))

  return (
    <div
      className="step-cluster"
      aria-hidden="true"
      style={{ aspectRatio: `${width + EDGE} / ${height + EDGE}` }}
    >
      <svg viewBox={`0 0 ${width + EDGE} ${height + EDGE}`} preserveAspectRatio="xMaxYMax meet">
        {steps.map((step, index) => (
          <rect
            key={index}
            x={step.x}
            y={step.y}
            width={step.width}
            height={step.height}
            style={{ animationDelay: `${index * 55}ms` }}
          />
        ))}
      </svg>
    </div>
  )
}
