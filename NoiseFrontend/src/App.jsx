import {
  Activity, Database, Wifi, WifiOff, Bell, BellOff,
  Zap, RefreshCw, ChevronLeft, Radio, Volume2, TrendingUp,
} from "lucide-react";
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis, ReferenceLine,
} from "recharts";
import io from "socket.io-client";

const API_URL = "https://silenceguard-gsfcu.ddns.net";
const StatusDot = ({ live }) => (
	<span style={{
		display: 'inline-block',
		width: 8,
		height: 8,
		borderRadius: '50%',
		background: live ? '#22C55E' : '#CBD5E1',
		boxShadow: live ? '0 0 0 3px rgba(34,197,94,0.2)' : 'none',
		animation: live ? 'pulse 2s infinite' : 'none',
	}} />
);

const Footer = () => (
	<footer style={{
		background: '#fff',
		borderTop: '1px solid #E2E8F0',
		padding: '12px 20px',
		marginTop: '16px',
		textAlign: 'center',
		fontSize: 13,
		color: '#64748B',
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		gap: 8,
	}}>
		<a
			href="https://dcs.gsfcuniversity.ac.in/academic/School-cp/home.aspx"
			target="_blank"
			rel="noreferrer"
			style={{
				textDecoration: 'none',
				color: '#fff',
				background: '#0EA5E9',
				padding: '8px 18px',
				borderRadius: 8,
				fontWeight: 700,
			}}
		>
			Back to DCS
		</a>
		<div>Developed with 💖 by team Burning Curiosity</div>
	</footer>
);

