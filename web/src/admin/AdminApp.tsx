import { useEffect, useMemo, useState } from 'react';
import type { AdminBan, AdminSession, AdminThread, AdminUser } from '../../../shared/types';
import { BrandMark, Icon } from '../components/Icon';
import { AdminError, adminApi, explain, getAdminToken } from './api';

const PAGE = 8;
const WEEK = 7 * 24 * 60 * 60 * 1000;

function normalizePath(p: string) {
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}

function useRoute() {
  const [path, setPath] = useState(() => normalizePath(location.pathname));
  useEffect(() => {
    const sync = () => setPath(normalizePath(location.pathname));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const go = (to: string) => {
    const next = normalizePath(to);
    if (next !== normalizePath(location.pathname)) history.pushState(null, '', next);
    setPath(next);
  };
  return { path, go };
}

function relTime(iso: string | null) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.round(hr / 24);
  if (day === 1) return '昨天';
  if (day < 30) return `${day}天前`;
  return absTime(iso);
}

function absTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const md = `${d.getMonth() + 1}月${d.getDate()}日 ${clock}`;
  return d.getFullYear() === new Date().getFullYear() ? md : `${d.getFullYear()}年${md}`;
}

function stamp(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function inWeek(u: AdminUser) {
  if (!u.lastSeen) return false;
  const t = new Date(u.lastSeen).getTime();
  return Number.isFinite(t) && Date.now() - t <= WEEK;
}

function pagesOf(page: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pages - 1, page + 1);
  if (start > 2) out.push('…');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < pages - 1) out.push('…');
  out.push(pages);
  return out;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="inline-flex items-center text-[#5b7b7a] hover:text-[#436261]" aria-label={label}
      onClick={() => { navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); }).catch(() => {}); }}>
      <Icon name={done ? 'check' : 'content_copy'} className="text-[15px]" />
    </button>
  );
}

function StatusPill({ banned }: { banned: boolean }) {
  return banned
    ? <span className="inline-flex items-center h-6 px-2.5 rounded-full border border-[#F3C7C7] bg-[#FBEBEB] text-[12px] text-[#B34040]">IP已禁用</span>
    : <span className="inline-flex items-center h-6 px-2.5 rounded-full border border-[#BDDEC9] bg-[#EAF4EF] text-[12px] text-[#3B7258]">正常</span>;
}

function Pager({ page, pages, total, from, to, onPage }: { page: number; pages: number; total: number; from: number; to: number; onPage: (n: number) => void }) {
  const btn = 'h-8 min-w-8 px-2 rounded-full text-[13px] disabled:opacity-40';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EBE7DF] bg-[#FAF8F5] px-4 py-3 text-[13px] text-[#5F6B66]">
      <span>{total === 0 ? '共 0 条' : `显示 ${from} - ${to} 条，共 ${total} 条`}</span>
      <div className="flex items-center gap-1">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</button>
        {pagesOf(page, pages).map((n, i) => n === '…'
          ? <span key={`g${i}`} className="px-1">…</span>
          : <button type="button" key={n} aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}
            className={`${btn} ${n === page ? 'bg-[#436261] text-white' : 'hover:bg-[#f4fbf6]'}`}>{n}</button>)}
        <button type="button" className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)}>下一页</button>
      </div>
    </div>
  );
}

