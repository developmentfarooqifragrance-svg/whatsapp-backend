require('dotenv').config();
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const apiRoutes = require('./src/routes/api');
const whatsappService = require('./src/services/whatsapp');

const app = express();
const PORT = process.env.PORT || 3000;
const startTime = Date.now();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Webhook-Signature', 'Accept', 'Bypass-Tunnel-Reminder'],
    credentials: false
}));

// Handle preflight OPTIONS requests for all routes
app.options('*', cors());

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Helper to format uptime
function formatUptime(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    return parts.join(' ');
}

// Health Check for Render & Uptime Monitors
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'Qloudflow WhatsApp Gateway',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        whatsapp: whatsappService.getStatus()
    });
});

// Public Live Status API (used by frontend dashboard)
app.get('/public/status', async (req, res) => {
    const waStatus = whatsappService.getStatus();
    const uptimeMs = Date.now() - startTime;
    let qrDataUrl = null;
    const qrText = whatsappService.getQr();

    if (qrText) {
        try {
            qrDataUrl = await qrcode.toDataURL(qrText, {
                margin: 2,
                scale: 7,
                color: { dark: '#0f172a', light: '#ffffff' }
            });
        } catch (e) {}
    }

    res.json({
        success: true,
        ...waStatus,
        qr: qrDataUrl,
        uptime: formatUptime(uptimeMs),
        memory: process.memoryUsage()
    });
});

// Public Phone Number Pairing Code API
app.post('/public/pairing-code', async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }
    try {
        const code = await whatsappService.requestPairingCode(phone);
        res.json({ success: true, code, phone });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Failed to request pairing code.' });
    }
});

