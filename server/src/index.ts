/**
 * FrenchyAPP Bridge Server
 * Sirve el cliente estático + WebSocket para Gemini Live
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { VertexLiveBridge } from './vertex-live-bridge.js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const PORT = process.env.PORT || 8081;
const isProduction = process.env.NODE_ENV === 'production';

const httpServer = createServer();

// WebSocket server para Gemini
const geminiWss = new WebSocketServer({ noServer: true });

new VertexLiveBridge(geminiWss);

// En producción, servir el cliente compilado
if (isProduction) {
  // __dirname apunta a server/dist/, subimos 2 niveles para llegar a la raíz del proyecto
  const clientDistPath = path.join(__dirname, '..', '..', 'client', 'dist');
  
  if (fs.existsSync(clientDistPath)) {
    // Servir archivos estáticos manualmente
    httpServer.on('request', (req, res) => {
      const requestUrl = req.url || '/';
      let filePath = path.join(clientDistPath, requestUrl === '/' ? 'index.html' : requestUrl);
      
      // SPA fallback - si no existe el archivo, servir index.html
      if (!fs.existsSync(filePath)) {
        filePath = path.join(clientDistPath, 'index.html');
      }
      
      const ext = path.extname(filePath);
      const contentTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
      };
      
      const contentType = contentTypes[ext] || 'text/plain';
      
      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(404);
          res.end('Not Found');
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content);
        }
      });
    });
    console.log(`[Server] 📁 Sirviendo cliente desde: ${clientDistPath}`);
  } else {
    console.warn('[Server] ⚠️ Cliente no encontrado, solo WebSocket');
  }
} else {
  console.log('[Server] 🏃 Modo desarrollo - cliente no servido');
}

// WebSocket routing
httpServer.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '/', `http://${request.headers.host}`).pathname;
  
  if (pathname === '/gemini') {
    geminiWss.handleUpgrade(request, socket, head, (ws) => {
      geminiWss.emit('connection', ws, request);
    });
  } else if (!isProduction) {
    socket.destroy();
  }
});

httpServer.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`[Server] 🟢 FrenchyAPP escuchando en ${url}`);
  console.log(`[Server] 📡 Gemini WebSocket: ws://localhost:${PORT}/gemini`);
  console.log(`[Server] 💡 Configura VERTEX_PROJECT_ID en variables de entorno`);
});
