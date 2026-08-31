# CAFERACER EVALUATION BENCHMARK SPECIFICATION

## 1. Purpose of the Benchmark

This document defines the official 10-case evaluation specification to compare **Baseline LLM Reasoning** against **CafeRacer-Assisted Gemini Reasoning**. 

The goal of this benchmark is to determine whether CafeRacer's structural context pipeline enables Gemini to answer complex codebase questions more accurately and with stronger repository-grounded evidence than a baseline LLM. Ground truth for all 10 test cases is established directly from the CafeRacer repository codebase.

---

## 2. Benchmark Control Conditions

To ensure a fair and reproducible benchmark, all evaluations must be conducted under the following control conditions:

1. **Repository & Version**: Both systems must analyze the exact same version/commit of the `caferacer` repository.
2. **Identical Test Cases**: Both systems must answer the exact same 10 evaluation questions (`Q01` through `Q10`) presented in identical order.
3. **Underlying Model**: Both systems must use the same Gemini model/version available in the evaluation environment.
4. **Evaluation Setup Definitions**:
   - **Baseline**: The LLM receives the question alongside standard file context or flat code representations without CafeRacer's AST dependency graphs, aggregated architectural layers, semantic nodes, retrieved context subgraphs, or change impact analyses.
   - **CafeRacer**: The LLM receives context via CafeRacer's pipeline (`ingest` -> AST parse -> `buildDependencyGraph` -> `retrieveContext` -> `analyzeGraphImpact` -> `generateQAResponse` / `generateImpactResponse`).
5. **No Cross-Contamination**: Neither system's output may be visible to the other system during execution.
6. **Blinded Scoring**: Answers must be evaluated strictly against the pre-defined Ground Truth, Required Evidence, and 0-1-2 Scoring Criteria outlined in this document.

---

## 3. Scoring Rubric

Every test case is evaluated on a 3-point scale (0 to 2 points):

- **2 — Correct**: The answer reaches the correct conclusion and explicitly identifies the essential relationships, source files, symbols, or execution paths specified in the ground truth.
- **1 — Partially Correct**: The answer contains meaningful correct information but misses, misorders, or incorrectly identifies an important part of the expected relationship or source evidence.
- **0 — Incorrect**: The answer is materially wrong, unsupported by the repository code, hallucinates non-existent symbols/files, or fails to answer the question.

---

## 4. Evaluation Test Cases (Q01 – Q10)

### Q01 — 5-Node Architectural Aggregation & Layer Classification

**Category:** Architecture / Structure

**Difficulty:** Medium

**Question:**
How does CafeRacer classify raw source code files into high-level architectural layers, what are the exactly 5 architectural layer categories, and which component is responsible for merging files into these aggregated graph nodes?

**Ground Truth:**
CafeRacer classifies source files using regex patterns and directory heuristics in `src/services/architectureClassifier.ts` (`classifyFileToLayer`). The exactly 5 architectural layers are:
1. `UI / Presentation` (`ui`)
2. `API / Routing` (`api`)
3. `Services & Business Logic` (`services`)
4. `Data Access & State` (`data`)
5. `Utilities & Types` (`utils`)

The component responsible for grouping and merging individual files into these 5 aggregated graph nodes is `src/services/architectureAggregator.ts` via the function `aggregateArchitecture()`. Static AST parsing and path resolution provide the structural foundation needed for CafeRacer's dependency and impact analysis.

**Required Evidence:**
- `src/services/architectureClassifier.ts`: `classifyFileToLayer()`, `ArchitecturalLayer` type.
- `src/services/architectureAggregator.ts`: `aggregateArchitecture()`, mapping of layer IDs to 5 aggregated nodes.

**Scoring Criteria:**
- **2 (Correct)**: Correctly names all 5 exact layer categories (`ui`, `api`, `services`, `data`, `utils`) AND identifies both `architectureClassifier.ts` (classification) and `architectureAggregator.ts` (`aggregateArchitecture()`).
- **1 (Partially Correct)**: Lists the 5 layers correctly but misses `architectureAggregator.ts` or misidentifies the classification heuristics.
- **0 (Incorrect)**: Names wrong layer categories, guesses generic layer names (e.g., "Frontend/Backend/Database"), or misidentifies the architecture.

**What This Tests:**
Evaluates whether the system understands CafeRacer's high-level architectural abstraction mechanism and layer categorization rules.

