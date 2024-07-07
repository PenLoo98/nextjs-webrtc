import fs from 'fs';
import https from 'https';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import next from 'next';
import cors from 'cors'; // Import CORS

// __dirname and __filename are not available in ES modules, so we need to set them up
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const port = 3000;

// Load your SSL certificates
const key = fs.readFileSync(path.join(__dirname, 'dev.key'));
const cert = fs.readFileSync(path.join(__dirname, 'dev.cert'));
const options = {
  key: key,
  cert: cert
};

app.prepare().then(() => {
  const server = express();

  // Enable CORS for all routes
  server.use(cors());

  // Serve static files from the 'public' directory
  server.use(express.static(path.join(__dirname, 'public')));

  // Handle all routes with Next.js
  server.all('*', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow requests from any origin
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return handle(req, res);
  });

  // Create HTTPS server
  https.createServer(options, server).listen(port, () => {
    console.log(`Server is running on https://localhost:${port}`);
  });
});