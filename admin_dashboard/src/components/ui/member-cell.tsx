// The "member" cell from the 21st.dev Member List (@ln-dev7/member-list): a
// round avatar with an optional status dot, the name in medium weight and one
// muted line under it. Used wherever a table row is about a person.

const TONES = ['#E8E8E8', '#E6E6EA', '#ECE8E4', '#E4E8E8', '#EAE6EC', '#E8EAE4'];

export const initialsOf = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

const toneFor = (name: string) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
};

export type MemberStatus = 'online' | 'away' | 'offline';
const STATUS_COLOR: Record<MemberStatus, string> = { online: '#00CC66', away: '#FFCC00', offline: '#969696' };

export function MemberAvatar({ name, status, size = 32 }: { name: string; status?: MemberStatus; size?: number }) {
  return (
    <span className="ml-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: toneFor(name) }}>
      {initialsOf(name)}
      {status && <i className="ml-dot" style={{ background: STATUS_COLOR[status] }} />}
    </span>
  );
}

export default function MemberCell({ name, sub, status }: { name: string; sub?: React.ReactNode; status?: MemberStatus }) {
  return (
    <div className="ml-cell">
      <MemberAvatar name={name} status={status} />
      <div className="ml-text">
        <span className="ml-name">{name}</span>
        {sub != null && sub !== '' && <span className="ml-sub">{sub}</span>}
      </div>
    </div>
  );
}