export default function IoTDashboard() {
	const [socket, setSocket] = useState(null);
	const [nodes, setNodes] = useState([]);
	const [selectedNode, setSelectedNode] = useState(null);
	const [liveData, setLiveData] = useState({});
	const [historicalData, setHistoricalData] = useState([]);
	const [metrics, setMetrics] = useState({});
	const [view, setView] = useState("overview");
	const [timeRange, setTimeRange] = useState("1h");
	const lastSeqRef = useRef({});

	useEffect(() => {
		const newSocket = io(API_URL);
		newSocket.on("connect", () => {
			newSocket.emit("identify", { type: "client" });
		});
		newSocket.on("nodes:list", (nodesList) => setNodes(nodesList));
		newSocket.on("node:connected", (data) => {
			setNodes((prev) => [...prev.filter((n) => n.nodeId !== data.nodeId), data]);
		});
		newSocket.on("node:disconnected", (data) => {
			setNodes((prev) => prev.filter((n) => n.nodeId !== data.nodeId));
		});
		newSocket.on("data:live", (reading) => {
			const { nodeId, ts, payload, seq } = reading;
			setLiveData((prev) => ({ ...prev, [nodeId]: { ts, payload, seq } }));
			if (lastSeqRef.current[nodeId] && seq && seq !== lastSeqRef.current[nodeId] + 1) {
				fetchMissingData(nodeId, lastSeqRef.current[nodeId]);
			}
			if (seq) lastSeqRef.current[nodeId] = seq;
		});
		setSocket(newSocket);
		return () => newSocket.close();
	}, []);

	useEffect(() => {
		fetchNodes();
		const interval = setInterval(fetchNodes, 5000);
		return () => clearInterval(interval);
	}, []);

	useEffect(() => {
		const fetchMetrics = async () => {
			for (const node of nodes) {
				try {
					const res = await fetch(`${API_URL}/api/metrics/${node.nodeId}`);
					const data = await res.json();
					if (data.success) {
						setMetrics((prev) => ({ ...prev, [node.nodeId]: data.metrics }));
					}
				} catch (err) {}
			}
		};
		if (nodes.length > 0) {
			fetchMetrics();
			const interval = setInterval(fetchMetrics, 10000);
			return () => clearInterval(interval);
		}
	}, [nodes]);

	const fetchNodes = async () => {
		try {
			const res = await fetch(`${API_URL}/api/nodes`);
			const data = await res.json();
			if (data.success) setNodes(data.nodes);
		} catch (err) {}
	};

	const fetchMissingData = async (nodeId, lastSeq) => {
		try {
			await fetch(`${API_URL}/api/sync/${nodeId}?lastSeq=${lastSeq}`);
		} catch (err) {}
	};

	const fetchHistoricalData = async (nodeId) => {
		try {
			const now = Date.now();
			const ranges = { "1h": 3600000, "6h": 21600000, "24h": 86400000, "7d": 604800000 };
			const fromTs = now - ranges[timeRange];
			const res = await fetch(`${API_URL}/api/series/${nodeId}?fromTs=${fromTs}&toTs=${now}&limit=1000`);
			const data = await res.json();
			if (data.success) setHistoricalData(data.data);
		} catch (err) {}
	};

	const handleNodeClick = (node) => {
		setSelectedNode(node);
		setView("detail");
		fetchHistoricalData(node.nodeId);
		if (socket) socket.emit("subscribe", node.nodeId);
	};

	const handleBackToOverview = () => {
		if (socket && selectedNode) socket.emit("unsubscribe", selectedNode.nodeId);
		setSelectedNode(null);
		setView("overview");
		setHistoricalData([]);
	};

	const sendCommand = async (nodeId, command, data = {}) => {
		try {
			const res = await fetch(`${API_URL}/api/command/${nodeId}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ command, data }),
			});
			const result = await res.json();
			alert(result.success ? `Command "${command}" sent to ${nodeId}` : `Failed: ${result.error}`);
		} catch (err) {
			alert("Error sending command");
		}
	};

	const formatTimestamp = (ts) => new Date(ts).toLocaleTimeString();

	const getChartData = () =>
		historicalData.map((item) => ({
			time: formatTimestamp(item.ts),
			...item.payload,
			seq: item.seq,
		}));

	const CHART_COLORS = ["#0EA5E9", "#10B981", "#F59E0B", "#EF4444"];

	const styles = {
		page: {
			minHeight: '100vh',
			background: '#F8FAFC',
			fontFamily: "'DM Sans', 'Outfit', system-ui, sans-serif",
			color: '#0F172A',
		},
		header: {
			background: '#fff',
			borderBottom: '1px solid #E2E8F0',
			padding: '0 2rem',
			height: 64,
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'space-between',
			position: 'sticky',
			top: 0,
			zIndex: 50,
			boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
		},
		logoArea: {
			display: 'flex',
			alignItems: 'center',
			gap: 12,
		},
		brandName: {
			fontWeight: 700,
			fontSize: 20,
			letterSpacing: '-0.5px',
			color: '#0F172A',
		},
		brandSub: {
			fontSize: 11,
			color: '#64748B',
			letterSpacing: '0.08em',
			textTransform: 'uppercase',
			fontWeight: 500,
		},
		content: {
			maxWidth: 1200,
			margin: '0 auto',
			padding: '2rem 1.5rem',
		},
		card: {
			background: '#fff',
			border: '1px solid #E2E8F0',
			borderRadius: 16,
			padding: '1.5rem',
		},
		statCard: (accent) => ({
			background: '#fff',
			border: `1px solid #E2E8F0`,
			borderRadius: 16,
			padding: '1.5rem',
			borderTop: `3px solid ${accent}`,
		}),
		statLabel: {
			fontSize: 12,
			color: '#64748B',
			fontWeight: 600,
			letterSpacing: '0.06em',
			textTransform: 'uppercase',
			marginBottom: 8,
		},
		statValue: {
			fontSize: 32,
			fontWeight: 700,
			color: '#0F172A',
			letterSpacing: '-1px',
		},
		sectionTitle: {
			fontSize: 18,
			fontWeight: 700,
			color: '#0F172A',
			marginBottom: '1rem',
			letterSpacing: '-0.3px',
		},
		nodeCard: {
			background: '#fff',
			border: '1px solid #E2E8F0',
			borderRadius: 16,
			padding: '1.25rem',
			cursor: 'pointer',
			transition: 'all 0.18s ease',
		},
		nodeCardHover: {
			borderColor: '#0EA5E9',
			boxShadow: '0 4px 20px rgba(14,165,233,0.12)',
			transform: 'translateY(-2px)',
		},
		liveChip: {
			background: '#F0FDF4',
			color: '#16A34A',
			border: '1px solid #BBF7D0',
			borderRadius: 20,
			padding: '2px 10px',
			fontSize: 11,
			fontWeight: 700,
			letterSpacing: '0.08em',
		},
		pill: (active) => ({
			padding: '6px 14px',
			borderRadius: 8,
			fontSize: 13,
			fontWeight: 600,
			cursor: 'pointer',
			border: active ? '1px solid #0EA5E9' : '1px solid #E2E8F0',
			background: active ? '#EFF6FF' : '#fff',
			color: active ? '#0369A1' : '#64748B',
			transition: 'all 0.15s',
		}),
		backBtn: {
			display: 'inline-flex',
			alignItems: 'center',
			gap: 6,
			padding: '8px 16px',
			borderRadius: 10,
			border: '1px solid #E2E8F0',
			background: '#fff',
			color: '#0F172A',
			fontWeight: 600,
			fontSize: 14,
			cursor: 'pointer',
			marginBottom: 24,
			transition: 'all 0.15s',
		},
		ctrlBtn: (color) => ({
			padding: '10px 0',
			borderRadius: 10,
			border: 'none',
			background: color,
			color: '#fff',
			fontWeight: 600,
			fontSize: 14,
			cursor: 'pointer',
			transition: 'opacity 0.15s',
			width: '100%',
		}),
		valueTag: {
			background: '#F8FAFC',
			border: '1px solid #E2E8F0',
			borderRadius: 12,
			padding: '12px 16px',
		},
		table: {
			width: '100%',
			borderCollapse: 'collapse',
			fontSize: 13,
		},
		th: {
			textAlign: 'left',
			padding: '10px 12px',
			fontWeight: 600,
			color: '#64748B',
			fontSize: 11,
			letterSpacing: '0.06em',
			textTransform: 'uppercase',
			borderBottom: '1px solid #E2E8F0',
		},
		td: {
			padding: '10px 12px',
			borderBottom: '1px solid #F1F5F9',
			fontFamily: 'monospace',
			color: '#334155',
		},
	};

	const Header = () => (
		<header style={styles.header}>
			<div style={styles.logoArea}>
				<div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
					<img src="/Gemini_Generated_Image_1oycc21oycc21oyc.png" alt="Gemini Generated" style={{ height: "8vh", objectFit: 'contain' }} />
					<div>
						<div style={styles.brandName}>SilenceGuard</div>
					</div>
					<img src="/gsfcu-logo.png" alt="GSFCU" style={{ display: "block", height: 25, objectFit: 'contain' }} />
					<img src="/guiitar.jpg" alt="Guiitar" style={{  display: "block", height: 50, objectFit: 'contain' }} />
				</div>

			</div>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
				<div style={{
					width: 8, height: 8, borderRadius: '50%',
					background: '#22C55E',
					boxShadow: '0 0 0 3px rgba(34,197,94,0.2)',
				}} />
				<span style={{ fontSize: 13, color: '#64748B', fontWeight: 500 }}>
					{nodes.length} device{nodes.length !== 1 ? 's' : ''} connected
				</span>
			</div>
		</header>
	);

	if (view === "detail" && selectedNode) {
		const live = liveData[selectedNode.nodeId];
		return (
			<div style={styles.page}>
				<Header />
				<div style={styles.content}>
					<button style={styles.backBtn} onClick={handleBackToOverview}>
						← Back to Overview
					</button>

					<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
						<div style={{
							width: 44, height: 44, borderRadius: 12, background: '#0F172A',
							display: 'flex', alignItems: 'center', justifyContent: 'center',
						}}>
							<Server size={22} color="#38BDF8" />
						</div>
						<div>
							<h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px' }}>
								{selectedNode.nodeId}
							</h1>
							<span style={styles.liveChip}>● LIVE</span>
						</div>
					</div>

					{/* Stats Row */}
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
						{[
							{ label: 'Status', value: 'Active', accent: '#22C55E', icon: <Activity size={18} color="#22C55E" /> },
							{ label: 'Last Update', value: live ? formatTimestamp(live.ts) : 'N/A', accent: '#0EA5E9', icon: <Clock size={18} color="#0EA5E9" /> },
							{ label: 'Sequence', value: live?.seq || 0, accent: '#8B5CF6', icon: <Database size={18} color="#8B5CF6" /> },
						].map((s) => (
							<div key={s.label} style={styles.statCard(s.accent)}>
								<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
									<span style={styles.statLabel}>{s.label}</span>
									{s.icon}
								</div>
								<div style={{ fontSize: 22, fontWeight: 700, color: '#0F172A' }}>{s.value}</div>
							</div>
						))}
					</div>

					{/* Current Values */}
					{live && (
						<div style={{ ...styles.card, marginBottom: 24 }}>
							<div style={styles.sectionTitle}>Live Readings</div>
							<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12 }}>
								{Object.entries(live.payload).map(([key, value]) => (
									<div key={key} style={styles.valueTag}>
										<div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{key}</div>
										<div style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', fontFamily: 'monospace' }}>
											{typeof value === 'number' ? value.toFixed(2) : value}
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Controls */}
					<div style={{ ...styles.card, marginBottom: 24 }}>
						<div style={styles.sectionTitle}>Device Controls</div>
						<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
							<button style={styles.ctrlBtn('#22C55E')} onClick={() => sendCommand(selectedNode.nodeId, 'start')}>▶ Start</button>
							<button style={styles.ctrlBtn('#F59E0B')} onClick={() => sendCommand(selectedNode.nodeId, 'stop')}>⏸ Stop</button>
							<button style={styles.ctrlBtn('#0EA5E9')} onClick={() => {
								const t = prompt('Enter threshold value:', '80');
								if (t) sendCommand(selectedNode.nodeId, 'setThreshold', { threshold: parseInt(t) });
							}}>⚙ Threshold</button>
							<button style={styles.ctrlBtn('#EF4444')} onClick={() => {
								if (confirm('Reset device?')) sendCommand(selectedNode.nodeId, 'reset');
							}}>↺ Reset</button>
						</div>
					</div>

					{/* Time Range + Chart */}
					<div style={{ ...styles.card, marginBottom: 24 }}>
						<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
							<div style={styles.sectionTitle}>Historical Data</div>
							<div style={{ display: 'flex', gap: 8 }}>
								{["1h", "6h", "24h", "7d"].map((r) => (
									<button key={r} style={styles.pill(timeRange === r)} onClick={() => {
										setTimeRange(r);
										fetchHistoricalData(selectedNode.nodeId);
									}}>{r}</button>
								))}
							</div>
						</div>
						{historicalData.length > 0 ? (
							<ResponsiveContainer width="100%" height={320}>
								<LineChart data={getChartData()}>
									<CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
									<XAxis dataKey="time" stroke="#94A3B8" tick={{ fontSize: 11 }} />
									<YAxis stroke="#94A3B8" tick={{ fontSize: 11 }} />
									<Tooltip contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }} />
									<Legend wrapperStyle={{ fontSize: 12 }} />
									{historicalData.length > 0 && Object.keys(historicalData[0].payload).map((key, idx) => (
										<Line key={key} type="monotone" dataKey={key}
											stroke={CHART_COLORS[idx % 4]} strokeWidth={2} dot={false} />
									))}
								</LineChart>
							</ResponsiveContainer>
						) : (
							<div style={{ padding: '3rem', textAlign: 'center', color: '#94A3B8' }}>
								<TrendingUp size={40} style={{ margin: '0 auto 12px', opacity: 0.4, display: 'block' }} />
								<p style={{ fontSize: 14 }}>Loading historical data...</p>
							</div>
						)}
					</div>

					{/* Table */}
					<div style={styles.card}>
						<div style={styles.sectionTitle}>Recent Records</div>
						<div style={{ overflowX: 'auto' }}>
							<table style={styles.table}>
								<thead>
									<tr>
										<th style={styles.th}>Seq</th>
										<th style={styles.th}>Timestamp</th>
										{historicalData.length > 0 && Object.keys(historicalData[0].payload).map((k) => (
											<th key={k} style={styles.th}>{k}</th>
										))}
									</tr>
								</thead>
								<tbody>
									{historicalData.slice(-10).reverse().map((rec, idx) => (
										<tr key={idx}>
											<td style={styles.td}>{rec.seq}</td>
											<td style={styles.td}>{new Date(rec.ts).toLocaleString()}</td>
											{Object.values(rec.payload).map((v, vi) => (
												<td key={vi} style={styles.td}>{typeof v === 'number' ? v.toFixed(2) : v}</td>
											))}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				</div>
				<Footer />
			</div>
		);
	}

	return (
		<div style={styles.page}>
			<Header />
			<div style={styles.content}>
				{/* Page title */}
				<div style={{ marginBottom: 28 }}>
					<h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px', color: '#0F172A' }}>
						Overview
					</h1>
					<p style={{ color: '#64748B', marginTop: 4, fontSize: 14 }}>
						Real-time monitoring of all connected IoT devices
					</p>
				</div>

				{/* Stats */}
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 32 }}>
					{[
						{ label: 'Connected Nodes', value: nodes.length, accent: '#0EA5E9', icon: <Wifi size={18} color="#0EA5E9" /> },
						{ label: 'Active Streams', value: Object.keys(liveData).length, accent: '#22C55E', icon: <Activity size={18} color="#22C55E" /> },
						{ label: 'Total Records', value: Object.values(metrics).reduce((s, m) => s + parseInt(m.totalRecords || 0), 0).toLocaleString(), accent: '#8B5CF6', icon: <Database size={18} color="#8B5CF6" /> },
					].map((s) => (
						<div key={s.label} style={styles.statCard(s.accent)}>
							<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
								<span style={styles.statLabel}>{s.label}</span>
								{s.icon}
							</div>
							<div style={styles.statValue}>{s.value}</div>
						</div>
					))}
				</div>

				{/* Devices */}
				<div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
					<h2 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.3px' }}>Devices</h2>
					<span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500 }}>
						Updated every 5s
					</span>
				</div>

				{nodes.length === 0 ? (
					<div style={{ ...styles.card, textAlign: 'center', padding: '4rem 2rem' }}>
						<WifiOff size={44} color="#CBD5E1" style={{ margin: '0 auto 16px', display: 'block' }} />
						<p style={{ fontSize: 16, fontWeight: 600, color: '#64748B' }}>No devices connected</p>
						<p style={{ color: '#94A3B8', marginTop: 6, fontSize: 14 }}>Waiting for IoT nodes to connect...</p>
					</div>
				) : (
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
						{nodes.map((node) => {
							const live = liveData[node.nodeId];
							const nm = metrics[node.nodeId] || {};
							return (
								<div key={node.nodeId} className="node-card" style={{ ...styles.nodeCard, transition: 'all 0.18s ease' }} onClick={() => handleNodeClick(node)}>
									<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
										<div>
											<h3 style={{ fontWeight: 700, fontSize: 16, color: '#0F172A', marginBottom: 4 }}>{node.nodeId}</h3>
											{live ? (
												<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
													<StatusDot live />
													<span style={{ fontSize: 11, color: '#22C55E', fontWeight: 700 }}>LIVE</span>
												</div>
											) : (
												<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
													<StatusDot live={false} />
													<span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>OFFLINE</span>
												</div>
											)}
										</div>
										<div style={{
											width: 36, height: 36, borderRadius: 10, background: live ? '#F0FDF4' : '#F8FAFC',
											display: 'flex', alignItems: 'center', justifyContent: 'center',
											border: '1px solid ' + (live ? '#BBF7D0' : '#E2E8F0'),
										}}>
											{live ? <Wifi size={18} color="#22C55E" /> : <WifiOff size={18} color="#CBD5E1" />}
										</div>
									</div>

									{live && (
										<div style={{ background: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 14, border: '1px solid #F1F5F9' }}>
											<div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8, textTransform: 'uppercase' }}>Live Data</div>
											<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
												{Object.entries(live.payload).slice(0, 4).map(([k, v]) => (
													<div key={k}>
														<div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, marginBottom: 1, textTransform: 'uppercase' }}>{k}</div>
														<div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#0F172A' }}>
															{typeof v === 'number' ? v.toFixed(2) : v}
														</div>
													</div>
												))}
											</div>
										</div>
									)}

									<div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
										{[
											{ label: 'Records', value: parseInt(nm.totalRecords || 0).toLocaleString() },
											{ label: 'Last Update', value: live ? formatTimestamp(live.ts) : 'N/A' },
											{ label: 'Sequence', value: live?.seq || 0 },
										].map((r) => (
											<div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
												<span style={{ color: '#94A3B8' }}>{r.label}</span>
												<span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>{r.value}</span>
											</div>
										))}
									</div>

									<button style={{
										width: '100%', padding: '9px 0', borderRadius: 10,
										background: '#0F172A', color: '#fff',
										fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer',
										letterSpacing: '0.01em',
									}}>
										View Details →
									</button>
								</div>
							);
						})}
					</div>
				)}
			</div>
			<Footer />
		</div>
	);
}
=======
const THRESHOLD_DEFAULT = 50;

