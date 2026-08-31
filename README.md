# CafeRacer: Deterministic Codebase Intelligence Engine

CafeRacer is an enterprise-grade codebase intelligence engine designed to convert complex JavaScript and TypeScript repositories into deterministic, interactive architectural system models. By replacing speculative vector search with Abstract Syntax Tree (AST) parsing and directed dependency graph analysis, CafeRacer provides exact call-graph citations, deterministic node classification, and a 3-hop reverse Breadth-First Search (BFS) blast-radius impact simulator.

Development was accelerated with LatentCode, an AI-augmented development platform.

---

## 1. Key Capabilities and Architectural Principles

- Deterministic 5-Node Architecture Map: Classifies repository files into five distinct architectural layers (Frontend Component, Routing / Controller, Backend Logic, Service Layer, and Repository / Data Model) using syntax-level AST analysis rather than filename string heuristics.
- AST-Grounded Evidence Extraction: Parses TypeScript and JavaScript source code via Babel AST engines to extract symbols, exports, endpoint signatures, and database queries with line-level accuracy and zero hallucinated call edges.
- 3-Hop Reverse BFS Change Impact Simulator: Calculates downstream blast radiuses for proposed code changes by traversing reverse dependency lists up to 3 edge hops from candidate seed nodes.
- Grounded Retrieval-Augmented Generation (RAG): Combines deterministic subgraph extraction with Google Gemini 2.0 Flash to deliver precise technical answers backed by verifiable source line citations.
- Dual-Mode Ingestion Pipeline: Supports both remote GitHub repository analysis via web interface and local directory ingestion via an automated CLI binary executable.

---

## 2. Technology Stack and Cloud Infrastructure

CafeRacer is constructed on the PERN stack (PostgreSQL, Express, React, Node.js) with cloud-native hosting across specialized infrastructure providers:

- Frontend Application: Built with React 18, TypeScript, Vite, Tailwind CSS, `@xyflow/react` (React Flow), and Dagre layout graph engines. Hosted on Vercel with automated GitHub CI/CD pipelines.
- API & Ingestion Engine: Built with Express.js and Node.js in TypeScript, utilizing `@babel/parser` and `@babel/traverse` for AST processing. Hosted on Render as a high-performance web service.
- Database & Credential Vault: PostgreSQL hosted on Supabase, serving as the relational database and configuration store for encrypted system parameters and AI provider API credentials.
- Artificial Intelligence Integration: Powered by the Google Gemini API (`gemini-2.0-flash`) via `@google/genai` for grounded reasoning over extracted AST subgraphs.
- Command-Line Interface: Native Node.js executable binary (`bin/caferacer.js`) providing automated environment detection, local AST parsing, and direct browser handoff.

### Tech Stack Matrix

| Component | Technology / Library | Hosting / Environment | Primary Responsibility |
|---|---|---|---|
| Frontend Framework | React 18, TypeScript, Vite | Vercel (Automated CI/CD) | Interactive system map, impact visualization, and Q&A console |
| Graph Visualization | React Flow (`@xyflow/react`), Dagre | Web Browser Client | Directed graph rendering, automated layout, and node inspection |
| Application Server | Express.js, Node.js (TypeScript) | Render Web Service | REST API endpoints, AST parsing, graph generation, and BFS algorithms |
| AST Parser Engine | `@babel/parser`, `@babel/traverse` | Render Web Service | Static analysis, symbol table generation, and import specifier resolution |
| Database | PostgreSQL | Supabase | Configuration storage, credential security management (`app_settings`) |
| Generative AI | Google Gemini 2.0 Flash (`@google/genai`) | Google AI Infrastructure | Context-grounded technical Q&A and reasoning over graph subgraphs |
| CLI Executable | Node.js POSIX Executable | Local Terminal / Workstation | Workspace discovery, local zip bundling, and automated browser dispatch |

---

## 3. Directory Tree Architecture

