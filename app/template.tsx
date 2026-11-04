/**
 * Re-mounted on every navigation (a layout is not), so each page enters with
 * the same short fade-up: the content changed, and it says so. Reduced motion
 * makes it instant.
 */
export default function Template({children}: {children: React.ReactNode}) {
  return <div className="animate-enter">{children}</div>;
}