/* ─────────────────────────────────────────────
   DIGITAL TWIN  — exact replica of physical device
───────────────────────────────────────────── */
function DigitalTwin({ db = 0, threshold = 50, isOnline = false, alertActive = false }) {
  const CIRC = 2 * Math.PI * 38;
  const pct  = Math.min(Math.max(db / 100, 0), 1);
  const dash = (pct * CIRC).toFixed(1);

  const color =
    db < 40    ? "#22c55e" :
    db < threshold ? "#facc15" :
    db < 80    ? "#f97316" : "#ef4444";

  return (
    <div className="dt-outer">
      {/* ── Disc body ── */}
      <div className={`dt-disc ${alertActive ? "dt-disc--alert" : ""}`}>

        {/* Wall brackets */}
        <div className="dt-bracket dt-bracket--l" />
        <div className="dt-bracket dt-bracket--r" />

        {/* ── LCD Screen (portrait) ── */}
        <div className="dt-lcd">
          <div className="dt-lcd__header">NOISE MONITORING SYSTEM</div>

          <div className="dt-lcd__chips">
            <div className="dt-chip dt-chip--blue">
              <span className="dt-chip__lbl">MIN</span>
              <span className="dt-chip__val">30</span>
            </div>
            <div className="dt-chip dt-chip--red">
              <span className="dt-chip__lbl">MAX</span>
              <span className="dt-chip__val">85</span>
            </div>
            <div className="dt-chip dt-chip--teal">
              <span className="dt-chip__lbl">&gt;1</span>
              <span className="dt-chip__val">{threshold}</span>
            </div>
          </div>

          {/* Circular gauge */}
          <div className="dt-lcd__gauge">
            <svg viewBox="0 0 90 90" width="90" height="90">
              {/* Track */}
              <circle cx="45" cy="45" r="38" fill="none"
                stroke="rgba(13,74,58,0.18)" strokeWidth="4" />
              {/* Value arc */}
              <circle cx="45" cy="45" r="38" fill="none"
                stroke={color} strokeWidth="6"
                strokeDasharray={`${dash} ${CIRC}`}
                strokeLinecap="round"
                transform="rotate(-90 45 45)"
                style={{ transition: "stroke-dasharray .4s ease, stroke .3s ease" }} />
              {/* dB text */}
              <text x="45" y="41" textAnchor="middle"
                fontFamily="'Share Tech Mono',monospace"
                fontSize="20" fontWeight="700" fill={color}
                style={{ transition: "fill .3s ease" }}>
                {isOnline ? Math.round(db) : "--"}
              </text>
              <text x="45" y="56" textAnchor="middle"
                fontFamily="'Rajdhani',sans-serif"
                fontSize="10" fill="#0d4a3a">dB SPL</text>
            </svg>
          </div>

          <div className={`dt-lcd__status ${alertActive ? "dt-lcd__status--alert" : ""}`}>
            {!isOnline ? "● OFFLINE" : alertActive ? "⚠ OVER LIMIT" : "● NORMAL"}
          </div>
          <div className="dt-lcd__thr">Threshold: {threshold} dB</div>
        </div>

        {/* ── No-noise icon ── */}
        <svg className="dt-icon" viewBox="0 0 90 90" xmlns="http://www.w3.org/2000/svg">
          <circle cx="45" cy="45" r="41" fill="rgba(192,57,43,0.06)"
            stroke="#c0392b" strokeWidth="5" />
          <line x1="16" y1="16" x2="74" y2="74"
            stroke="#c0392b" strokeWidth="5" strokeLinecap="round" />
          {/* Head */}
          <ellipse cx="32" cy="27" rx="9" ry="10" fill="#2c2c2a" />
          {/* Body facing right */}
          <path d="M32 37 Q32 43 38 45 L38 58 Q38 62 34 62 L28 62 Q24 62 24 58 L24 45 Q24 41 28 39 Z"
            fill="#2c2c2a" />
          {/* Sound waves */}
          <path d="M46 35 Q53 40 53 49 Q53 58 46 63"
            fill="none" stroke="#2c2c2a" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M52 28 Q63 36 63 49 Q63 62 52 70"
            fill="none" stroke="#2c2c2a" strokeWidth="3" strokeLinecap="round" />
        </svg>

        {/* ── LED indicator ── */}
        <div className={`dt-led ${alertActive ? "dt-led--alert" : isOnline ? "dt-led--on" : "dt-led--off"}`} />

        {/* ── Footer text ── */}
        <div className="dt-footer">Please keep silence</div>
      </div>

      {/* ── Wave visualiser below disc ── */}
      <div className="dt-waves">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="dt-wave-bar"
            style={{
              backgroundColor: color,
              animationDelay: `${i * 0.09}s`,
              height: isOnline
                ? `${8 + pct * 28 * Math.abs(Math.sin(i * 1.3))}px`
                : "4px",
            }} />
        ))}
      </div>

      {/* ── Live dB badge ── */}
      <div className="dt-badge" style={{ borderColor: color, color }}>
        {isOnline ? `${Math.round(db)} dB` : "OFFLINE"}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   NODE CARD