```
caferacer/
├── .env.example                       # Environment variable specification template
├── .gitignore                          # Version control exclusion parameters
├── package.json                        # Monorepo dependencies and execution scripts
├── tsconfig.json                       # Client-side TypeScript compilation setup
├── tsconfig.server.json                # Server-side TypeScript compilation setup
├── vercel.json                         # Vercel deployment and SPA routing setup
├── bin/
│   └── caferacer.js                    # CLI binary launcher with local ingestion and web handoff
├── server/                             # Express REST API & static analysis engine
│   ├── index.ts                        # Express server entry point and health monitor
│   ├── routes/
│   │   └── repo.ts                     # API route handlers for ingestion, impact, and Q&A
│   ├── services/
│   │   ├── parser.ts                   # Babel static parser and symbol table extractor
│   │   ├── graph.ts                    # Directed adjacency builder and layer classifier
│   │   ├── impact.ts                   # Candidate scoring engine and 3-hop reverse BFS tracer
│   │   ├── ingestion.ts                # File system scanner, path normalizer, and zip unpacker
│   │   └── gemini.ts                   # Supabase credential loader and Gemini AI integrator
│   └── types/
│       └── index.ts                    # Core server type definitions and data interfaces
└── src/                                # React 18 frontend single page application
    ├── App.tsx                         # Primary routing state machine and session store
    ├── main.tsx                        # React application DOM entry point
    ├── index.css                       # Global Tailwind CSS styling rules
    ├── config/
    │   └── api.ts                      # Backend REST API endpoint configuration
    ├── types/
    │   └── index.ts                    # Client-side data model definitions
    ├── services/
    │   ├── architectureClassifier.ts  # Client-side node classification rules
    │   └── architectureAggregator.ts  # Architectural layer aggregation and telemetry
    └── components/
        ├── ask/
        │   └── AskContainer.tsx        # Grounded Q&A interface with source citations
        ├── evidence/
        │   └── EvidencePanel.tsx       # AST symbol call graph and snippet inspection panel
        ├── explorer/
        │   └── RepoExplorer.tsx        # File tree explorer with node status filtering
        ├── graph/
        │   ├── GraphVisualizer.tsx     # React Flow canvas wrapper with auto-layout
        │   ├── CustomCodeNode.tsx      # Specialized canvas rendering node for file symbols
        │   ├── SemanticArchitectureNode.tsx # Layer group container node
        │   ├── NodeInspector.tsx       # Deep inspection drawer for selected AST nodes
        │   └── graphUtils.ts           # Dagre layout calculation helper
        ├── impact/
        │   └── ImpactPanel.tsx         # Blast-radius impact simulator control panel
        ├── landing/
        │   ├── Landing.tsx             # Marketing hero page and console entry switchboard
        │   └── NetworkCanvas.tsx       # Interactive background canvas particle animation
        ├── repo/
        │   └── StepRepo.tsx            # Repository input form and URL submission step
        └── shell/
            ├── Header.tsx              # System navigation header and status indicator
            ├── ConsoleStepper.tsx      # Workflow step progression control (01 REPO to 04 ASK)
            └── AnalyzeProgressView.tsx # AST parsing and progress overlay indicator
```

---

## 4. System Flow Architecture

The data flow within CafeRacer moves through four distinct operational phases: Ingestion, AST Analysis and Dependency Graph Generation, Impact Simulation, and Grounded Reasoning.

