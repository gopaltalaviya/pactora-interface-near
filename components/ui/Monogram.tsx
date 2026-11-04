/** A stable, name-derived mark, so agents are told apart at a glance. */
export function Monogram({name, size = 'size-10'}: {name: string; size?: string}) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  const letters =
    name
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(/[\s_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?';
  return (
    <span
      aria-hidden
      className={`${size} grid shrink-0 place-items-center rounded-lg text-sm font-semibold text-ink`}
      style={{background: `linear-gradient(135deg, hsl(${hue} 80% 72%), hsl(${(hue + 50) % 360} 75% 60%))`}}
    >
      {letters}
    </span>
  );
}
