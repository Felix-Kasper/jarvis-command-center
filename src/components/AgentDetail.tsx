import { useState, type ReactNode } from 'react'
import { agentColor, depotTotals, fmtEur, fmtPct, matchSignal, relTime, signalLabels, type Agent, type AgentReport, type Position, type SignalLevel } from '../lib/agents'
import { Robot } from './Robot'
import { Markdown } from './Markdown'
import { Modal, Segmented } from './ui'

type Tab = 'ueberblick' | 'positionen' | 'kandidaten' | 'report' | 'verlauf'

const SIGNAL_LABEL: Record<SignalLevel, string> = { positiv: 'positiv', neutral: 'neutral', negativ: 'Warnsignal' }

export function AgentDetail({ agent, reports, positions, now, onClose, top }: { agent: Agent; reports: AgentReport[]; positions: Position[]; now: Date; onClose: () => void; top?: ReactNode }) {
  const [reportId, setReportId] = useState<string | undefined>(reports[0]?.id)
  const report = reports.find((r) => r.id === reportId) ?? reports[0]
  const [tab, setTab] = useState<Tab>(report ? 'ueberblick' : positions.length ? 'positionen' : 'verlauf')
  const d = report?.data
  const labels = signalLabels(agent.id)
  const totals = positions.length ? depotTotals(positions) : null

  const tabs: { value: Tab; label: string }[] = [
    { value: 'ueberblick', label: 'Überblick' },
    ...(positions.length ? [{ value: 'positionen' as Tab, label: 'Positionen' }] : []),
    ...(d?.candidates.length ? [{ value: 'kandidaten' as Tab, label: 'Kandidaten' }] : []),
    { value: 'report', label: 'Report' },
    { value: 'verlauf', label: `Verlauf (${reports.length})` },
  ]

  return (
    <Modal title={agent.name} onClose={onClose} full>
      <div className="detail-head" style={{ ['--agent' as string]: agentColor(agent.id) }}>
        <Robot status={agent.status} color={agentColor(agent.id)} size={64} />
        <div>
          <strong>{report ? report.title : 'Noch kein Report'}</strong>
          <p className="muted small">
            {report ? `${report.period} · erstellt ${relTime(report.created_at, now)}` : agent.status_note ?? ''}
            {d?.as_of ? ` · Datenstand ${d.as_of}` : ''}
          </p>
        </div>
      </div>

      {top}

      <Segmented<Tab> label="Bereich" value={tab} onChange={setTab} options={tabs} />

      <div className="detail-body">
        {tab === 'ueberblick' &&
          (report && d ? (
            <>
              {d.headline && <p className="lead">{d.headline}</p>}
              {!d.headline && <p className="lead">{report.summary}</p>}
              {d.decisions.length > 0 && (
                <section className="decision-box">
                  <h4>Entscheidungen mit Frist</h4>
                  <ul>
                    {d.decisions.map((x, i) => (
                      <li key={i}>
                        <strong>{x.name}</strong> – {x.what}
                        {x.deadline && <span className="badge badge-danger">bis {new Date(x.deadline + 'T12:00:00').toLocaleDateString('de-DE')}</span>}
                        {x.options && <p className="small muted">{x.options}</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {d.changes.length > 0 && (
                <section>
                  <h4>Änderungen zur Vorwoche</h4>
                  <ul>
                    {d.changes.map((c, i) => (
                      <li key={i}>
                        {c.name && <strong>{c.name}: </strong>}
                        {c.change}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {d.outlook && (
                <section>
                  <h4>Ausblick (1–3 Monate)</h4>
                  <p>{d.outlook}</p>
                </section>
              )}
              {d.market_context && (
                <section>
                  <h4>Marktumfeld</h4>
                  <p>{d.market_context}</p>
                </section>
              )}
              <div className="signal-cols wide">
                <section>
                  <h4 className="sig-pos">{labels.pos}</h4>
                  {d.top_positive.length ? (
                    <ol>
                      {d.top_positive.map((s) => (
                        <li key={s.name}>
                          <strong>{s.name}</strong> – {s.reason}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="muted">–</p>
                  )}
                </section>
                <section>
                  <h4 className="sig-neg">{labels.neg}</h4>
                  {d.top_negative.length ? (
                    <ol>
                      {d.top_negative.map((s) => (
                        <li key={s.name}>
                          <strong>{s.name}</strong> – {s.reason}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="muted">–</p>
                  )}
                </section>
              </div>
              {d.risks.length > 0 && (
                <section>
                  <h4>{agent.id === 'depot' ? 'Risiken im Depot' : 'Hinweise'}</h4>
                  <ul>
                    {d.risks.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : (
            <p className="muted">{agent.status === 'arbeitet' ? 'Läuft gerade …' : 'Noch kein Ergebnis.'}</p>
          ))}

        {tab === 'positionen' && (
          <>
            {totals && (
              <p className="muted small">
                {positions.length} Positionen · {fmtEur(totals.value)} · seit Kauf {fmtEur(totals.diff)} ({fmtPct(totals.pct)})
              </p>
            )}
            <div className="pos-grid">
              {positions.map((p) => {
                const s = d ? matchSignal(p, d.positions) : undefined
                const perf = p.buy_value_eur && p.market_value_eur !== null ? ((p.market_value_eur - p.buy_value_eur) / p.buy_value_eur) * 100 : null
                const weight = totals && totals.value > 0 && p.market_value_eur !== null ? (p.market_value_eur / totals.value) * 100 : null
                return (
                  <article key={p.id} className={`pos-card ${s?.signal ? `sig-${s.signal}` : ''}`}>
                    <div className="pos-top">
                      <div>
                        <strong>{p.name}</strong>
                        <span className="muted small">
                          {' '}
                          {p.account} · {p.asset_type}
                          {p.wkn ? ` · ${p.wkn}` : ''}
                        </span>
                      </div>
                      {s?.signal && <span className={`badge sigbadge-${s.signal}`}>{SIGNAL_LABEL[s.signal]}</span>}
                    </div>
                    <div className="pos-nums">
                      <span>{fmtEur(p.market_value_eur)}</span>
                      <span className={perf === null ? 'muted' : perf >= 0 ? 'pos' : 'neg'}>{fmtPct(perf)}</span>
                      <span className="muted">{weight === null ? '' : `${weight.toLocaleString('de-DE', { maximumFractionDigits: 1 })} % Anteil`}</span>
                    </div>
                    {s && (
                      <dl className="pos-facts">
                        {s.consensus && (
                          <>
                            <dt>Analysten</dt>
                            <dd>{s.consensus}</dd>
                          </>
                        )}
                        {s.price_target && (
                          <>
                            <dt>Kursziel</dt>
                            <dd>{s.price_target}</dd>
                          </>
                        )}
                        {s.insider && (
                          <>
                            <dt>Insider</dt>
                            <dd>{s.insider}</dd>
                          </>
                        )}
                        {s.sentiment && (
                          <>
                            <dt>Stimmung</dt>
                            <dd>{s.sentiment}</dd>
                          </>
                        )}
                        {s.next_event && (
                          <>
                            <dt>Nächster Termin</dt>
                            <dd>{s.next_event}</dd>
                          </>
                        )}
                      </dl>
                    )}
                    {s?.note && <p className="small">{s.note}</p>}
                  </article>
                )
              })}
            </div>
          </>
        )}

        {tab === 'kandidaten' && d && (
          <>
            <div className="pos-grid">
              {d.candidates.map((c) => (
                <article key={c.name} className="pos-card">
                  <div className="pos-top">
                    <strong>{c.name}</strong>
                    {c.isin && <span className="muted small">{c.isin}</span>}
                  </div>
                  {c.why && <p className="small">{c.why}</p>}
                  {c.metrics && <p className="small muted">{c.metrics}</p>}
                  {c.risks && (
                    <p className="small">
                      <span className="sig-neg">Risiken:</span> {c.risks}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </>
        )}

        {tab === 'report' &&
          (report ? (
            <>
              <Markdown text={report.content_md || report.summary} />
              {d && d.sources.length > 0 && (
                <section>
                  <h4>Quellen</h4>
                  <ul className="sources">
                    {d.sources.map((s, i) => (
                      <li key={i}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer">
                          {s.title ?? s.url}
                        </a>
                        {s.date && <span className="muted small"> · {s.date}</span>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : (
            <p className="muted">Noch kein Report.</p>
          ))}

        {tab === 'verlauf' &&
          (reports.length ? (
            <ul className="snapshots">
              {reports.map((r) => (
                <li key={r.id}>
                  <span>
                    <strong>{r.period}</strong> · {r.title}
                    <span className="muted small"> · {new Date(r.created_at).toLocaleDateString('de-DE')}</span>
                  </span>
                  <button
                    className={`chip ${r.id === report?.id ? 'active' : ''}`}
                    onClick={() => {
                      setReportId(r.id)
                      setTab('ueberblick')
                    }}
                  >
                    Öffnen
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Noch keine Reports.</p>
          ))}
      </div>

    </Modal>
  )
}