```
+-----------------------------------------------------------------------------------+
|                                 INGESTION PHASE                                   |
+-----------------------------------------------------------------------------------+
|  Local CLI Workstation                   Remote GitHub Repository                 |
|  (caferacer CLI executable)              (User URL Input in Web UI)              |
|             |                                        |                            |
|             v                                        v                            |
|  POST /api/repo/ingest-local             POST /api/repo/ingest-github             |
+-----------------------------------------------------------------------------------+
                                      |
                                      v
+-----------------------------------------------------------------------------------+
|                   STATIC ANALYSIS & GRAPH GENERATION PHASE                        |
+-----------------------------------------------------------------------------------+
|  1. File System Traversal & Extension Filtering (.ts, .tsx, .js, .jsx)            |
|  2. AST Parsing (@babel/parser, @babel/traverse)                                  |
|     - Extract Functions, Classes, Variables, and Component Exports               |
|     - Extract Express/HTTP Endpoint Handlers and DB Queries                       |
|  3. Import Specifier Path Resolution (Relative & Index path candidate matching)    |
|  4. Adjacency Matrix & Reverse Adjacency List Construction                        |
|  5. 5-Node Architectural Layer Classification                                    |
+-----------------------------------------------------------------------------------+
                                      |
                                      v
+-----------------------------------------------------------------------------------+
|                   IMPACT SIMULATION & QUERY PROCESSING PHASE                       |
+-----------------------------------------------------------------------------------+
|  User Query / Proposed Code Change                                                |
|             |                                                                     |
|             +----------------------------+                                        |
|             |                            |                                        |
|             v                            v                                        |
|  [3-Hop Reverse BFS Simulator]   [Grounded Reasoning Engine]                      |
|  - Candidate Seed Node Scoring   - Load Credentials from Supabase (app_settings)  |
|  - Reverse Adjacency Traversal   - Inject Graph Subgraph Context                  |
|  - Blast-Radius Identification   - Stream Response via Gemini 2.0 Flash           |
|  - Bounded Code Snippet Load     - Provide Exact Line-Number Citations            |
+-----------------------------------------------------------------------------------+
```

### Pipeline Details

1. Ingestion Stage: The system accepts codebases through two vectors. The local CLI scans the current working directory, constructs an in-memory repository archive, and dispatches it to the backend. The web interface accepts GitHub repository URLs, downloads the repository zip archive via public GitHub APIs, and unpacks the source tree into an in-memory file structure.
2. AST Extraction Stage: Each source file is parsed into a Babel Abstract Syntax Tree. The parser identifies named and default exports, imported specifiers, declared functions, classes, React components, HTTP endpoint definitions (e.g. Express `app.get`, `router.post`), and database interactions (e.g. SQL, Prisma, Mongoose queries).
3. Dependency Graph Construction Stage: Raw import specifiers are resolved against the repository file map using multi-extension resolution algorithms. A directed graph is created containing source-to-target edges along with a reverse adjacency map representing downstream dependent relationships.
4. Impact Simulation Stage: When a user proposes a code change, candidate seed nodes are scored using domain keyword matching and path criteria. The engine traverses the reverse adjacency graph up to 3 hops away to identify all downstream components, routes, and services at risk of breaking.
5. Grounded Q&A Stage: The server fetches active Gemini API credentials from the `app_settings` table in Supabase PostgreSQL. It formats the relevant graph subgraph and code snippets into a structured prompt context, ensuring that the Google Gemini AI responds exclusively using verifiable repository line citations.

---

## 5. Technical Benchmark and Comparison Tables

### Table 1: Comparative Analysis: CafeRacer vs. Baseline Code Analysis Architectures

| Feature / Criteria | Standard Vector RAG (Baseline) | Generic LLM Context Window | CafeRacer Intelligence Engine |
|---|---|---|---|
| Context Grounding | Approximate semantic embeddings | Unstructured token dump | Exact AST symbol tables and file import graphs |
| Call Graph Resolution | Probabilistic similarity matches | Heuristic token correlation | Deterministic Babel AST traversal |
| Downstream Blast Radius | Manual user tracing | Hallucination-prone prediction | 3-Hop Reverse BFS graph traversal |
| Citation Precision | File-level or chunk-level estimates | None or hallucinated line numbers | Exact file path and line range citations |
| Architectural Classification | Folder naming heuristics | Unstructured text descriptions | Syntax-level 5-node layer classification |
| Ingestion Latency | High (Embedding generation & vector DB) | High (Token processing overhead) | Low (In-memory static AST parsing) |
| System Determinism | Non-deterministic | Non-deterministic | 100% Deterministic graph structure |

