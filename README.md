<p align="center">
  <img src="https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/Vite-7.3-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4.1-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Bun-1.2-FBF0DF?style=for-the-badge&logo=bun&logoColor=black" alt="Bun" />
</p>

<h1 align="center">🖥️ Code Proxy · Admin Dashboard</h1>

<p align="center">
  <strong>The official frontend management panel for <a href="https://github.com/kittors/CliRelay">CliRelay (CLI Proxy API)</a></strong>
</p>

<p align="center">
  <em>Monitor, manage, and configure your CLI proxy channels — all from a modern web UI.</em>
</p>

<p align="center">
  <a href="https://github.com/kittors/codeProxy/stargazers"><img src="https://img.shields.io/github/stars/kittors/codeProxy?style=flat-square&color=f5a623" alt="Stars" /></a>
  <a href="https://github.com/kittors/codeProxy/network/members"><img src="https://img.shields.io/github/forks/kittors/codeProxy?style=flat-square&color=4a90d9" alt="Forks" /></a>
  <a href="https://github.com/kittors/codeProxy/issues"><img src="https://img.shields.io/github/issues/kittors/codeProxy?style=flat-square&color=e74c3c" alt="Issues" /></a>
  <a href="https://github.com/kittors/codeProxy/blob/main/LICENSE"><img src="https://img.shields.io/github/license/kittors/codeProxy?style=flat-square&color=27ae60" alt="License" /></a>
</p>

---

## ✨ Overview

