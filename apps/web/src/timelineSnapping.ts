import type { CompletedSegment } from './editor';

export const SNAP_THRESHOLD_PX = 8;

type SnapTarget = {
  milliseconds: number;
};

export function getSnapThresholdMs(windowDurationMs: number, laneWidthPx: number): number {
  return (SNAP_THRESHOLD_PX * windowDurationMs) / Math.max(laneWidthPx, 1);
}

export function buildSnapTargets(
  segments: Record<string, CompletedSegment>,
  excludedLineIds: Iterable<string>,
  playheadMs: number,
): SnapTarget[] {
  const excluded = new Set(excludedLineIds);
  const values = new Set<number>([playheadMs]);

  for (const segment of Object.values(segments)) {
    if (excluded.has(segment.lineId)) continue;
    values.add(segment.startMs);
    values.add(segment.endMs);
  }

  return Array.from(values).map((milliseconds) => ({ milliseconds }));
}

export function findNearestSnap(
  candidateMs: number[],
  targets: SnapTarget[],
  thresholdMs: number,
  isEligible: (targetMs: number) => boolean = () => true,
): number | null {
  let nearest: { targetMs: number; distanceMs: number } | null = null;

  for (const candidate of candidateMs) {
    for (const target of targets) {
      const distanceMs = Math.abs(target.milliseconds - candidate);
      if (distanceMs > thresholdMs || !isEligible(target.milliseconds)) continue;
      if (!nearest || distanceMs < nearest.distanceMs) {
        nearest = { targetMs: target.milliseconds, distanceMs };
      }
    }
  }

  return nearest?.targetMs ?? null;
}
