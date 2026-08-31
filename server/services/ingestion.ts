import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { IngestedRepository, SourceFile, FileTreeNode } from '../types/index.js';

// Configuration & Limits
const MAX_SOURCE_FILES = 300;
const MAX_FILE_SIZE_BYTES = 500 * 1024; // 500 KB

// Extension to Language Mapping
const EXTENSION_MAP: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript (JSX)',
  js: 'JavaScript',
  jsx: 'JavaScript (JSX)',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  json: 'JSON',
  py: 'Python',
  go: 'Go',
  rs: 'Rust',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  h: 'C/C++ Header',
  hpp: 'C++ Header',
  cs: 'C#',
  php: 'PHP',
  rb: 'Ruby',
  kt: 'Kotlin',
  swift: 'Swift',
  md: 'Markdown',
  yaml: 'YAML',
  yml: 'YAML',
  css: 'CSS',
  scss: 'SCSS',
  html: 'HTML',
  sql: 'SQL',
};

// Directories to ignore at any depth
const IGNORE_DIRECTORIES = new Set([
  '.git',
  '.github',
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  'vendor',
  'target',
  'bin',
  'obj',
  '__pycache__',
  '.idea',
  '.vscode',
]);

// Binary/Non-source extensions to ignore
const IGNORE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'bmp', 'tiff',
  'mp3', 'mp4', 'wav', 'avi', 'mov', 'flv',
  'zip', 'tar', 'gz', '7z', 'rar', 'pdf', 'doc', 'docx',
  'exe', 'dll', 'so', 'dylib', 'class', 'o', 'obj', 'pyc',
  'lock', 'log', 'wasm', 'map', 'min.js', 'min.css',
]);

// In-Memory Repository Store
const repositoryStore = new Map<string, IngestedRepository>();

export class IngestionError extends Error {
  constructor(message: string, public statusCode: number = 400) {
    super(message);
    this.name = 'IngestionError';
  }
}

/**
 * Validates public GitHub URL and returns owner and repo name.
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } {
  if (!url || typeof url !== 'string') {
    throw new IngestionError('A repository URL is required.');
  }

  const trimmed = url.trim();
  const githubRegex = /^https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9_\-.]+)\/([a-zA-Z0-9_\-.]+)(?:\.git|\/)?$/;
  const match = trimmed.match(githubRegex);

  if (!match) {
    throw new IngestionError('Invalid GitHub URL format. Please provide a URL in the format: https://github.com/owner/repository');
  }

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, '');

  return { owner, repo };
}

/**
 * Checks if a relative file path should be filtered out.
 */
function shouldIgnorePath(relativePath: string, size: number): boolean {
  const parts = relativePath.split('/');
  
  // Ignore directory names
  for (const part of parts) {
    if (IGNORE_DIRECTORIES.has(part.toLowerCase())) {
      return true;
    }
  }

  const fileName = parts[parts.length - 1];
  if (fileName.startsWith('.')) {
    return true; // Ignore hidden files like .gitignore, .DS_Store
  }

  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (IGNORE_EXTENSIONS.has(ext)) {
    return true;
  }

  if (size > MAX_FILE_SIZE_BYTES) {
    return true;
  }

  return false;
}

/**
 * Detects programming language from file extension.
 */
function detectLanguage(extension: string): string {
  return EXTENSION_MAP[extension.toLowerCase()] || 'Other';
}

/**
 * Builds a nested FileTreeNode array from a flat list of source files.
 */
