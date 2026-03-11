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
			<div className="min-h-screen w-full bg-white text-gray-800">

				<Header />

				<div className="w-full px-10 py-8">

					{/* TITLE */}
					<div className="mb-10">
						<h1 className="text-5xl font-bold mb-2">
							IoT Dashboard
						</h1>

						<p className="text-gray-500 text-lg">
							Real-time monitoring of connected devices
						</p>
					</div>

					{/* STATS */}
					<div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-8 mb-10">
						...
					</div>

				</div>

			</div>
		);
	}
	function Header() {
		return (
			<header className="w-full bg-orange-500 shadow-md">
				<div className="max-w-7xl mx-auto flex items-center gap-4 px-6 h-16">

					{/* Logo */}
					<img
						src="https://tse4.mm.bing.net/th/id/OIP.ToLkwjrNOCJd86BTPeSumwHaBP?pid=Api&P=0&h=180"
						alt="GSFC University"
						className="h-10 object-contain bg-white rounded px-2 py-1"
					/>

					{/* Title */}
					<h1 className="text-white text-xl font-semibold tracking-wide">
						Digital Campus System
					</h1>

				</div>
			</header>
		);
	}

	// Overview Dashboard
		return (
			<div className="flex flex-col min-h-screen bg-white text-gray-800">

				{/* HEADER */}
				<div className="bg-orange-500 w-full shadow-md">
					<div className="flex items-center gap-4 px-6 h-16">

						<h1 className="text-white text-2xl font-semibold">
							Digital Campus System
						</h1>

					</div>
				</div>


				{/* MAIN CONTENT */}
				<div className="flex-1 w-full px-10 py-8">

					{/* TITLE */}
					<div className="mb-10">
						<h1 className="text-5xl font-bold mb-2">
							IoT Dashboard
						</h1>

						<p className="text-gray-500 text-lg">
							Real-time monitoring of connected devices
						</p>
					</div>


					{/* STATS */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">

						<div className="bg-white border border-gray-200 shadow-sm rounded-lg p-6">
							<div className="flex justify-between items-center mb-2">
								<span className="text-gray-500">Connected Nodes</span>
								<Wifi className="text-blue-500 w-6 h-6" />
							</div>
							<p className="text-4xl font-bold">{nodes.length}</p>
						</div>

						<div className="bg-white border border-gray-200 shadow-sm rounded-lg p-6">
							<div className="flex justify-between items-center mb-2">
								<span className="text-gray-500">Active Streams</span>
								<TrendingUp className="text-green-500 w-6 h-6" />
							</div>
							<p className="text-4xl font-bold">{Object.keys(liveData).length}</p>
						</div>

						<div className="bg-white border border-gray-200 shadow-sm rounded-lg p-6">
							<div className="flex justify-between items-center mb-2">
								<span className="text-gray-500">Total Records</span>
								<Database className="text-purple-500 w-6 h-6" />
							</div>

							<p className="text-4xl font-bold">
								{Object.values(metrics)
									.reduce((sum, m) => sum + parseInt(m.totalRecords || 0), 0)
									.toLocaleString()}
							</p>
						</div>

					</div>


					{/* DEVICES */}
					<h2 className="text-2xl font-bold mb-6">
						Connected Devices
					</h2>


					{nodes.length === 0 ? (
						<div className="bg-gray-50 border border-gray-200 rounded-lg shadow-sm p-16 text-center">

							<WifiOff className="mx-auto mb-4 w-16 h-16 text-gray-400" />

							<p className="text-xl text-gray-500">
								No devices connected
							</p>

							<p className="text-gray-400 mt-2">
								Waiting for IoT nodes to connect...
							</p>

						</div>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
							{/* device cards here */}
						</div>
					)}

				</div>


				{/* BACK BUTTON */}
				<div className="flex justify-center pb-6">
					<button
						className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-medium shadow-md transition"
						onClick={() => window.location.href = "https://dcs.gsfcuniversity.ac.in"}
					>
						Back to DCS
					</button>
				</div>


				{/* FOOTER */}
				<footer className="w-full bg-gray-100 border-t text-center py-4 text-gray-600">
					Developed by <b><a></a>Ms. Swati Saxena</b>, <b>Harsh Vaidya</b> & <b>Pratik Rathod</b>
				</footer>

			</div>
		);
}
