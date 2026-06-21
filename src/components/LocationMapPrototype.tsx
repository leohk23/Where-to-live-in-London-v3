import { useEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import locationWardPolygons from '../data/location-ward-polygons.json';
import { SCORE_THRESHOLDS } from '../lib/constants';
import { usePersistedCollapse } from '../hooks/usePersistedCollapse';
import type { ScoredResult } from '../types';

interface OfficeMarker {
  coords: { lat: string; lon: string };
  label: string;
  tone: 'work' | 'partner';
}

interface Props {
  sortedResults: ScoredResult[];
  selectedLocation: string | null;
  highlightedLocation: string | null;
  darkMode?: boolean;
  officeCoords?: { lat: string; lon: string } | null;
  partnerCoords?: { lat: string; lon: string } | null;
  budgetEnabled?: boolean;
  maxBudget?: number;
  onLocationHover?: (location: string | null) => void;
  onLocationSelect?: (location: string) => void;
  className?: string;
}

interface Coordinate {
  lat: number;
  lon: number;
}

type Position = [number, number];

type PolygonGeometry =
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] };

interface LocationBoundary {
  anchor: Coordinate;
  boundaryLevel: string;
  boundaryName: string;
  geometry: PolygonGeometry;
  source: string;
}

interface DrawableLocation {
  result: ScoredResult;
  boundary: LocationBoundary;
  path: string;
  anchor: {
    x: number;
    y: number;
  };
  bounds: Bounds;
  rank: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const LOCATION_BOUNDARIES = locationWardPolygons as unknown as Record<string, LocationBoundary>;
const TILE_SIZE = 256;
const ALL_LOCATIONS_ZOOM = 11;
const SELECTED_LOCATION_ZOOM = 13;
const MIN_TILE_ZOOM = 11;
const MAX_TILE_ZOOM = 14;
const MAX_EFFECTIVE_ZOOM = 14;
const fallbackGeoBounds = {
  minX: -0.52,
  minY: 51.28,
  maxX: 0.16,
  maxY: 51.68,
};

function toPoint([lon, lat]: Position, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const clampedLat = Math.max(Math.min(lat, 85.05112878), -85.05112878);
  const sinLat = Math.sin(clampedLat * Math.PI / 180);

  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function mergeBounds(a: Bounds | null, b: Bounds): Bounds {
  if (!a) return b;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function positionsToBounds(positions: Position[], zoom: number, current: Bounds | null = null): Bounds {
  return positions.reduce<Bounds>((bounds, position) => {
    const point = toPoint(position, zoom);
    return {
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    };
  }, current ?? {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  });
}

function geometryToBounds(geometry: PolygonGeometry, zoom: number): Bounds {
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.coordinates;

  return polygons.reduce<Bounds | null>((bounds, polygon) => {
    const polygonBounds = polygon.reduce<Bounds | null>(
      (ringBounds, ring) => positionsToBounds(ring, zoom, ringBounds),
      null,
    );
    return polygonBounds ? mergeBounds(bounds, polygonBounds) : bounds;
  }, null) ?? getFallbackBounds(zoom);
}

function ringToPath(ring: Position[], zoom: number) {
  return ring.map((position, index) => {
    const point = toPoint(position, zoom);
    return `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`;
  }).join(' ');
}

function geometryToPath(geometry: PolygonGeometry, zoom: number) {
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.coordinates;

  return polygons
    .flatMap(polygon => polygon.map(ring => `${ringToPath(ring, zoom)} Z`))
    .join(' ');
}

function getFallbackBounds(zoom: number): Bounds {
  const northWest = toPoint([fallbackGeoBounds.minX, fallbackGeoBounds.maxY], zoom);
  const southEast = toPoint([fallbackGeoBounds.maxX, fallbackGeoBounds.minY], zoom);

  return {
    minX: northWest.x,
    minY: northWest.y,
    maxX: southEast.x,
    maxY: southEast.y,
  };
}

function boundsToViewBox(bounds: Bounds, paddingRatio = 0.08) {
  const width = Math.max(bounds.maxX - bounds.minX, 0.01);
  const height = Math.max(bounds.maxY - bounds.minY, 0.01);
  const padding = Math.max(width, height) * paddingRatio;

  return {
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    width: width + padding * 2,
    height: height + padding * 2,
  };
}

function viewBoxToString(viewBox: ReturnType<typeof boundsToViewBox>) {
  return `${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`;
}

// Van Wijk & Nuij smooth zoom/pan interpolation between two camera states [centerX, centerY, width].
// Returns interp(t in [0,1]) -> [centerX, centerY, width], arcing out and back for distant moves.
function createZoomInterpolator(
  from: [number, number, number],
  to: [number, number, number],
): (t: number) => [number, number, number] {
  const rho = 1.42;
  const [ux0, uy0, w0] = from;
  const [ux1, uy1, w1] = to;
  const dx = ux1 - ux0;
  const dy = uy1 - uy0;
  const d1 = Math.hypot(dx, dy);

  // Near-zero pan: fall back to a pure exponential (geometric) zoom in place.
  if (d1 < 1e-6 || !Number.isFinite(d1)) {
    return (t: number) => [ux0 + dx * t, uy0 + dy * t, w0 * (w1 / w0) ** t];
  }

  const rho2 = rho * rho;
  const rho4 = rho2 * rho2;
  const d2 = d1 * d1;
  const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1);
  const b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (r1 - r0) / rho;
  const coshr0 = Math.cosh(r0);

  if (!Number.isFinite(S) || Math.abs(S) < 1e-6) {
    return (t: number) => [ux0 + dx * t, uy0 + dy * t, w0 * (w1 / w0) ** t];
  }

  return (t: number) => {
    const s = t * S;
    const u = (w0 / rho2) * (coshr0 * Math.tanh(rho * s + r0) - Math.sinh(r0));
    const w = (w0 * coshr0) / Math.cosh(rho * s + r0);
    return [ux0 + (u / d1) * dx, uy0 + (u / d1) * dy, w];
  };
}

// Re-express a viewBox from one tile-zoom space into another (point coords scale by 2^Δzoom).
function convertViewBoxZoom(
  viewBox: ReturnType<typeof boundsToViewBox>,
  fromZoom: number,
  toZoom: number,
) {
  const factor = 2 ** (toZoom - fromZoom);
  return {
    minX: viewBox.minX * factor,
    minY: viewBox.minY * factor,
    width: viewBox.width * factor,
    height: viewBox.height * factor,
  };
}

function viewBoxToAspect(viewBox: ReturnType<typeof boundsToViewBox>, aspectRatio: number | null) {
  if (!aspectRatio || aspectRatio <= 0) return viewBox;

  const currentAspect = viewBox.width / viewBox.height;
  if (Math.abs(currentAspect - aspectRatio) < 0.01) return viewBox;

  if (currentAspect > aspectRatio) {
    const nextHeight = viewBox.width / aspectRatio;
    return {
      minX: viewBox.minX,
      minY: viewBox.minY - (nextHeight - viewBox.height) / 2,
      width: viewBox.width,
      height: nextHeight,
    };
  }

  const nextWidth = viewBox.height * aspectRatio;
  return {
    minX: viewBox.minX - (nextWidth - viewBox.width) / 2,
    minY: viewBox.minY,
    width: nextWidth,
    height: viewBox.height,
  };
}

function buildDrawableLocations(sortedResults: ScoredResult[], zoom: number) {
  return sortedResults.flatMap((result, index) => {
    const boundary = LOCATION_BOUNDARIES[result.location];
    if (!boundary) return [];

    const anchorPoint = toPoint([boundary.anchor.lon, boundary.anchor.lat], zoom);

    return [{
      result,
      boundary,
      path: geometryToPath(boundary.geometry, zoom),
      anchor: anchorPoint,
      bounds: geometryToBounds(boundary.geometry, zoom),
      rank: index + 1,
    }];
  });
}

function getMapBounds(locations: DrawableLocation[]) {
  return locations.reduce<Bounds | null>(
    (bounds, location) => mergeBounds(bounds, location.bounds),
    null,
  );
}

function getVisibleTiles(viewBox: ReturnType<typeof boundsToViewBox>, zoom: number) {
  const maxTileIndex = 2 ** zoom - 1;
  // Pad the range by one tile each side so a sub-pixel edge can never leave a blank strip.
  const minTileX = Math.max(0, Math.floor(viewBox.minX / TILE_SIZE) - 1);
  const maxTileX = Math.min(maxTileIndex, Math.floor((viewBox.minX + viewBox.width) / TILE_SIZE) + 1);
  const minTileY = Math.max(0, Math.floor(viewBox.minY / TILE_SIZE) - 1);
  const maxTileY = Math.min(maxTileIndex, Math.floor((viewBox.minY + viewBox.height) / TILE_SIZE) + 1);
  const tiles: Array<{ x: number; y: number; href: string }> = [];

  for (let x = minTileX; x <= maxTileX; x += 1) {
    for (let y = minTileY; y <= maxTileY; y += 1) {
      tiles.push({
        x,
        y,
        // OSM, sharded across subdomains so the browser's ~6-per-host connection cap
        // doesn't stall a whole column of tiles while many load at once.
        href: `https://${['a', 'b', 'c'][(x + y) % 3]}.tile.openstreetmap.org/${zoom}/${x}/${y}.png`,
      });
    }
  }

  return tiles;
}

function getTileStyle(
  tile: { x: number; y: number },
  viewBox: ReturnType<typeof boundsToViewBox>,
) {
  return {
    left: `${((tile.x * TILE_SIZE - viewBox.minX) / viewBox.width) * 100}%`,
    top: `${((tile.y * TILE_SIZE - viewBox.minY) / viewBox.height) * 100}%`,
    width: `${(TILE_SIZE / viewBox.width) * 100}%`,
    height: `${(TILE_SIZE / viewBox.height) * 100}%`,
  };
}

// Match-score hue, mirroring the table's score column (green / amber / red), per theme.
function scoreHue(score: number, darkMode: boolean) {
  if (score >= SCORE_THRESHOLDS.high) return darkMode ? '#4ade80' : '#16a34a';
  if (score >= SCORE_THRESHOLDS.medium) return darkMode ? '#facc15' : '#ca8a04';
  return darkMode ? '#f87171' : '#ef4444';
}

function hexToRgba(hex: string, alpha: number) {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function polygonTone(
  location: DrawableLocation,
  selectedLocation: string | null,
  darkMode: boolean,
  scoresActive: boolean,
  overBudget: boolean,
) {
  const isSelected = location.result.location === selectedLocation;
  const isDimmed = Boolean(selectedLocation && !isSelected);

  // Areas filtered out by the max-budget toggle are greyed out, mirroring the dimmed table rows.
  if (overBudget) {
    return {
      fill: darkMode ? 'rgba(71, 85, 105, 0.30)' : 'rgba(148, 163, 184, 0.18)',
      stroke: darkMode ? '#64748b' : '#94a3b8',
      strokeWidth: isSelected ? 2.2 : 1,
      pinFill: darkMode ? '#334155' : '#e2e8f0',
      pinStroke: darkMode ? '#64748b' : '#94a3b8',
      opacity: isSelected ? 0.9 : isDimmed ? 0.35 : 0.5,
    };
  }

  // When priority scores are active, colour each ward by its match score (keeping transparency).
  if (scoresActive) {
    const hue = scoreHue(location.result.compositeScore, darkMode);
    const isTop5 = location.rank <= 5;
    const fillAlpha = isSelected
      ? (darkMode ? 0.62 : 0.38)
      : (darkMode ? 0.45 : 0.28);
    const opacity = isSelected
      ? 1
      : isDimmed
        ? (isTop5 ? 0.7 : 0.55)
        : (isTop5 ? 0.95 : 0.8);
    return {
      fill: hexToRgba(hue, fillAlpha),
      stroke: hue,
      strokeWidth: isSelected ? 2.8 : isTop5 ? 1.6 : 1,
      pinFill: darkMode ? '#0b1220' : '#ffffff',
      pinStroke: hue,
      opacity,
    };
  }

  if (isSelected) {
    return {
      fill: darkMode ? 'rgba(45, 212, 191, 0.55)' : 'rgba(20, 184, 166, 0.32)',
      stroke: darkMode ? '#5eead4' : '#0f766e',
      strokeWidth: 2.6,
      pinFill: darkMode ? '#2dd4bf' : '#14b8a6',
      pinStroke: darkMode ? '#99f6e4' : '#0f766e',
      opacity: 1,
    };
  }

  if (location.rank <= 5) {
    return {
      fill: darkMode ? 'rgba(96, 165, 250, 0.45)' : 'rgba(59, 130, 246, 0.18)',
      stroke: darkMode ? '#93c5fd' : '#2563eb',
      strokeWidth: 1.4,
      pinFill: darkMode ? '#bfdbfe' : '#f8fafc',
      pinStroke: darkMode ? '#3b82f6' : '#64748b',
      opacity: isDimmed ? 0.75 : 0.9,
    };
  }

  return {
    fill: darkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(71, 85, 105, 0.24)',
    stroke: darkMode ? '#cbd5e1' : '#475569',
    strokeWidth: darkMode ? 1 : 1.2,
    pinFill: darkMode ? '#e2e8f0' : '#f8fafc',
    pinStroke: darkMode ? '#94a3b8' : '#475569',
    opacity: isDimmed ? 0.6 : 0.85,
  };
}

export default function LocationMapPrototype({
  sortedResults,
  selectedLocation,
  highlightedLocation,
  darkMode = false,
  officeCoords = null,
  partnerCoords = null,
  budgetEnabled = false,
  maxBudget = 0,
  onLocationHover,
  onLocationSelect,
  className = '',
}: Props) {
  const mapFrameRef = useRef<HTMLDivElement>(null);
  const { collapsed, toggle } = usePersistedCollapse('wtl-collapse-map');
  const [mapAspectRatio, setMapAspectRatio] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null);
  const [renderZoom, setRenderZoom] = useState(ALL_LOCATIONS_ZOOM);
  const [renderViewBox, setRenderViewBox] = useState<ReturnType<typeof boundsToViewBox> | null>(null);
  const animationRef = useRef<number | null>(null);
  // Mirrors of the live render state, so the fly animation / wheel handler read fresh values
  // without those changes being able to re-trigger or cancel an in-flight animation.
  const viewBoxRef = useRef<ReturnType<typeof boundsToViewBox> | null>(null);
  const renderZoomRef = useRef(ALL_LOCATIONS_ZOOM);
  const fallbackViewBoxRef = useRef<ReturnType<typeof boundsToViewBox> | null>(null);
  const sortedResultsRef = useRef(sortedResults);
  sortedResultsRef.current = sortedResults;
  const mapAspectRatioRef = useRef<number | null>(mapAspectRatio);
  mapAspectRatioRef.current = mapAspectRatio;

  const cancelFly = () => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  };

  const showTooltip = (event: { clientX: number; clientY: number }, label: string) => {
    const rect = mapFrameRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, label });
  };
  const visualFocus = highlightedLocation ?? selectedLocation;
  const scoresActive = sortedResults.some(result => result.compositeScore > 0);
  const drawableLocations = useMemo(
    () => buildDrawableLocations(sortedResults, renderZoom),
    [renderZoom, sortedResults],
  );
  const fallbackViewBox = useMemo(
    () => viewBoxToAspect(
      boundsToViewBox(getMapBounds(drawableLocations) ?? getFallbackBounds(renderZoom), 0.06),
      mapAspectRatio,
    ),
    [drawableLocations, renderZoom, mapAspectRatio],
  );
  // Re-apply the current frame aspect on every render so a resize can never leave the map skewed.
  const viewBox = viewBoxToAspect(renderViewBox ?? fallbackViewBox, mapAspectRatio);
  viewBoxRef.current = viewBox;
  renderZoomRef.current = renderZoom;
  fallbackViewBoxRef.current = fallbackViewBox;
  const mapTiles = getVisibleTiles(viewBox, renderZoom);
  const selectedResult = selectedLocation
    ? sortedResults.find(result => result.location === selectedLocation) ?? null
    : null;
  const selectedBoundary = selectedLocation ? LOCATION_BOUNDARIES[selectedLocation] ?? null : null;

  // Project work-location pins into the current map space (kept screen-stable as you zoom).
  const markerRadius = viewBox.width * 0.016;
  // Anchor dots also scale with the viewBox so they stay a constant on-screen size while zooming.
  const anchorRadius = viewBox.width * 0.008;
  const officeMarkers = ([
    { coords: officeCoords, label: 'Your workplace', tone: 'work' },
    { coords: partnerCoords, label: 'Partner workplace', tone: 'partner' },
  ] as OfficeMarker[])
    .flatMap(marker => {
      if (!marker.coords) return [];
      const lon = Number(marker.coords.lon);
      const lat = Number(marker.coords.lat);
      if (Number.isNaN(lon) || Number.isNaN(lat)) return [];
      return [{ ...marker, point: toPoint([lon, lat], renderZoom) }];
    });

  useEffect(() => {
    if (!mapFrameRef.current) return undefined;

    const updateSize = () => {
      if (!mapFrameRef.current) return;
      const rect = mapFrameRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setMapAspectRatio(rect.width / rect.height);
      }
    };

    updateSize();
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateSize);
    if (!resizeObserver) return undefined;

    resizeObserver.observe(mapFrameRef.current);

    return () => resizeObserver.disconnect();
  }, [collapsed]); // re-attach when the section expands and the frame remounts

  // Animate the shared viewBox when the pinned location changes (zoom in/out).
  // Depends ONLY on selectedLocation: aspect/results are read from refs so a resize or
  // re-sort mid-flight can't re-run this effect and cancel the animation.
  useEffect(() => {
    const frameRect = mapFrameRef.current?.getBoundingClientRect();
    const liveAspect = frameRect && frameRect.height > 0
      ? frameRect.width / frameRect.height
      : mapAspectRatioRef.current;
    if (!liveAspect) return undefined;

    const results = sortedResultsRef.current;
    const computeFraming = (loc: string | null, zoom: number) => {
      const drawable = buildDrawableLocations(results, zoom);
      const shape = loc ? drawable.find(d => d.result.location === loc) : null;
      if (!shape) {
        const bounds = getMapBounds(drawable) ?? getFallbackBounds(zoom);
        return viewBoxToAspect(boundsToViewBox(bounds, 0.06), liveAspect);
      }
      // Fit the whole ward (plus padding); aspect expansion only ever adds margin, so the
      // full polygon stays visible however big the ward is.
      return viewBoxToAspect(boundsToViewBox(shape.bounds, 0.35), liveAspect);
    };

    const targetZoom = selectedLocation ? SELECTED_LOCATION_ZOOM : ALL_LOCATIONS_ZOOM;

    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    // Animate within the overview zoom space, then commit to the crisp resting zoom.
    // Start from wherever the camera currently sits (handles free wheel-zoom seamlessly).
    // Both endpoints share the live aspect so the frame never skews mid-flight.
    const currentVB = viewBoxRef.current;
    const rawFrom = currentVB
      ? convertViewBoxZoom(currentVB, renderZoomRef.current, ALL_LOCATIONS_ZOOM)
      : computeFraming(null, ALL_LOCATIONS_ZOOM);
    const fromVB = viewBoxToAspect(rawFrom, liveAspect);
    const toVB = computeFraming(selectedLocation, ALL_LOCATIONS_ZOOM);
    setRenderZoom(ALL_LOCATIONS_ZOOM);

    // Van Wijk smooth zoom/pan: for far targets it zooms out, pans, then zooms back in,
    // so every transition — near or far — reads as deliberate motion (not just a slide).
    const fromCx = fromVB.minX + fromVB.width / 2;
    const fromCy = fromVB.minY + fromVB.height / 2;
    const toCx = toVB.minX + toVB.width / 2;
    const toCy = toVB.minY + toVB.height / 2;
    const interpolate = createZoomInterpolator(
      [fromCx, fromCy, fromVB.width],
      [toCx, toCy, toVB.width],
    );

    const DURATION = 650;
    const startTime = performance.now();
    const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

    const step = (now: number) => {
      const t = Math.min((now - startTime) / DURATION, 1);
      const [cx, cy, width] = interpolate(easeInOut(t));
      const height = width / liveAspect;
      setRenderViewBox({
        minX: cx - width / 2,
        minY: cy - height / 2,
        width,
        height,
      });
      if (t < 1) {
        animationRef.current = requestAnimationFrame(step);
        return;
      }
      animationRef.current = null;
      if (selectedLocation) {
        setRenderZoom(targetZoom);
        setRenderViewBox(computeFraming(selectedLocation, targetZoom));
      }
    };
    animationRef.current = requestAnimationFrame(step);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [selectedLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wheel to zoom (centred on the cursor) and two-finger pinch to zoom/pan on touch
  // screens, both clamped between the overview and street level.
  useEffect(() => {
    const frame = mapFrameRef.current;
    if (!frame) return undefined;

    // Shared camera step: the geographic point under (fromX, fromY) ends up pinned
    // under (toX, toY) while the effective zoom changes by zoomDelta. Wheel passes the
    // same point twice (zoom in place); pinch passes the old/new midpoint (zoom + pan).
    const applyZoom = (fromX: number, fromY: number, toX: number, toY: number, zoomDelta: number) => {
      const vb = viewBoxRef.current;
      const fallback = fallbackViewBoxRef.current;
      if (!vb || !fallback) return;
      const zoom = renderZoomRef.current;
      const rect = frame.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const cx = fromX - rect.left;
      const cy = fromY - rect.top;

      // Geographic point under the anchor, in the current tile-zoom space.
      const pointX = vb.minX + (cx / rect.width) * vb.width;
      const pointY = vb.minY + (cy / rect.height) * vb.height;

      // Current and minimum effective zoom (overview = how far out the fit sits).
      const effZoom = zoom + Math.log2(rect.width / vb.width);
      const minEffZoom = zoom + Math.log2(rect.width / fallback.width);
      const nextEffZoom = Math.min(Math.max(effZoom + zoomDelta, minEffZoom), MAX_EFFECTIVE_ZOOM);

      const tileZoom = Math.min(Math.max(Math.round(nextEffZoom), MIN_TILE_ZOOM), MAX_TILE_ZOOM);
      const scale = 2 ** (nextEffZoom - tileZoom);
      const newWidth = rect.width / scale;
      const newHeight = rect.height / scale;

      // Re-pin the anchor's geographic point, in the chosen tile-zoom space.
      const factor = 2 ** (tileZoom - zoom);
      const tx = toX - rect.left;
      const ty = toY - rect.top;
      const nextViewBox = {
        minX: pointX * factor - (tx / rect.width) * newWidth,
        minY: pointY * factor - (ty / rect.height) * newHeight,
        width: newWidth,
        height: newHeight,
      };

      if (tileZoom !== zoom) setRenderZoom(tileZoom);
      setRenderViewBox(nextViewBox);

      // Keep the camera refs in sync immediately. Pinch fires many touchmoves per second at
      // continuous-event priority, so the next frame often runs before React has committed this
      // update; without this, applyZoom would re-read the pre-zoom camera and the map jumps
      // around instead of zooming smoothly toward the fingers.
      renderZoomRef.current = tileZoom;
      viewBoxRef.current = nextViewBox;
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      cancelFly();
      applyZoom(event.clientX, event.clientY, event.clientX, event.clientY, -event.deltaY * 0.002);
    };

    // Pinch state: midpoint and finger spread from the previous touch frame.
    let pinch: { x: number; y: number; dist: number } | null = null;
    const readPinch = (event: TouchEvent) => {
      const [a, b] = [event.touches[0], event.touches[1]];
      return {
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      };
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        pinch = null;
        return;
      }
      cancelFly();
      pinch = readPinch(event);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !pinch) return;
      event.preventDefault();
      const next = readPinch(event);
      applyZoom(pinch.x, pinch.y, next.x, next.y, Math.log2(next.dist / Math.max(pinch.dist, 1)));
      pinch = next;
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinch = null;
    };

    // Safari (iOS) fires its own gesture events on a two-finger pinch and zooms the whole
    // page/visual viewport, which touch-action does not govern. Suppress it so the pinch
    // drives the map instead of the page. No-op on browsers that don't emit these events.
    const onGesture = (event: Event) => event.preventDefault();

    // Mouse navigation:
    //  - single drag         => pan (Google-Maps style)
    //  - double-click + hold, then drag vertically => zoom (up = in, down = out)
    // A plain click still falls through to select a ward.
    let lastDownAt = 0;
    let lastDownX = 0;
    let lastDownY = 0;
    type Gesture =
      | { kind: 'pan'; startX: number; startY: number; minX: number; minY: number; moved: boolean }
      | { kind: 'zoom'; anchorX: number; anchorY: number; lastY: number; moved: boolean };
    let gesture: Gesture | null = null;

    const onMove = (event: MouseEvent) => {
      if (!gesture) return;
      const rect = frame.getBoundingClientRect();
      const vb = viewBoxRef.current;
      if (!vb || rect.width === 0 || rect.height === 0) return;
      event.preventDefault();
      if (gesture.kind === 'zoom') {
        const dy = event.clientY - gesture.lastY;
        if (Math.abs(dy) < 0.5) return;
        gesture.lastY = event.clientY;
        gesture.moved = true;
        applyZoom(gesture.anchorX, gesture.anchorY, gesture.anchorX, gesture.anchorY, -dy * 0.01);
      } else {
        const dxPx = event.clientX - gesture.startX;
        const dyPx = event.clientY - gesture.startY;
        if (!gesture.moved && Math.hypot(dxPx, dyPx) < 4) return;
        gesture.moved = true;
        const next = {
          minX: gesture.minX - dxPx * (vb.width / rect.width),
          minY: gesture.minY - dyPx * (vb.height / rect.height),
          width: vb.width,
          height: vb.height,
        };
        setRenderViewBox(next);
        viewBoxRef.current = next;
      }
    };
    // Swallow the click that ends a drag so it doesn't also toggle a ward selection.
    const swallowClick = (event: MouseEvent) => { event.stopPropagation(); event.preventDefault(); };
    const onUp = () => {
      const moved = gesture?.moved;
      gesture = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (moved) frame.addEventListener('click', swallowClick, { capture: true, once: true });
    };
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const now = Date.now();
      const isDouble = now - lastDownAt < 300
        && Math.hypot(event.clientX - lastDownX, event.clientY - lastDownY) < 12;
      lastDownAt = now;
      lastDownX = event.clientX;
      lastDownY = event.clientY;
      const vb = viewBoxRef.current;
      if (!vb) return;
      cancelFly();
      if (isDouble) {
        event.preventDefault();
        gesture = { kind: 'zoom', anchorX: event.clientX, anchorY: event.clientY, lastY: event.clientY, moved: false };
      } else {
        gesture = { kind: 'pan', startX: event.clientX, startY: event.clientY, minX: vb.minX, minY: vb.minY, moved: false };
      }
      window.addEventListener('mousemove', onMove, { passive: false });
      window.addEventListener('mouseup', onUp);
    };

    frame.addEventListener('mousedown', onMouseDown);
    frame.addEventListener('wheel', onWheel, { passive: false });
    frame.addEventListener('touchstart', onTouchStart, { passive: true });
    frame.addEventListener('touchmove', onTouchMove, { passive: false });
    frame.addEventListener('touchend', onTouchEnd);
    frame.addEventListener('touchcancel', onTouchEnd);
    frame.addEventListener('gesturestart', onGesture);
    frame.addEventListener('gesturechange', onGesture);
    return () => {
      frame.removeEventListener('mousedown', onMouseDown);
      frame.removeEventListener('wheel', onWheel);
      frame.removeEventListener('touchstart', onTouchStart);
      frame.removeEventListener('touchmove', onTouchMove);
      frame.removeEventListener('touchend', onTouchEnd);
      frame.removeEventListener('touchcancel', onTouchEnd);
      frame.removeEventListener('gesturestart', onGesture);
      frame.removeEventListener('gesturechange', onGesture);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [collapsed]); // re-attach when the section expands and the frame remounts

  if (drawableLocations.length === 0) return null;

  return (
    <section className={`flex flex-col rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900 sm:p-4 ${collapsed ? '' : className}`}>
      <div className={`flex items-center justify-between gap-3 ${collapsed ? '' : 'mb-3'}`}>
        <div className="min-w-0 flex-1">
          <h2 className="flex min-w-0 items-center text-lg font-semibold">
            <MapPin className="mr-2 h-5 w-5 shrink-0 text-teal-600 dark:text-teal-300" />
            <span className="truncate">{selectedResult?.displayName ?? 'All locations'}</span>
          </h2>
          {!collapsed && (
            /* Fixed-height, non-wrapping line so selecting a ward never reflows the map frame. */
            <p
              className="mt-1 h-4 truncate text-xs text-gray-500 dark:text-gray-400"
              title={selectedBoundary && selectedResult
                ? `${selectedBoundary.boundaryName} ward - ${selectedResult.anchorStation}`
                : undefined}
            >
              {selectedBoundary && selectedResult
                ? `${selectedBoundary.boundaryName} ward - ${selectedResult.anchorStation}`
                : 'Hover or click a ward to focus it'}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={toggle}
          className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand map' : 'Collapse map'}
        >
          {collapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
        </button>
      </div>

      {!collapsed && (
      <>
      <div
        ref={mapFrameRef}
        className="relative h-80 min-h-[22rem] flex-1 cursor-grab overflow-hidden rounded-md border border-gray-200 bg-slate-100 active:cursor-grabbing dark:border-gray-700 dark:bg-slate-950 sm:h-[28rem] xl:h-auto"
        /* One-finger touch keeps scrolling the page; pinch is reserved for the map's own zoom. */
        style={{ touchAction: 'pan-x pan-y' }}
        onMouseLeave={() => { onLocationHover?.(null); setTooltip(null); }}
      >
        <div
          className="absolute inset-0 bg-slate-100 dark:bg-slate-900"
          style={darkMode ? { filter: 'invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.9)' } : undefined}
        >
          {mapTiles.map(tile => (
            <img
              key={`${renderZoom}-${tile.x}-${tile.y}`}
              src={tile.href}
              alt=""
              aria-hidden="true"
              draggable={false}
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute select-none"
              style={getTileStyle(tile, viewBox)}
            />
          ))}
        </div>
        <svg
          viewBox={viewBoxToString(viewBox)}
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label="London location ward polygons"
          preserveAspectRatio="none"
        >
          <rect
            x={viewBox.minX}
            y={viewBox.minY}
            width={viewBox.width}
            height={viewBox.height}
            fill="rgba(248, 250, 252, 0.2)"
            pointerEvents="none"
          />
          {drawableLocations.map(location => {
            const overBudget = budgetEnabled && location.result.totalMonthly > maxBudget;
            const tone = polygonTone(location, visualFocus, darkMode, scoresActive, overBudget);
            return (
              <g
                key={location.result.location}
                opacity={tone.opacity}
                tabIndex={0}
                role="button"
                aria-label={`${location.result.displayName}, ${location.result.borough}${
                  scoresActive ? `, match score ${location.result.compositeScore} of 100` : ''
                }. Press Enter to zoom.`}
                onMouseEnter={event => { onLocationHover?.(location.result.location); showTooltip(event, location.result.displayName); }}
                onMouseMove={event => showTooltip(event, location.result.displayName)}
                onFocus={() => onLocationHover?.(location.result.location)}
                onBlur={() => onLocationHover?.(null)}
                onClick={() => onLocationSelect?.(location.result.location)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onLocationSelect?.(location.result.location);
                  }
                }}
                className="cursor-pointer focus:outline-none"
              >
                <title>{`${location.result.displayName} - ${location.boundary.boundaryName}`}</title>
                <path
                  d={location.path}
                  fill={tone.fill}
                  fillRule="evenodd"
                  stroke={tone.stroke}
                  strokeWidth={tone.strokeWidth}
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={location.anchor.x}
                  cy={location.anchor.y}
                  r={location.result.location === visualFocus ? anchorRadius * 1.6 : anchorRadius}
                  fill={tone.pinFill}
                  stroke={tone.pinStroke}
                  strokeWidth={location.result.location === visualFocus ? 2.5 : 1.75}
                  vectorEffect="non-scaling-stroke"
                  opacity={visualFocus && location.result.location !== visualFocus ? 0.8 : 1}
                />
              </g>
            );
          })}
          {officeMarkers.map(marker => {
            const fill = marker.tone === 'partner' ? '#6366f1' : '#e11d48';
            const badgeRadius = markerRadius * 1.3;
            const iconSize = badgeRadius * 1.25;
            return (
              <g key={marker.tone} pointerEvents="none">
                <title>{marker.label}</title>
                <circle
                  cx={marker.point.x}
                  cy={marker.point.y}
                  r={badgeRadius}
                  fill={fill}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
                <Briefcase
                  x={marker.point.x - iconSize / 2}
                  y={marker.point.y - iconSize / 2}
                  width={iconSize}
                  height={iconSize}
                  color="#ffffff"
                  strokeWidth={2.25}
                />
              </g>
            );
          })}
        </svg>
        <div className="absolute bottom-1 right-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-gray-500 shadow-sm dark:bg-gray-900/90 dark:text-gray-400">
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            OpenStreetMap
          </a>
        </div>
        {tooltip && (
          <div
            className="pointer-events-none absolute z-20 max-w-[14rem] -translate-y-full truncate rounded bg-gray-900/90 px-2 py-1 text-xs font-medium text-white shadow-md dark:bg-gray-100/95 dark:text-gray-900"
            style={{ left: tooltip.x + 12, top: tooltip.y - 6 }}
          >
            {tooltip.label}
          </div>
        )}
      </div>

      <div className="mt-2 space-y-1 text-[11px] text-gray-400 dark:text-gray-500">
        {/* Slider-dependent status on its own fixed-height line so toggling sliders never reflows the map. */}
        <div className="flex h-4 items-center gap-x-3 overflow-hidden whitespace-nowrap">
          {scoresActive ? (
            <span className="flex items-center gap-2">
              <span>Match score:</span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-green-500" /> high
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-yellow-500" /> fair
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-red-500" /> low
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm border border-blue-500 bg-blue-500/20" />
              <span>Top 5 matches from the table highlighted</span>
            </span>
          )}
          {budgetEnabled && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm border border-slate-400 bg-slate-400/30" />
              <span>Over budget</span>
            </span>
          )}
        </div>
        {officeMarkers.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {officeMarkers.map(marker => (
              <span key={marker.tone} className="flex items-center gap-1.5">
                <Briefcase
                  className="h-3 w-3 shrink-0"
                  style={{ color: marker.tone === 'partner' ? '#6366f1' : '#e11d48' }}
                />
                <span>{marker.label}</span>
              </span>
            ))}
          </div>
        )}
        <span className="block">Hover a row to highlight; click to zoom to a ward (click again to reset); scroll to zoom.</span>
      </div>
      </>
      )}
    </section>
  );
}
