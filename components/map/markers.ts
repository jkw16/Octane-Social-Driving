import * as maplibregl from 'maplibre-gl';

/**
 * Branded map markers — the single place DOM markers get their look, so the
 * map reads like the rest of the app (colors mirror tailwind.config.js).
 * Every factory returns an unattached maplibregl.Marker: position and
 * `addTo(map)` stay with the caller.
 */

// Keep in sync with services/mapStyle.ts OCTANE_COLORS / tailwind.config.js.
const ACCENT = '#06b6d4';
const SUCCESS = '#22c55e';
const DANGER = '#ef4444';

const baseDotCss = (color: string, size: number, extra = '') =>
  `background:${color};width:${size}px;height:${size}px;border-radius:50%;border:2px solid #fff;${extra}`;

/** The signed-in driver — glowing cyan dot, the same look CruiseMode had. */
export function createUserPuckMarker(): maplibregl.Marker {
  const el = document.createElement('div');
  el.style.cssText =
    'background:#06b6d4;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 15px #06b6d4;';
  return new maplibregl.Marker(el);
}

/**
 * A car in motion — dot plus heading needle. `heading` is degrees clockwise
 * from north (device compass / course-over-ground). Pass a fresh heading to
 * `setHeading(marker, deg)` as fixes stream in — the needle rotates smoothly
 * by CSS transition, no marker rebuild.
 */
export function createCarPuckMarker(heading = 0, color = ACCENT): maplibregl.Marker {
  const el = document.createElement('div');
  el.style.cssText = 'position:relative;width:22px;height:22px;';
  const dot = document.createElement('div');
  dot.style.cssText = `position:absolute;inset:3px;background:${color};border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px ${color};`;
  const needle = document.createElement('div');
  needle.style.cssText = [
    'position:absolute;top:-5px;left:50%;transform:translateX(-50%)',
    'width:0;height:0',
    `border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:8px solid ${color}`,
    'transition:transform 300ms ease-out',
  ].join(';');
  el.appendChild(dot);
  el.appendChild(needle);
  el.dataset.heading = '0';
  return new maplibregl.Marker({ element: el }).setLngLat([0, 0]);
}

/** Rotate a car puck to a compass heading without recreating the marker. */
export function setCarPuckHeading(marker: maplibregl.Marker, heading: number) {
  const el = marker.getElement().querySelector('div:last-child') as HTMLElement | null;
  if (el) el.style.transform = `translateX(-50%) rotate(${heading}deg)`;
}

export type TrackMarkerKind = 'start' | 'finish' | 'checkpoint';

/** Route-creator checkpoint: green start, red finish, cyan intermediate. */
export function createTrackMarker(kind: TrackMarkerKind): maplibregl.Marker {
  const color = kind === 'start' ? SUCCESS : kind === 'finish' ? DANGER : ACCENT;
  const size = kind === 'checkpoint' ? 10 : 16;
  const el = document.createElement('div');
  el.style.cssText = `background:${color};width:${size}px;height:${size}px;border-radius:50%;border:2px solid #fff;`;
  return new maplibregl.Marker(el);
}

/** A meetup / event point pinned on the map (accent tab with white ring). */
export function createMeetupMarker(): maplibregl.Marker {
  const el = document.createElement('div');
  el.style.cssText = [
    'width:22px;height:22px',
    'background:#06b6d4',
    'border:2px solid #fff',
    'border-radius:50% 50% 50% 4px',           // pin shape
    'box-shadow:0 2px 8px rgba(0,0,0,.55)',
    'transform:rotate(45deg)',
  ].join(';');
  return new maplibregl.Marker({ element: el, anchor: 'bottom' });
}