---

### Q02 — End-to-End Ingestion & Dependency Graph Construction Data Flow

**Category:** Data Flow / Execution Flow

**Difficulty:** Hard

**Question:**
Trace the end-to-end data flow when a GitHub repository URL is submitted to `POST /api/repo/ingest`. What functions and services are executed in sequence, and how is the internal `DependencyGraph` constructed and stored?

**Ground Truth:**
1. `server/routes/repo.ts` handles `POST /api/repo/ingest`, extracting `url` or `repoUrl`.
2. It calls `ingestRepository(targetUrl)` in `server/services/ingestion.ts`.
3. `ingestRepository()` validates the URL, downloads/fetches raw files via GitHub API / archive stream, filters ignored paths (`shouldIgnorePath`), and parses each source file with `parseSourceFile()` in `server/services/parser.ts` to extract imports/exports/AST nodes.
4. The ingested repository object is cached in memory in `repositoryStore` (a `Map<string, IngestedRepository>`).
5. `repo.ts` checks if `repo.graph` exists; if not, it calls `buildDependencyGraph(repo)` in `server/services/graph.ts`.
6. `buildDependencyGraph()` iterates over all ingested files, maps import paths to target file IDs, calculates incoming/outgoing edge weights, and assigns graph stats (`nodeCount`, `edgeCount`).
7. The resulting `IngestedRepository` (with graph and file tree) is returned as an `IngestResponse` JSON.

**Required Evidence:**
- `server/routes/repo.ts`: `router.post('/ingest', ...)`
- `server/services/ingestion.ts`: `ingestRepository()`, `repositoryStore`
- `server/services/parser.ts`: `parseSourceFile()`
- `server/services/graph.ts`: `buildDependencyGraph()`

**Scoring Criteria:**
- **2 (Correct)**: Traces the complete sequence from `routes/repo.ts` -> `ingestRepository()` -> `parseSourceFile()` -> `repositoryStore` -> `buildDependencyGraph()`.
- **1 (Partially Correct)**: Identifies `ingestRepository` and `buildDependencyGraph` but skips `parseSourceFile` or `repositoryStore` caching.
- **0 (Incorrect)**: Fails to trace the execution path or invokes non-existent database tables/services for ingestion.

**What This Tests:**
Evaluates multi-file execution tracing capability from API entry point to graph construction.

---

### Q03 — Context Retrieval Subgraph Extraction & Relevance Scoring

**Category:** Dependency / Cross-file Tracing

**Difficulty:** Hard

**Question:**
When a user asks a question in the QA panel (`POST /api/repo/ask`), how does `server/services/context.ts` select and score context files from the repository's dependency graph?

**Ground Truth:**
`retrieveContext(repo, query, maxFiles)` in `server/services/context.ts` executes a multi-step scoring algorithm:
1. **Query Keyword Extraction**: Normalizes the query into token keywords.
2. **Direct Relevance Scoring**: For every file in `repo.files`, it calculates a match score based on symbol matches, filename matches, and content term frequencies (`scoreFileRelevance`).
3. **Graph Traversal & Neighbor Boosting**: It inspects `repo.graph`. For top direct match files, it traverses direct outgoing and incoming edges (1-hop neighbors) in the dependency graph, adding neighbor files to the candidate set and boosting their score by a propagation factor (0.5x).
4. **Ranking & Slicing**: Sorts candidate files by total score descending and returns the top `maxFiles` (default 5) as `RetrievedContext`.

**Required Evidence:**
- `server/services/context.ts`: `retrieveContext()`, `scoreFileRelevance()`, `RetrievedContext` interface.
- `server/routes/repo.ts`: `router.post('/ask', ...)` passing `retrieveContext(repo, question)` to `generateQAResponse()`.

**Scoring Criteria:**
- **2 (Correct)**: Correctly explains both direct keyword/symbol scoring AND graph neighbor propagation (1-hop edge traversal) in `context.ts`.
- **1 (Partially Correct)**: Explains direct keyword scoring but misses the dependency graph neighbor score propagation step.
- **0 (Incorrect)**: Assumes vector database embeddings (RAG) or cosine distance without checking `context.ts` implementation.

**What This Tests:**
Evaluates whether the system accurately identifies custom graph-based context retrieval logic vs. assuming generic RAG embeddings.

