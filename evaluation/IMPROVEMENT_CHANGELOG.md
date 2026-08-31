# Improvement Changelog

## Baseline

### What You Tried and Why
The initial baseline relied on naive full-file text scanning and keyword-based context assembly without static structural analysis. In this approach, source code files were treated as raw text strings without parsing language syntax, extracting exports, or resolving file import specifiers into explicit dependency graphs. This was tried as the simplest entry point for codebase ingestion before building structural models.

### Evidence
- **Call Edge Resolution**: Import statements were treated as raw text specifiers rather than mapped edges between source files.
- **Blast Radius Analysis**: Downstream impacts could not be traced automatically without explicit dependency relationships.
- **Context Selection**: Large text segments were supplied directly to LLM prompts, increasing the risk of context truncation.
- **Symbol Grounding**: Limited to file-level scope without extracting start/end line coordinates for declarations.

### Decision / Learning
- **Decision**: REVISED / REPLACED
- **Learning**: Unstructured text scanning does not capture symbol scopes, call graphs, or downstream change impacts accurately. Static AST parsing and path resolution are necessary prerequisites for structural codebase intelligence.

---

## Iteration 1: Babel AST Parser & Symbol Table Extraction

### What You Tried and Why
Implemented static Abstract Syntax Tree (AST) parsing using `@babel/parser` and `@babel/traverse` (`server/services/parser.ts`). The parser processes supported TypeScript and JavaScript file types to extract declared functions, classes, interfaces, types, exported symbols, import specifiers, Express API endpoint signatures, and database ORM references.

### Evidence
- **Implementation File**: `server/services/parser.ts:15-202`
- **Parsing Configuration**: Configured `@babel/parser` with `errorRecovery: true` and syntax plugins for TypeScript, JSX, legacy decorators, and top-level await.
- **Symbol Metadata**: Extracted line range coordinates (`loc.start.line` to `loc.end.line`) for named functions, classes, interfaces, and type aliases.
- **Endpoint Detection**: Extracted HTTP methods (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`) and route path strings from AST `CallExpression` nodes.
- **Observed Result**: Enabled syntax-level extraction of exported symbols and raw import specifiers across supported file types without relying on regex matching or filename heuristics.

### Decision / Learning
- **Decision**: KEPT
- **Learning**: AST parsing provides structured, reproducible extraction of code declarations. Capturing line coordinates and export tables provides the necessary foundation for dependency graph construction.

---

## Iteration 2: Specifier Path Resolver and Directed Adjacency Graph

### What You Tried and Why
Implemented relative specifier path resolution (`resolveImportPath`) and directed dependency graph construction (`buildDependencyGraph`) in `server/services/graph.ts`. This experiment resolved relative import specifiers to target file paths using multi-extension matching (`.ts`, `.tsx`, `.js`, `.jsx`) and index file resolution, constructing both forward and reverse adjacency lists.

### Evidence
- **Implementation File**: `server/services/graph.ts:8-204`
- **Import Resolution**: Resolved relative specifiers against existing repository files and recorded unresolved external specifiers.
- **Dual Adjacency Structure**:
  - `adjacencyList`: Forward mapping from importing source file to imported target files.
  - `reverseAdjacency`: Reverse mapping from target file to incoming dependent files.
- **Layer Classification**: Categorized nodes into architectural types (`endpoint`, `db_model`, `component`, `utility`) based on AST metadata.
- **Observed Result**: Built a explicit graph topology of the repository file structure, enabling lookup of upstream imports and reverse downstream dependents.

### Decision / Learning
- **Decision**: KEPT
- **Learning**: Maintaining dual forward and reverse adjacency structures is necessary for structural codebase analysis. Reverse adjacency mapping enables systematic calculation of downstream change impacts.

---

## Iteration 3: 3-Hop Reverse BFS Change Impact Simulator

### What You Tried and Why
Implemented candidate seed node selection and a 3-hop reverse Breadth-First Search (BFS) graph traversal algorithm in `server/services/impact.ts`. When a change proposal is evaluated, the engine scores candidate seed nodes using keyword matches and traverses the `reverseAdjacency` graph up to 3 edge hops deep to identify downstream components, routes, and services affected by the proposed change.

### Evidence
- **Implementation File**: `server/services/impact.ts:77-248`
- **Traversal Bounding**: Bounded reverse BFS traversal to a maximum of 3 hops (`depth >= 3`), preventing cyclic loops and unbounded context expansion.
- **Path Tracing**: Generated step-by-step dependency chain paths for each identified downstream node.
- **Evidence Bounding**: Redacted sensitive pattern strings and capped extracted code snippets at 80 lines per file.
- **Observed Result**: Identified downstream dependent routes and components up to 3 hops away from candidate seed files.

### Decision / Learning
- **Decision**: KEPT
- **Learning**: Bounding reverse BFS traversal to 3 hops isolates downstream impact chains while maintaining manageable context size for review.

---

## Iteration 4: Subgraph-Grounded Context Retrieval and LLM Integration

### What You Tried and Why
Implemented query-focused context retrieval (`retrieveContext` in `server/services/context.ts`) and grounded AI reasoning (`askGemini` in `server/services/gemini.ts`). The retrieval service scores graph nodes against query terms, expands context by 1 hop for direct dependencies, formats a structured subgraph summary, and extracts bounded source code snippets. The LLM integration fetches API credentials from database storage at runtime and formats responses with source line citations.

### Evidence
- **Implementation Files**: `server/services/context.ts:32-190`, `server/services/gemini.ts:32-132`
- **Context Formatting**: Assembled structured context containing file counts, symbol export lists, forward/reverse dependency lists, and bounded source snippets.
- **Credential Handling**: Loaded AI provider configuration from external settings storage at runtime to ensure secure credential management.
- **Citation Structure**: Configured system prompts to format responses using line-level source citations backed by retrieved AST snippets.
- **Observed Result**: Generated answers referencing specific file paths and line number ranges extracted from the target repository.

### Decision / Learning
- **Decision**: KEPT
- **Learning**: Structuring LLM context around AST subgraphs and bounded code snippets provides clear grounding in repository source code while keeping context sizes concise.

---

## Final

### What Was Combined
The final system integrates the validated structural pipeline components:
1. **AST Parser Engine**: Extracts line-level symbol coordinates, exports, endpoint handlers, and ORM references.
2. **Directed Adjacency Graph**: Resolves relative import specifiers and maintains forward and reverse adjacency lists.
3. **3-Hop Reverse BFS Simulator**: Computes downstream change impact paths up to 3 edge hops deep.
4. **Subgraph-Grounded LLM Reasoning**: Assembles targeted AST subgraphs and bounded code snippets for grounded Q&A with line-level citations.

### Final System Characteristics
- **Structural Analysis**: Static AST parsing across supported JavaScript and TypeScript extensions.
- **Dependency Mapping**: Forward and reverse graph traversal for import resolution and impact simulation.
- **Impact Simulation**: Bounded 3-hop reverse BFS downstream dependency tracing.
- **Secure Grounded Reasoning**: Automated credential sanitization prior to model submission with source line citations.

### Main Contribution
The primary architectural shift in CafeRacer was moving from unstructured text scanning to **static AST parsing and reverse adjacency graph traversal**. This design provides explicit dependency resolution, 3-hop downstream impact simulation, and verifiable line-level citations in LLM responses.
