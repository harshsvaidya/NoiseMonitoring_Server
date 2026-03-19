import {
	Activity,
	Clock,
	Database,
	Server,
	TrendingUp,
	Wifi,
	WifiOff,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import {
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
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
				<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
					<img src="/Gemini_Generated_Image_1oycc21oycc21oyc.png" alt="Gemini Generated" style={{ width: 100, height: 100, objectFit: 'contain' }} />
									<div>
					<div style={styles.brandName}>SilenceGuard</div>
				</div>
					<img src="/gsfcu-logo.png" alt="GSFCU" style={{ width: 100, height: 100, objectFit: 'contain' }} />
					<img src="/guiitar.jpg" alt="Guiitar" style={{ width: 100, height: 100, objectFit: 'contain' }} />
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