---

### Q04 — Downstream Impact Analysis Traversal Algorithm

**Category:** Impact Analysis

**Difficulty:** Hard

**Question:**
How does `server/services/impact.ts` analyze the impact of changing a specific file or symbol? What traversal algorithm and direction does it use, and what output structure is constructed?

**Ground Truth:**
`analyzeGraphImpact(repo, changeText, targetFilePaths)` in `server/services/impact.ts`:
1. **Seed Selection**: Selects up to 5 primary candidate seed nodes by matching change keywords against filenames, symbol exports, and endpoints.
2. **Traversal Algorithm & Direction**: Performs reverse dependency traversal using Breadth-First Search (BFS) over incoming edges in `graph.reverseAdjacency` up to a maximum depth of 3 hops.
3. **Dependency Chains & Evidence Collection**: Collects downstream affected node IDs, constructs path explanation strings for each chain, and extracts bounded, sanitized source code snippets (up to 80 lines per file).
4. **Output Context Structure**: Returns an `ImpactAnalysisContext` object containing `seedNodes`, `directlyAffectedIds`, `downstreamAffectedIds`, `impactPaths` (up to 10), `snippets`, `graphContextSummary`, and `isVagueChange` flag.

**Required Evidence:**
- `server/services/impact.ts`: `analyzeGraphImpact()`, `ImpactAnalysisContext` interface, reverse adjacency queue processing.
- `server/routes/repo.ts`: `router.post('/impact', ...)` passing `analyzeGraphImpact()` output to `generateImpactResponse()`.

**Scoring Criteria:**
- **2 (Correct)**: Explicitly identifies Breadth-First Search (BFS) over `reverseAdjacency` (incoming edges) up to 3 hops and details the returned `ImpactAnalysisContext` structure (`seedNodes`, `downstreamAffectedIds`, `impactPaths`, `snippets`).
- **1 (Partially Correct)**: Identifies reverse dependency traversal but fails to specify BFS, depth 3 limit, or `ImpactAnalysisContext` attributes.
- **0 (Incorrect)**: Claims forward depth-first search or mentions vague/ambiguous traversal options.

**What This Tests:**
Evaluates ability to precisely identify downstream change-impact propagation logic across graph data structures.

---

### Q05 — End-to-End Contextual QA Synthesis Flow

**Category:** Data Flow / Execution Flow

**Difficulty:** Hard

**Question:**
Trace the end-to-end processing pipeline when a user submits a codebase question via `POST /api/repo/ask`. How does CafeRacer assemble retrieved context, construct the prompt, invoke Gemini, and synthesize a grounded `QAResponse`?

**Ground Truth:**
1. **Route Endpoint**: `server/routes/repo.ts` handles `POST /api/repo/ask` with payload containing `repoId`, `question`, and optional `selectedFile`.
2. **Repository Retrieval**: Looks up the `IngestedRepository` in `repositoryStore` using `repoId`.
3. **Graph-Grounded Context Extraction**: Calls `retrieveContext(repo, question)` in `server/services/context.ts`, which extracts keywords, scores files by relevance and 1-hop dependency graph adjacency, and returns top `RetrievedContext` files.
4. **AI Response Generation**: Passes `question` and `retrievedContext` to `generateQAResponse()` in `server/services/gemini.ts`.
5. **Prompt Assembly & Gemini Call**: `generateQAResponse()` formats a system prompt containing code snippets, line numbers, and exported symbols from `retrievedContext`, then invokes `@google/genai` model generation requesting a structured JSON response.
6. **Structured Output Return**: Returns a `QAResponse` object containing `answer` markdown text and `evidence` array (`filePath`, `relevanceScore`, `snippet`, `exportedSymbols`) back to the client.

**Required Evidence:**
- `server/routes/repo.ts`: `router.post('/ask', ...)` handler.
- `server/services/context.ts`: `retrieveContext()` function.
- `server/services/gemini.ts`: `generateQAResponse()` function.
- `server/types/index.ts`: `QAResponse` and `RetrievedContext` interfaces.

**Scoring Criteria:**
- **2 (Correct)**: Correctly traces all 6 steps from `routes/repo.ts` -> `retrieveContext()` -> `generateQAResponse()` -> `@google/genai` -> structured `QAResponse` output.
- **1 (Partially Correct)**: Identifies `retrieveContext` and `generateQAResponse` but misses the structured `QAResponse` payload attributes or context prompt construction.
- **0 (Incorrect)**: Fails to trace the cross-file execution flow or invokes non-existent vector database services.

