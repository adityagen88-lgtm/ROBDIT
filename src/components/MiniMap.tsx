import React, { useState } from 'react';
import { Compass, Minimize2, Maximize2 } from 'lucide-react';
import { RadarSnapshot } from '../game/types';

interface MiniMapProps {
  radar: RadarSnapshot | null;
  nearestBoxId: string | null;
  levelAccentColor: number;
}

const ARENA_MIN = -27;
const ARENA_SPAN = 54;

function toMapCoord(val: number): number {
  return ((val - ARENA_MIN) / ARENA_SPAN) * 100;
}

export const MiniMap: React.FC<MiniMapProps> = ({
  radar,
  nearestBoxId,
  levelAccentColor,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  if (!radar) return null;

  const accentHex = '#' + levelAccentColor.toString(16).padStart(6, '0');
  const availableBoxes = radar.boxes.filter((b) => !b.opened).length;

  const boundMin = toMapCoord(-25);
  const boundSize = toMapCoord(25) - boundMin;
  const spawnX = toMapCoord(0);
  const spawnY = toMapCoord(14);
  const spawnR = (5.5 / ARENA_SPAN) * 100;

  return (
    <div className="fixed top-16 right-4 z-20 flex flex-col items-end pointer-events-none">
      {collapsed ? (
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => setCollapsed(false)}
          className="pointer-events-auto inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950/92 border border-slate-700 hover:border-amber-400 text-xs font-semibold text-slate-100 shadow-xl cursor-pointer whitespace-nowrap"
        >
          <Compass className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Peta Arena</span>
          <Maximize2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </button>
      ) : (
        <div className="pointer-events-auto w-36 sm:w-44 rounded-xl bg-slate-950/92 border border-slate-700 p-2.5 shadow-2xl text-slate-100">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-display font-bold text-white truncate">
              <Compass className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Peta Arena</span>
            </div>
            <button
              type="button"
              aria-label="Perkecil Peta"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => setCollapsed(true)}
              className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer shrink-0"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="relative aspect-square w-full rounded-lg bg-slate-900 border border-slate-800 overflow-hidden">
            <svg viewBox="0 0 100 100" className="w-full h-full block">
              {/* Arena walkable boundary */}
              <rect
                x={boundMin}
                y={boundMin}
                width={boundSize}
                height={boundSize}
                fill="#0f172a"
                stroke="#334155"
                strokeWidth="0.9"
                rx="2"
              />

              {/* Subtle center guide lines */}
              <line x1="50" y1={boundMin} x2="50" y2={boundMin + boundSize} stroke="#1e293b" strokeWidth="0.6" />
              <line x1={boundMin} y1="50" x2={boundMin + boundSize} y2="50" stroke="#1e293b" strokeWidth="0.6" />

              {/* Central spawn pad */}
              <circle
                cx={spawnX}
                cy={spawnY}
                r={spawnR}
                fill="#1e293b"
                stroke="#475569"
                strokeWidth="0.7"
              />

              {/* Obby platforms */}
              {radar.platforms.map((plat, idx) => {
                const x = toMapCoord(plat.minX);
                const y = toMapCoord(plat.minZ);
                const w = toMapCoord(plat.maxX) - x;
                const h = toMapCoord(plat.maxZ) - y;
                return (
                  <rect
                    key={idx}
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    rx="1"
                    fill="#334155"
                    stroke={accentHex}
                    strokeOpacity="0.45"
                    strokeWidth="0.6"
                  />
                );
              })}

              {/* Mystery Boxes */}
              {radar.boxes.map((box) => {
                const bx = toMapCoord(box.x);
                const by = toMapCoord(box.z);
                const isNearest = box.id === nearestBoxId;
                if (box.opened) {
                  return (
                    <rect
                      key={box.id}
                      x={bx - 1.4}
                      y={by - 1.4}
                      width="2.8"
                      height="2.8"
                      rx="0.5"
                      fill="#475569"
                      opacity="0.45"
                    />
                  );
                }
                return (
                  <g key={box.id} transform={`translate(${bx}, ${by})`}>
                    {isNearest && (
                      <circle r="4.6" fill="none" stroke="#ffffff" strokeWidth="0.9" opacity="0.95" />
                    )}
                    <rect
                      x="-2.1"
                      y="-2.1"
                      width="4.2"
                      height="4.2"
                      rx="0.7"
                      transform="rotate(45)"
                      fill="#fbbf24"
                      stroke="#78350f"
                      strokeWidth="0.6"
                    />
                  </g>
                );
              })}

              {/* Remote classmate players */}
              {radar.remotePlayers.map((rp) => {
                const px = toMapCoord(rp.x);
                const py = toMapCoord(rp.z);
                return (
                  <circle
                    key={rp.id}
                    cx={px}
                    cy={py}
                    r="2.2"
                    fill="#38bdf8"
                    stroke="#082f49"
                    strokeWidth="0.7"
                  />
                );
              })}

              {/* Local player directional marker */}
              {radar.localPlayer && (
                <g
                  transform={`translate(${toMapCoord(radar.localPlayer.x)}, ${toMapCoord(
                    radar.localPlayer.z
                  )}) rotate(${180 - (radar.localPlayer.yaw * 180) / Math.PI})`}
                >
                  <polygon
                    points="0,-4.4 3.1,3.2 0,1.6 -3.1,3.2"
                    fill="#34d399"
                    stroke="#ffffff"
                    strokeWidth="0.8"
                    strokeLinejoin="round"
                  />
                </g>
              )}
            </svg>

            <span className="absolute top-1 left-1.5 text-[9px] font-mono font-bold text-slate-500 pointer-events-none">
              U
            </span>
          </div>

          {/* Compact Legend & Active Box Count */}
          <div className="mt-1.5 flex items-center justify-between gap-1 text-[10px] text-slate-400">
            <div className="flex items-center gap-2 truncate">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                <span>Kamu</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
                <span>Teman</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rotate-45 bg-amber-400 inline-block" />
                <span>Box</span>
              </span>
            </div>
            <span className="font-mono tabular-nums text-amber-300 font-semibold shrink-0">
              {availableBoxes}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
