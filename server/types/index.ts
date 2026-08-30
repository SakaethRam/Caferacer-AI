export interface SourceFile {
  path: string;           // Relative file path e.g. "src/App.tsx"
  content: string;        // Raw source code content
  size: number;           // Size in bytes
  lines: number;          // Line count
  extension: string;      // e.g. "ts"
  language: string;       // e.g. "TypeScript"
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  lines?: number;
  extension?: string;
  language?: string;
  children?: FileTreeNode[];
}

export interface IngestRequest {
  url: string;
}

export interface IngestResponse {
  success: boolean;
  repoId: string;
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
  stats: IngestedRepository['stats'];
  tree: FileTreeNode[];
  error?: string;
}

export interface ParsedSymbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'component';
  isExported: boolean;
  loc?: { start: number; end: number };
}

export interface ApiEndpointMetadata {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'ALL' | 'UNKNOWN';
  path: string;
}

export interface DatabaseMetadata {
  orm: 'prisma' | 'mongoose' | 'knex' | 'typeorm' | 'pg' | 'generic';
}

export interface ParsedFileAnalysis {
  filePath: string;
  language: string;
  lines: number;
  rawImports: string[];                 // Import specifiers e.g. "./auth", "express"
  resolvedDependencies: string[];       // Resolved repo-relative paths e.g. "server/services/auth.ts"
  unresolvedImports: string[];          // Unresolved specifiers e.g. "express"
  exports: string[];                     // Exported symbol names
  symbols: ParsedSymbol[];              // Extracted functions, classes, interfaces
  endpoints: ApiEndpointMetadata[];      // Detected API routes
  dbReferences: DatabaseMetadata[];      // Detected DB clients
  isSupported: boolean;
  parseError?: string;
}

export interface CodeNode {
  id: string;                           // e.g. "src/App.tsx"
  label: string;                        // Display name e.g. "App.tsx"
  type: 'file' | 'component' | 'endpoint' | 'db_model' | 'utility';
  filePath: string;
  exports: string[];
  imports: string[];                    // Dependent file paths
  unresolvedImports?: string[];
  symbols?: ParsedSymbol[];
  endpoints?: ApiEndpointMetadata[];
  dbReferences?: DatabaseMetadata[];
  loc?: number;
}

export interface CodeEdge {
  id: string;                           // e.g. "src/App.tsx->src/Header.tsx"
  source: string;                       // Dependent file ID
  target: string;                       // Dependency file ID
  relation: 'imports' | 'calls' | 'uses_db' | 'handles_route';
}

export interface DependencyGraph {
  nodes: CodeNode[];
  edges: CodeEdge[];
  adjacencyList: Record<string, string[]>;        // source -> targets (Forward dependencies)
  reverseAdjacency: Record<string, string[]>;     // target -> sources (Downstream dependents)
  metadata: {
    totalFiles: number;
    parsedFiles: number;
    failedFiles: number;
    skippedFiles: number;
    totalNodes: number;
    totalEdges: number;
    supportedLanguages: string[];
    unresolvedImportCount: number;
    parseErrors: Array<{ filePath: string; error: string }>;
    analysisDurationMs: number;
  };
}

export interface IngestedRepository {
  id: string;
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
  ingestedAt: string;
  files: Map<string, SourceFile>; // Keyed by relative path
  tree: FileTreeNode[];
  graph?: DependencyGraph;        // Cached dependency graph
  stats: {
    totalDiscoveredFiles: number;
    analyzedSourceFiles: number;
    skippedFiles: number;
    totalSourceLines: number;
    totalBytes: number;
    languages: Record<string, number>;
  };
}

export interface QAEvidence {
  nodeId: string;
  filePath: string;
  lines: string;
  snippet: string;
  explanation: string;
  isRepositoryFact: boolean;
}

export interface QARequest {
  question: string;
  nodeId?: string;
}

export interface QAResponse {
  question: string;
  answer: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  keyPoints: string[];
  evidence: QAEvidence[];
  uncertainties?: string[];
}

export interface ContextRetrievalResult {
  relevantNodes: CodeNode[];
  snippets: Array<{
    nodeId: string;
    filePath: string;
    lines: string;
    content: string;
    score: number;
    reason: string;
  }>;
  graphContextSummary: string;
}


export interface ImpactRequest {
  proposedChange: string;
  targetFiles?: string[];
}

export interface ImpactResponse {
  proposedChange: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  summary: string;
  directlyAffectedNodeIds: string[];
  downstreamAffectedNodeIds: string[];
  impactPaths: Array<{
    source: string;
    path: string[];
    explanation: string;
  }>;
  componentAnalysis?: Array<{
    nodeId: string;
    whyAffected: string;
    riskReason: string;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
  evidence: Array<{
    nodeId: string;
    filePath: string;
    codeSnippet: string;
    lines: string;
    isRepositoryFact: boolean;
  }>;
  uncertainties?: string[];
}