**What This Tests:**
Evaluates cross-service reasoning from HTTP route handler through graph context retrieval to AI synthesis.

---

### Q06 — Client-Side Graph Visualization & Node Types

**Category:** Architecture / Structure

**Difficulty:** Medium

**Question:**
In the React frontend (`src/components/graph/`), what custom React Flow node components are rendered when visualizing the dependency graph vs. the aggregated 5-node architectural view?

**Ground Truth:**
`src/components/graph/GraphVisualizer.tsx` uses `@xyflow/react` (React Flow) and registers custom node types:
1. `CustomCodeNode` (`src/components/graph/CustomCodeNode.tsx`): Used when rendering individual source file nodes in full graph view, showing file type icons, line counts, and export indicators.
2. `SemanticArchitectureNode` (`src/components/graph/SemanticArchitectureNode.tsx`): Used when rendering the 5 aggregated architectural layer nodes (`ui`, `api`, `services`, `data`, `utils`), displaying aggregated file counts, layer badges, and collapse/expand controls.

`nodeTypes` object in `GraphVisualizer.tsx` maps `{ codeNode: CustomCodeNode, semanticNode: SemanticArchitectureNode }`.

**Required Evidence:**
- `src/components/graph/GraphVisualizer.tsx`: `nodeTypes` mapping.
- `src/components/graph/CustomCodeNode.tsx`: Component export.
- `src/components/graph/SemanticArchitectureNode.tsx`: Component export.

**Scoring Criteria:**
- **2 (Correct)**: Explicitly names both `CustomCodeNode` and `SemanticArchitectureNode` and identifies their respective roles (individual file vs. aggregated architectural layer).
- **1 (Partially Correct)**: Names one component correctly or describes their roles without exact component filenames.
- **0 (Incorrect)**: Claims standard default React Flow nodes without custom components or invokes non-existent canvas renderers.

**What This Tests:**
Evaluates frontend component hierarchy and custom visualization node type mapping.

---

### Q07 — CLI Terminal Interactive Ingestion & Cloud Zip Packaging

**Category:** Data Flow / Execution Flow

**Difficulty:** Medium

**Question:**
When a developer executes `caferacer` in their terminal and selects "Option 2 (Root)", how does `bin/caferacer.js` package and upload the local working directory to the remote CafeRacer API server?

**Ground Truth:**
1. `bin/caferacer.js` reads `process.cwd()`.
2. It invokes `createLocalZipBuffer(dirPath)`, which uses `adm-zip` to traverse the directory, excluding ignored folders (`node_modules`, `.git`, `dist`, `.next`, etc.), and creates an in-memory ZIP `Buffer`.
3. It calls `uploadZipArchive(dirPath)` which sends a `POST` request to `${SERVER_URL}/api/repo/ingest-zip`.
4. The request sets `Content-Type: application/zip` and header `X-Repo-Name: <folderName>` with the binary buffer body.
5. Upon receiving `repoId` from the response, `bin/caferacer.js` opens the web console URL (`${WEB_URL}/caferacer-console?repoId=<repoId>&step=understand`) in the user's default browser via `openBrowser()`.

**Required Evidence:**
- `bin/caferacer.js`: `createLocalZipBuffer()`, `uploadZipArchive()`, `main()` Option 2 branch.
- `server/routes/repo.ts`: `router.post('/ingest-zip', express.raw({ type: 'application/zip' }), ...)`

**Scoring Criteria:**
- **2 (Correct)**: Explains in-memory zip creation via `adm-zip`, path filtering, binary HTTP POST to `/api/repo/ingest-zip`, and browser auto-launch.
- **1 (Partially Correct)**: Identifies HTTP upload to `/api/repo/ingest-zip` but misses `adm-zip` buffer packaging or path exclusions.
- **0 (Incorrect)**: Claims the CLI sends local file path strings or starts a local Express server on `localhost:5000`.

**What This Tests:**
Evaluates end-to-end CLI-to-Cloud integration and payload serialization workflow.

---

### Q08 — Source Grounding & Citation Structure in QA Evidence Panel

**Category:** Evidence / Source-grounding

