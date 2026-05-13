'use client';

/**
 * Sparkline minimal — pure SVG, sin deps de chart.
 * Renderiza una serie de N closes en un canvas ancho×alto, con color
 * según pendiente neta (alza vs baja).
 *
 * Mantén liviano: cero ejes, cero tooltips, cero animación. Es decorativo.
 */
interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** Si se pasa, fuerza el color (emerald/rose son por defecto según tendencia) */
  stroke?: string;
  className?: string;
}

export function Sparkline({ values, width = 60, height = 20, stroke, className }: SparklineProps) {
  if (!values || values.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className}>
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="rgb(71 85 105 / 0.4)" strokeDasharray="2 2" strokeWidth={0.5} />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const up = values[values.length - 1]! >= values[0]!;
  const color = stroke ?? (up ? 'rgb(16 185 129)' : 'rgb(244 63 94)'); // emerald | rose

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points.join(' ')}
      />
    </svg>
  );
}
