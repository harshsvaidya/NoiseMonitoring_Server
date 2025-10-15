import React, { useState, useEffect, useRef } from "react";
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	Legend,
	ResponsiveContainer,
} from "recharts";
import {
	Activity,
	Wifi,
	WifiOff,
	Database,
	TrendingUp,
	Clock,
	Server,
} from "lucide-react";
import io from "socket.io-client";

const API_URL = "http://localhost";

export default function IoTDashboard() {
	const [socket, setSocket] = useState(null);
	const [nodes, setNodes] = useState([]);
	const [selectedNode, setSelectedNode] = useState(null);
	const [liveData, setLiveData] = useState({});
	const [historicalData, setHistoricalData] = useState([]);
	const [metrics, setMetrics] = useState({});
	const [view, setView] = useState("overview"); // 'overview' or 'detail'
	const [timeRange, setTimeRange] = useState("1h");
	const lastSeqRef = useRef({});

	// Initialize Socket.IO connection
	useEffect(() => {
		const newSocket = io(API_URL);

		newSocket.on("connect", () => {
			console.log("Connected to server");
			newSocket.emit("identify", { type: "client" });
		});

		newSocket.on("nodes:list", (nodesList) => {
			setNodes(nodesList);
		});

		newSocket.on("node:connected", (data) => {
			setNodes((prev) => [
				...prev.filter((n) => n.nodeId !== data.nodeId),
				data,
			]);
		});

		newSocket.on("node:disconnected", (data) => {
			setNodes((prev) => prev.filter((n) => n.nodeId !== data.nodeId));
		});

		newSocket.on("data:live", (reading) => {
			const { nodeId, ts, payload, seq } = reading;

			// Update live data
			setLiveData((prev) => ({
				...prev,
				[nodeId]: { ts, payload, seq },
			}));

			// Check for missing sequences
			if (
				lastSeqRef.current[nodeId] &&
				seq &&
				seq !== lastSeqRef.current[nodeId] + 1
			) {
				console.warn(
					`Missing sequences for ${nodeId}: ${lastSeqRef.current[nodeId]} to ${seq}`,
				);
				fetchMissingData(nodeId, lastSeqRef.current[nodeId]);
			}

			if (seq) lastSeqRef.current[nodeId] = seq;
		});

		setSocket(newSocket);

		return () => newSocket.close();
	}, []);

	// Fetch nodes on mount
	useEffect(() => {
		fetchNodes();
		const interval = setInterval(fetchNodes, 5000);
		return () => clearInterval(interval);
	}, []);

	// Fetch metrics for all nodes
	useEffect(() => {
		const fetchMetrics = async () => {
			for (const node of nodes) {
				try {
					const res = await fetch(`${API_URL}/api/metrics/${node.nodeId}`);
					const data = await res.json();
					if (data.success) {
						setMetrics((prev) => ({ ...prev, [node.nodeId]: data.metrics }));
					}
				} catch (err) {
					console.error("Error fetching metrics:", err);
				}
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
			if (data.success) {
				setNodes(data.nodes);
			}
		} catch (err) {
			console.error("Error fetching nodes:", err);
		}
	};

	const fetchMissingData = async (nodeId, lastSeq) => {
		try {
			const res = await fetch(
				`${API_URL}/api/sync/${nodeId}?lastSeq=${lastSeq}`,
			);
			const data = await res.json();
			if (data.success && data.data.length > 0) {
				console.log(`Fetched ${data.count} missing records for ${nodeId}`);
			}
		} catch (err) {
			console.error("Error fetching missing data:", err);
		}
	};

	const fetchHistoricalData = async (nodeId) => {
		try {
			const now = Date.now();
			const ranges = {
				"1h": 3600000,
				"6h": 21600000,
				"24h": 86400000,
				"7d": 604800000,
			};

			const fromTs = now - ranges[timeRange];
			const res = await fetch(
				`${API_URL}/api/series/${nodeId}?fromTs=${fromTs}&toTs=${now}&limit=1000`,
			);
			const data = await res.json();

			if (data.success) {
				setHistoricalData(data.data);
			}
		} catch (err) {
			console.error("Error fetching historical data:", err);
		}
	};

	const handleNodeClick = (node) => {
		setSelectedNode(node);
		setView("detail");
		fetchHistoricalData(node.nodeId);
		if (socket) {
			socket.emit("subscribe", node.nodeId);
		}
	};

	const handleBackToOverview = () => {
		if (socket && selectedNode) {
			socket.emit("unsubscribe", selectedNode.nodeId);
		}
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
			if (result.success) {
				console.log(`✅ Command ${command} sent successfully`);
				alert(`Command "${command}" sent to ${nodeId}`);
			} else {
				console.error("Command failed:", result.error);
				alert(`Failed to send command: ${result.error}`);
			}
		} catch (err) {
			console.error("Error sending command:", err);
			alert("Error sending command");
		}
	};

	const formatTimestamp = (ts) => {
		return new Date(ts).toLocaleTimeString();
	};

	const getChartData = () => {
		return historicalData.map((item) => ({
			time: formatTimestamp(item.ts),
			...item.payload,
			seq: item.seq,
		}));
	};

	if (view === "detail" && selectedNode) {
		return (
			<div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 min-h-screen text-white">
				<div className="mx-auto max-w-7xl">
					{/* Header */}
					<div className="mb-6">
						<button
							onClick={handleBackToOverview}
							className="bg-slate-700 hover:bg-slate-600 mb-4 px-4 py-2 rounded-lg transition"
						>
							← Back to Overview
						</button>
						<h1 className="flex items-center gap-3 font-bold text-3xl">
							<Server className="w-8 h-8" />
							{selectedNode.nodeId}
						</h1>
					</div>

					{/* Live Stats */}
					<div className="gap-4 grid grid-cols-1 md:grid-cols-3 mb-6">
						<div className="bg-slate-800 p-6 border border-slate-700 rounded-lg">
							<div className="flex justify-between items-center mb-2">
								<span className="text-slate-400">Status</span>
								<Activity className="w-5 h-5 text-green-400" />
							</div>
							<p className="font-bold text-green-400 text-2xl">Live</p>
						</div>

						<div className="bg-slate-800 p-6 border border-slate-700 rounded-lg">
							<div className="flex justify-between items-center mb-2">
								<span className="text-slate-400">Last Update</span>
								<Clock className="w-5 h-5 text-blue-400" />
							</div>
							<p className="font-mono text-lg">
								{liveData[selectedNode.nodeId]
									? formatTimestamp(liveData[selectedNode.nodeId].ts)
									: "N/A"}
							</p>
						</div>

						<div className="bg-slate-800 p-6 border border-slate-700 rounded-lg">
							<div className="flex justify-between items-center mb-2">
								<span className="text-slate-400">Sequence</span>
								<Database className="w-5 h-5 text-purple-400" />
							</div>
							<p className="font-bold text-2xl">
								{liveData[selectedNode.nodeId]?.seq || 0}
							</p>
						</div>
					</div>

					{/* Current Values */}
					{liveData[selectedNode.nodeId] && (
						<div className="bg-slate-800 mb-6 p-6 border border-slate-700 rounded-lg">
							<h2 className="mb-4 font-bold text-xl">Current Values</h2>
							<div className="gap-4 grid grid-cols-2 md:grid-cols-4">
								{Object.entries(liveData[selectedNode.nodeId].payload).map(
									([key, value]) => (
										<div key={key} className="bg-slate-700 p-4 rounded">
											<p className="mb-1 text-slate-400 text-sm">{key}</p>
											<p className="font-bold text-2xl">
												{typeof value === "number" ? value.toFixed(2) : value}
											</p>
										</div>
									),
								)}
							</div>
						</div>
					)}

					{/* Device Controls */}
					<div className="bg-slate-800 mb-6 p-6 border border-slate-700 rounded-lg">
						<h2 className="mb-4 font-bold text-xl">Device Controls</h2>
						<div className="gap-4 grid grid-cols-2 md:grid-cols-4">
							<button
								onClick={() => sendCommand(selectedNode.nodeId, "start")}
								className="bg-green-600 hover:bg-green-700 px-4 py-3 rounded-lg font-medium transition"
							>
								▶️ Start
							</button>
							<button
								onClick={() => sendCommand(selectedNode.nodeId, "stop")}
								className="bg-yellow-600 hover:bg-yellow-700 px-4 py-3 rounded-lg font-medium transition"
							>
								⏸️ Stop
							</button>
							<button
								onClick={() => {
									const threshold = prompt("Enter new threshold value:", "80");
									if (threshold) {
										sendCommand(selectedNode.nodeId, "setThreshold", {
											threshold: parseInt(threshold),
										});
									}
								}}
								className="bg-blue-600 hover:bg-blue-700 px-4 py-3 rounded-lg font-medium transition"
							>
								⚙️ Set Threshold
							</button>
							<button
								onClick={() => {
									if (confirm("Reset device? This will restart the device.")) {
										sendCommand(selectedNode.nodeId, "reset");
									}
								}}
								className="bg-red-600 hover:bg-red-700 px-4 py-3 rounded-lg font-medium transition"
							>
								🔄 Reset
							</button>
						</div>
					</div>

					{/* Time Range Selector */}
					<div className="flex gap-2 mb-4">
						{["1h", "6h", "24h", "7d"].map((range) => (
							<button
								key={range}
								onClick={() => {
									setTimeRange(range);
									fetchHistoricalData(selectedNode.nodeId);
								}}
								className={`px-4 py-2 rounded-lg transition ${
									timeRange === range
										? "bg-blue-600 text-white"
										: "bg-slate-700 hover:bg-slate-600"
								}`}
							>
								{range}
							</button>
						))}
					</div>

					{/* Historical Chart */}
					<div className="bg-slate-800 p-6 border border-slate-700 rounded-lg">
						<h2 className="mb-4 font-bold text-xl">Historical Data</h2>
						{historicalData.length > 0 ? (
							<ResponsiveContainer width="100%" height={400}>
								<LineChart data={getChartData()}>
									<CartesianGrid strokeDasharray="3 3" stroke="#374151" />
									<XAxis dataKey="time" stroke="#9CA3AF" />
									<YAxis stroke="#9CA3AF" />
									<Tooltip
										contentStyle={{
											backgroundColor: "#1F2937",
											border: "1px solid #374151",
											borderRadius: "8px",
										}}
									/>
									<Legend />
									{historicalData.length > 0 &&
										Object.keys(historicalData[0].payload).map((key, idx) => (
											<Line
												key={key}
												type="monotone"
												dataKey={key}
												stroke={
													["#3B82F6", "#10B981", "#F59E0B", "#EF4444"][idx % 4]
												}
												strokeWidth={2}
												dot={false}
											/>
										))}
								</LineChart>
							</ResponsiveContainer>
						) : (
							<div className="py-12 text-slate-400 text-center">
								<TrendingUp className="opacity-50 mx-auto mb-4 w-16 h-16" />
								<p>Loading historical data...</p>
							</div>
						)}
					</div>

					{/* Data Table */}
					<div className="bg-slate-800 mt-6 p-6 border border-slate-700 rounded-lg">
						<h2 className="mb-4 font-bold text-xl">Recent Records</h2>
						<div className="overflow-x-auto">
							<table className="w-full text-left">
								<thead>
									<tr className="border-slate-700 border-b">
										<th className="pb-3 font-medium text-slate-400">
											Sequence
										</th>
										<th className="pb-3 font-medium text-slate-400">
											Timestamp
										</th>
										{historicalData.length > 0 &&
											Object.keys(historicalData[0].payload).map((key) => (
												<th
													key={key}
													className="pb-3 font-medium text-slate-400"
												>
													{key}
												</th>
											))}
									</tr>
								</thead>
								<tbody>
									{historicalData
										.slice(-10)
										.reverse()
										.map((record, idx) => (
											<tr key={idx} className="border-slate-700/50 border-b">
												<td className="py-3 font-mono text-sm">{record.seq}</td>
												<td className="py-3 font-mono text-sm">
													{new Date(record.ts).toLocaleString()}
												</td>
												{Object.values(record.payload).map((value, vidx) => (
													<td key={vidx} className="py-3 font-mono text-sm">
														{typeof value === "number"
															? value.toFixed(2)
															: value}
													</td>
												))}
											</tr>
										))}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			</div>
		);
	}

	// Overview Dashboard
	return (
		<div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 min-h-screen text-white">
			<div className="mx-auto max-w-7xl">
				{/* Header */}
				<div className="mb-8">
					<h1 className="flex items-center gap-3 mb-2 font-bold text-4xl">
						<Activity className="w-10 h-10 text-blue-400" />
						IoT Dashboard
					</h1>
					<p className="text-slate-400">
						Real-time monitoring of connected devices
					</p>
				</div>

				{/* Stats Overview */}
				<div className="gap-6 grid grid-cols-1 md:grid-cols-3 mb-8">
					<div className="bg-gradient-to-br from-blue-600 to-blue-700 shadow-xl p-6 rounded-lg">
						<div className="flex justify-between items-center mb-2">
							<span className="text-blue-100">Connected Nodes</span>
							<Wifi className="w-6 h-6" />
						</div>
						<p className="font-bold text-4xl">{nodes.length}</p>
					</div>

					<div className="bg-gradient-to-br from-green-600 to-green-700 shadow-xl p-6 rounded-lg">
						<div className="flex justify-between items-center mb-2">
							<span className="text-green-100">Active Streams</span>
							<TrendingUp className="w-6 h-6" />
						</div>
						<p className="font-bold text-4xl">{Object.keys(liveData).length}</p>
					</div>

					<div className="bg-gradient-to-br from-purple-600 to-purple-700 shadow-xl p-6 rounded-lg">
						<div className="flex justify-between items-center mb-2">
							<span className="text-purple-100">Total Records</span>
							<Database className="w-6 h-6" />
						</div>
						<p className="font-bold text-4xl">
							{Object.values(metrics)
								.reduce((sum, m) => sum + parseInt(m.totalRecords || 0), 0)
								.toLocaleString()}
						</p>
					</div>
				</div>

				{/* Connected Nodes */}
				<div className="mb-4">
					<h2 className="mb-4 font-bold text-2xl">Connected Devices</h2>
				</div>

				{nodes.length === 0 ? (
					<div className="bg-slate-800 p-12 border border-slate-700 rounded-lg text-center">
						<WifiOff className="mx-auto mb-4 w-16 h-16 text-slate-600" />
						<p className="text-slate-400 text-xl">No devices connected</p>
						<p className="mt-2 text-slate-500">
							Waiting for IoT nodes to connect...
						</p>
					</div>
				) : (
					<div className="gap-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
						{nodes.map((node) => {
							const isLive = liveData[node.nodeId];
							const nodeMetrics = metrics[node.nodeId] || {};

							return (
								<div
									key={node.nodeId}
									onClick={() => handleNodeClick(node)}
									className="group bg-slate-800 p-6 border border-slate-700 hover:border-blue-500 rounded-lg transition cursor-pointer"
								>
									{/* Node Header */}
									<div className="flex justify-between items-center mb-4">
										<h3 className="font-bold group-hover:text-blue-400 text-xl transition">
											{node.nodeId}
										</h3>
										{isLive ? (
											<div className="flex items-center gap-2">
												<div className="bg-green-400 rounded-full w-2 h-2 animate-pulse" />
												<Wifi className="w-5 h-5 text-green-400" />
											</div>
										) : (
											<WifiOff className="w-5 h-5 text-slate-600" />
										)}
									</div>

									{/* Live Data Preview */}
									{isLive && (
										<div className="bg-slate-700 mb-4 p-4 rounded">
											<p className="mb-2 text-slate-400 text-xs">LIVE DATA</p>
											<div className="gap-2 grid grid-cols-2">
												{Object.entries(liveData[node.nodeId].payload)
													.slice(0, 4)
													.map(([key, value]) => (
														<div key={key}>
															<p className="text-slate-400 text-xs">{key}</p>
															<p className="font-mono font-bold text-sm">
																{typeof value === "number"
																	? value.toFixed(2)
																	: value}
															</p>
														</div>
													))}
											</div>
										</div>
									)}

									{/* Metrics */}
									<div className="space-y-2 text-sm">
										<div className="flex justify-between">
											<span className="text-slate-400">Total Records:</span>
											<span className="font-mono font-bold">
												{parseInt(
													nodeMetrics.totalRecords || 0,
												).toLocaleString()}
											</span>
										</div>
										<div className="flex justify-between">
											<span className="text-slate-400">Last Update:</span>
											<span className="font-mono text-xs">
												{isLive
													? formatTimestamp(liveData[node.nodeId].ts)
													: "N/A"}
											</span>
										</div>
										<div className="flex justify-between">
											<span className="text-slate-400">Sequence:</span>
											<span className="font-mono font-bold">
												{liveData[node.nodeId]?.seq || 0}
											</span>
										</div>
									</div>

									{/* View Details Button */}
									<button className="bg-blue-600 hover:bg-blue-700 mt-4 py-2 rounded-lg w-full font-medium transition">
										View Details →
									</button>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