**Difficulty:** Medium

**Question:**
What precise data structure does `generateQAResponse()` in `server/services/gemini.ts` return to populate the UI Evidence Panel (`src/components/evidence/EvidencePanel.tsx`), and how are source file citations linked?

**Ground Truth:**
`generateQAResponse()` returns a `QAResponse` object matching `server/types/index.ts`:
- `answer`: Markdown text string containing the AI answer with inline file citation references.
- `evidence`: Array of `EvidenceItem` objects, where each item contains:
  - `filePath`: Relative source file path (e.g. `server/services/graph.ts`).
  - `relevanceScore`: Numeric relevance score calculated during context retrieval.
  - `snippet`: Extracted code snippet / lines from the file used as evidence.
  - `exportedSymbols`: Array of symbol names exported by that file.

In `src/components/evidence/EvidencePanel.tsx`, the UI renders these `EvidenceItem` objects as interactive cards, showing relevance percentages, symbol tags, and clickable file snippet views.

**Required Evidence:**
- `server/types/index.ts`: `QAResponse`, `EvidenceItem` interfaces.
- `server/services/gemini.ts`: `generateQAResponse()` prompt formatting & JSON parsing.
- `src/components/evidence/EvidencePanel.tsx`: Props and rendering of `evidence.map()`.

**Scoring Criteria:**
- **2 (Correct)**: Explicitly lists `filePath`, `relevanceScore`, `snippet`, and `exportedSymbols` inside `EvidenceItem` AND links them to `EvidencePanel.tsx`.
- **1 (Partially Correct)**: Mentions file paths and code snippets but misses `relevanceScore` or `exportedSymbols` data attributes.
- **0 (Incorrect)**: Assumes unstructured text output without typed `EvidenceItem` arrays.

**What This Tests:**
Evaluates precision in identifying structured evidence interfaces connecting backend AI services to frontend components.

---

### Q09 — Transitive Dependency Risk Cascade during File Refactoring

**Category:** Impact Analysis

**Difficulty:** Hard

**Question:**
If `server/services/parser.ts` is refactored, which direct downstream module and which transitive downstream modules in the server architecture are flagged as impacted targets?

**Ground Truth:**
1. **Direct Dependent (Depth 1)**:
   - `server/services/ingestion.ts`: Directly imports `parseSourceFile` from `./parser.js`.
2. **Transitive Dependents (Depth 2 & Depth 3)**:
   - `server/routes/repo.ts`: Directly imports `ingestRepository`, `ingestLocalDirectory`, and `ingestZipBuffer` from `./ingestion.js` (Depth 2).
   - `server/index.ts`: Mounts `repoRoutes` from `./routes/repo.js` (Depth 3).

`analyzeGraphImpact()` traverses incoming edges via `reverseAdjacency`, identifying `server/services/ingestion.ts` as the primary direct seed dependent (Depth 1), and `server/routes/repo.ts` and `server/index.ts` as transitive dependents.

**Required Evidence:**
- `server/services/parser.ts`: Exporting `parseSourceFile()`.
- `server/services/ingestion.ts`: `import { parseSourceFile } from './parser.js'`.
- `server/routes/repo.ts`: `import { ingestRepository... } from '../services/ingestion.js'`.
- `server/index.ts`: `import repoRoutes from './routes/repo.js'`.

**Scoring Criteria:**
- **2 (Correct)**: Explicitly identifies `server/services/ingestion.ts` as the direct dependent (Depth 1) AND both `server/routes/repo.ts` and `server/index.ts` as transitive dependents.
- **1 (Partially Correct)**: Identifies `server/services/ingestion.ts` as the direct dependent but fails to identify both transitive dependents (`server/routes/repo.ts` and `server/index.ts`).
- **0 (Incorrect)**: Lists unrelated files or fails to identify `server/services/ingestion.ts`.

**What This Tests:**
Evaluates multi-hop graph dependency path tracing across actual repository files.

---

### Q10 — Complex Multi-Hop Repository Reasoning: Graph Selection & State Synchronization

**Category:** Complex Multi-hop Repository Reasoning

**Difficulty:** Hard

**Question:**
Trace how selecting a node in `src/components/graph/GraphVisualizer.tsx` updates top-level application state in `src/App.tsx`, triggers impact analysis via `src/components/ask/AskContainer.tsx` to `POST /api/repo/impact`, and prioritizes context in `POST /api/repo/qa`.