// Public Reconnect / Force QR generation
app.post('/public/reconnect', async (req, res) => {
    try {
        await whatsappService.connect(true);
        res.json({ success: true, message: 'Reconnection initiated.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Root Landing & Real-time Live Pairing Dashboard
app.get('/', async (req, res) => {
    const waStatus = whatsappService.getStatus();
    const uptimeMs = Date.now() - startTime;
    const memory = process.memoryUsage();
    const rssMB = (memory.rss / 1024 / 1024).toFixed(1);
    const heapMB = (memory.heapUsed / 1024 / 1024).toFixed(1);

    // If API client requests JSON
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.json({
            success: true,
            service: 'Qloudflow WhatsApp Automation API Gateway',
            status: 'operational',
            uptime: formatUptime(uptimeMs),
            whatsapp: waStatus,
            node: process.version,
            memory: { rss: `${rssMB} MB`, heap: `${heapMB} MB` }
        });
    }

    // Generate QR Data URL if pairing is needed
    let qrDataUrl = null;
    const qrText = whatsappService.getQr();
    if (qrText) {
        try {
            qrDataUrl = await qrcode.toDataURL(qrText, {
                margin: 2,
                scale: 7,
                color: { dark: '#0f172a', light: '#ffffff' }
            });
        } catch (e) {}
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Qloudflow WhatsApp Gateway • Service Operational</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        :root {
            --bg: #0b0f19;
            --card: rgba(17, 24, 39, 0.90);
            --border: rgba(255, 255, 255, 0.08);
            --primary: #6366f1;
            --accent: #06b6d4;
            --emerald: #10b981;
            --amber: #f59e0b;
            --text: #f3f4f6;
            --muted: #9ca3af;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background-color: var(--bg);
            background-image: 
                radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.16) 0px, transparent 50%),
                radial-gradient(at 100% 100%, rgba(6, 182, 212, 0.14) 0px, transparent 50%);
            color: var(--text);
            font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px 16px;
        }
        .container {
            width: 100%;
            max-width: 720px;
            background: var(--card);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border: 1px solid var(--border);
            border-radius: 28px;
            padding: 36px;
            box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.06);
        }
        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid var(--border);
            padding-bottom: 24px;
            margin-bottom: 28px;
            flex-wrap: wrap;
            gap: 16px;
        }
        .brand {
            display: flex;
            align-items: center;
            gap: 16px;
        }
        .logo-icon {
            width: 52px;
            height: 52px;
            border-radius: 16px;
            background: linear-gradient(135deg, #10b981, #06b6d4);
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 12px 24px -6px rgba(16, 185, 129, 0.4);
            font-size: 26px;
            color: white;
        }
        .title h1 { font-size: 21px; font-weight: 800; letter-spacing: -0.5px; }
        .title p { font-size: 13px; color: var(--muted); margin-top: 2px; }
        .live-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            border-radius: 9999px;
            font-size: 12px;
            font-weight: 700;
            background: rgba(16, 185, 129, 0.12);
            color: #34d399;
            border: 1px solid rgba(16, 185, 129, 0.25);
        }
        .pulse {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #10b981;
            box-shadow: 0 0 12px #10b981;
            animation: pulse-glow 2s infinite;
        }
        @keyframes pulse-glow {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.4); opacity: 0.6; }
        }
        .status-hero {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--border);
            border-radius: 20px;
            padding: 22px 26px;
            margin-bottom: 26px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 16px;
        }
        .wa-status-pill {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 800;
            letter-spacing: 0.5px;
            transition: all 0.3s;
        }
        .pill-connected {
            background: rgba(16, 185, 129, 0.15);
            color: #34d399;
            border: 1px solid rgba(16, 185, 129, 0.35);
        }
        .pill-connecting {
            background: rgba(245, 158, 11, 0.15);
            color: #fbbf24;
            border: 1px solid rgba(245, 158, 11, 0.35);
        }
        .pill-disconnected {
            background: rgba(99, 102, 241, 0.15);
            color: #818cf8;
            border: 1px solid rgba(99, 102, 241, 0.35);
        }

        /* Pairing Hub Card */
        .pairing-hub {
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--border);
            border-radius: 22px;
            padding: 26px;
            margin-bottom: 28px;
        }
        .hub-tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 22px;
            border-bottom: 1px solid var(--border);
            padding-bottom: 12px;
        }
        .tab-btn {
            background: transparent;
            border: none;
            color: var(--muted);
            font-size: 13px;
            font-weight: 700;
            padding: 8px 16px;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .tab-btn.active {
            background: rgba(255, 255, 255, 0.08);
            color: white;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
        .tab-content { display: none; }
        .tab-content.active { display: block; }

        /* QR Scanner Layout */
        .qr-box-wrapper {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 18px;
            text-align: center;
        }
        .qr-frame {
            width: 260px;
            height: 260px;
            background: white;
            padding: 14px;
            border-radius: 20px;
            box-shadow: 0 16px 36px -10px rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        }
        .qr-frame img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            border-radius: 8px;
        }
        .instructions-list {
            text-align: left;
            font-size: 13px;
            color: #d1d5db;
            line-height: 1.7;
            max-width: 440px;
            margin: 0 auto;
        }
        .instructions-list ol { padding-left: 20px; }
        .instructions-list li { margin-bottom: 6px; }

        /* Pairing Code Form */
        .phone-form {
            max-width: 420px;
            margin: 0 auto;
            text-align: center;
        }
        .input-group {
            display: flex;
            gap: 8px;
            margin-top: 14px;
        }
        .phone-input {
            flex: 1;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 12px 16px;
            color: white;
            font-size: 15px;
            font-family: 'JetBrains Mono', monospace;
            outline: none;
            transition: border 0.2s;
        }
        .phone-input:focus { border-color: var(--primary); }
        .submit-btn {
            background: linear-gradient(135deg, #10b981, #06b6d4);
            border: none;
            color: white;
            font-weight: 700;
            padding: 12px 20px;
            border-radius: 12px;
            cursor: pointer;
            transition: opacity 0.2s;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .submit-btn:hover { opacity: 0.9; }
        .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .code-display {
            display: none;
            margin-top: 20px;
            padding: 20px;
            background: rgba(16, 185, 129, 0.1);
            border: 1px solid rgba(16, 185, 129, 0.3);
            border-radius: 16px;
        }
        .code-number {
            font-family: 'JetBrains Mono', monospace;
            font-size: 32px;
            font-weight: 800;
            letter-spacing: 6px;
            color: #34d399;
            margin: 8px 0;
        }

        /* Connected View */
        .connected-view {
            display: none;
            text-align: center;
            padding: 20px 0;
        }
        .success-circle {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            background: rgba(16, 185, 129, 0.15);
            color: #10b981;
            font-size: 34px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 16px;
            border: 2px solid rgba(16, 185, 129, 0.4);
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 14px;
            margin-bottom: 28px;
        }
        .metric-card {
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--border);
            border-radius: 14px;
            padding: 16px;
        }
        .metric-card span { font-size: 11px; color: var(--muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; }
        .metric-card h3 { font-size: 15px; font-weight: 700; margin-top: 6px; font-family: 'JetBrains Mono', monospace; }
        .footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 12px;
            color: var(--muted);
            border-top: 1px solid var(--border);
            padding-top: 20px;
            flex-wrap: wrap;
            gap: 12px;
        }
        .footer a {
            color: #818cf8;
            text-decoration: none;
            font-weight: 600;
            transition: color 0.2s;
        }
        .footer a:hover { color: #a5b4fc; }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="brand">
                <div class="logo-icon">
                    <i class="fa-brands fa-whatsapp"></i>
                </div>
                <div class="title">
                    <h1>Qloudflow WhatsApp Gateway</h1>
                    <p>Baileys v7 Multi-Device Real-Time Automation</p>
                </div>
            </div>
            <div class="live-badge">
                <span class="pulse"></span>
                <span>SERVICE LIVE</span>
            </div>
        </div>

        <!-- Connection Status Hero -->
        <div class="status-hero">
            <div>
                <p style="font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase;">Linked WhatsApp Account</p>
                <h2 id="phoneDisplay" style="font-size: 20px; font-weight: 800; margin-top: 4px; font-family: 'JetBrains Mono', monospace;">
                    ${waStatus.phone ? '+' + waStatus.phone : 'Ready for QR Pairing'}
                </h2>
            </div>
            <div id="statusBadge" class="wa-status-pill ${waStatus.status === 'connected' ? 'pill-connected' : 'pill-connecting'}">
                <span>●</span>
                <span id="statusBadgeText">${waStatus.status === 'connected' ? 'CONNECTED' : 'PAIRING IN PROGRESS'}</span>
            </div>
        </div>

        <!-- Dynamic Pairing Hub -->
        <div class="pairing-hub" id="pairingHub" style="${waStatus.status === 'connected' ? 'display:none;' : 'display:block;'}">
            <div class="hub-tabs">
                <button class="tab-btn active" onclick="switchTab('qrTab', this)">
                    <i class="fa-solid fa-qrcode"></i> Scan QR Code
                </button>
                <button class="tab-btn" onclick="switchTab('phoneTab', this)">
                    <i class="fa-solid fa-mobile-screen-button"></i> Link with Phone Number
                </button>
            </div>

            <!-- Tab 1: QR Code Scanner -->
            <div id="qrTab" class="tab-content active">
                <div class="qr-box-wrapper">
                    <div class="qr-frame">
                        <img id="qrImage" src="${qrDataUrl || ''}" style="${qrDataUrl ? '' : 'display:none;'}" alt="WhatsApp QR Code">
                        <div id="qrLoader" style="${qrDataUrl ? 'display:none;' : 'display:flex; flex-direction:column; align-items:center; gap:10px; color:#64748b; font-size:13px; font-weight:600;'}">
                            <i class="fa-solid fa-circle-notch fa-spin" style="font-size:28px; color:#10b981;"></i>
                            <span>Generating QR Code...</span>
                        </div>
                    </div>
                    <div class="instructions-list">
                        <ol>
                            <li>Open <strong>WhatsApp</strong> on your phone</li>
                            <li>Tap <strong>Settings</strong> or <strong>Menu (⋮)</strong> &rarr; <strong>Linked Devices</strong></li>
                            <li>Tap <strong>Link a device</strong> and point your camera at this QR code</li>
                        </ol>
                    </div>
                    <button class="submit-btn" onclick="triggerReconnect()" style="margin-top: 8px; background: rgba(255,255,255,0.08);">
                        <i class="fa-solid fa-arrows-rotate"></i> Refresh QR Code
                    </button>
                </div>
            </div>

            <!-- Tab 2: Phone Number Pairing Code -->
            <div id="phoneTab" class="tab-content">
                <div class="phone-form">
                    <p style="font-size: 13px; color: #d1d5db; margin-bottom: 12px;">
                        Enter your WhatsApp phone number with country code (e.g. <code>919876543210</code>) to generate an 8-digit linking code.
                    </p>
                    <div class="input-group">
                        <input type="text" id="phoneInput" class="phone-input" placeholder="e.g. 919876543210" maxlength="15">
                        <button id="pairingCodeBtn" class="submit-btn" onclick="requestPairingCode()">
                            <span>Get Code</span>
                        </button>
                    </div>

                    <div id="codeDisplay" class="code-display">
                        <p style="font-size: 12px; color: #6ee7b7; font-weight: 700; text-transform: uppercase;">Your Pairing Code</p>
                        <div class="code-number" id="pairingCodeValue">---- ----</div>
                        <p style="font-size: 12px; color: #9ca3af;">
                            Open WhatsApp &gt; Linked Devices &gt; Link with phone number instead &gt; enter this code.
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Connected Success Banner -->
        <div id="connectedBanner" class="connected-view" style="${waStatus.status === 'connected' ? 'display:block;' : 'display:none;'}">
            <div class="success-circle">
                <i class="fa-solid fa-check"></i>
            </div>
            <h3 style="font-size: 20px; font-weight: 800; color: white;">WhatsApp Device Connected!</h3>
            <p style="font-size: 13px; color: var(--muted); margin-top: 6px; max-width: 440px; margin-left: auto; margin-right: auto;">
                Your WhatsApp automation gateway is online and active. Incoming customer inquiries and lead alerts are now functioning.
            </p>
        </div>

        <!-- Metrics Grid -->
        <div class="grid">
            <div class="metric-card">
                <span>Uptime</span>
                <h3 id="uptimeDisplay">${formatUptime(uptimeMs)}</h3>
            </div>
            <div class="metric-card">
                <span>Node Runtime</span>
                <h3>${process.version}</h3>
            </div>
            <div class="metric-card">
                <span>Memory (RSS)</span>
                <h3>${rssMB} MB</h3>
            </div>
            <div class="metric-card">
                <span>Port</span>
                <h3>${PORT}</h3>
            </div>
        </div>

        <!-- Footer -->
        <div class="footer">
            <span>&copy; ${new Date().getFullYear()} Qloudsoft Solutions &bull; Qloudflow Suite</span>
            <div style="display:flex; gap:16px;">
                <a href="/health" target="_blank">Health Check JSON &rarr;</a>
            </div>
        </div>
    </div>

    <!-- Client-side Polling Script -->
    <script>
        function switchTab(tabId, btn) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        }

        async function requestPairingCode() {
            const input = document.getElementById('phoneInput');
            const btn = document.getElementById('pairingCodeBtn');
            const codeDisplay = document.getElementById('codeDisplay');
            const codeValue = document.getElementById('pairingCodeValue');
            const phone = input.value.trim().replace(/\\D/g, '');

            if (!phone || phone.length < 10) {
                alert('Please enter a valid phone number with country code (e.g. 919876543210)');
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...';

            try {
                const res = await fetch('/public/pairing-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone })
                });
                const data = await res.json();
                if (data.success && data.code) {
                    codeValue.innerText = data.code;
                    codeDisplay.style.display = 'block';
                } else {
                    alert(data.message || 'Failed to get pairing code.');
                }
            } catch (e) {
                alert('Network error while requesting pairing code.');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<span>Get Code</span>';
            }
        }

        async function triggerReconnect() {
            const qrLoader = document.getElementById('qrLoader');
            const qrImage = document.getElementById('qrImage');
            qrImage.style.display = 'none';
            qrLoader.style.display = 'flex';
            try {
                await fetch('/public/reconnect', { method: 'POST' });
                pollStatus();
            } catch (e) {}
        }

        async function pollStatus() {
            try {
                const res = await fetch('/public/status');
                const data = await res.json();

                if (data) {
                    const phoneDisplay = document.getElementById('phoneDisplay');
                    const statusBadge = document.getElementById('statusBadge');
                    const statusBadgeText = document.getElementById('statusBadgeText');
                    const pairingHub = document.getElementById('pairingHub');
                    const connectedBanner = document.getElementById('connectedBanner');
                    const qrImage = document.getElementById('qrImage');
                    const qrLoader = document.getElementById('qrLoader');
                    const uptimeDisplay = document.getElementById('uptimeDisplay');

                    if (uptimeDisplay && data.uptime) {
                        uptimeDisplay.innerText = data.uptime;
                    }

                    if (data.status === 'connected') {
                        phoneDisplay.innerText = data.phone ? '+' + data.phone : 'Connected';
                        statusBadge.className = 'wa-status-pill pill-connected';
                        statusBadgeText.innerText = 'CONNECTED';
                        pairingHub.style.display = 'none';
                        connectedBanner.style.display = 'block';
                    } else {
                        statusBadge.className = 'wa-status-pill pill-connecting';
                        statusBadgeText.innerText = 'PAIRING IN PROGRESS';
                        phoneDisplay.innerText = 'Ready for QR Pairing';
                        pairingHub.style.display = 'block';
                        connectedBanner.style.display = 'none';

                        if (data.qr) {
                            qrImage.src = data.qr;
                            qrImage.style.display = 'block';
                            qrLoader.style.display = 'none';
                        }
                    }
                }
            } catch (e) {}
        }

        // Auto-poll status every 3 seconds
        setInterval(pollStatus, 3000);
    </script>
</body>
</html>`;

    res.send(html);
});

// API Key Middleware (applies only to protected /api routes)
const DEFAULT_API_KEY = 'local-development-key';
app.use('/api', (req, res, next) => {
    const expectedKey = process.env.API_KEY || DEFAULT_API_KEY;
    const apiKey = req.headers['x-api-key'];
    // Allow if apiKey matches expected key, or matches default key, or if neither is set
    if (apiKey === expectedKey || apiKey === DEFAULT_API_KEY || (!process.env.API_KEY && !apiKey)) {
        return next();
    }
    return res.status(401).json({ success: false, message: 'Unauthorized: Invalid API Key' });
});

// API Routes
app.use('/api', apiRoutes);

// Process safety handlers
process.on('uncaughtException', (err) => {
    console.error('[WhatsApp API Server] Caught unhandled exception safely:', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.warn('[WhatsApp API Server] Caught unhandled promise rejection safely:', reason?.message || reason);
});

// Initialize WhatsApp on startup if there is an existing session
whatsappService.connect().catch((err) => {
    console.warn('[WhatsApp API Server] Initial connection notice:', err.message);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`WhatsApp API Server running on port ${PORT} (0.0.0.0)`);
});
