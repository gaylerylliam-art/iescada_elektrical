import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, Bell, Database, Filter, LogOut, MapPin, Search, ShieldCheck, Upload } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, clearSession, getUser, login } from "./api";
import "./styles.css";

function App() {
  const [user, setUser] = useState(getUser());
  const [selectedId, setSelectedId] = useState(null);

  if (!user) return <Login onLogin={setUser} />;

  return (
    <Shell user={user} onLogout={() => { clearSession(); setUser(null); }}>
      <Dashboard selectedId={selectedId} setSelectedId={setSelectedId} user={user} />
    </Shell>
  );
}

function Login({ onLogin }) {
  const [email, setEmail] = useState("admin@utility.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const session = await login(email, password);
      onLogin(session.user);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={submit}>
        <ShieldCheck size={36} />
        <h1>Substation Capacity Monitoring System</h1>
        <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" /></label>
        {error && <p className="error">{error}</p>}
        <button>Sign in</button>
      </form>
    </main>
  );
}

function Shell({ user, onLogout, children }) {
  return (
    <div className="app-shell">
      <header>
        <div>
          <h1>Substation Capacity Monitoring System</h1>
          <p>Monitoring-only utility operations visibility</p>
        </div>
        <div className="user-area">
          <span>{user.email}</span>
          <strong>{user.role}</strong>
          <button className="icon-button" title="Sign out" onClick={onLogout}><LogOut size={18} /></button>
        </div>
      </header>
      {children}
    </div>
  );
}

function Dashboard({ selectedId, setSelectedId, user }) {
  const [substations, setSubstations] = useState([]);
  const [alarms, setAlarms] = useState([]);
  const [query, setQuery] = useState({ search: "", region: "", status: "", alarm: "", sort: "name" });
  const [view, setView] = useState("table");
  const selected = substations.find((item) => item.id === selectedId) || substations[0];

  async function load() {
    const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value));
    const [substationRows, alarmRows] = await Promise.all([
      api(`/api/substations?${params}`),
      api("/api/alarms")
    ]);
    setSubstations(substationRows);
    setAlarms(alarmRows);
    if (!selectedId && substationRows[0]) setSelectedId(substationRows[0].id);
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [query.search, query.region, query.status, query.alarm, query.sort]);

  const stats = useMemo(() => {
    const overloaded = substations.filter((item) => item.telemetry?.status === "Overloaded").length;
    const warnings = substations.filter((item) => item.telemetry?.status === "Warning").length;
    const capacity = substations.reduce((sum, item) => sum + (item.telemetry?.availableCapacityMva || 0), 0);
    return { overloaded, warnings, capacity: capacity.toFixed(1), alarms: alarms.length };
  }, [substations, alarms]);

  return (
    <main>
      <section className="summary-grid">
        <Metric label="Active alarms" value={stats.alarms} icon={<Bell />} />
        <Metric label="Warnings" value={stats.warnings} icon={<AlertTriangle />} />
        <Metric label="Overloaded" value={stats.overloaded} icon={<Database />} />
        <Metric label="Available MVA" value={stats.capacity} icon={<ShieldCheck />} />
      </section>

      <section className="toolbar">
        <div className="search"><Search size={18} /><input placeholder="Search name, region, voltage" value={query.search} onChange={(event) => setQuery({ ...query, search: event.target.value })} /></div>
        <Select label="Region" value={query.region} onChange={(region) => setQuery({ ...query, region })} options={["", "North", "East", "West", "Central", "South"]} />
        <Select label="Status" value={query.status} onChange={(status) => setQuery({ ...query, status })} options={["", "Normal", "Watch", "Warning", "Overloaded"]} />
        <Select label="Alarm" value={query.alarm} onChange={(alarm) => setQuery({ ...query, alarm })} options={["", "Normal", "Warning", "Critical"]} />
        <Select label="Sort" value={query.sort} onChange={(sort) => setQuery({ ...query, sort })} options={["name", "loading", "voltage", "alarm"]} />
        <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}><Filter size={16} />Table</button>
        <button className={view === "map" ? "active" : ""} onClick={() => setView("map")}><MapPin size={16} />Map</button>
        {["Admin", "Engineer"].includes(user.role) && <ImportButton onImported={load} />}
      </section>

      <section className="content-grid">
        {view === "table" ? <SubstationTable rows={substations} selectedId={selected?.id} onSelect={setSelectedId} /> : <MapView rows={substations} onSelect={setSelectedId} />}
        {selected && <DetailPanel substation={selected} />}
      </section>
    </main>
  );
}

function Metric({ label, value, icon }) {
  return <div className="metric"><span>{React.cloneElement(icon, { size: 20 })}</span><div><p>{label}</p><strong>{value}</strong></div></div>;
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="select">{label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option || "All"}</option>)}
      </select>
    </label>
  );
}

