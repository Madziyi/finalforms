import { ArrowRight, BarChart3, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FORMS, getForm } from "../forms";
import { listSubmissions } from "../lib/api";
import { listLocalSubmissions } from "../lib/offlineDb";

export function DataPage() {
  const PAGE_SIZE = 50;
  const { formKey } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedKey = formKey ?? FORMS[0].key;
  const selected = getForm(selectedKey) ?? FORMS[0];
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [page, setPage] = useState(0);
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([undefined]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const filters = useMemo(() => ({
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
    operator: searchParams.get("operator") ?? "",
  }), [searchParams]);

  function updateFilter(key: "from" | "to" | "operator", value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  function clearFilters() {
    setSearchParams({}, { replace: true });
  }

  useEffect(() => {
    setPage(0);
    setPageCursors([undefined]);
  }, [selected.key, filters.from, filters.to, filters.operator]);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      try {
        const result = await listSubmissions({ formKey: selected.key, limit: PAGE_SIZE, before: pageCursors[page], ...filters });
        const remote = result.submissions.map((row) => ({
          ...row,
          id: String(row.id ?? ""),
          date: String(row.date ?? ""),
          operator: String(row.operator ?? ""),
          updated_at: String(row.updated_at ?? row.updatedAt ?? ""),
        }));
        const local = await listLocalSubmissions(selected.key);
        const byId = new Map(remote.map((row) => [row.id, row]));
        const matchingLocal = local.filter((submission) => (!filters.from || submission.date >= filters.from)
          && (!filters.to || submission.date <= filters.to)
          && (!filters.operator || submission.operator.toLocaleLowerCase().includes(filters.operator.toLocaleLowerCase())));
        for (const submission of matchingLocal) {
          const existing = byId.get(submission.id);
          if (!existing || submission.updatedAt >= String(existing.updated_at ?? "")) {
            byId.set(submission.id, {
              id: submission.id,
              form_key: submission.formKey,
              operator: submission.operator,
              date: submission.date,
              shift: submission.shift,
              time_slot: submission.timeSlot,
              boiler_number: submission.boilerNumber,
              status: submission.status,
              updated_at: submission.updatedAt,
            });
          }
        }
        const merged = [...byId.values()].sort((a, b) => String(b.date).localeCompare(String(a.date))
          || String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""))
          || String(b.id).localeCompare(String(a.id)));
        setRows(merged.slice(0, PAGE_SIZE));
        setHasMore(result.hasMore);
      } catch {
        const local = await listLocalSubmissions(selected.key);
        const matching = local.filter((row) => (!filters.from || row.date >= filters.from)
          && (!filters.to || row.date <= filters.to)
          && (!filters.operator || row.operator.toLocaleLowerCase().includes(filters.operator.toLocaleLowerCase())));
        setHasMore(matching.length > (page + 1) * PAGE_SIZE);
        setRows(matching.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((row) => ({
          id: row.id, form_key: row.formKey, operator: row.operator, date: row.date,
          shift: row.shift, time_slot: row.timeSlot, boiler_number: row.boilerNumber, status: row.status, updated_at: row.updatedAt,
        })));
      } finally {
        setLoading(false);
      }
    })();
  }, [selected.key, page, pageCursors, filters]);

  const filteredRows = useMemo(() => rows
    .sort((a, b) => String(b.date).localeCompare(String(a.date))
      || String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""))
      || String(b.id).localeCompare(String(a.id))), [rows, filters]);

  const updateError = (location.state as { updateError?: string; updateId?: string } | null)?.updateError;
  const updateErrorId = (location.state as { updateError?: string; updateId?: string } | null)?.updateId;
  const query = location.search;

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div><div className="eyebrow">Historical data</div><h1>Data Viewing</h1><p>Open past entries or select a numerical field to view trends.</p></div>
      </section>
      <section className="data-toolbar card-surface">
        <label><span>Form</span><select value={selected.key} onChange={(e) => navigate(`/data/${e.target.value}${query}`)}>{FORMS.map((form) => <option key={form.key} value={form.key}>{form.number}. {form.name}</option>)}</select></label>
        <label><span>From date</span><input type="date" value={filters.from} onChange={(e) => updateFilter("from", e.target.value)} /></label>
        <label><span>To date</span><input type="date" value={filters.to} onChange={(e) => updateFilter("to", e.target.value)} /></label>
        <label><span>Operator / name</span><input type="search" value={filters.operator} placeholder="Search operator" onChange={(e) => updateFilter("operator", e.target.value)} /></label>
        {(filters.from || filters.to || filters.operator) && <button className="secondary-button" type="button" onClick={clearFilters}>Reset filters</button>}
        <Link to={`/trends/${selected.key}/${selected.sections.flatMap(s => s.fields).find(f => f.trendable)?.key ?? ""}`} className="secondary-button trends-button"><BarChart3 size={17} /> Trends</Link>
      </section>
      <section className="entries-card card-surface">
        {updateError && <div className="notice error data-recovery"><div><strong>Unable to open that update</strong><p>{updateError}</p></div>{updateErrorId && <button className="secondary-button" type="button" onClick={() => navigate(`/forms/${selected.key}/update/${encodeURIComponent(updateErrorId)}${query}`, { state: null })}><RefreshCw size={16} /> Retry update</button>}</div>}
        <div className="entries-title"><div><h2>{selected.name}</h2><p>{filteredRows.length ? `Page ${page + 1} · Showing ${filteredRows.length} entries` : "0 entries"}</p></div><Search size={20} /></div>
        {loading ? <div className="loading-card plain">Loading entries…</div> : filteredRows.length ? (
          <div className="entries-list">
            {filteredRows.map((row) => (
              <div className="entry-list-row" key={row.id}>
                <div className="entry-primary"><strong>{row.date}</strong><span>{row.time_slot || row.shift || (row.boiler_number ? `Boiler ${row.boiler_number}` : "Daily")}</span></div>
                <div className="entry-secondary"><span>{row.operator || "—"}</span><span className={`status-dot ${row.status}`}>{row.status}</span></div>
                <div className="entry-actions"><Link className="text-button" to={`/data/${selected.key}/${encodeURIComponent(row.id)}${query}`}>View <ArrowRight size={16} /></Link><Link className="secondary-button update-button" to={`/forms/${selected.key}/update/${encodeURIComponent(row.id)}${query}`}>Update</Link></div>
              </div>
            ))}
          </div>
        ) : <div className="empty-state small"><h3>No entries yet</h3><p>No entries match these filters or have been synced yet.</p>{(filters.from || filters.to || filters.operator) && <button className="primary-button inline" type="button" onClick={clearFilters}>Reset filters</button>}</div>}
        {(page > 0 || hasMore) && <div className="pagination-controls"><button className="secondary-button" type="button" disabled={page === 0 || loading} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {page + 1}</span><button className="secondary-button" type="button" disabled={!hasMore || loading} onClick={() => {
          const lastMeasuredAt = String(filteredRows.at(-1)?.measured_at ?? "");
          setPageCursors((current) => [...current.slice(0, page + 1), lastMeasuredAt || undefined]);
          setPage((current) => current + 1);
        }}>Next</button></div>}
      </section>
    </div>
  );
}
