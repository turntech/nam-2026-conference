import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConference, useFetch } from '../lib/store.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import * as api from '../lib/api.js';
import { relativeDate, time as fmtTime } from '../lib/format.js';
import { SponsorMarquee } from '../components/SponsorMarquee.jsx';
import { Reveal } from '../components/Reveal.jsx';
import { HeroMedia } from '../components/HeroMedia.jsx';
import { Button, Chip, cx } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { useToast } from '../components/Toaster.jsx';

/**
 * A slim bar, not a brochure.
 *
 * The page used to open with a marketing headline, four vanity stats and a
 * "programme at a glance" panel — 592px desktop and over a full screen on a
 * phone, none of it about the person holding the phone, all of it known before
 * they bought a ticket.
 */
function HeroBar({ conference }) {
  const { clock, days } = useConference();
  const today = days.find((d) => d.date === clock.day);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-hairline" data-testid="hero">
      <HeroMedia />
      <div className="absolute inset-0 bg-[radial-gradient(30rem_14rem_at_12%_0%,rgba(139,92,246,0.22),transparent_65%)]" />

      <div className="relative flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4 sm:px-7 sm:py-5">
        <div className="min-w-0">
          <h1 className="font-display text-2xl leading-none tracking-tight sm:text-3xl">
            {conference.name} <span className="text-muted">{conference.edition}</span>
          </h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
            {conference.dates} · {conference.city}
          </p>
        </div>

        {today && (
          <Chip accent="cyan" className="!py-1.5">
            <span className="size-1.5 animate-pulse-dot rounded-full bg-cyan-400" />
            {today.label} · {fmtTime(clock.time)}
          </Chip>
        )}

        <div className="ml-auto flex flex-wrap gap-2">
          <Button to={`/schedule?day=${clock.day}`} variant="primary" size="sm">
            Browse today <Icon name="arrowRight" className="size-3.5" />
          </Button>
          <Button to="/speakers" size="sm">Speakers</Button>
        </div>
      </div>
    </section>
  );
}

/** The main pages, one tap each — a way in, not a feed. */
const LINKS = [
  { to: '/schedule', label: 'Schedule', blurb: 'Every session, by day, room and track', icon: 'calendar' },
  { to: '/speakers', label: 'Speakers', blurb: 'Who is on stage, A to Z', icon: 'users' },
  { to: '/venues', label: 'Venues', blurb: 'Both sites, their rooms and getting between them', icon: 'building' },
  { to: '/food', label: 'Food & drink', blurb: 'What is open, and where', icon: 'food' },
  { to: '/expo', label: 'Expo', blurb: 'Partners and sponsors', icon: 'grid' },
];

function QuickLinks() {
  return (
    <nav aria-label="Explore the conference" data-testid="quick-links">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map((l) => (
          <li key={l.to}>
            <Link to={l.to}
              className="group flex items-start gap-3 rounded-xl border border-hairline bg-surface p-4 transition-colors hover:border-white/20 hover:bg-raised">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-violet-500/12 text-violet-300">
                <Icon name={l.icon} className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold group-hover:text-violet-200">{l.label}</span>
                <span className="block text-[13px] text-muted">{l.blurb}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * One announcement, and only one that has actually been posted.
 *
 * This used to render the first two pinned rows regardless of `postedAt`, so a
 * warning about day 3 appeared on day 2 — before it was written.
 */
function LatestAnnouncement() {
  const { clock, venueById } = useConference();
  const { data } = useFetch(api.getAnnouncements, []);

  const nowIso = `${clock.day}T${clock.time}:00Z`;
  const live = (data ?? [])
    .filter((a) => a.postedAt <= nowIso)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.postedAt.localeCompare(a.postedAt));

  const item = live[0];
  if (!item) return null;

  const tone = {
    warning: 'border-amber-500/25 bg-amber-500/[0.07] text-amber-200',
    success: 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-200',
    info: 'border-sky-500/25 bg-sky-500/[0.07] text-sky-200',
  }[item.kind] ?? 'border-sky-500/25 bg-sky-500/[0.07] text-sky-200';

  return (
    <section className={cx('flex gap-3 rounded-2xl border p-4', tone)} data-testid="announcements">
      <Icon name={item.kind === 'warning' ? 'alert' : 'info'} className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold">{item.title}</h2>
          <span className="text-[11px] text-faint">
            {relativeDate(item.postedAt, clock)}
            {item.venueId && ` · ${venueById[item.venueId]?.shortName}`}
          </span>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{item.body}</p>
      </div>
    </section>
  );
}

const NOTE_LIMIT = 500;
const countChars = (s) => Array.from(s).length;

/** Optional free text about yourself. Shown to everyone, seats or not; read nowhere else. */
function InterestsBox() {
  const { currentUserId } = useConference();
  const toast = useToast();
  const { data } = useFetch(() => api.getInterestNote(currentUserId), [currentUserId]);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    setText(data?.text ?? '');
    setSaved(data?.text ?? '');
  }, [data]);

  const left = NOTE_LIMIT - countChars(text);

  async function save(next) {
    try {
      const res = await api.saveInterestNote(currentUserId, next);
      setText(res.text);
      setSaved(res.text);
      toast({ message: res.text ? 'Interests saved' : 'Interests cleared', icon: 'info' });
    } catch (err) {
      toast({ message: `Could not save: ${err.message}`, icon: 'alert' });
    }
  }

  return (
    <section className="rounded-2xl border border-hairline bg-surface p-4 sm:p-5" data-testid="interests-box">
      <label htmlFor="interests-input" className="block text-sm font-semibold">
        Describe your interests in your own words <span className="font-normal text-muted">(optional)</span>
      </label>
      <textarea id="interests-input" data-testid="interests-input" rows={3} value={text}
        onChange={(e) => setText(e.target.value)}
        className="mt-2 w-full rounded-lg border border-hairline bg-raised p-3 text-sm" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span data-testid="interests-remaining"
          className={left < 0 ? 'text-[13px] text-amber-300' : 'text-[13px] text-muted'}>{left} left</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" data-testid="interests-clear" disabled={!text && !saved}
            onClick={() => (saved ? save('') : setText(''))}>Clear</Button>
          <Button size="sm" variant="primary" data-testid="interests-save"
            disabled={left < 0 || text === saved} onClick={() => save(text)}>Save</Button>
        </div>
      </div>
    </section>
  );
}

export function HomePage() {
  const { conference } = useConference();
  useDocumentTitle("ORBIT '26");

  return (
    // Sections hide themselves when empty; hide their Reveal wrapper too, or
    // each one leaves a blank gap in the stack.
    <div className="space-y-8 [&>:empty]:hidden">
      <HeroBar conference={conference} />
      <QuickLinks />
      <InterestsBox />
      <Reveal><LatestAnnouncement /></Reveal>
      <SponsorMarquee />
    </div>
  );
}
