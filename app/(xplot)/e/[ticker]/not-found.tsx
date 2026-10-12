export default function NotFound() {
  return (
    <p className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--bad)", color: "var(--bad)" }} role="status">
      <span aria-hidden="true">■ </span>
      Not a verified XPLOT token. An unregistered ticker or address does not get a normal card.
    </p>
  );
}