### Table 2: Service API Endpoint Specification Matrix

| Method | Endpoint | Payload / Parameters | Function |
|---|---|---|---|
| GET | `/api/health` | None | Evaluates API status, version, and Supabase Gemini key configuration |
| POST | `/api/repo/ingest-github` | `{ url: string }` | Downloads, unpacks, and generates dependency graph for GitHub repository |
| POST | `/api/repo/ingest-local` | `{ path: string }` | Scans local workstation folder, extracts AST, and generates graph |
| POST | `/api/repo/ingest-zip` | Multipart form zip upload | Unpacks uploaded zip archive and builds codebase dependency graph |
| GET | `/api/repo/:id` | `id` route parameter | Retrieves ingested repository metadata, stats, and file tree structure |
| GET | `/api/repo/:id/graph` | `id` route parameter | Returns nodes, edges, adjacency lists, and analysis metrics for graph |
| POST | `/api/repo/:id/impact` | `{ changeText: string, targetFilePaths?: string[] }` | Executes candidate seed scoring and 3-hop reverse BFS impact simulation |
| POST | `/api/repo/:id/ask` | `{ question: string, selectedNodeId?: string }` | Executes AST-grounded Q&A reasoning via Supabase credentials and Gemini 2.0 Flash |

---

## 6. Prerequisites and Environment Setup

### System Requirements

- Node.js: `v18.16.0` or higher
- npm: `v9.x` or higher
- PostgreSQL Database: Supabase instance with active service credentials

### Supabase Database Configuration

CafeRacer securely retrieves its AI service configuration from PostgreSQL hosted on Supabase. Execute the following SQL script in your Supabase SQL Editor to initialize the necessary configuration schema:

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_settings (key, value)
VALUES
  ('gemini_api_key', 'YOUR_GEMINI_API_KEY_HERE'),
  ('gemini_model', 'gemini-2.0-flash')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

### Environment Variable Setup

Create a `.env` file in the repository root directory by copying `.env.example`:

```bash
cp .env.example .env
```

Configure `.env` with the appropriate parameters:

```env
PORT=5000
NODE_ENV=development
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

---

## 7. Installation and CLI Setup

### For End-Users (Instant CLI Usage)

Users do **not** need to configure any database or Supabase credentials. The CLI connects to CafeRacer's managed cloud API service out of the box.

1. Install globally via npm (or clone and link):
```bash
npm install -g https://github.com/SakaethRam/Caferacer-AI.git
```

Or by cloning locally:
```bash
git clone https://github.com/SakaethRam/Caferacer-AI.git
cd Caferacer-AI
npm install
npm link
```

2. Run the CLI in any repository on your machine:
```bash
caferacer
```

---

## 8. Operating Instructions

### Option A: Terminal CLI Workflow

1. Open a terminal in any target codebase directory on your workstation.
2. Launch the CLI utility:
```bash
caferacer
```
3. Choose an ingestion pathway:
   - **Option 1 (Github Repo):** Redirects to `https://caferacer-nu.vercel.app/caferacer-console?step=repo` in your default browser.
   - **Option 2 (Root):** Ingests your local working directory via AST parsing, generates the dependency graph, and opens `https://caferacer-nu.vercel.app/caferacer-console?repoId=<generated_id>&step=understand` in your default browser.

### Option B: Web Console Interface

1. Navigate to `https://caferacer-nu.vercel.app` or open `http://localhost:3000` when running locally.
2. Step 01 (REPO): Paste a public GitHub repository link or select a local workspace.
3. Step 02 (ANALYZE): Observe the real-time progress as AST symbol tables, endpoint signatures, and dependency edges are calculated.
4. Step 03 (UNDERSTAND): Explore the interactive 5-node architecture canvas, inspect file nodes, and run the 3-hop reverse BFS impact simulator.
5. Step 04 (ASK): Query the codebase using grounded generative reasoning backed by line-level code citations.

---

## 9. License

Distributed under the MIT License. See `LICENSE` for further details.