───────────────────────────────────────────── */
function NodeCard({ node, liveData, metrics, onClick }) {
  const d  = liveData[node.nodeId];
  const db = d?.payload?.db ?? d?.payload?.noise ?? 0;
  const isOver = db > THRESHOLD_DEFAULT;
  const color =
    db < 40 ? "#22c55e" : db < THRESHOLD_DEFAULT ? "#facc15" : "#ef4444";

  return (
    <button
      className={`nc ${isOver ? "nc--alert" : ""}`}
      onClick={() => onClick(node)}
    >
      <div className="nc__top">
        <span className="nc__id"><Radio size={13} /> {node.nodeId}</span>
        <span className={`nc__dot ${node.connected ? "nc__dot--on" : "nc__dot--off"}`} />
      </div>

      {/* Mini arc gauge */}
      <div className="nc__arc">
        <svg viewBox="0 0 80 45" width="80" height="45">
          <path d="M8 44 A36 36 0 0 1 72 44" fill="none"
            stroke="rgba(255,255,255,0.08)" strokeWidth="6" strokeLinecap="round" />
          <path d="M8 44 A36 36 0 0 1 72 44" fill="none"
            stroke={color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${Math.min(db / 100, 1) * 113} 113`}
            style={{ transition: "stroke-dasharray .4s, stroke .3s" }} />
          <text x="40" y="42" textAnchor="middle"
            fontFamily="'Share Tech Mono',monospace"
            fontSize="13" fontWeight="700" fill={color}>
            {db > 0 ? `${Math.round(db)}` : "--"}
          </text>
        </svg>
      </div>

      <div className="nc__label" style={{ color }}>
        {isOver ? "⚠ Noisy" : "✓ Quiet"}
      </div>
      <div className="nc__records">
        <Database size={11} />
        {metrics[node.nodeId]?.totalRecords?.toLocaleString() ?? "0"} records
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────
   CUSTOM TOOLTIP
───────────────────────────────────────────── */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ctt">
      <p className="ctt__time">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.dataKey}: <b>{p.value}</b> dB
        </p>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   STAT CARD
───────────────────────────────────────────── */
function StatCard({ label, value, color, icon: Icon, sub }) {
  return (
    <div className="sc">
      <div className="sc__icon" style={{ color }}><Icon size={20} /></div>
      <div className="sc__val" style={{ color }}>{value}</div>
      <div className="sc__label">{label}</div>
      {sub && <div className="sc__sub">{sub}</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN APP
───────────────────────────────────────────── */
export default function IoTDashboard() {
  const [nodes,          setNodes]          = useState([]);
  const [selectedNode,   setSelectedNode]   = useState(null);
  const [liveData,       setLiveData]       = useState({});
  const [historicalData, setHistoricalData] = useState([]);
  const [metrics,        setMetrics]        = useState({});
  const [view,           setView]           = useState("overview");
  const [timeRange,      setTimeRange]      = useState("1h");
  const [alertMuted,     setAlertMuted]     = useState(false);
  const [tick,           setTick]           = useState(0);
  const socketRef  = useRef(null);
  const lastSeqRef = useRef({});

  /* Tick for wave animation */
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 220);
    return () => clearInterval(id);
  }, []);

  /* Socket.IO */
  useEffect(() => {
    const s = io(API_URL);
    socketRef.current = s;
    s.on("connect",           ()   => s.emit("identify", { type: "client" }));
    s.on("nodes:list",        setNodes);
    s.on("node:connected",    d    => setNodes(p => [...p.filter(n => n.nodeId !== d.nodeId), d]));
    s.on("node:disconnected", d    => setNodes(p => p.filter(n => n.nodeId !== d.nodeId)));
    s.on("data:live", reading => {
      const { nodeId, ts, payload, seq } = reading;
      setLiveData(p => ({ ...p, [nodeId]: { ts, payload, seq } }));
      if (lastSeqRef.current[nodeId] && seq && seq !== lastSeqRef.current[nodeId] + 1)
        fetchMissing(nodeId, lastSeqRef.current[nodeId]);
      if (seq) lastSeqRef.current[nodeId] = seq;
    });
    return () => s.close();
  }, []);

  /* Poll nodes */
  useEffect(() => {
    fetchNodes();
    const id = setInterval(fetchNodes, 5000);
    return () => clearInterval(id);
  }, []);

  /* Metrics */
  useEffect(() => {
    if (!nodes.length) return;
    const go = async () => {
      for (const node of nodes) {
        try {
          const r = await fetch(`${API_URL}/api/metrics/${node.nodeId}`);
          const d = await r.json();
          if (d.success) setMetrics(p => ({ ...p, [node.nodeId]: d.metrics }));
        } catch {}
      }
    };
    go();
    const id = setInterval(go, 10000);
    return () => clearInterval(id);
  }, [nodes]);

  const fetchNodes = async () => {
    try {
      const r = await fetch(`${API_URL}/api/nodes`);
      const d = await r.json();
      if (d.success) setNodes(d.nodes);
    } catch {}
  };

  const fetchMissing = async (nodeId, lastSeq) => {
    try { await fetch(`${API_URL}/api/sync/${nodeId}?lastSeq=${lastSeq}`); } catch {}
  };

  const fetchHistory = useCallback(async (nodeId, range = timeRange) => {
    try {
      const ranges = { "1h": 3600000, "6h": 21600000, "24h": 86400000, "7d": 604800000 };
      const now = Date.now();
      const r = await fetch(
        `${API_URL}/api/series/${nodeId}?fromTs=${now - ranges[range]}&toTs=${now}&limit=1000`
      );
      const d = await r.json();
      if (d.success) setHistoricalData(d.data);
    } catch {}
  }, [timeRange]);

  const handleNodeClick = (node) => {
    setSelectedNode(node);
    setView("detail");
    fetchHistory(node.nodeId);
    socketRef.current?.emit("subscribe", node.nodeId);
  };

  const handleBack = () => {
    socketRef.current?.emit("unsubscribe", selectedNode?.nodeId);
    setSelectedNode(null);
    setView("overview");
    setHistoricalData([]);
  };

  const sendCommand = async (nodeId, command, data = {}) => {
    try {
      const r = await fetch(`${API_URL}/api/command/${nodeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, data }),
      });
      const res = await r.json();
      alert(res.success ? `✅ "${command}" sent` : `❌ ${res.error}`);
    } catch { alert("Error sending command"); }
  };

  /* Derived */
  const selLive = selectedNode ? liveData[selectedNode.nodeId] : null;
  const selDb   = selLive?.payload?.db ?? selLive?.payload?.noise ?? 0;
  const totalRec = Object.values(metrics).reduce((s, m) => s + parseInt(m?.totalRecords || 0), 0);
  const anyAlert = Object.values(liveData).some(
    d => (d?.payload?.db ?? d?.payload?.noise ?? 0) > THRESHOLD_DEFAULT
  );
  const chartData = historicalData.map(item => ({
    time: new Date(item.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    ...item.payload,
  }));

  /* ── JSX ── */
  return (
    <>
      {/* ══════════════════ GLOBAL STYLES ══════════════════ */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;500;600;700&family=Syne:wght@700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:       #070b14;
          --s1:       #0c1220;
          --s2:       #111827;
          --s3:       #1a2236;
          --b1:       #1e2d47;
          --b2:       #253352;
          --acc:      #06b6d4;   /* cyan */
          --acc2:     #0891b2;
          --red:      #ef4444;
          --green:    #22c55e;
          --yellow:   #facc15;
          --orange:   #f97316;
          --txt:      #e2e8f0;
          --muted:    #64748b;
          --mono:     'Share Tech Mono', monospace;
          --head:     'Syne', sans-serif;
          --body:     'Rajdhani', sans-serif;
        }

        body { background: var(--bg); color: var(--txt); font-family: var(--body); font-size: 15px; }
        button { cursor: pointer; font-family: var(--body); }

        /* ── App shell ── */
        .app { min-height: 100vh; display: flex; flex-direction: column; }

        /* ── Header ── */
        .hdr {
          height: 60px;
          background: var(--s1);
          border-bottom: 1px solid var(--b1);
          display: flex; align-items: center;
          padding: 0 2rem; gap: 1rem;
          position: sticky; top: 0; z-index: 50;
        }
        .hdr__logo {
          height: 32px; border-radius: 5px;
          background: #fff; padding: 2px 8px; object-fit: contain;
        }
        .hdr__title {
          font-family: var(--head); font-size: 1rem;
          font-weight: 800; letter-spacing: .08em;
          background: linear-gradient(90deg, var(--acc), #67e8f9);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .hdr__spacer { flex: 1; }
        .hdr__pill {
          display: flex; align-items: center; gap: 6px;
          background: var(--s2); border: 1px solid var(--b1);
          border-radius: 20px; padding: 4px 12px;
          font-family: var(--mono); font-size: .72rem; color: var(--green);
        }
        .pulse {
          width: 7px; height: 7px; border-radius: 50%; background: var(--green);
          animation: pulse 1.6s infinite;
        }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.5)} }

        /* ── Main ── */
        .main { flex: 1; padding: 2rem; max-width: 1440px; margin: 0 auto; width: 100%; }

        /* ── Alert banner ── */
        .alert-banner {
          background: rgba(239,68,68,.08);
          border: 1px solid rgba(239,68,68,.35);
          border-radius: 10px; padding: .7rem 1.2rem;
          display: flex; align-items: center; gap: .8rem;
          margin-bottom: 1.5rem; color: var(--red);
          font-weight: 600; font-size: .88rem;
          animation: alertFade 1.2s infinite;
        }
        @keyframes alertFade { 0%,100%{background:rgba(239,68,68,.08)} 50%{background:rgba(239,68,68,.15)} }
        .alert-banner__spacer { flex: 1; }
        .mute-btn {
          background: none; border: 1px solid rgba(239,68,68,.4);
          color: var(--red); border-radius: 7px;
          padding: 4px 10px; font-size: .75rem;
          display: flex; align-items: center; gap: 5px;
          transition: background .15s;
        }
        .mute-btn:hover { background: rgba(239,68,68,.12); }

        /* ── Page heading ── */
        .pg-head { margin-bottom: 1.8rem; }
        .pg-head h1 {
          font-family: var(--head); font-size: 2.6rem; font-weight: 800;
          line-height: 1; letter-spacing: -.02em;
        }
        .pg-head h1 span { color: var(--acc); }
        .pg-head p { color: var(--muted); margin-top: .3rem; font-size: .9rem; }

        /* ── Stat cards ── */
        .stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 1rem; margin-bottom: 2rem; }
        .sc {
          background: var(--s1); border: 1px solid var(--b1);
          border-radius: 16px; padding: 1.4rem 1.6rem;
          position: relative; overflow: hidden;
          transition: border-color .2s, transform .2s;
        }
        .sc:hover { border-color: var(--acc); transform: translateY(-2px); }
        .sc__icon { margin-bottom: .5rem; opacity: .8; }
        .sc__val { font-family: var(--mono); font-size: 2.2rem; font-weight: 700; }
        .sc__label { color: var(--muted); font-size: .75rem; text-transform: uppercase; letter-spacing: .1em; margin-top: .2rem; }
        .sc__sub { font-size: .75rem; color: var(--muted); margin-top: .4rem; }

        /* ── Section label ── */
        .section-lbl {
          font-size: .72rem; text-transform: uppercase; letter-spacing: .12em;
          color: var(--muted); margin-bottom: 1rem; display: flex; align-items: center; gap: 8px;
        }
        .section-lbl::after { content:''; flex:1; height:1px; background: var(--b1); }

        /* ── Node grid ── */
        .nodes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }

        /* ── Node card ── */
        .nc {
          background: var(--s1); border: 1px solid var(--b1);
          border-radius: 16px; padding: 1.1rem 1.2rem;
          text-align: left; color: var(--txt);
          display: flex; flex-direction: column; gap: .6rem;
          transition: border-color .2s, transform .2s, box-shadow .2s;
        }
        .nc:hover {
          border-color: var(--acc); transform: translateY(-3px);
          box-shadow: 0 8px 28px rgba(6,182,212,.12);
        }
        .nc--alert { border-color: rgba(239,68,68,.5); animation: alertFade 1s infinite; }
        .nc__top { display: flex; justify-content: space-between; align-items: center; }
        .nc__id { font-family: var(--mono); font-size: .72rem; color: var(--muted); display: flex; align-items: center; gap: 5px; }
        .nc__dot { width: 8px; height: 8px; border-radius: 50%; }
        .nc__dot--on  { background: var(--green); box-shadow: 0 0 6px var(--green); }
        .nc__dot--off { background: var(--muted); }
        .nc__arc { display: flex; justify-content: center; }
        .nc__label { font-size: .8rem; font-weight: 600; text-align: center; }
        .nc__records { font-family: var(--mono); font-size: .68rem; color: var(--muted); display: flex; align-items: center; gap: 4px; }

        /* ── Empty state ── */
        .empty {
          background: var(--s1); border: 1px dashed var(--b1);
          border-radius: 20px; padding: 4rem; text-align: center; color: var(--muted);
        }
        .empty h3 { font-size: 1.1rem; margin: 1rem 0 .4rem; color: var(--txt); }

        /* ── DETAIL VIEW ── */
        .detail-grid {
          display: grid;
          grid-template-columns: 420px 1fr;
          gap: 2rem; align-items: start;
        }

        /* ── Digital twin container ── */
        .dt-outer {
          display: flex; flex-direction: column; align-items: center; gap: 1.2rem;
        }
        .dt-disc {
          width: 360px; height: 360px; border-radius: 50%;
          background: radial-gradient(circle at 36% 34%, #f5f3ef 0%, #e8e5e0 60%, #d8d4cd 100%);
          border: 7px solid #ccc9c2;
          position: relative;
          box-shadow:
            inset 0 6px 16px rgba(255,255,255,.85),
            inset 0 -4px 12px rgba(0,0,0,.07),
            0 10px 50px rgba(0,0,0,.35),
            0 2px 0 rgba(255,255,255,.4);
          transition: border-color .3s, box-shadow .3s;
        }
        .dt-disc--alert {
          border-color: #c0392b;
          box-shadow:
            inset 0 6px 16px rgba(255,255,255,.85),
            inset 0 -4px 12px rgba(0,0,0,.07),
            0 0 0 4px rgba(192,57,43,.25),
            0 10px 50px rgba(192,57,43,.3);
        }
        .dt-bracket {
          position: absolute; top: 6px;
          width: 30px; height: 13px;
          background: #aaa9a2; border: 2px solid #8a8980;
          border-radius: 3px 3px 0 0;
        }
        .dt-bracket--l { left: 96px; }
        .dt-bracket--r { right: 96px; }

        /* LCD screen */
        .dt-lcd {
          position: absolute;
          top: 50%; left: 36%;
          transform: translate(-50%,-50%);
          width: 108px; height: 162px;
          background: linear-gradient(170deg, #c8ede0 0%, #a8dcc8 100%);
          border: 3px solid #2a8a72; border-radius: 6px;
          display: flex; flex-direction: column;
          padding: 6px; gap: 4px;
          box-shadow: inset 0 2px 8px rgba(0,0,0,.18), 0 3px 10px rgba(42,138,114,.35);
        }
        .dt-lcd__header {
          font-family: var(--mono); font-size: 7px; color: #0a4a38;
          text-align: center; letter-spacing: .05em;
          border-bottom: 1px solid rgba(10,74,56,.25);
          padding-bottom: 3px;
        }
        .dt-lcd__chips { display: flex; gap: 3px; }
        .dt-chip { flex:1; border-radius: 3px; padding: 2px 1px; text-align: center; }
        .dt-chip__lbl { display: block; font-family: var(--mono); font-size: 6px; font-weight: 700; }
        .dt-chip__val { display: block; font-family: var(--mono); font-size: 9px; font-weight: 700; }
        .dt-chip--blue { background: rgba(59,130,246,.2); color: #1e40af; }
        .dt-chip--red  { background: rgba(239,68,68,.2);  color: #991b1b; }
        .dt-chip--teal { background: rgba(20,184,166,.2); color: #0f766e; }
        .dt-lcd__gauge { display: flex; justify-content: center; align-items: center; flex:1; }
        .dt-lcd__status {
          font-family: var(--mono); font-size: 7px; color: #16a34a;
          text-align: center; border-top: 1px solid rgba(10,74,56,.25); padding-top: 2px;
        }
        .dt-lcd__status--alert { color: #dc2626; }
        .dt-lcd__thr { font-family: var(--mono); font-size: 6.5px; color: #0a4a38; text-align: center; }

        /* No-noise icon */
        .dt-icon {
          position: absolute; top: 50%; right: 52px;
          transform: translateY(-50%);
          width: 84px; height: 84px;
        }

        /* LED */
        .dt-led {
          position: absolute; width: 10px; height: 10px; border-radius: 50%;
          right: 50px; top: calc(50% + 44px);
        }
        .dt-led--on  { background: #2196F3; box-shadow: 0 0 7px rgba(33,150,243,.9); animation: ledPulse 2s infinite; }
        .dt-led--off { background: #555; }
        .dt-led--alert { background: #ef4444; box-shadow: 0 0 8px rgba(239,68,68,1); animation: alertLed .5s infinite; }
        @keyframes ledPulse  { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes alertLed  { 0%,100%{opacity:1} 50%{opacity:.15} }

        /* Footer text */
        .dt-footer {
          position: absolute; bottom: 26px; left: 50%;
          transform: translateX(-50%);
          font-family: var(--body); font-size: 14px; font-weight: 700;
          color: #c0392b; white-space: nowrap; letter-spacing: .03em;
        }

        /* Wave bars */
        .dt-waves { display: flex; gap: 5px; align-items: center; height: 48px; }
        .dt-wave-bar {
          width: 6px; border-radius: 3px;
          transition: height .2s ease;
          animation: waveAnim .7s infinite alternate;
        }
        @keyframes waveAnim { from{transform:scaleY(.8)} to{transform:scaleY(1.2)} }

        /* Live badge */
        .dt-badge {
          font-family: var(--mono); font-size: .9rem; font-weight: 700;
          border: 2px solid; border-radius: 8px;
          padding: 4px 14px; letter-spacing: .05em;
          transition: color .3s, border-color .3s;
        }

        /* ── Panel ── */
        .panel {
          background: var(--s1); border: 1px solid var(--b1);
          border-radius: 16px; padding: 1.4rem;
          margin-bottom: 1.2rem;
        }
        .panel__title {
          font-size: .72rem; text-transform: uppercase; letter-spacing: .12em;
          color: var(--muted); margin-bottom: 1rem;
        }

        /* ── Live metrics ── */
        .live-metrics { display: grid; grid-template-columns: repeat(3,1fr); gap: .8rem; }
        .lm-box {
          background: var(--s2); border: 1px solid var(--b1);
          border-radius: 12px; padding: 1rem; text-align: center;
        }
        .lm-val { font-family: var(--mono); font-size: 1.7rem; font-weight: 700; }
        .lm-lbl { font-size: .7rem; color: var(--muted); margin-top: 2px; }

        /* ── Time range buttons ── */
        .time-sel { display: flex; gap: .5rem; }
        .time-btn {
          background: var(--s2); border: 1px solid var(--b1);
          color: var(--muted); padding: 4px 13px;
          border-radius: 20px; font-size: .75rem;
          font-family: var(--mono); transition: all .15s;
        }
        .time-btn.active, .time-btn:hover {
          background: var(--acc); border-color: var(--acc); color: #000;
        }

        /* ── Command buttons ── */
        .cmd-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: .8rem; }
        .cmd-btn {
          background: var(--s2); border: 1px solid var(--b1);
          color: var(--txt); border-radius: 12px;
          padding: .8rem 1rem; font-size: .85rem; font-weight: 600;
          display: flex; align-items: center; gap: .6rem;
          transition: all .15s;
        }
        .cmd-btn:hover { border-color: var(--acc); color: var(--acc); transform: translateY(-1px); }
        .cmd-btn--danger:hover { border-color: var(--red); color: var(--red); }

        /* ── Chart tooltip ── */
        .ctt {
          background: var(--s1); border: 1px solid var(--b1);
          border-radius: 8px; padding: 8px 12px;
          font-family: var(--mono); font-size: .75rem;
        }
        .ctt__time { color: var(--muted); margin-bottom: 4px; font-size: .65rem; }

        /* ── Back button ── */
        .back-btn {
          display: flex; align-items: center; gap: 6px;
          background: var(--s1); border: 1px solid var(--b1);
          color: var(--txt); border-radius: 10px;
          padding: 8px 16px; font-size: .85rem; font-weight: 600;
          transition: all .15s; margin-bottom: 1.5rem;
        }
        .back-btn:hover { border-color: var(--acc); color: var(--acc); }

        /* ── Footer ── */
        .footer {
          border-top: 1px solid var(--b1); text-align: center;
          padding: 1rem; font-size: .78rem; color: var(--muted);
          font-family: var(--mono);
        }
        .footer b { color: var(--txt); }

        /* ── Responsive ── */
        @media (max-width: 960px) {
          .detail-grid { grid-template-columns: 1fr; }
          .stats { grid-template-columns: repeat(2,1fr); }
          .live-metrics { grid-template-columns: repeat(2,1fr); }
          .dt-disc { width: 300px; height: 300px; }
          .dt-lcd  { width: 90px; height: 136px; }
          .dt-icon { width: 70px; height: 70px; right: 38px; }
        }
      `}</style>

      <div className="app">
        {/* ── HEADER ── */}
        <header className="hdr">
          <img
            src="https://tse4.mm.bing.net/th/id/OIP.ToLkwjrNOCJd86BTPeSumwHaBP?pid=Api&P=0&h=180"
            alt="GSFC University" className="hdr__logo"
          />
          <span className="hdr__title">SILENCE GUARD · CAMPUS SYSTEM</span>
          <div className="hdr__spacer" />
          {nodes.length > 0 && (
            <div className="hdr__pill">
              <div className="pulse" />
              {nodes.length} NODE{nodes.length !== 1 ? "S" : ""} LIVE
            </div>
          )}
        </header>

        <main className="main">
          {/* Alert banner */}
          {anyAlert && !alertMuted && (
            <div className="alert-banner">
              <Bell size={15} />
              ⚠ Noise threshold exceeded on one or more devices!
              <div className="alert-banner__spacer" />
              <button className="mute-btn" onClick={() => setAlertMuted(true)}>
                <BellOff size={12} /> Mute
              </button>
            </div>
          )}

          {view === "overview" ? (
            <>
              {/* ── PAGE HEADING ── */}
              <div className="pg-head">
                <h1>IoT <span>Dashboard</span></h1>
                <p>Real-time noise monitoring across GSFC University campus</p>
              </div>

              {/* ── STATS ── */}
              <div className="stats">
                <StatCard label="Connected Nodes"  value={nodes.length}               color="#06b6d4" icon={Wifi}      />
                <StatCard label="Active Streams"   value={Object.keys(liveData).length} color="#22c55e" icon={Activity}  />
                <StatCard label="Total Records"    value={totalRec.toLocaleString()}  color="#a78bfa" icon={Database}  />
              </div>

              {/* ── DEVICES ── */}
              <div className="section-lbl">Connected Devices</div>

              {nodes.length === 0 ? (
                <div className="empty">
                  <WifiOff size={52} style={{ opacity: .25, margin: "0 auto" }} />
                  <h3>No devices connected</h3>
                  <p>Waiting for IoT nodes to come online…</p>
                </div>
              ) : (
                <div className="nodes-grid">
                  {nodes.map(node => (
                    <NodeCard key={node.nodeId}
                      node={node} liveData={liveData}
                      metrics={metrics} onClick={handleNodeClick}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            /* ── DETAIL VIEW ── */
            <>
              <button className="back-btn" onClick={handleBack}>
                <ChevronLeft size={16} /> Back to Overview
              </button>

              <div className="pg-head">
                <h1><span>{selectedNode?.nodeId}</span></h1>
                <p>Live readings · Digital twin · Device controls</p>
              </div>

              <div className="detail-grid">
                {/* LEFT — Digital Twin */}
                <div className="panel" style={{ textAlign: "center" }}>
                  <div className="panel__title">Digital Twin</div>
                  <DigitalTwin
                    db={selDb}
                    threshold={THRESHOLD_DEFAULT}
                    isOnline={selectedNode?.connected ?? false}
                    alertActive={selDb > THRESHOLD_DEFAULT}
                    tick={tick}
                  />
                </div>

                {/* RIGHT */}
                <div>
                  {/* Live readings */}
                  <div className="panel">
                    <div className="panel__title">Live Readings</div>
                    <div className="live-metrics">
                      <div className="lm-box">
                        <div className="lm-val" style={{
                          color: selDb < 40 ? "#22c55e" : selDb < 50 ? "#facc15" : "#ef4444"
                        }}>
                          {selDb > 0 ? Math.round(selDb) : "--"}
                        </div>
                        <div className="lm-lbl">dB SPL (Live)</div>
                      </div>
                      <div className="lm-box">
                        <div className="lm-val" style={{ color: "#06b6d4" }}>{THRESHOLD_DEFAULT}</div>
                        <div className="lm-lbl">Threshold (dB)</div>
                      </div>
                      <div className="lm-box">
                        <div className="lm-val" style={{ color: "#a78bfa" }}>
                          {metrics[selectedNode?.nodeId]?.totalRecords?.toLocaleString() ?? "--"}
                        </div>
                        <div className="lm-lbl">Total Records</div>
                      </div>
                    </div>
                  </div>

                  {/* Historical chart */}
                  <div className="panel">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                      <div className="panel__title" style={{ margin: 0 }}>Historical Data</div>
                      <div className="time-sel">
                        {["1h", "6h", "24h", "7d"].map(r => (
                          <button key={r}
                            className={`time-btn ${timeRange === r ? "active" : ""}`}
                            onClick={() => { setTimeRange(r); fetchHistory(selectedNode.nodeId, r); }}>
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="gDb" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#06b6d4" stopOpacity={.3} />
                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}  />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e2d47" />
                        <XAxis dataKey="time" tick={{ fill: "#64748b", fontSize: 10, fontFamily: "'Share Tech Mono'" }} />
                        <YAxis tick={{ fill: "#64748b", fontSize: 10, fontFamily: "'Share Tech Mono'" }} domain={[0, 100]} />
                        <Tooltip content={<CustomTooltip />} />
                        <ReferenceLine y={THRESHOLD_DEFAULT} stroke="#ef4444" strokeDasharray="4 4"
                          label={{ value: `${THRESHOLD_DEFAULT} dB`, fill: "#ef4444", fontSize: 10 }} />
                        <Area type="monotone" dataKey="db"    stroke="#06b6d4" fill="url(#gDb)" strokeWidth={2} dot={false} />
                        <Area type="monotone" dataKey="noise" stroke="#0891b2" fill="url(#gDb)" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Commands */}
                  <div className="panel">
                    <div className="panel__title">Device Controls</div>
                    <div className="cmd-grid">
                      <button className="cmd-btn" onClick={() => sendCommand(selectedNode.nodeId, "ping")}>
                        <Zap size={15} /> Ping Device
                      </button>
                      <button className="cmd-btn" onClick={() => sendCommand(selectedNode.nodeId, "reboot")}>
                        <RefreshCw size={15} /> Reboot
                      </button>
                      <button className="cmd-btn" onClick={() => sendCommand(selectedNode.nodeId, "set_threshold", { value: 50 })}>
                        <Activity size={15} /> Set Threshold 50 dB
                      </button>
                      <button className="cmd-btn cmd-btn--danger" onClick={() => sendCommand(selectedNode.nodeId, "reset")}>
                        <WifiOff size={15} /> Reset Node
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>

        <footer className="footer">
          Developed by <b>Ms. Swati Saxena</b>, <b>Harsh Vaidya</b> &amp; <b>Pratik Rathod</b> · GSFC University
        </footer>
      </div>
    </>
  );
}
>>>>>>> 7c1d6dd (Changing the frontend view)