function buildFileTree(files: SourceFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const map: Record<string, FileTreeNode> = {};

  // Sort paths to process parent folders before children
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sortedFiles) {
    const parts = file.path.split('/');
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!map[currentPath]) {
        const newNode: FileTreeNode = {
          name: part,
          path: currentPath,
          type: isFile ? 'file' : 'directory',
          ...(isFile && {
            size: file.size,
            lines: file.lines,
            extension: file.extension,
            language: file.language,
          }),
          ...(!isFile && { children: [] }),
        };

        map[currentPath] = newNode;

        if (i === 0) {
          root.push(newNode);
        } else {
          const parentPath = parts.slice(0, i).join('/');
          const parentNode = map[parentPath];
          if (parentNode && parentNode.children) {
            parentNode.children.push(newNode);
          }
        }
      }
    }
  }

  return root;
}

/**
 * Ingests a public GitHub repository safely without executing any code.
 */
export async function ingestRepository(rawUrl: string): Promise<IngestedRepository> {
  const { owner, repo } = parseGitHubUrl(rawUrl);
  const repoId = `${owner.toLowerCase()}_${repo.toLowerCase()}`;

  // 1. Fetch main or master zipball from GitHub public API
  const zipballUrl = `https://api.github.com/repos/${owner}/${repo}/zipball`;

  let response: Response;
  try {
    response = await fetch(zipballUrl, {
      headers: {
        'User-Agent': 'CafeRacer-BuildSprint-Agent',
        'Accept': 'application/vnd.github+json',
      },
    });
  } catch (err) {
    throw new IngestionError(`Network error connecting to GitHub: ${(err as Error).message}`, 502);
  }

  if (response.status === 404) {
    throw new IngestionError(`Repository "${owner}/${repo}" was not found or is private. Only public repositories are supported.`, 404);
  }

  if (response.status === 403) {
    throw new IngestionError(`GitHub API rate limit exceeded or access forbidden for "${owner}/${repo}".`, 403);
  }

  if (!response.ok) {
    throw new IngestionError(`Failed to download repository archive from GitHub (HTTP ${response.status}).`, response.status);
  }

  // 2. Extract zip archive in memory
  let zipBuffer: Buffer;
  try {
    const arrayBuffer = await response.arrayBuffer();
    zipBuffer = Buffer.from(arrayBuffer);
  } catch (err) {
    throw new IngestionError(`Failed to read repository zip payload: ${(err as Error).message}`, 500);
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch (err) {
    throw new IngestionError(`Failed to parse repository ZIP archive: ${(err as Error).message}`, 500);
  }

  const zipEntries = zip.getEntries();
  if (zipEntries.length === 0) {
    throw new IngestionError(`The downloaded repository zipball for "${owner}/${repo}" is empty.`, 400);
  }

  // Find root directory prefix added by GitHub zipball (e.g. "owner-repo-sha/")
  const rootPrefix = zipEntries[0].entryName.split('/')[0] + '/';

  const sourceFiles = new Map<string, SourceFile>();
  let totalDiscoveredFiles = 0;
  let skippedFiles = 0;
  let totalSourceLines = 0;
  let totalBytes = 0;
  const languages: Record<string, number> = {};

  // 3. Process entries with safety checks & file limits
  for (const entry of zipEntries) {
    if (entry.isDirectory) continue;

    // Prevent Zip Slip / Path Traversal
    let relativePath = entry.entryName;
    if (relativePath.startsWith(rootPrefix)) {
      relativePath = relativePath.slice(rootPrefix.length);
    }

    if (!relativePath || relativePath.includes('..')) {
      skippedFiles++;
      continue;
    }

    totalDiscoveredFiles++;

    const fileSize = entry.header.size;

    // Filter out ignored paths, extensions, or large files
    if (shouldIgnorePath(relativePath, fileSize)) {
      skippedFiles++;
      continue;
    }

    // Enforce 300 source file cap
    if (sourceFiles.size >= MAX_SOURCE_FILES) {
      skippedFiles++;
      continue;
    }

    // Extract text content safely
    let content = '';
    try {
      content = entry.getData().toString('utf8');
    } catch {
      // Non-UTF8 or corrupt file
      skippedFiles++;
      continue;
    }

    const lines = content.split('\n').length;
    const extension = relativePath.split('.').pop()?.toLowerCase() || '';
    const language = detectLanguage(extension);

    const sourceFile: SourceFile = {
      path: relativePath,
      content,
      size: fileSize,
      lines,
      extension,
      language,
    };

    sourceFiles.set(relativePath, sourceFile);

    totalSourceLines += lines;
    totalBytes += fileSize;
    languages[language] = (languages[language] || 0) + 1;
  }

  if (sourceFiles.size === 0) {
    throw new IngestionError(`No supported source files (under 500KB) found in "${owner}/${repo}".`, 400);
  }

  const sourceFileList = Array.from(sourceFiles.values());
  const tree = buildFileTree(sourceFileList);

  const ingestedRepo: IngestedRepository = {
    id: repoId,
    owner,
    name: repo,
    url: `https://github.com/${owner}/${repo}`,
    defaultBranch: 'main',
    ingestedAt: new Date().toISOString(),
    files: sourceFiles,
    tree,
    stats: {
      totalDiscoveredFiles,
      analyzedSourceFiles: sourceFiles.size,
      skippedFiles,
      totalSourceLines,
      totalBytes,
      languages,
    },
  };

  // 4. Save to In-Memory Repository Store
  repositoryStore.set(repoId, ingestedRepo);

  return ingestedRepo;
}

/**
 * Ingests a raw zip buffer uploaded from local CLI or client.
 */
export async function ingestZipBuffer(zipBuffer: Buffer, nameHint: string = 'local-repo'): Promise<IngestedRepository> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch (err) {
    throw new IngestionError(`Failed to parse repository ZIP archive: ${(err as Error).message}`, 400);
  }

  const zipEntries = zip.getEntries();
  if (zipEntries.length === 0) {
    throw new IngestionError('The uploaded repository ZIP archive is empty.', 400);
  }

  // Detect root prefix if present (e.g., folder inside zip)
  let rootPrefix = '';
  if (zipEntries[0].isDirectory) {
    rootPrefix = zipEntries[0].entryName;
  }

  const folderName = nameHint.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const repoId = `local_${folderName}_${Date.now()}`;

  const sourceFiles = new Map<string, SourceFile>();
  let totalDiscoveredFiles = 0;
  let skippedFiles = 0;
  let totalSourceLines = 0;
  let totalBytes = 0;
  const languages: Record<string, number> = {};

  for (const entry of zipEntries) {
    if (entry.isDirectory) continue;

    let relativePath = entry.entryName;
    if (rootPrefix && relativePath.startsWith(rootPrefix)) {
      relativePath = relativePath.slice(rootPrefix.length);
    }

    if (!relativePath || relativePath.includes('..')) {
      skippedFiles++;
      continue;
    }

    totalDiscoveredFiles++;
    const fileSize = entry.header.size;

    if (shouldIgnorePath(relativePath, fileSize)) {
      skippedFiles++;
      continue;
    }

    if (sourceFiles.size >= MAX_SOURCE_FILES) {
      skippedFiles++;
      continue;
    }

    let content = '';
    try {
      content = entry.getData().toString('utf8');
    } catch {
      skippedFiles++;
      continue;
    }

    const lines = content.split('\n').length;
    const extension = relativePath.split('.').pop()?.toLowerCase() || '';
    const language = detectLanguage(extension);

    const sourceFile: SourceFile = {
      path: relativePath,
      content,
      size: fileSize,
      lines,
      extension,
      language,
    };

    sourceFiles.set(relativePath, sourceFile);

    totalSourceLines += lines;
    totalBytes += fileSize;
    languages[language] = (languages[language] || 0) + 1;
  }

  if (sourceFiles.size === 0) {
    throw new IngestionError('No supported source code files found in the uploaded ZIP archive.', 400);
  }

  const sourceFileList = Array.from(sourceFiles.values());
  const tree = buildFileTree(sourceFileList);

  const ingestedRepo: IngestedRepository = {
    id: repoId,
    owner: 'local',
    name: nameHint,
    url: nameHint,
    defaultBranch: 'main',
    ingestedAt: new Date().toISOString(),
    files: sourceFiles,
    tree,
    stats: {
      totalDiscoveredFiles,
      analyzedSourceFiles: sourceFiles.size,
      skippedFiles,
      totalSourceLines,
      totalBytes,
      languages,
    },
  };

  repositoryStore.set(repoId, ingestedRepo);
  return ingestedRepo;
}

