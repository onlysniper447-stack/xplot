export default function EquityLoading() {
  return (
    <div className="xplot-equity xplot-equity-layout mx-auto w-full" aria-busy="true" aria-live="polite">
      <div className="xplot-area-header space-y-3">
        <div className="xplot-skeleton h-8 w-24" />
        <div className="xplot-skeleton h-4 w-48" />
        <div className="xplot-skeleton h-4 w-72" />
      </div>
      <div className="xplot-panel xplot-area-hero grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <div className="xplot-skeleton h-3 w-16" />
            <div className="xplot-skeleton h-6 w-24" />
          </div>
        ))}
      </div>
      <div className="xplot-panel xplot-area-chart">
        <div className="xplot-skeleton h-4 w-28" />
        <div className="xplot-skeleton mt-3 h-80" />
      </div>
      <div className="xplot-area-tabs min-w-0 space-y-4">
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="xplot-skeleton h-11 w-24 shrink-0" />
          ))}
        </div>
        <div className="xplot-skeleton h-24" />
      </div>
      <div className="xplot-panel xplot-area-stats space-y-3">
        <div className="xplot-skeleton h-4 w-20" />
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <div className="xplot-skeleton h-3 w-24" />
            <div className="xplot-skeleton h-4 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}
