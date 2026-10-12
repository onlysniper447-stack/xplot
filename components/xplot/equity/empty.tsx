export function EmptyState({ title, children }: { title: string; children: string }) {
  return (
    <div className="rounded-[10px] border px-4 py-3" role="status" style={{ borderColor: "var(--border)" }}>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{children}</p>
    </div>
  );
}