function BanDialog({ initialIp, onClose, onDone, onUnauthorized }: {
  initialIp: string;
  onClose: () => void;
  onDone: () => void;
  onUnauthorized: () => void;
}) {
  const [ip, setIp] = useState(initialIp);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  const submit = async () => {
    const target = ip.trim();
    if (!target) { setError('请填写 IP'); return; }
    setBusy(true);
    setError('');
    try {
      await adminApi.ban(target, reason.trim());
      onDone();
    } catch (e) {
      if (e instanceof AdminError && e.status === 401) onUnauthorized();
      else { setError(explain(e)); setBusy(false); }
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(22,29,26,0.35)' }}
      onMouseDown={() => { if (!busy) onClose(); }}>
      <form role="dialog" aria-modal="true" aria-labelledby="ban-title" data-testid="admin-ban-dialog"
        className="w-full max-w-[440px] rounded-[20px] border-[1.5px] border-[#436261] bg-white p-6"
        onMouseDown={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); void submit(); }}>
        <h2 id="ban-title" className="font-headline-md text-[22px] text-[#161d1a]">{initialIp ? '禁用此 IP？' : '手动封禁 IP'}</h2>
        <p className="mt-2 text-[13px] leading-6 text-[#5F6B66]">确认后，来自该地址的访问不能再使用行程助手，业务接口会返回 403。已有聊天仍可在后台查看。</p>
        {initialIp
          ? <p className="mt-4 font-mono text-[15px] text-[#161d1a]">{initialIp}</p>
          : <input value={ip} onChange={e => setIp(e.target.value)} autoFocus placeholder="例如 203.0.113.8" aria-label="IP"
            className="mt-4 h-10 w-full rounded-full border border-[#D5CEBF] bg-white px-4 text-[14px] outline-none focus:border-[#436261]" />}
        <label className="mt-4 block text-[12px] text-[#5F6B66]">原因（可选）
          <input value={reason} onChange={e => setReason(e.target.value)} maxLength={200} data-testid="admin-ban-reason" placeholder="例如 异常刷接口"
            className="mt-1.5 h-10 w-full rounded-full border border-[#D5CEBF] bg-white px-4 text-[14px] text-[#161d1a] outline-none focus:border-[#436261]" />
        </label>
        {error && <p className="mt-3 text-[13px] text-[#B34040]" role="alert">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="h-10 rounded-full border border-[#D5CEBF] bg-white px-4 text-[13px] text-[#436261] disabled:opacity-40">取消</button>
          <button type="submit" disabled={busy} data-testid="admin-ban-confirm" className="h-10 rounded-full bg-[#B34040] px-4 text-[13px] text-white disabled:opacity-40">{busy ? '提交中…' : '确认禁用'}</button>
        </div>
      </form>
    </div>
  );
}

function Login({ onOk }: { onOk: () => void }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) { setError('请输入有效的 11 位手机号'); return; }
    if (!password) { setError('请输入密码'); return; }
    setBusy(true);
    setError('');
    try {
      await adminApi.login(phone.trim(), password);
      setPassword('');
      onOk();
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  };
  const inputClass = 'h-12 w-full rounded-xl border border-[#D5CEBF] bg-[#FAF8F5] px-4 text-[14px] outline-none transition focus:border-[#436261] focus:ring-2 focus:ring-[#436261]/10 disabled:opacity-60';
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#F5F2EC] px-4 py-10 text-[#161d1a]">
      <div className="mb-7 flex items-center gap-3">
        <BrandMark />
        <div>
          <div className="font-headline-md text-[20px] leading-7">行程助手</div>
          <div className="text-[10px] tracking-[0.2em] text-[#5F6B66]">管理后台</div>
        </div>
      </div>
      <form data-testid="admin-login" aria-busy={busy} className="w-full max-w-[440px] rounded-[24px] border border-[#D5CEBF] bg-white p-6 shadow-[0_12px_40px_rgba(67,98,97,0.05)] sm:p-9"
        onSubmit={e => { e.preventDefault(); void submit(); }}>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EAF4EF] text-[#436261]"><Icon name="shield" className="text-[22px]" /></span>
        <h1 className="mt-5 font-headline-md text-[28px] leading-10">管理员登录</h1>
        <p className="mt-1 text-[13px] leading-6 text-[#5F6B66]">使用手机号和密码登录，管理用户与访问权限。</p>
        <label className="mb-2 mt-7 block text-[13px] text-[#3d4a46]" htmlFor="admin-phone">手机号</label>
        <input id="admin-phone" name="phone" data-testid="admin-phone" type="tel" inputMode="tel" autoComplete="username"
          autoFocus required pattern="1[3-9][0-9]{9}" maxLength={11} title="请输入有效的 11 位手机号" placeholder="请输入手机号"
          disabled={busy} value={phone} onChange={e => { setPhone(e.target.value); setError(''); }}
          aria-describedby={error ? 'admin-login-error' : undefined} className={inputClass} />
        <label className="mb-2 mt-5 block text-[13px] text-[#3d4a46]" htmlFor="admin-password">密码</label>
        <div className="relative">
          <input id="admin-password" name="password" data-testid="admin-password" type={showPassword ? 'text' : 'password'}
            autoComplete="current-password" required maxLength={256} placeholder="请输入密码" disabled={busy}
            value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
            aria-describedby={error ? 'admin-login-error' : undefined} className={`${inputClass} pr-16`} />
          <button type="button" onClick={() => setShowPassword(v => !v)} disabled={busy} aria-controls="admin-password"
            aria-label={showPassword ? '隐藏密码' : '显示密码'} aria-pressed={showPassword}
            className="absolute inset-y-0 right-1 my-1 rounded-lg px-3 text-[12px] text-[#436261] hover:bg-[#EAF4EF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#436261]">
            {showPassword ? '隐藏' : '显示'}
          </button>
        </div>
        {error && <p id="admin-login-error" className="mt-3 text-[13px] text-[#B34040]" role="alert">{error}</p>}
        <button type="submit" disabled={busy} data-testid="admin-enter" className="mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#436261] text-[14px] text-white transition hover:bg-[#365250] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#436261] disabled:opacity-50">
          {busy ? '登录中…' : '登录后台'}
          {!busy && <Icon name="arrow_forward" className="text-[17px]" />}
        </button>
      </form>
      <p className="mt-6 text-[12px] text-[#5F6B66]">仅限已授权的管理员访问</p>
    </main>
  );
}

