export default function RouteSketchMap({ points = [], activeId }) {
  const visible = points.filter(Boolean);

  if (!visible.length) {
    return <div className="h-[320px] rounded-[28px] bg-[#edf4ff]" />;
  }

  const lats = visible.map((point) => point.lat);
  const lngs = visible.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const project = (lat, lng) => {
    const x = 40 + ((lng - minLng) / Math.max(maxLng - minLng, 0.001)) * 520;
    const y = 280 - ((lat - minLat) / Math.max(maxLat - minLat, 0.001)) * 220;
    return { x, y };
  };

  const userPoint = points.find((point) => point.kind === "user");
  const activePoint = points.find((point) => point.id === activeId);

  return (
    <div className="relative overflow-hidden rounded-[30px] bg-[#eef5ff] p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(70,126,229,0.18),transparent_35%)]" />
      <svg viewBox="0 0 600 320" className="relative h-[320px] w-full">
        <defs>
          <pattern id="route-grid" width="36" height="36" patternUnits="userSpaceOnUse">
            <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#dbeafe" strokeWidth="1" />
          </pattern>
        </defs>

        <rect width="600" height="320" rx="26" fill="url(#route-grid)" />

        {userPoint && activePoint ? (
          <path
            d={`M ${project(userPoint.lat, userPoint.lng).x} ${project(userPoint.lat, userPoint.lng).y}
                C 250 60, 330 240, ${project(activePoint.lat, activePoint.lng).x} ${project(activePoint.lat, activePoint.lng).y}`}
            fill="none"
            stroke="#467ee5"
            strokeWidth="3.5"
            strokeDasharray="8 8"
          />
        ) : null}

        {visible.map((point) => {
          const coords = project(point.lat, point.lng);
          const isActive = point.id === activeId;
          const isUser = point.kind === "user";

          return (
            <g key={point.id || point.label}>
              <circle
                cx={coords.x}
                cy={coords.y}
                r={isUser ? 12 : isActive ? 10 : 7}
                fill={isUser ? "#0f172a" : isActive ? "#467ee5" : "#93c5fd"}
              />
              <circle
                cx={coords.x}
                cy={coords.y}
                r={isUser ? 22 : isActive ? 18 : 0}
                fill={isUser ? "rgba(15,23,42,0.08)" : "rgba(70,126,229,0.14)"}
              />
              <text
                x={coords.x}
                y={coords.y - 16}
                textAnchor="middle"
                className="fill-slate-700 text-[11px] font-medium"
              >
                {isUser ? "You" : point.shortLabel || point.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