function ImportButton({ onImported }) {
  async function upload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    await api("/api/import/ratings", { method: "POST", body });
    onImported();
  }
  return <label className="upload"><Upload size={16} />Import CSV<input type="file" accept=".csv" onChange={upload} /></label>;
}

function SubstationTable({ rows, selectedId, onSelect }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Region</th><th>kV</th><th>Loading</th><th>Available</th><th>MW</th><th>MVAR</th><th>Temp</th><th>Alarm</th><th>Latest Data</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.id === selectedId ? "selected" : ""} onClick={() => onSelect(row.id)}>
              <td>{row.name}</td>
              <td>{row.region}</td>
              <td>{row.voltageLevelKv}</td>
              <td><StatusBadge status={row.telemetry?.status} value={row.telemetry?.loadingPercent} /></td>
              <td>{row.telemetry?.availableCapacityMva ?? "-"} MVA</td>
              <td>{row.telemetry?.mw ?? "-"}</td>
              <td>{row.telemetry?.mvar ?? "-"}</td>
              <td>{row.telemetry?.transformerTempC ?? "-"} C</td>
              <td><span className={`alarm ${row.alarmStatus}`}>{row.alarmStatus}</span></td>
              <td>{row.telemetry?.isStale ? "Data stale" : new Date(row.telemetry?.timestamp || Date.now()).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status = "Unknown", value = 0 }) {
  return <span className={`badge ${status}`}>{status} {Number(value).toFixed(1)}%</span>;
}

function MapView({ rows, onSelect }) {
  return (
    <div className="map-view">
      {rows.map((row) => (
        <button key={row.id} className={`map-pin ${row.telemetry?.status}`} style={{ left: `${20 + (row.longitude - 103.7) * 95}%`, top: `${70 - (row.latitude - 1.25) * 180}%` }} onClick={() => onSelect(row.id)} title={row.name}>
          <MapPin size={18} />
        </button>
      ))}
    </div>
  );
}

function DetailPanel({ substation }) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    api(`/api/substations/${substation.id}/history?limit=96`).then(setHistory);
  }, [substation.id]);

  const telemetry = substation.telemetry;
  const peak = Math.max(...history.map((item) => item.mva), telemetry?.mva || 0).toFixed(1);

  return (
    <aside className="detail">
      <div className="detail-head">
        <div>
          <h2>{substation.name}</h2>
          <p>{substation.region} · {substation.voltageLevelKv} kV</p>
        </div>
        <StatusBadge status={telemetry?.status} value={telemetry?.loadingPercent} />
      </div>
      <div className="detail-grid">
        <Info label="Transformer rating" value={`${substation.ratedMva} MVA`} />
        <Info label="Current load" value={`${telemetry?.mva ?? "-"} MVA`} />
        <Info label="Available capacity" value={`${telemetry?.availableCapacityMva ?? "-"} MVA`} />
        <Info label="Peak demand" value={`${peak} MVA`} />
        <Info label="Voltage" value={`${telemetry?.voltageKv ?? "-"} kV`} />
        <Info label="Current" value={`${telemetry?.currentA ?? "-"} A`} />
        <Info label="N-1 status" value={telemetry?.nMinusOne?.status || "-"} />
        <Info label="Connection" value={telemetry?.connectionStatus || "-"} />
      </div>
      <h3>Loading Trend</h3>
      <div className="chart">
        <ResponsiveContainer>
          <AreaChart data={history.map((item) => ({ ...item, time: new Date(item.timestamp).toLocaleTimeString() }))}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" hide />
            <YAxis domain={[0, 130]} />
            <Tooltip />
            <Area type="monotone" dataKey="loadingPercent" stroke="#2364aa" fill="#9bc1ff" name="Loading %" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <h3>Feeder Status</h3>
      <div className="feeders">
        {(telemetry?.feederLoading || []).map((feeder) => <div key={feeder.name}><span>{feeder.name}</span><meter min="0" max="125" value={feeder.loadingPercent} /><strong>{feeder.loadingPercent}%</strong></div>)}
      </div>
      <h3>Equipment Alarms</h3>
      <div className="alarm-list">
        {substation.alarms.length ? substation.alarms.map((alarm) => <p key={alarm.id} className={alarm.severity}>{alarm.severity}: {alarm.message}</p>) : <p>No active equipment alarms.</p>}
      </div>
      <h3>Forecast</h3>
      <p className="forecast">Next interval estimate: {forecast(history, telemetry)}% loading.</p>
    </aside>
  );
}

function Info({ label, value }) {
  return <div className="info"><span>{label}</span><strong>{value}</strong></div>;
}

function forecast(history, telemetry) {
  if (history.length < 2 || !telemetry) return telemetry?.loadingPercent?.toFixed(1) || "-";
  const recent = history.slice(-6);
  const slope = (recent[recent.length - 1].loadingPercent - recent[0].loadingPercent) / recent.length;
  return Math.max(0, Math.min(140, telemetry.loadingPercent + slope)).toFixed(1);
}

createRoot(document.getElementById("root")).render(<App />);