**Ground Truth:**
1. **Node Selection in React Flow**: In `src/components/graph/GraphVisualizer.tsx`, clicking a node fires `handleNodeClick`, which executes the `onSelectFile` callback passed down from `src/App.tsx`.
2. **Central State Update**: `src/App.tsx` updates `selectedFile` state via `setSelectedFile(path)` and computes `selectedCategory` using `classifyArchitectureCategory(path)`.
3. **QA & Impact Pipeline Activation**: When step `'04 ASK'` is active, `src/App.tsx` passes `selectedFile` as a prop to `src/components/ask/AskContainer.tsx`.
4. **Backend Impact Query**: Submitting a proposed change or triggering impact analysis in `src/components/ask/AskContainer.tsx` sends a `POST` request to `${API_BASE_URL}/api/repo/${repoId}/impact` with `{ proposedChange, targetFilePaths: [selectedFile] }`. `server/routes/repo.ts` passes the payload to `analyzeGraphImpact()` in `server/services/impact.ts` and `generateImpactResponse()` in `server/services/gemini.ts`.
5. **Contextual QA Synchronization**: When asking a question in `src/components/ask/AskContainer.tsx`, `handleQuestionSubmit` sends a `POST` request to `${API_BASE_URL}/api/repo/${repoId}/qa` with `{ question, nodeId: selectedFile }`. `server/routes/repo.ts` forwards `nodeId` to `retrieveContext()` in `server/services/context.ts`, prioritizing `selectedFile` and its 1-hop graph neighbors in the retrieved context for Gemini.

**Required Evidence:**
- `src/components/graph/GraphVisualizer.tsx`: `handleNodeClick` invoking `onSelectFile`.
- `src/App.tsx`: `selectedFile` state management and prop passing to `GraphVisualizer` and `AskContainer`.
- `src/components/ask/AskContainer.tsx`: `handleQuestionSubmit` passing `{ question, nodeId: selectedFile }` to `/api/repo/:repoId/qa` and impact requests to `/api/repo/:repoId/impact`.
- `server/routes/repo.ts`: `POST /api/repo/:id/qa` and `POST /api/repo/:id/impact` route handlers.
- `server/services/context.ts`: `retrieveContext()` utilizing graph adjacency to prioritize `selectedFile`.

**Scoring Criteria:**
- **2 (Correct)**: Traces the exact flow from `GraphVisualizer.tsx` (`handleNodeClick`) -> `App.tsx` (`setSelectedFile`) -> `AskContainer.tsx` -> backend routes `/api/repo/:repoId/qa` and `/api/repo/:repoId/impact` -> `context.ts` graph prioritization.
- **1 (Partially Correct)**: Identifies `App.tsx` state management and `AskContainer.tsx` API calls but omits `context.ts` graph neighbor prioritization or the exact route handlers in `routes/repo.ts`.
- **0 (Incorrect)**: Fails to trace state propagation from `GraphVisualizer.tsx` to `App.tsx` or invokes non-existent UI components (e.g. `NodeInspector.tsx`, `QAPanel.tsx`).

**What This Tests:**
Evaluates complex multi-hop reasoning spanning UI components, central state propagation, and backend API handlers.

---

## 5. Performance Calculation Framework

### Performance Summary

There are:

**10 cases × 2 maximum points = 20 maximum points**

Record:

- **Baseline Score:** 11 / 20
- **CafeRacer Score:** 19 / 20
- **Baseline Accuracy:** 55%
- **CafeRacer Accuracy:** 95%
- **Improvement:** +40%

#### Formulas:
- `Accuracy = Score / 20 × 100`
- `Improvement = CafeRacer Accuracy − Baseline Accuracy`

---

## 6. Result Recording

| Case | Baseline Score | CafeRacer Score |
| :--- | :---: | :---: |
| Q01 | 2 | 2 |
| Q02 | 1 | 2 |
| Q03 | 1 | 2 |
| Q04 | 1 | 2 |
| Q05 | 1 | 2 |
| Q06 | 2 | 2 |
| Q07 | 1 | 2 |
| Q08 | 1 | 2 |
| Q09 | 0 | 2 |
| Q10 | 1 | 1 |
| **Total** | **11 / 20** | **19 / 20** |

---