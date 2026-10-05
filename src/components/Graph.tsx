import { useEffect, useRef, useState } from 'react';
import { robustRange } from '../lib/sampling';

const COLOURS = {
  background: '#0e1116',
  grid: '#1c2430',
  axis: '#3c495c',
  label: '#7c8798',
  curve: '#5eead4',
};

const PADDING = { left: 54, right: 14, top: 14, bottom: 28 };

/** A grid step of 1, 2 or 5 times a power of ten — the steps people expect. */
function niceStep(range: number, targetCount: number): number {
  if (!(range > 0)) return 1;
  const raw = range / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalised = raw / magnitude;
  const step = normalised < 1.5 ? 1 : normalised < 3 ? 2 : normalised < 7 ? 5 : 10;
  return step * magnitude;
}

/** Short axis labels without floating-point noise like 0.30000000000000004. */
function formatTick(value: number): string {
  if (Math.abs(value) < 1e-10) return '0';
  const magnitude = Math.abs(value);
  if (magnitude >= 10000 || magnitude < 0.001) {
    return value.toExponential(1).replace('e+', 'e');
  }
  return String(Number(value.toPrecision(4)));
}

function draw(
  c: CanvasRenderingContext2D,
  width: number,
  height: number,
  ys: Float64Array,
  xMin: number,
  xMax: number,
): void {
  c.fillStyle = COLOURS.background;
  c.fillRect(0, 0, width, height);

  const plotWidth = width - PADDING.left - PADDING.right;
  const plotHeight = height - PADDING.top - PADDING.bottom;
  if (plotWidth <= 0 || plotHeight <= 0 || !(xMax > xMin)) return;

  const { lo, hi } = robustRange(ys);
  const toX = (x: number) =>
    PADDING.left + ((x - xMin) / (xMax - xMin)) * plotWidth;
  const toY = (y: number) =>
    PADDING.top + (1 - (y - lo) / (hi - lo)) * plotHeight;

  c.font =
    '11px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
  c.textBaseline = 'middle';
  c.lineWidth = 1;

  // Vertical grid lines and x labels.
  const xStep = niceStep(xMax - xMin, 6);
  c.textAlign = 'center';
  for (let t = Math.ceil(xMin / xStep) * xStep; t <= xMax + 1e-9; t += xStep) {
    const x = Math.round(toX(t)) + 0.5;
    c.strokeStyle = COLOURS.grid;
    c.beginPath();
    c.moveTo(x, PADDING.top);
    c.lineTo(x, PADDING.top + plotHeight);
    c.stroke();
    c.fillStyle = COLOURS.label;
    c.fillText(formatTick(t), x, PADDING.top + plotHeight + 14);
  }

  // Horizontal grid lines and y labels.
  const yStep = niceStep(hi - lo, 5);
  c.textAlign = 'right';
  for (let t = Math.ceil(lo / yStep) * yStep; t <= hi + 1e-9; t += yStep) {
    const y = Math.round(toY(t)) + 0.5;
    c.strokeStyle = COLOURS.grid;
    c.beginPath();
    c.moveTo(PADDING.left, y);
    c.lineTo(PADDING.left + plotWidth, y);
    c.stroke();
    c.fillStyle = COLOURS.label;
    c.fillText(formatTick(t), PADDING.left - 8, y);
  }

  // The axes themselves, drawn only when zero is actually in view.
  c.strokeStyle = COLOURS.axis;
  c.lineWidth = 1.5;
  if (lo < 0 && hi > 0) {
    const y = toY(0);
    c.beginPath();
    c.moveTo(PADDING.left, y);
    c.lineTo(PADDING.left + plotWidth, y);
    c.stroke();
  }
  if (xMin < 0 && xMax > 0) {
    const x = toX(0);
    c.beginPath();
    c.moveTo(x, PADDING.top);
    c.lineTo(x, PADDING.top + plotHeight);
    c.stroke();
  }

  c.strokeStyle = COLOURS.grid;
  c.lineWidth = 1;
  c.strokeRect(PADDING.left + 0.5, PADDING.top + 0.5, plotWidth - 1, plotHeight - 1);

  // The curve.
  c.save();
  c.beginPath();
  c.rect(PADDING.left, PADDING.top, plotWidth, plotHeight);
  c.clip();

  c.strokeStyle = COLOURS.curve;
  c.lineWidth = 2;
  c.lineJoin = 'round';
  c.lineCap = 'round';

  // Break the line on an implausibly large jump between neighbouring samples.
  // Without this, `tan(x)` crossing an asymptote from +huge to -huge would be
  // drawn as a vertical stripe straight through the middle of the plot.
  const jumpLimit = (hi - lo) * 0.6;
  const n = ys.length;
  let drawing = false;
  let previous = NaN;

  c.beginPath();
  for (let i = 0; i < n; i += 1) {
    const y = ys[i];
    if (!Number.isFinite(y)) {
      drawing = false;
      previous = NaN;
      continue;
    }

    // x is i/n (not i/(n-1)) because sampling covers the half-open [xMin, xMax).
    const px = PADDING.left + (i / n) * plotWidth;
    const py = toY(y);

    const jumped = Number.isFinite(previous) && Math.abs(y - previous) > jumpLimit;
    if (!drawing || jumped) {
      c.moveTo(px, py);
      drawing = true;
    } else {
      c.lineTo(px, py);
    }
    previous = y;
  }
  c.stroke();
  c.restore();
}

export interface GraphProps {
  ys: Float64Array;
  xMin: number;
  xMax: number;
}

export function Graph({ ys, xMin, xMax }: GraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Track the container's size so the canvas can fill it responsively.
  useEffect(() => {
    const container = canvasRef.current?.parentElement;
    if (!container) return;

    const measure = () =>
      setSize({ width: container.clientWidth, height: container.clientHeight });

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0 || size.height === 0) return;

    // Render at device resolution so the curve is crisp on a Retina screen.
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.width * ratio);
    canvas.height = Math.round(size.height * ratio);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw(context, size.width, size.height, ys, xMin, xMax);
  }, [ys, xMin, xMax, size]);

  return (
    <div className="graph">
      <canvas ref={canvasRef} aria-label="Graph of the entered function" />
    </div>
  );
}
