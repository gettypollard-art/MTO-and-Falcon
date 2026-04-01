import { format, formatDistanceToNow, differenceInMinutes, differenceInHours } from 'date-fns';
import type { FalconBehavior, WingbeatQuality, PursuitOutcome, DesiredWeightTrend, RewardSize, BoundaryClass, FalconDistanceFromHandler } from '../types/models';

export function fmtDate(iso: string): string {
  return format(new Date(iso), 'M/d/yyyy');
}

export function fmtTime(iso: string): string {
  return format(new Date(iso), 'h:mm a');
}

export function fmtDateTime(iso: string): string {
  return format(new Date(iso), 'M/d/yyyy h:mm a');
}

export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function fmtHours(minutes: number): string {
  return (minutes / 60).toFixed(1) + 'h';
}

export function fmtAgo(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

export function minutesSince(iso: string): number {
  return differenceInMinutes(new Date(), new Date(iso));
}

export function hoursSince(iso: string): number {
  return differenceInHours(new Date(), new Date(iso));
}

export function behaviorLabel(b: FalconBehavior): string {
  switch (b) {
    case 'perch': return 'Sitting on Perch';
    case 'baitAway': return 'Baiting Away from Handler';
    case 'baitToward': return 'Bait Towards Handler';
  }
}

export function wingbeatLabel(w: WingbeatQuality): string {
  switch (w) {
    case 'strong': return 'Strong';
    case 'normal': return 'Normal';
    case 'weak': return 'Weak';
  }
}

export function outcomeLabel(o: PursuitOutcome): string {
  switch (o) {
    case 'kill': return 'Catch';
    case 'chase': return 'Chase';
    case 'ignore': return 'Ignore';
    case 'no': return 'No';
  }
}

export function desiredWeightLabel(d: DesiredWeightTrend): string {
  switch (d) {
    case 'higher': return 'Higher';
    case 'same': return 'Same';
    case 'lower': return 'Lower';
  }
}

export function rewardSizeLabel(s: RewardSize): string {
  switch (s) {
    case 'small': return 'Small';
    case 'medium': return 'Medium';
    case 'large': return 'Large';
    case 'pickUpPiece': return 'Pickup Piece';
  }
}

export function boundaryLabel(b: BoundaryClass): string {
  switch (b) {
    case 'inside': return 'Inside';
    case 'perimeter': return 'Perimeter';
    case 'outside': return 'Outside';
    case 'unknown': return 'Unknown';
  }
}

export function distanceLabel(d: FalconDistanceFromHandler): string {
  switch (d) {
    case 'inView': return 'Visible';
    case 'outOfSight': return 'Out of Sight';
  }
}

export function windDirectionLabel(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

export function monthLabel(date: Date): string {
  return format(date, 'MMMM yyyy');
}

export function dayOfWeekShort(dayIndex: number): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayIndex];
}
