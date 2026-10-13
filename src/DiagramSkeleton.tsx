const tables = [
  { x: 70, y: 75, rows: 4 },
  { x: 70, y: 290, rows: 3 },
  { x: 350, y: 175, rows: 5 },
  { x: 630, y: 65, rows: 4 },
  { x: 630, y: 300, rows: 3 },
];

export function DiagramSkeleton() {
  return <svg className="diagram-skeleton" viewBox="0 0 900 500" aria-hidden="true">
    <g className="skeleton-edges" fill="none">
      <path d="M270 146 H305 Q315 146 315 156 V237 Q315 247 325 247 H350" />
      <path d="M270 361 H305 Q315 361 315 351 V287 Q315 277 325 277 H350" />
      <path d="M550 247 H585 Q595 247 595 237 V136 Q595 126 605 126 H630" />
      <path d="M550 277 H585 Q595 277 595 287 V361 Q595 371 605 371 H630" />
    </g>
    {tables.map((table, index) => <g key={index} className="skeleton-table" transform={`translate(${table.x} ${table.y})`} style={{ animationDelay: `${index * 160}ms` }}>
      <rect className="skeleton-card" width="200" height={44 + table.rows * 27} rx="7" />
      <path className="skeleton-header" d="M7 0 H193 Q200 0 200 7 V33 H0 V7 Q0 0 7 0" />
      <rect className="skeleton-title" x="13" y="13" width={70 + index % 3 * 17} height="7" rx="3" />
      {Array.from({ length: table.rows }, (_, row) => <g key={row}>
        <rect className="skeleton-field" x="13" y={47 + row * 27} width={58 + row % 3 * 13} height="6" rx="3" />
        <rect className="skeleton-type" x="144" y={47 + row * 27} width="42" height="6" rx="3" />
      </g>)}
    </g>)}
  </svg>;
}
