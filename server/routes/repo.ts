import { Router } from 'express';
import { ingestRepository, ingestLocalDirectory, getIngestedRepository, IngestionError } from '../services/ingestion.js';
import { buildDependencyGraph } from '../services/graph.js';
import { retrieveContext } from '../services/context.js';
import { analyzeGraphImpact } from '../services/impact.js';
import { generateQAResponse, generateImpactResponse } from '../services/gemini.js';
import { QAResponse, ImpactResponse, IngestResponse } from '../types/index.js';

const router = Router();

// POST /api/repo/ingest - Real public GitHub repository ingestion
router.post('/ingest', async (req, res) => {
  const { url, repoUrl } = req.body || {};
  const targetUrl = url || repoUrl;

  if (!targetUrl) {
    res.status(400).json({ error: 'Repository URL is required' });
    return;
  }

  try {
    const repo = await ingestRepository(targetUrl);

    // Build and cache dependency graph upon ingestion
    if (!repo.graph) {
      repo.graph = buildDependencyGraph(repo);
    }

    const response: IngestResponse = {
      success: true,
      repoId: repo.id,
      owner: repo.owner,
      name: repo.name,
      url: repo.url,
      defaultBranch: repo.defaultBranch,
      stats: repo.stats,
      tree: repo.tree,
    };

    res.json(response);
  } catch (err) {
    if (err instanceof IngestionError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('Ingestion error:', err);
    res.status(500).json({ error: 'An unexpected error occurred during repository ingestion.' });
  }
});

// POST /api/repo/ingest-local - Local directory ingestion for CLI Root analysis
router.post('/ingest-local', async (req, res) => {
  const { path: dirPath, dir } = req.body || {};
  const targetPath = dirPath || dir;

  if (!targetPath) {
    res.status(400).json({ error: 'Directory path is required' });
    return;
  }

  try {
    const repo = await ingestLocalDirectory(targetPath);

    if (!repo.graph) {
      repo.graph = buildDependencyGraph(repo);
    }

    const response: IngestResponse = {
      success: true,
      repoId: repo.id,
      owner: repo.owner,
      name: repo.name,
      url: repo.url,
      defaultBranch: repo.defaultBranch,
      stats: repo.stats,
      tree: repo.tree,
    };

    res.json(response);
  } catch (err) {
    if (err instanceof IngestionError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('Local ingestion error:', err);
    res.status(500).json({ error: 'An unexpected error occurred during local repository ingestion.' });
  }
});

// GET /api/repo/:id - Retrieve ingested repo details & file tree
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const repo = getIngestedRepository(id);

  if (!repo) {
    res.status(404).json({ error: `Repository with ID "${id}" was not found in memory store.` });
    return;
  }

  res.json({
    id: repo.id,
    owner: repo.owner,
    name: repo.name,
    url: repo.url,
    defaultBranch: repo.defaultBranch,
    stats: repo.stats,
    tree: repo.tree,
  });
});

// GET /api/repo/:id/file?path=src/App.tsx - Retrieve source file content
router.get('/:id/file', (req, res) => {
  const { id } = req.params;
  const filePath = req.query.path as string;

  if (!filePath) {
    res.status(400).json({ error: 'File path query parameter is required.' });
    return;
  }

  const repo = getIngestedRepository(id);
  if (!repo) {
    res.status(404).json({ error: `Repository with ID "${id}" not found.` });
    return;
  }

  const file = repo.files.get(filePath);
  if (!file) {
    res.status(404).json({ error: `File "${filePath}" not found in repository.` });
    return;
  }

  res.json(file);
});

// GET /api/repo/:id/graph - Returns real AST-derived DependencyGraph
router.get('/:id/graph', (req, res) => {
  const { id } = req.params;
  const repo = getIngestedRepository(id);

  if (!repo) {
    res.status(404).json({ error: `Repository "${id}" not found.` });
    return;
  }

  // Generate graph if not already cached
  if (!repo.graph) {
    repo.graph = buildDependencyGraph(repo);
  }

  res.json({ repoId: id, graph: repo.graph });
});


// POST /api/repo/:id/qa - Codebase Q&A endpoint powered by Graph Retrieval + Gemini
router.post('/:id/qa', async (req, res) => {
  const { id } = req.params;
  const { question, nodeId } = req.body || {};

  if (!question) {
    res.status(400).json({ error: 'Question is required' });
    return;
  }

  const repo = getIngestedRepository(id);
  if (!repo) {
    res.status(404).json({ error: `Repository "${id}" not found.` });
    return;
  }

  if (!repo.graph) {
    repo.graph = buildDependencyGraph(repo);
  }

  try {
    const context = retrieveContext(repo, question, nodeId);
    const qaResult = await generateQAResponse(question, context);
    res.json(qaResult);
  } catch (err) {
    console.error('Q&A generation error:', err);
    res.status(500).json({ error: 'Failed to generate codebase Q&A response.' });
  }
});

// POST /api/repo/:id/impact - Real Change Impact Intelligence endpoint
router.post('/:id/impact', async (req, res) => {
  const { id } = req.params;
  const { proposedChange, change, targetFiles } = req.body || {};
  const targetChange = proposedChange || change;

  if (!targetChange) {
    res.status(400).json({ error: 'Proposed change description is required.' });
    return;
  }

  const repo = getIngestedRepository(id);
  if (!repo) {
    res.status(404).json({ error: `Repository "${id}" not found.` });
    return;
  }

  if (!repo.graph) {
    repo.graph = buildDependencyGraph(repo);
  }

  try {
    const impactCtx = analyzeGraphImpact(repo, targetChange, targetFiles);
    const result = await generateImpactResponse(targetChange, impactCtx);
    res.json(result);
  } catch (err) {
    console.error('Impact analysis error:', err);
    res.status(500).json({ error: 'Failed to analyze change impact.' });
  }
});

export default router;

