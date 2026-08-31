# CafeRacer Agent Trajectories

**Agent:** LatentCode
**Purpose:** Representative agent trajectories from the CafeRacer development process.
**Source:** Actual LatentCode session history.

## Trajectory 01 — Static AST Parser & Symbol Table Extraction

**Objective:** Extract line-level symbol coordinates, exported declarations, Express endpoints, and database ORM references using static AST parsing.

**Agent Instruction:**  
Implement static AST parsing in `server/services/parser.ts` using `@babel/parser` and `@babel/traverse` to extract declared functions, classes, interfaces, types, endpoints, and database models.

**Agent Action:**  
Created `server/services/parser.ts` configured with `@babel/parser` plugins for TypeScript, JSX, decorators, and top-level await to extract line range coordinates (`loc.start.line` to `loc.end.line`).

**Tool / Repository Response:**  
`server/services/parser.ts` was written and confirmed. Symbol metadata and line range coordinates were extracted across TypeScript and JavaScript source files.

**Feedback / Observation:**  
AST parsing extracted raw import specifiers, indicating that relative specifiers needed resolution to map full file dependency relationships.

**Final Result:**  
Implemented static AST parser in `server/services/parser.ts:15-202`.

**Impact:**  
Provided the structural code metadata necessary for dependency graph construction and line-level citations.

## Trajectory 02 — Relative Specifier Path Resolver & Directed Adjacency Graph

**Objective:** Resolve relative import specifiers and construct directed dependency graph topology.

**Agent Instruction:**  
Implement `resolveImportPath` and `buildDependencyGraph` in `server/services/graph.ts` to map file dependencies and support reverse lookup for downstream change impact analysis.

**Agent Action:**  
Implemented path specifier resolution with multi-extension matching (`.ts`, `.tsx`, `.js`, `.jsx`) and constructed forward `adjacencyList` and reverse `reverseAdjacency` graph mappings.

**Human Checkpoint:**  
Prompt requirement specified maintaining explicit reverse dependency structures to enable downstream blast radius analysis.

**Final Result:**  
Created `server/services/graph.ts:8-204` with forward/reverse graph adjacency structures and node layer classification.

**Impact:**  
Enabled lookup of both upstream dependencies and downstream reverse dependents across the repository.

## Trajectory 03 — 3-Hop Reverse BFS Change Impact Simulator

**Objective:** Simulate the downstream blast radius of proposed code changes using reverse dependency graph traversal.

**Agent Instruction:**  
Implement `analyzeGraphImpact` in `server/services/impact.ts` to identify seed nodes, traverse incoming edges up to 3 edge hops, and extract bounded code snippets.

**Agent Action:**  
Implemented candidate seed node scoring based on keyword matching against exports and endpoints, then executed Breadth-First Search (BFS) over `reverseAdjacency`.

**Retry / Revision:**  
Bounded reverse BFS traversal to a maximum of 3 hops (`depth <= 3`) with visited-set tracking to prevent cyclic traversal loops.

**Final Result:**  
Implemented `server/services/impact.ts:77-248` returning an `ImpactAnalysisContext` payload with seed nodes, downstream affected IDs, impact path chains, and 80-line capped code snippets.

**Impact:**  
Allowed CafeRacer to simulate downstream regression risks across dependency chains before code modification.

## Trajectory 04 — Subgraph-Grounded Context Retrieval & Gemini Reasoning

**Objective:** Retrieve query-relevant context subgraphs with 1-hop neighbor propagation for grounded LLM reasoning.

**Agent Instruction:**  
Implement `retrieveContext` in `server/services/context.ts` and `generateQAResponse` in `server/services/gemini.ts` to select graph nodes and invoke Gemini with line citations.

**Agent Action:**  
Developed term relevance scoring with 1-hop graph neighbor score boosting (0.5x propagation) and constructed system prompts using line-numbered AST snippets.

**Feedback / Observation:**  
Credential handling required external runtime loading from Supabase settings storage rather than hardcoded environment variables.

**Final Result:**  
Implemented `server/services/context.ts:32-190` and `server/services/gemini.ts:32-132`.

**Impact:**  
Improved LLM answer grounding by conditioning model outputs on extracted AST subgraphs and verified line citations.

## Trajectory 05 — 5-Node Architectural Layer Classification & Aggregation

**Objective:** Classify repository source files into 5 architectural layers and aggregate them into high-level graph nodes.

**Agent Instruction:**  
Create `architectureClassifier.ts` and `architectureAggregator.ts` to categorize files into 5 distinct architectural layer groups.

**Agent Action:**  
Implemented classification logic in `src/services/architectureClassifier.ts` (`ui`, `api`, `services`, `data`, `utils`) and node aggregation in `src/services/architectureAggregator.ts` (`aggregateArchitecture`).

**Tool / Repository Response:**  
Verified classification and aggregation of repository files into 5 layer categories (`UI / Presentation`, `API / Routing`, `Services & Business Logic`, `Data Access & State`, `Utilities & Types`).

**Final Result:**  
Delivered frontend architectural services in `src/services/architectureClassifier.ts` and `src/services/architectureAggregator.ts`.