function UsersView({ rev, go, onBan, onUnban, onUnauthorized }: {
  rev: number;
  go: (to: string) => void;
  onBan: (ip: string) => void;
  onUnban: (ip: string) => void;
  onUnauthorized: () => void;
}) {
  const [rows, setRows] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [chip, setChip] = useState<'all' | 'week' | 'banned'>('all');
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [q, chip]);
  useEffect(() => {
    let cancel = false;
    adminApi.users().then(list => { if (!cancel) { setRows(list); setError(''); } }).catch(e => {
      if (cancel) return;
      if (e instanceof AdminError && e.status === 401) onUnauthorized();
      else setError(explain(e));
    });
    return () => { cancel = true; };
  }, [rev, onUnauthorized]);

  const searched = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter(u => !s || u.userId.toLowerCase().includes(s) || u.ip.toLowerCase().includes(s));
  }, [rows, q]);
  const counts = {
    all: searched.length,
    week: searched.filter(inWeek).length,
    banned: searched.filter(u => u.banned).length,
  };
  const shown = searched.filter(u => chip === 'week' ? inWeek(u) : chip === 'banned' ? u.banned : true);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const safe = Math.min(page, pages);
  const slice = shown.slice((safe - 1) * PAGE, safe * PAGE);
  const from = shown.length === 0 ? 0 : (safe - 1) * PAGE + 1;
  const to = Math.min(shown.length, safe * PAGE);

  const chipBtn = (id: typeof chip, label: string, n: number) => (
    <button type="button" aria-pressed={chip === id} onClick={() => setChip(id)}
      className={`h-9 rounded-full px-3.5 text-[13px] ${chip === id ? 'bg-[#436261] text-white' : 'border border-[#D5CEBF] bg-white text-[#5F6B66] hover:bg-[#f4fbf6]'}`}>
      {label} ({n})
    </button>
  );

  return (
    <div data-testid="admin-users">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-headline-md text-[26px] leading-9">用户</h1>
            <span className="inline-flex h-6 items-center rounded-full border border-[#D5CEBF] bg-[#f4fbf6] px-2 text-[12px] text-[#436261]">共 {rows?.length ?? 0} 位访客</span>
          </div>
          <p className="mt-1 text-[13px] text-[#5F6B66]">按匿名访客浏览会话；可查看聊天并禁用 IP</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[240px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5F6B66]"><Icon name="search" className="text-[18px]" /></span>
          <input data-testid="admin-search" value={q} onChange={e => setQ(e.target.value)} placeholder="搜索 IP / 访客 ID"
            className="h-10 w-full rounded-full border border-[#D5CEBF] bg-white pl-10 pr-4 text-[14px] outline-none focus:border-[#436261]" />
        </label>
        {chipBtn('all', '全部', counts.all)}
        {chipBtn('week', '近7天活跃', counts.week)}
        {chipBtn('banned', '已封禁IP', counts.banned)}
      </div>
      {error && <p className="mt-3 text-[13px] text-[#B34040]" role="alert">{error}</p>}
      <div className="mt-4 overflow-hidden rounded-[18px] border border-[#D5CEBF] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-[13px]">
            <caption className="sr-only">访客列表</caption>
            <thead className="bg-[#EBE7DF] text-[12px] text-[#5F6B66]">
              <tr>
                {['访客 ID', 'IP', '最近活跃', '会话数', '消息数', '状态', '操作'].map(h => (
                  <th key={h} scope="col" className={`px-4 py-3 font-medium ${h === '操作' ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows === null && !error && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#5F6B66]">加载中…</td></tr>}
              {rows !== null && slice.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#5F6B66]">没有匹配的访客</td></tr>}
              {slice.map(u => (
                <tr key={u.userId} data-testid="admin-row" className="border-t border-[#EBE7DF] hover:bg-[#F4FBF6]">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-mono" title={u.userId}>{u.userId.length > 10 ? `${u.userId.slice(0, 8)}…` : u.userId}</span>
                      <CopyButton value={u.userId} label="复制访客 ID" />
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono">{u.ip || '—'}</td>
                  <td className="px-4 py-3 text-[#5F6B66]">{relTime(u.lastSeen)}</td>
                  <td className="px-4 py-3 tabular-nums">{u.tripCount}</td>
                  <td className="px-4 py-3 tabular-nums">{u.messageCount}</td>
                  <td className="px-4 py-3"><StatusPill banned={u.banned} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <button type="button" data-testid="admin-view-chat" className="text-[13px] text-[#436261] hover:underline" onClick={() => go(`/admin/users/${encodeURIComponent(u.userId)}`)}>查看聊天</button>
                      {u.banned
                        ? <button type="button" data-testid="admin-unban" className="h-8 rounded-full border border-[#D5CEBF] bg-white px-3 text-[12px] text-[#3d4a46] hover:bg-[#f4fbf6]" onClick={() => onUnban(u.ip)}>解除禁用</button>
                        : <button type="button" data-testid="admin-ban" disabled={!u.ip} title={u.ip ? '禁用此 IP' : '尚未记录 IP'} className="h-8 rounded-full border border-[#F3C7C7] bg-[#FBEBEB] px-3 text-[12px] text-[#B34040] disabled:opacity-40" onClick={() => u.ip && onBan(u.ip)}>禁用 IP</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={safe} pages={pages} total={shown.length} from={from} to={to} onPage={setPage} />
      </div>
    </div>
  );
}

function sessionLabel(s: AdminSession) {
  if (s.plan?.complete) return '已生成规划';
  if (s.plan) return '规划中';
  return '仅对话';
}

function ChatView({ userId, rev, onBan, onUnban, onUnauthorized }: {
  userId: string;
  rev: number;
  onBan: (ip: string) => void;
  onUnban: (ip: string) => void;
  onUnauthorized: () => void;
}) {
  const [thread, setThread] = useState<AdminThread | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    let cancel = false;
    setMissing(false);
    adminApi.thread(userId).then(t => {
      if (cancel) return;
      setThread(t);
      setError('');
      setActiveId(id => id && t.sessions.some(s => s.id === id) ? id : t.sessions[0]?.id ?? null);
    }).catch(e => {
      if (cancel) return;
      if (e instanceof AdminError && e.status === 401) onUnauthorized();
      else if (e instanceof AdminError && e.status === 404) { setThread(null); setMissing(true); }
      else setError(explain(e));
    });
    return () => { cancel = true; };
  }, [userId, rev, onUnauthorized]);

  const session = thread?.sessions.find(s => s.id === activeId) ?? null;
  const names = [...new Set(session?.plan?.days.flatMap(d => d.names) ?? [])];

  return (
    <div data-testid="admin-chat" className="flex min-h-0 flex-1 flex-col">
      <div className="rounded-[18px] border border-[#D5CEBF] bg-white px-5 py-4">
        <div className="text-[12px] text-[#5F6B66]">用户 / 访客 {userId.length > 12 ? `${userId.slice(0, 8)}…` : userId}</div>
        {missing && <p className="mt-3 text-[14px]">没有这位访客。</p>}
        {error && <p className="mt-3 text-[13px] text-[#B34040]" role="alert">{error}</p>}
        {!thread && !missing && !error && <p className="mt-3 text-[13px] text-[#5F6B66]">加载中…</p>}
        {thread && (
          <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="min-w-0">
              <div className="text-[12px] text-[#5F6B66]">访客 ID</div>
              <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[14px]"><span className="break-all">{thread.userId}</span><CopyButton value={thread.userId} label="复制访客 ID" /></div>
            </div>
            <div>
              <div className="text-[12px] text-[#5F6B66]">IP</div>
              <div className="mt-0.5 font-mono text-[14px]">{thread.ip || '—'}</div>
            </div>
            <div>
              <div className="text-[12px] text-[#5F6B66]">状态</div>
              <div className="mt-1"><StatusPill banned={thread.banned} /></div>
            </div>
            <div>
              <div className="text-[12px] text-[#5F6B66]">最近活跃</div>
              <div className="mt-0.5 text-[14px]">{relTime(thread.lastSeen)}</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="inline-flex h-7 items-center rounded-full bg-[#f4fbf6] px-2.5 text-[12px] text-[#5b7b7a]">只读</span>
              {thread.banned
                ? <button type="button" data-testid="admin-unban" className="h-9 rounded-full border border-[#D5CEBF] bg-white px-3 text-[13px]" onClick={() => thread.ip && onUnban(thread.ip)}>解除禁用</button>
                : <button type="button" data-testid="admin-ban" disabled={!thread.ip} className="h-9 rounded-full border border-[#F3C7C7] bg-[#FBEBEB] px-3 text-[13px] text-[#B34040] disabled:opacity-40" onClick={() => thread.ip && onBan(thread.ip)}>禁用 IP</button>}
            </div>
          </div>
        )}
      </div>

      {thread && (
        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 xl:flex-row">
          <section className="flex max-h-[240px] min-h-0 flex-col overflow-hidden rounded-[18px] border border-[#D5CEBF] bg-white xl:max-h-none xl:w-[260px]">
            <div className="flex items-center justify-between border-b border-[#EBE7DF] px-4 py-3">
              <span className="inline-flex items-center gap-1.5 text-[14px] font-medium"><Icon name="chat" className="text-[16px] text-[#436261]" />会话列表</span>
              <span className="rounded-full bg-[#f4fbf6] px-2 py-0.5 text-[12px] text-[#5b7b7a]">{thread.sessions.length} 个会话</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {thread.sessions.length === 0 && <p className="px-2 py-6 text-center text-[13px] text-[#5F6B66]">这位访客还没有会话</p>}
              {thread.sessions.map(s => (
                <button type="button" key={s.id} onClick={() => setActiveId(s.id)}
                  className={`mb-2 w-full rounded-[14px] border px-3 py-2.5 text-left ${s.id === session?.id ? 'border-[#436261] bg-[#f4fbf6]' : 'border-[#EBE7DF] bg-white hover:bg-[#FAF8F5]'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${s.plan?.complete ? 'bg-[#EAF4EF] text-[#3B7258]' : 'bg-[#EBE7DF] text-[#5F6B66]'}`}>{sessionLabel(s)}</span>
                    <span className="text-[11px] text-[#5F6B66]">{relTime(s.updatedAt)}</span>
                  </div>
                  <div className="mt-1.5 truncate text-[14px]">{s.title || '未命名会话'}</div>
                  <div className="mt-0.5 text-[12px] text-[#5F6B66]">{s.messageCount} 条消息</div>
                </button>
              ))}
            </div>
          </section>

          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-[#D5CEBF] bg-white">
            <div className="border-b border-[#EBE7DF] px-4 py-3">
              <div className="truncate text-[15px]">{session?.title || '对话'}</div>
              <div className="text-[12px] text-[#5F6B66]">只读监管，不能代发消息</div>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#F5F2EC] px-4 py-4">
              {!session && <p className="py-8 text-center text-[13px] text-[#5F6B66]">选择左侧会话查看记录</p>}
              {session && session.messages.length === 0 && <p className="py-8 text-center text-[13px] text-[#5F6B66]">这条会话还没有消息</p>}
              {session?.messages.map(m => (
                <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div className="max-w-[80%]">
                    <div className={`mb-1 text-[11px] text-[#5F6B66] ${m.role === 'user' ? 'text-right' : ''}`}>{m.role === 'user' ? '访客' : '行程助手'} · {absTime(m.time)}</div>
                    <div className={m.role === 'user'
                      ? 'whitespace-pre-wrap rounded-[18px] rounded-br-md bg-[#436261] px-4 py-2.5 text-[14px] leading-6 text-white'
                      : 'whitespace-pre-wrap rounded-[18px] rounded-bl-md border border-[#D5CEBF] bg-[#f4fbf6] px-4 py-2.5 text-[14px] leading-6 text-[#161d1a]'}>
                      {m.content}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <aside className="min-h-0 overflow-y-auto rounded-[18px] border border-[#D5CEBF] bg-white p-4 xl:w-[300px]">
            <div className="text-[14px] font-medium">关联行程规划</div>
            {!session?.plan && <p className="mt-3 text-[13px] leading-6 text-[#5F6B66]">尚未生成路线。</p>}
            {session && (
              <dl className="mt-3 space-y-3 text-[13px]">
                <div><dt className="text-[12px] text-[#5F6B66]">目的地</dt><dd className="mt-0.5">{session.destination.trim() || '未填写'}</dd></div>
                <div><dt className="text-[12px] text-[#5F6B66]">时间周期</dt><dd className="mt-0.5">{session.days} 天 · {session.companions} · {session.pace}</dd></div>
                {session.preferences.length > 0 && (
                  <div>
                    <dt className="text-[12px] text-[#5F6B66]">策划基调</dt>
                    <dd className="mt-1.5 flex flex-wrap gap-1.5">{session.preferences.map(p => <span key={p} className="rounded-full border border-[#D5CEBF] bg-[#f4fbf6] px-2 py-0.5 text-[12px] text-[#436261]">{p}</span>)}</dd>
                  </div>
                )}
                {names.length > 0 && (
                  <div>
                    <dt className="text-[12px] text-[#5F6B66]">景点</dt>
                    <dd className="mt-1.5 flex flex-wrap gap-1.5">{names.map(n => <span key={n} className="rounded-full bg-[#EBE7DF] px-2 py-0.5 text-[12px]">{n}</span>)}</dd>
                  </div>
                )}
                {session.plan && session.plan.days.length > 0 && (
                  <div>
                    <dt className="text-[12px] text-[#5F6B66]">每日路线</dt>
                    <dd className="mt-1.5 space-y-2">
                      {session.plan.days.map(d => (
                        <div key={d.day}>
                          <div className="text-[12px] text-[#436261]">D{d.day}</div>
                          <div className="text-[13px] leading-5">{d.names.length ? d.names.join(' → ') : '景点待细化'}</div>
                          {d.summary && <div className="text-[12px] text-[#5F6B66]">{d.summary}</div>}
                        </div>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function BansView({ rev, onBan, onUnban, onUnauthorized }: {
  rev: number;
  onBan: (ip: string) => void;
  onUnban: (ip: string) => void;
  onUnauthorized: () => void;
}) {
  const [rows, setRows] = useState<AdminBan[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    let cancel = false;
    adminApi.bans().then(list => { if (!cancel) { setRows(list); setError(''); } }).catch(e => {
      if (cancel) return;
      if (e instanceof AdminError && e.status === 401) onUnauthorized();
      else setError(explain(e));
    });
    return () => { cancel = true; };
  }, [rev, onUnauthorized]);
  const shown = (rows ?? []).filter(b => b.ip.includes(q.trim()));
  return (
    <div data-testid="admin-bans">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-headline-md text-[26px] leading-9">封禁 IP</h1>
            <span className="inline-flex h-6 items-center rounded-full border border-[#D5CEBF] bg-[#f4fbf6] px-2 text-[12px] text-[#436261]">共 {rows?.length ?? 0} 个</span>
          </div>
          <p className="mt-1 text-[13px] text-[#5F6B66]">被禁用的地址访问业务接口会返回 403。解除后立即恢复。</p>
        </div>
        <button type="button" onClick={() => onBan('')} className="h-10 rounded-full bg-[#436261] px-4 text-[13px] text-white hover:bg-[#365250]">手动封禁</button>
      </div>
      <label className="relative mt-4 block max-w-[360px]">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5F6B66]"><Icon name="search" className="text-[18px]" /></span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索 IP" aria-label="搜索 IP"
          className="h-10 w-full rounded-full border border-[#D5CEBF] bg-white pl-10 pr-4 text-[14px] outline-none focus:border-[#436261]" />
      </label>
      {error && <p className="mt-3 text-[13px] text-[#B34040]" role="alert">{error}</p>}
      <div className="mt-4 overflow-hidden rounded-[18px] border border-[#D5CEBF] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
            <caption className="sr-only">封禁 IP 列表</caption>
            <thead className="bg-[#EBE7DF] text-[12px] text-[#5F6B66]">
              <tr>
                {['IP', '禁用时间', '原因', '关联访客数', '操作'].map(h => (
                  <th key={h} scope="col" className={`px-4 py-3 font-medium ${h === '操作' ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows === null && !error && <tr><td colSpan={5} className="px-4 py-10 text-center text-[#5F6B66]">加载中…</td></tr>}
              {rows !== null && shown.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-[#5F6B66]">{rows.length === 0 ? '还没有被禁用的 IP' : '没有匹配的 IP'}</td></tr>}
              {shown.map(b => (
                <tr key={b.ip} className="border-t border-[#EBE7DF] hover:bg-[#F4FBF6]">
                  <td className="px-4 py-3 font-mono">{b.ip}</td>
                  <td className="px-4 py-3 text-[#5F6B66]">{stamp(b.createdAt)}</td>
                  <td className="px-4 py-3">{b.reason || '—'}</td>
                  <td className="px-4 py-3 tabular-nums">{b.visitorCount}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" data-testid="admin-unban" className="h-8 rounded-full border border-[#D5CEBF] bg-white px-3 text-[12px] hover:bg-[#f4fbf6]" onClick={() => onUnban(b.ip)}>解除禁用</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Console({ onLogout, onUnauthorized }: { onLogout: () => void; onUnauthorized: () => void }) {
  const { path, go } = useRoute();
  const [rev, setRev] = useState(0);
  const [banIp, setBanIp] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const chat = path.match(/^\/admin\/users\/([A-Za-z0-9_-]{8,64})$/);
  const bans = path === '/admin/ips';
  const changed = () => setRev(n => n + 1);
  const unban = async (ip: string) => {
    setNotice('');
    try { await adminApi.unban(ip); changed(); }
    catch (e) {
      if (e instanceof AdminError && e.status === 401) onUnauthorized();
      else setNotice(explain(e));
    }
  };
  const nav = (id: 'users' | 'ips') => {
    const on = id === 'ips' ? bans : !bans;
    const cls = `flex h-10 w-full items-center gap-2 rounded-full px-4 text-[14px] ${on ? 'bg-[#436261] text-white' : 'text-[#161d1a] hover:bg-[#f4fbf6]'}`;
    return (
      <button type="button" className={cls} aria-current={on ? 'page' : undefined} onClick={() => go(id === 'ips' ? '/admin/ips' : '/admin')}>
        <Icon name={id === 'ips' ? 'shield' : 'person'} className="text-[18px]" />
        {id === 'ips' ? '封禁 IP' : '用户'}
      </button>
    );
  };
  return (
    <div className="flex h-dvh flex-col bg-[#F5F2EC] text-[#161d1a]">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#D5CEBF] px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark />
          <div className="min-w-0">
            <div className="truncate font-headline-md text-[18px] leading-6">行程助手 <span className="text-[#5b7b7a]">/</span> 管理后台</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {chat && <button type="button" onClick={() => go('/admin')} className="hidden h-9 items-center gap-1 rounded-full border border-[#D5CEBF] bg-white px-3 text-[13px] text-[#436261] sm:inline-flex"><Icon name="arrow_forward" className="rotate-180 text-[16px]" />返回用户列表</button>}
          <span className="inline-flex h-8 items-center rounded-full border border-[#D5CEBF] bg-[#f4fbf6] px-3 text-[13px] text-[#436261]">管理员</span>
          <button type="button" onClick={onLogout} className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-[13px] text-[#5F6B66] hover:text-[#161d1a]"><Icon name="logout" className="text-[16px]" />退出</button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[216px] shrink-0 flex-col border-r border-[#D5CEBF] md:flex">
          <div className="px-5 pb-2 pt-6 text-[11px] tracking-[0.14em] text-[#5F6B66]">后台导航</div>
          <nav className="flex flex-col gap-1 px-3" aria-label="后台导航">
            {nav('users')}
            {nav('ips')}
          </nav>
          <div className="mt-auto px-5 pb-4 text-[11px] text-[#5F6B66]">宣纸青瓷 · 管理后台</div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex gap-2 border-b border-[#D5CEBF] px-4 py-2 md:hidden">
            <button type="button" className={`h-9 flex-1 rounded-full text-[13px] ${!bans ? 'bg-[#436261] text-white' : 'border border-[#D5CEBF] bg-white'}`} onClick={() => go('/admin')}>用户</button>
            <button type="button" className={`h-9 flex-1 rounded-full text-[13px] ${bans ? 'bg-[#436261] text-white' : 'border border-[#D5CEBF] bg-white'}`} onClick={() => go('/admin/ips')}>封禁 IP</button>
          </div>
          <main className={`min-h-0 flex-1 p-4 md:p-6 ${chat ? 'flex flex-col overflow-hidden' : 'overflow-auto'}`}>
            {notice && <p className="mb-3 text-[13px] text-[#B34040]" role="alert">{notice}</p>}
            {chat
              ? <ChatView userId={chat[1]} rev={rev} onBan={setBanIp} onUnban={ip => void unban(ip)} onUnauthorized={onUnauthorized} />
              : bans
                ? <BansView rev={rev} onBan={setBanIp} onUnban={ip => void unban(ip)} onUnauthorized={onUnauthorized} />
                : <UsersView rev={rev} go={go} onBan={setBanIp} onUnban={ip => void unban(ip)} onUnauthorized={onUnauthorized} />}
          </main>
        </div>
      </div>
      {banIp !== null && (
        <BanDialog initialIp={banIp} onClose={() => setBanIp(null)} onUnauthorized={onUnauthorized}
          onDone={() => { setBanIp(null); changed(); }} />
      )}
    </div>
  );
}

export function AdminApp() {
  const [authed, setAuthed] = useState(() => !!getAdminToken());
  useEffect(() => { document.title = '行程助手 · 管理后台'; }, []);
  if (!authed) return (
    <div style={{ ['--c-primary' as string]: '67 98 97' }}>
      <Login onOk={() => setAuthed(true)} />
    </div>
  );
  return (
    <div style={{ ['--c-primary' as string]: '67 98 97', ['--c-on-surface' as string]: '22 29 26' }}>
      <Console onLogout={() => { void adminApi.logout().catch(() => {}).finally(() => setAuthed(false)); }} onUnauthorized={() => setAuthed(false)} />
    </div>
  );
}
