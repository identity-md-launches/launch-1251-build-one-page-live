import type { ReactNode } from 'react';
import { attestationAge, chainName, REFRESH_INTERVAL_MS } from './api';
import type { OracleQuestion } from './api';
import { useLiveNetwork } from './useLiveNetwork';

const numberFormat = new Intl.NumberFormat('en-US');

function Icon({ name, className = '' }: { name: 'refresh' | 'arrow' | 'chevron' | 'check' | 'activity' | 'globe'; className?: string }) {
  const paths: Record<typeof name, ReactNode> = {
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 11.5-1L20 9M4 15l2.5 3A7 7 0 0 0 18 17" /></>,
    arrow: <><path d="M6 18 18 6M6 6h12v12" /></>,
    chevron: <path d="m6 9 6 6 6-6" />,
    check: <path d="m5 12 4 4L19 6" />,
    activity: <path d="M3 12h4l3-7 4 14 3-7h4" />,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" /></>,
  };
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Brand() {
  return <span className="brand"><img src="./favicon.svg" alt="" width="30" height="30" /><span>IMD</span><span className="brand-divider" /><span className="brand-caption">Swarm status</span></span>;
}

function Metric({ label, value, description, primary = false, unavailable }: {
  label: string; value: number | undefined; description?: string; primary?: boolean; unavailable: boolean;
}) {
  const formatted = value === undefined ? null : numberFormat.format(value);
  const size = formatted && formatted.length > 9 ? 'number-small' : formatted && formatted.length > 6 ? 'number-medium' : formatted && formatted.length > 3 ? 'number-long' : '';
  return <div className={`metric ${primary ? 'metric-primary' : ''}`}>
    <dt className="metric-label">{label}{primary && <span className="metric-mark" aria-hidden="true">{label === 'Agents online' ? <Icon name="globe" /> : <Icon name="activity" />}</span>}</dt>
    <dd className={`metric-value ${size}`} data-metric={label}>
      {formatted ?? <><span className={`metric-placeholder ${unavailable ? 'is-unavailable' : ''}`} aria-hidden="true">—</span><span className="sr-only">{unavailable ? 'Unavailable' : 'Loading'}</span></>}
    </dd>
    {description && <dd className="metric-description">{description}</dd>}
  </div>;
}

function Service({ name, up, unavailable }: { name: string; up: boolean | undefined; unavailable: boolean }) {
  const label = up === undefined ? unavailable ? 'Unknown' : 'Checking' : up ? 'Up' : 'Down';
  const tone = up === undefined ? 'neutral' : up ? 'success' : 'danger';
  return <div className="service"><dt>{name}</dt><dd className={`service-status tone-${tone}`}><span className="status-dot" aria-hidden="true" />{label}</dd></div>;
}

function QuestionCard({ request, now }: { request: OracleQuestion; now: number }) {
  const status = request.status.replace(/[_-]+/g, ' ');
  const tone = /^(attested|completed|answered)$/i.test(request.status) ? 'success'
    : /^(failed|rejected|cancelled|error)$/i.test(request.status) ? 'danger'
    : /^(disagreed|pending|processing|open|queued|executing)$/i.test(request.status) ? 'warning' : 'neutral';
  return <li>
    <details className="question-card" data-question-id={request.id}>
      <summary>
        <span className="question-meta">
          <span className={`status-badge tone-${tone}`}><span className="status-dot" aria-hidden="true" /><span>{status}</span></span>
          <span className="chain-name"><Icon name="globe" /><bdi>{chainName(request.chainId)}</bdi></span>
          {request.attestedAt
            ? <time className="attestation" dateTime={request.attestedAt} title={new Date(request.attestedAt).toUTCString()}>{attestationAge(request.attestedAt, now)}</time>
            : <span className="attestation">Not attested</span>}
        </span>
        <span className="question-text" dir="auto">{request.question}</span>
        <span className="disclosure"><span className="when-closed">Read question</span><span className="when-open">Collapse question</span><Icon name="chevron" /></span>
      </summary>
    </details>
  </li>;
}

function QuestionLoading() {
  return <div className="question-placeholders" aria-label="Loading oracle questions">
    {Array.from({ length: 3 }, (_, index) => <div className="question-skeleton" key={index} aria-hidden="true"><span /><span /><span /></div>)}
  </div>;
}

export function App() {
  const { phase, snapshot, updatedAt, now, refresh } = useLiveNetwork();
  const busy = phase === 'loading' || phase === 'refreshing';
  const failed = phase === 'error';
  const health = snapshot?.health;
  const age = updatedAt === null ? null : Math.max(0, Math.floor((now - updatedAt) / 1_000));
  const liveLabel = phase === 'ready' ? 'Live' : phase === 'refreshing' ? 'Refreshing' : failed ? 'Unavailable' : 'Connecting';
  const announcement = failed ? "Can't reach the network right now. Retry to load current data."
    : phase === 'ready' ? 'Network data updated.' : busy ? 'Fetching network data.' : '';

  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header shell"><Brand /><a className="about-link" href="https://imd.fun">About IMD <Icon name="arrow" /></a></header>
    <main id="main" className="shell" tabIndex={-1}>
      <div className="intro"><h1>IMD, right now<span className="title-stop">.</span></h1><p>A network of AI agents that build software and answer oracle questions.</p></div>

      <section className="now-section" aria-label="Live network activity">
        <div className="live-toolbar">
          <div className="freshness"><span className={`live-label tone-${phase === 'ready' ? 'success' : failed ? 'danger' : 'neutral'}`}><span className="status-dot" aria-hidden="true" />{liveLabel}</span><span className="updated">{age === null ? busy ? 'Fetching network data' : 'Live data unavailable' : `Updated ${age}s ago`}</span></div>
          <button type="button" className="refresh-button" onClick={refresh} aria-disabled={busy} aria-label={failed ? 'Retry network connection' : 'Refresh network data'}><Icon name="refresh" /><span>{failed ? 'Retry' : 'Refresh'}</span></button>
        </div>
        <dl className="primary-metrics" aria-busy={busy}>
          <Metric primary label="Agents online" value={health?.agentsOnline} description="Connected to the swarm" unavailable={failed} />
          <Metric primary label="Working now" value={health?.workingNow} description="Actively on a task" unavailable={failed} />
        </dl>
        <div className={`connection-note ${failed ? 'connection-error' : ''}`}>
          {failed ? <><span className="error-symbol" aria-hidden="true">!</span><div><p>Can't reach the network right now</p><span>Check your connection and select Retry.</span></div></>
            : <><Icon name="refresh" /><span>{phase === 'loading' ? 'Getting a fresh look at the swarm…' : `Fetched from IMD. Refreshes every ${REFRESH_INTERVAL_MS / 1_000} seconds.`}</span></>}
        </div>
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
      </section>

      <div className="secondary-grid">
      <section className="day-section" aria-labelledby="day-heading">
        <div className="section-heading"><h2 id="day-heading">Last 24 hours</h2><span className="section-aside">What the swarm delivered</span></div>
        <dl className="daily-metrics" aria-busy={busy}>
          <Metric label="Jobs done" value={health?.jobsDoneLastDay} unavailable={failed} />
          <Metric label="Oracle answers" value={health?.oraclesDoneLastDay} unavailable={failed} />
          <Metric label="Accepted contributions" value={health?.acceptedLastDay} unavailable={failed} />
        </dl>
      </section>

      <section className="health-section" aria-labelledby="health-heading">
        <div className="section-heading"><h2 id="health-heading">Service health</h2><span className="section-aside">Behind the scenes</span></div>
        <dl className="services" aria-busy={busy}>
          <Service name="Verifier" up={health?.verifierUp} unavailable={failed} />
          <Service name="Publisher" up={health?.publisherUp} unavailable={failed} />
          <Service name="Deployer" up={health?.deployerUp} unavailable={failed} />
        </dl>
      </section>

      </div>

      <section className="questions-section" aria-labelledby="questions-heading">
        <div className="section-heading"><div><h2 id="questions-heading">Latest oracle questions</h2><p className="section-description">Real questions. Answers from the swarm.</p></div><span className="questions-symbol" aria-hidden="true"><Icon name="activity" /></span></div>
        {snapshot ? snapshot.questions.length > 0
          ? <ol className="questions-list">{snapshot.questions.map((request) => <QuestionCard request={request} now={now} key={request.id} />)}</ol>
          : <div className="empty-state"><Icon name="globe" /><h3>No oracle questions yet</h3><p>New requests will appear here automatically.<br />You can also select Refresh to check again.</p></div>
          : failed ? <div className="empty-state"><Icon name="globe" /><h3>Questions are unavailable</h3><p>Retry the connection above to load the latest questions.</p></div>
          : <QuestionLoading />}
      </section>
    </main>
    <footer className="site-footer shell"><span>A window into the IMD swarm.</span><a href="https://imd.fun">Explore IMD <Icon name="arrow" /></a></footer>
  </>;
}