**Impact:**  
Provided high-level architectural abstraction for exploring repository file organization.

## Trajectory 06 — Custom React Flow Graph Visualization Nodes

**Objective:** Render interactive custom React Flow canvas nodes for individual source files and aggregated 5-node architectural layers.

**Agent Instruction:**  
Implement React Flow custom node components in `src/components/graph/` to display node metadata, export indicators, and layer controls.

**Agent Action:**  
Created `GraphVisualizer.tsx` with registered `nodeTypes` mapping `codeNode` (`CustomCodeNode.tsx`) for source files and `semanticNode` (`SemanticArchitectureNode.tsx`) for architectural layer containers.

**Tool / Repository Response:**  
Components rendered in the React interface with node selection handlers, expansion controls, and layer badges.

**Final Result:**  
Built visualization components in `src/components/graph/GraphVisualizer.tsx`, `CustomCodeNode.tsx`, and `SemanticArchitectureNode.tsx`.

**Impact:**  
Enabled visual exploration of repository graph topology and architectural layer boundaries.

**## Trajectory 07 — CLI Terminal Ingestion & Cloud Zip Transfer**

****Objective:**** Package local workspace files into in-memory ZIP buffers and transmit them to the remote API server via terminal CLI.

****Agent Instruction:****

Implement `bin/caferacer.js` to package local files excluding ignored paths, send binary ZIP data to `/api/repo/ingest-zip`, and launch the web browser console.

****Agent Action:****

Built `createLocalZipBuffer` using `adm-zip` and `uploadZipArchive` to send binary `application/zip` payloads to the backend endpoint.

****Retry / Revision:****

Configured server handler `POST /api/repo/ingest-zip` in `server/routes/repo.ts` to accept `express.raw({ type: 'application/zip' })` binary request bodies.

****Final Result:****

Implemented CLI binary launcher `bin/caferacer.js` and server ZIP ingestion handler in `server/routes/repo.ts`.

****Impact:****

Enabled local codebase ingestion directly from the developer terminal through a short setup and execution workflow.

## Trajectory 08 — Grounded Q&A UI & Evidence Panel Component

**Objective:** Render structured Q&A evidence items including file paths, relevance scores, exported symbols, and interactive code snippets in the UI.

**Agent Instruction:**  
Build `EvidencePanel.tsx` and integrate it with `AskContainer.tsx` to display structured `EvidenceItem` arrays returned from backend Q&A endpoints.

**Agent Action:**  
Created `src/components/evidence/EvidencePanel.tsx` rendering evidence cards with score percentages, symbol badges, and code snippet views linked to selected graph nodes.

**Tool / Repository Response:**  
`EvidencePanel.tsx` rendered evidence cards in synchronization with central `App.tsx` state during Q&A interactions.

**Final Result:**  
Delivered `src/components/evidence/EvidencePanel.tsx` integrated into the web console workspace.

**Impact:**  
Provided clear visibility into source code evidence supporting AI reasoning outputs.

## Trajectory 09 — Benchmark Specification & Evaluation Rubric

**Objective:** Define a 10-case evaluation benchmark to measure reasoning accuracy differences between Baseline LLM and CafeRacer-Assisted Gemini.

**Agent Instruction:**  
Create `evaluation/CAFERACER_BENCHMARK.md` specifying control conditions, 0-1-2 scoring criteria, ground truth for 10 evaluation questions (Q01-Q10), and accuracy metrics.

**Agent Action:**  
Authored `evaluation/CAFERACER_BENCHMARK.md` detailing 10 technical test cases covering architectural classification, execution tracing, impact analysis, and state flow.

**Human Checkpoint:**  
Verified that ground truth descriptions for all 10 test cases were established directly from actual CafeRacer source files.

**Final Result:**  
Authored benchmark specification in `evaluation/CAFERACER_BENCHMARK.md` recording Baseline (55%) vs. CafeRacer (95%) benchmark results.

**Impact:**  
Established a quantitative evaluation metric for measuring structural codebase reasoning improvements.

## Trajectory 10 — Iterative Improvement Changelog & Evidence Schema

**Objective:** Document technical evolution, architectural shifts, baseline limitations, and verifiable code references.

**Agent Instruction:**  
Create `evaluation/IMPROVEMENT_CHANGELOG.md` and `evaluation/IMPROVEMENT_EVIDENCE.json` to record project iteration details and structural shift evidence.

**Agent Action:**  
Authored markdown changelog and JSON evidence map documenting the baseline naive scanning approach, 4 engineering iterations, decisions, and line-level code references.

**Tool / Repository Response:**  
`evaluation/IMPROVEMENT_CHANGELOG.md` and `evaluation/IMPROVEMENT_EVIDENCE.json` created and verified against source file references.

**Final Result:**  
Produced evaluation evidence files in `evaluation/IMPROVEMENT_CHANGELOG.md` and `evaluation/IMPROVEMENT_EVIDENCE.json`.

**Impact:**  
Provided a documented causal audit trail connecting architectural decisions to verifiable code references.

## Coverage

These trajectories represent the most significant documented agent-assisted development, debugging, refinement, validation, and evaluation work performed during the CafeRacer project.