/**
 * Ingests a local filesystem repository (Root path) cleanly using the same filtering & store logic.
 */
export async function ingestLocalDirectory(dirPath: string): Promise<IngestedRepository> {
  const resolvedPath = path.resolve(dirPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new IngestionError(`Local directory does not exist: "${resolvedPath}"`, 404);
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    throw new IngestionError(`Specified path is not a directory: "${resolvedPath}"`, 400);
  }

  const folderName = path.basename(resolvedPath) || 'local-repo';
  // Standardize ID format
  const sanitizedFolder = folderName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const repoId = `local_${sanitizedFolder}`;

  const sourceFiles = new Map<string, SourceFile>();
  let totalDiscoveredFiles = 0;
  let skippedFiles = 0;
  let totalSourceLines = 0;
  let totalBytes = 0;
  const languages: Record<string, number> = {};

  function walkDir(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      let relativePath = path.relative(resolvedPath, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (IGNORE_DIRECTORIES.has(entry.name.toLowerCase()) || entry.name.startsWith('.')) {
          continue;
        }
        walkDir(fullPath);
      } else if (entry.isFile()) {
        totalDiscoveredFiles++;

        let size = 0;
        try {
          size = fs.statSync(fullPath).size;
        } catch {
          skippedFiles++;
          continue;
        }

        if (shouldIgnorePath(relativePath, size)) {
          skippedFiles++;
          continue;
        }

        if (sourceFiles.size >= MAX_SOURCE_FILES) {
          skippedFiles++;
          continue;
        }

        let content = '';
        try {
          content = fs.readFileSync(fullPath, 'utf8');
        } catch {
          skippedFiles++;
          continue;
        }

        const lines = content.split('\n').length;
        const extension = relativePath.split('.').pop()?.toLowerCase() || '';
        const language = detectLanguage(extension);

        const sourceFile: SourceFile = {
          path: relativePath,
          content,
          size,
          lines,
          extension,
          language,
        };

        sourceFiles.set(relativePath, sourceFile);

        totalSourceLines += lines;
        totalBytes += size;
        languages[language] = (languages[language] || 0) + 1;
      }
    }
  }

  try {
    walkDir(resolvedPath);
  } catch (err) {
    throw new IngestionError(`Failed to read local directory: ${(err as Error).message}`, 500);
  }

  if (sourceFiles.size === 0) {
    throw new IngestionError(`No supported source files (under 500KB) found in local directory "${resolvedPath}".`, 400);
  }

  const sourceFileList = Array.from(sourceFiles.values());
  const tree = buildFileTree(sourceFileList);

  const ingestedRepo: IngestedRepository = {
    id: repoId,
    owner: 'local',
    name: folderName,
    url: resolvedPath,
    defaultBranch: 'main',
    ingestedAt: new Date().toISOString(),
    files: sourceFiles,
    tree,
    stats: {
      totalDiscoveredFiles,
      analyzedSourceFiles: sourceFiles.size,
      skippedFiles,
      totalSourceLines,
      totalBytes,
      languages,
    },
  };

  repositoryStore.set(repoId, ingestedRepo);
  return ingestedRepo;
}

/**
 * Retrieves an ingested repository from the in-memory store.
 */
export function getIngestedRepository(repoId: string): IngestedRepository | undefined {
  return repositoryStore.get(repoId);
}
