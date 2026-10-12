export default function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <div className="xplot-card h-8 w-64 animate-pulse rounded" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="xplot-card h-20 animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="xplot-card h-64 animate-pulse rounded-xl" />
    </div>
  );
}
