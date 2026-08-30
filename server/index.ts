import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import repoRoutes from './routes/repo.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health Check Endpoint
app.get('/api/health', (_req, res) => {
  const key = process.env.GEMINI_API_KEY || '';
  const isConfigured = Boolean(key && key.trim() !== '' && key !== 'your_gemini_api_key_here' && !key.includes('placeholder'));
  res.json({
    status: 'ok',
    service: 'CafeRacer API',
    version: '0.1.0',
    geminiConfigured: isConfigured,
    timestamp: new Date().toISOString(),
  });
});

// Repo routes placeholder
app.use('/api/repo', repoRoutes);

app.listen(PORT, () => {
  console.log(`[CafeRacer Server] Running on http://localhost:${PORT}`);
});