**Code Proxy** is the official web-based admin panel for [**CliRelay**](https://github.com/kittors/CliRelay) — a proxy server that wraps Gemini CLI, Antigravity, ChatGPT Codex, Claude Code, Qwen Code, Kiro, and iFlow as OpenAI/Gemini/Claude compatible API services.

This dashboard provides a complete management interface for your AI proxy infrastructure:

- 📊 **Real-time Dashboard** — KPI cards, health score, system monitoring, channel latency
- 📈 **Advanced Monitoring Center** — Model usage distribution, daily trends, hourly heatmaps with API Key filtering
- 📋 **Request Logs** — Full request history with token counts, latency, status, and clickable error details
- 💬 **Message Viewer** — Beautiful Markdown-rendered input/output content with XML tag collapsible sections
- 🔗 **AI Provider Management** — Multi-tab provider config (Gemini, Claude, Codex, Vertex, OpenAI, Ampcode) with enable/disable toggles
- 🗂️ **Auth File Workspace** — Saved OAuth/auth files with model inspection, prefix/proxy controls, and download actions
- 🧪 **OAuth Workbench** — Provider-specific authorization launcher with remote callback submission
- 🔑 **API Key Management** — Create, edit, delete keys with quota & rate limit controls
- 🔐 **OAuth Login Management** — Manage OAuth authentication credentials
- 📦 **Config Panel** — Visual YAML configuration editor with import/export
- 🎯 **Model Management** — Model alias mapping and routing rules
- 📊 **Quota Management** — Per-key usage quota tracking and limits
- 🔍 **API Key Lookup** — Public self-service page for users to check their own usage statistics and request logs
- 💲 **Model Pricing** — Built-in pricing table for quota cost accounting and per-model cost controls
- ℹ️ **System Info** — Connection info grid, version/build metadata, model listing with colorful vendor icons and click-to-copy
- 🪵 **Live Logs** — Streaming log viewer with search, download, clear, and runtime filter controls
- 🌙 **Dark Mode** — Full dark theme with smooth transitions
- 🌐 **i18n Ready** — Internationalization support (Chinese, English)

## 📸 Screenshots

The gallery below uses the latest 13 management-panel screenshots and maps each screen to its operational role.

| Screen | What it shows |
| :----- | :------------ |
| Dashboard Overview | KPI cards, health score, live system monitor, throughput, resource usage, latency ranking |
| Monitor Center | Request KPIs, model distribution, daily token trends, API Key usage share |
| Request Logs | Multi-filter log table, time range selector, status/channel/model filtering |
| Request Details | Input/output viewer with Markdown rendering and instruction block inspection |
| AI Providers | Multi-provider tabs, per-channel success rate, model tags, enable/edit/delete controls |
| Auth Files | Saved auth file inventory with model inspection, proxy prefix controls, and download |
| OAuth Login | Authorization launcher plus remote callback submission workflow |
| API Keys | Keys, quotas, RPM/TPM, model permissions, channel bindings, quick actions |
| Models | Pricing table for input/output/cache cost accounting |
| Quota | Remaining refresh time and current usage bars for provider-specific quotas |
| Config | YAML source editor with search and runtime mode switching |
| System | API base, management endpoint, version metadata, API Key lookup link, model tags |
| Logs | Live log console with search, download, clear, and toggleable filters |

### 1. Dashboard Overview

<p align="center">
  <img src="docs/images/dashboard-overview.png" width="100%" />
</p>
<p align="center"><em>Dashboard — KPI cards, health score, live system monitor, throughput, storage, and channel latency ranking.</em></p>

### 2. Monitor Center

<p align="center">
  <img src="docs/images/monitor-center-zh.png" width="100%" />
</p>
<p align="center"><em>Monitor Center (Chinese locale) — request summary, model distribution, daily token/request trends, and API Key usage share.</em></p>

### 3. Request Logs

<p align="center">
  <img src="docs/images/request-logs-table.png" width="100%" />
</p>
<p align="center"><em>Request Logs — time-range switcher, multi-filter toolbar, high-density table, and success metrics at a glance.</em></p>

### 4. Request Details Viewer

<p align="center">
  <img src="docs/images/request-details-modal.png" width="100%" />
</p>
<p align="center"><em>Request Details — input/output tabs, Markdown rendering, collapsible sections, and copy/export helpers.</em></p>

### 5. AI Providers

<p align="center">
  <img src="docs/images/providers-codex.png" width="100%" />
</p>
<p align="center"><em>AI Providers — provider tabs, per-channel success/failure stats, model badges, latency bars, and CRUD actions.</em></p>

### 6. Auth Files

<p align="center">
  <img src="docs/images/auth-files-grid.png" width="100%" />
</p>
<p align="center"><em>Auth Files — card-based inventory for saved credentials with model inspection, rename, proxy-prefix, download, and delete actions.</em></p>

### 7. OAuth Login Workbench

<p align="center">
  <img src="docs/images/oauth-login-workbench.png" width="100%" />
</p>
<p align="center"><em>OAuth Login — provider-specific authorization launcher plus remote callback URL submission workflow.</em></p>

### 8. API Keys Management

<p align="center">
  <img src="docs/images/api-keys-management.png" width="100%" />
</p>
<p align="center"><em>API Keys — quotas, RPM/TPM limits, model permissions, channel bindings, and quick analytics/edit actions.</em></p>

### 9. Model Pricing

<p align="center">
  <img src="docs/images/model-pricing.png" width="100%" />
</p>
<p align="center"><em>Models — built-in pricing catalog for input/output/cache cost calculation and quota accounting.</em></p>

### 10. Quota Management

<p align="center">
  <img src="docs/images/quota-management.png" width="100%" />
</p>
<p align="center"><em>Quota — remaining refresh time and progress bars for Codex, Gemini CLI, Kiro, and other provider-specific quotas.</em></p>

### 11. Config Editor

<p align="center">
  <img src="docs/images/config-source-editor.png" width="100%" />
</p>
<p align="center"><em>Config — source editor mode with YAML search, keyboard-friendly navigation, and runtime config switching.</em></p>

### 12. System Info

<p align="center">
  <img src="docs/images/system-info-models.png" width="100%" />
</p>
<p align="center"><em>System — API base, management endpoint, version/build metadata, API Key lookup entry, and vendor-colored model tags.</em></p>

### 13. Live Logs

<p align="center">
  <img src="docs/images/live-logs.png" width="100%" />
</p>
<p align="center"><em>Logs — live stream viewer with keyword search, hide-management toggle, download, clear, and jump-to-latest controls.</em></p>

## 🧩 Feature Details

### 📊 Dashboard

| Module              | Description                                                                            |
| :------------------ | :------------------------------------------------------------------------------------- |
| **KPI Cards**       | Total requests, success rate, token consumption, failed request count (7-day / 30-day) |
| **Health Score**    | Real-time circular gauge (0–100) evaluating overall system health                      |
| **System Monitor**  | WebSocket-powered live stats: uptime, goroutines, CPU, memory, network I/O, DB size    |
| **Channel Latency** | Top 5 channel average latency with visual bar indicators                               |
| **Resource Bars**   | System CPU, memory, service CPU, memory, database size — color-coded status            |

### 📈 Monitor Center

| Module                 | Description                                                                       |
| :--------------------- | :-------------------------------------------------------------------------------- |
| **KPI Summary**        | Total requests, success rate, total/output tokens with time range selection       |
| **Model Distribution** | Interactive donut chart showing Top 10 model usage by request count or token      |
| **Daily Trends**       | Dual-axis chart with input/output tokens (bar) and request count (line) over time |
| **Hourly Heatmap**     | Stacked bar chart showing per-model hourly request distribution (6h / 12h / 24h)  |
| **API Key Filter**     | Filter all metrics by specific API Key prefix                                     |

### 📋 Request Logs

| Module             | Description                                                                                       |
| :----------------- | :------------------------------------------------------------------------------------------------ |
| **Virtual Table**  | High-performance virtual scrolling for 10,000+ log entries                                        |
| **Multi-Filter**   | Filter by Key, model, status (success/fail), with time range selection                            |
| **Token Details**  | Click on input/output tokens to view full message content                                         |
| **Error Modal**    | Click on "失败" (Failed) status to view error details in a red-themed modal                       |
| **Message Viewer** | Markdown rendering with syntax highlighting, XML tag detection, and role-based collapsible blocks |

### 🔗 AI Providers

| Module            | Description                                                                                            |
| :---------------- | :----------------------------------------------------------------------------------------------------- |
| **Multi-Tab**     | Gemini, Claude, Codex, Vertex, OpenAI Compatible, Ampcode tabs                                         |
| **Channel Cards** | Name, masked API key, base URL, model count, success/fail stats, latency bar                           |
| **CRUD**          | Add, edit, delete channels with full configuration (proxyUrl, headers, model aliases, excluded models) |
| **Toggle**        | Enable/disable individual channels with instant visual feedback                                        |

### 🔍 API Key Lookup

| Module           | Description                                                                 |
| :--------------- | :-------------------------------------------------------------------------- |
| **Self-Service** | Public page (no login required) for end users to check their API Key usage  |
| **Usage Stats**  | Per-key KPI cards, model distribution chart, daily trend chart              |
| **Request Logs** | Per-key request history with detailed virtual table and source channel info |

## 🛠️ Tech Stack

| Category             | Technology                                     |
| :------------------- | :--------------------------------------------- |
| **Framework**        | React 19.2 + TypeScript 5.9                    |
| **Build Tool**       | Vite 7.3                                       |
| **Package Manager**  | Bun 1.2                                        |
| **Styling**          | Tailwind CSS v4                                |
| **State Management** | Zustand                                        |
| **Charts**           | Apache ECharts                                 |
| **Routing**          | React Router v7                                |
| **HTTP**             | Axios + WebSocket (real-time monitoring)       |
| **Icons**            | Lucide React + Custom vendor SVGs (14 vendors) |
| **Linting**          | oxlint + oxfmt                                 |

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh/) ≥ 1.2 (or Node.js ≥ 18)
- A running [CliRelay](https://github.com/kittors/CliRelay) backend instance

### Install & Run

```bash
# Clone the repository
git clone https://github.com/kittors/codeProxy.git
cd codeProxy

# Install dependencies
bun install

# Start dev server
bun run dev
```

The dashboard will be available at **http://localhost:5173/**

### Build for Production

```bash
# Type-check & build
bun run build

# Preview production build
bun run preview
```

## 📁 Project Structure

```
src/
├── app/                 # Routing & auth guards
├── assets/icons/        # Vendor SVG icons (Claude, OpenAI, Gemini, etc.)
├── components/ui/       # Inline SVG icon components
├── i18n/                # i18next locales (en, zh-CN)
├── lib/
│   ├── constants/       # App-wide constants
│   └── http/            # Axios client, API layer, WebSocket
├── modules/
│   ├── auth/            # Authentication provider & session
│   ├── apikey-lookup/   # Public API Key usage lookup
│   ├── config/          # Visual config editor (YAML)
│   ├── dashboard/       # Dashboard overview + system monitor
│   ├── login/           # Login page
│   ├── monitor/         # Monitoring center (charts, logs, modals)
│   ├── oauth/           # OAuth management
│   ├── providers/       # AI provider channel management
│   ├── system/          # System info + model listing
│   ├── ui/              # Shared UI (AppShell, Button, Table, Tabs, etc.)
│   └── usage/           # Usage statistics & snapshot import/export
└── styles/              # Global styles & theme tokens
```

## 🔌 API Integration

This dashboard communicates with the CliRelay backend via the Management API:

| Endpoint                                  | Method            | Description                         |
| :---------------------------------------- | :---------------- | :---------------------------------- |
| `/v0/management/config`                   | `GET`             | Verify login & fetch configuration  |
| `/v0/management/usage`                    | `GET`             | Retrieve usage statistics           |
| `/v0/management/usage/logs`               | `GET`             | Paginated request log history       |
| `/v0/management/usage/log-content`        | `GET`             | Full message content (input/output) |
| `/v0/management/usage/dashboard-summary`  | `GET`             | Dashboard KPI data                  |
| `/v0/management/usage/model-distribution` | `GET`             | Model usage distribution            |
| `/v0/management/usage/daily-trends`       | `GET`             | Daily token/request trends          |
| `/v0/management/usage/hourly-model`       | `GET`             | Hourly per-model request data       |
| `/v0/management/openai-compatibility`     | `GET/POST/DELETE` | OpenAI channel CRUD                 |
| `/v0/management/gemini-api-key`           | `GET/POST/DELETE` | Gemini channel CRUD                 |
| `/v0/management/claude-api-key`           | `GET/POST/DELETE` | Claude channel CRUD                 |
| `/v0/management/codex-api-key`            | `GET/POST/DELETE` | Codex channel CRUD                  |
| `/v0/management/vertex-api-key`           | `GET/POST/DELETE` | Vertex channel CRUD                 |
| `/v0/management/system-stats`             | `WebSocket`       | Real-time system monitoring         |

> **Note:** The API base is automatically normalized to `{apiBase}/v0/management`

For full backend API documentation, see the [CliRelay Management API](https://help.router-for.me/management/api).

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 Related Projects

- **[CliRelay](https://github.com/kittors/CliRelay)** — The backend proxy server (Go)
- **[CliRelay Guides](https://help.router-for.me/)** — Official documentation

## 📝 License

This project is open source. See the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Made with ❤️ for the <a href="https://github.com/kittors/CliRelay">CliRelay</a> community
</p>
