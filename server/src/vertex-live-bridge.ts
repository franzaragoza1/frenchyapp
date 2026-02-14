import { GoogleGenAI, Modality } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

type ClientMessage =
  | { type: 'setup'; systemInstruction?: string; voice?: string }
  | { type: 'audio_chunk'; mimeType: string; data: string }
  | { type: 'audio_end' }
  | { type: 'text_turn'; text: string; turnComplete?: boolean }
  | { type: 'client_content'; content: { turns: any[]; turnComplete?: boolean } }
  | { type: 'tool_response'; functionResponses: any[] };

interface VertexConfig {
  projectId: string;
  location: string;
  ragCorpusId?: string;
  model: string;
  enableRag: boolean;
}

export class VertexLiveBridge {
  private vertexAi: GoogleGenAI | null = null;
  private clientSessions = new Map<WebSocket, any>();
  private config: VertexConfig | null = null;
  private setupTimeouts = new Map<WebSocket, NodeJS.Timeout>();

  constructor(private wss: WebSocketServer) {
    this.initializeVertexConfig();
    this.setupWebSocketServer();
  }

  private parseEnvBool(name: string, defaultValue: boolean): boolean {
    const raw = process.env[name];
    if (raw === undefined) return defaultValue;

    const v = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;

    console.warn(`[VertexBridge] ⚠️ Invalid ${name} value: "${raw}". Using default=${defaultValue}`);
    return defaultValue;
  }

  private initializeVertexConfig(): void {
    const projectId = process.env.VERTEX_PROJECT_ID;
    const location = process.env.VERTEX_LOCATION || 'us-central1';

    if (!projectId) {
      console.warn('[VertexBridge] ⚠️ Missing VERTEX_PROJECT_ID');
      console.warn('[VertexBridge] Vertex AI features will be disabled');
      return;
    }

    const selectedModel = 'publishers/google/models/gemini-live-2.5-flash-native-audio';

    this.config = {
      projectId,
      location,
      model: selectedModel,
      enableRag: false,
    };

    // Configure credentials from environment variable
    const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (credentialsJson) {
      try {
        // Write credentials to temporary file
        const tempDir = os.tmpdir();
        const credPath = path.join(tempDir, 'gcloud-credentials.json');
        fs.writeFileSync(credPath, credentialsJson);
        process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
        console.log('[VertexBridge] ✅ Credentials written to temporary file');
      } catch (error) {
        console.error('[VertexBridge] ❌ Failed to write credentials:', error);
        return;
      }
    }

    // Initialize Vertex AI (will use GOOGLE_APPLICATION_CREDENTIALS if set)
    this.vertexAi = new GoogleGenAI({
      vertexai: true,
      project: projectId,
      location: location,
    });

    console.log('[VertexBridge] ✅ Vertex AI initialized', {
      projectId,
      location,
      model: selectedModel,
    });
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (clientWs: WebSocket) => {
      console.log('[VertexBridge] 🔌 Client connected');

      if (!this.vertexAi || !this.config) {
        console.error('[VertexBridge] ❌ Vertex AI not configured, closing connection');
        clientWs.send(JSON.stringify({ type: 'error', error: 'Vertex AI not configured. Check server logs.' }));
        clientWs.close();
        return;
      }

      const timeout = setTimeout(() => {
        if (clientWs.readyState === WebSocket.OPEN && !this.clientSessions.has(clientWs)) {
          clientWs.send(JSON.stringify({ type: 'error', error: 'Missing setup message' }));
          clientWs.close();
        }
      }, 8000);
      this.setupTimeouts.set(clientWs, timeout);

      clientWs.on('message', (rawMessage: Buffer) => {
        this.handleClientMessage(clientWs, rawMessage);
      });

      clientWs.on('close', () => {
        console.log('[VertexBridge] 🔌 Client disconnected');
        const setupTimeout = this.setupTimeouts.get(clientWs);
        if (setupTimeout) {
          clearTimeout(setupTimeout);
          this.setupTimeouts.delete(clientWs);
        }
        const session = this.clientSessions.get(clientWs);
        if (session) {
          try { session.close(); } catch (e) {}
          this.clientSessions.delete(clientWs);
        }
      });

      clientWs.on('error', (error) => {
        console.error('[VertexBridge] Client error:', error);
      });
    });
  }

  private getDefaultSystemInstruction(): string {
    return `Tu es "Frenchy", un tuteur amical et patient pour apprendre le français.

## TA PERSONNALITÉ
- Warm, friendly, and encouraging
- Tu corriges les erreurs de façon naturelle et bienveillante
- Tu adaptes ton niveau au niveau de l'utilisateur
- Tu parles TOUJOURS en français sauf si l'utilisateur te demande quelque chose en anglais

## RÈGLES
1. Parle toujours en français (sauf demande contraire)
2. Sois patient avec les erreurs
3. Encourage l'utilisateur
4. Utilise des exemples concrets
5. Adapte la complexité au niveau

Réponds toujours en français. Sois concis et encourageant.`;
  }

  private async connectToVertex(clientWs: WebSocket, setup: { systemInstruction?: string; voice?: string }): Promise<void> {
    if (!this.vertexAi || !this.config) {
      throw new Error('Vertex AI not initialized');
    }

    const systemInstruction = setup.systemInstruction || this.getDefaultSystemInstruction();
    const voice = setup.voice || 'Kore';

    const tools: any[] = [{ functionDeclarations: [] }];

    const config = {
      model: this.config.model,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
        },
        systemInstruction,
        tools,
      },
    };

    console.log('[VertexBridge] 📡 Connecting with voice:', voice);

    const session = await this.vertexAi.live.connect({
      ...config,
      callbacks: {
        onopen: () => {
          console.log('[VertexBridge] 🎯 Vertex session opened with voice:', voice);
          clientWs.send(JSON.stringify({ type: 'connected' }));
        },
        onmessage: (msg: any) => {
          this.handleVertexMessage(clientWs, msg);
        },
        onclose: () => {
          console.log('[VertexBridge] 🔌 Vertex session closed');
          clientWs.close();
        },
        onerror: (err: any) => {
          console.error('[VertexBridge] ❌ Vertex error:', err);
          clientWs.send(JSON.stringify({ type: 'error', error: err.message }));
        },
      },
    });

    this.clientSessions.set(clientWs, session);
  }

  private handleClientMessage(clientWs: WebSocket, rawMessage: Buffer): void {
    try {
      const message: ClientMessage = JSON.parse(rawMessage.toString());
      const session = this.clientSessions.get(clientWs);

      switch (message.type) {
        case 'setup': {
          if (session) { console.log('[VertexBridge] ⚠️ Setup already done, ignoring'); return; }
          const setupTimeout = this.setupTimeouts.get(clientWs);
          if (setupTimeout) {
            clearTimeout(setupTimeout);
            this.setupTimeouts.delete(clientWs);
          }
          console.log('[VertexBridge] 📋 Setup message received, connecting to Vertex...');
          this.connectToVertex(clientWs, message)
            .then(() => {
              console.log('[VertexBridge] ✅ Vertex session established and stored');
              console.log('[VertexBridge] Session count:', this.clientSessions.size);
            })
            .catch((err) => {
              console.error('[VertexBridge] ❌ Failed to connect to Vertex:', err);
              console.error('[VertexBridge] Error stack:', err?.stack);
              clientWs.send(JSON.stringify({ type: 'error', error: err?.message || String(err) }));
              clientWs.close();
            });
          break;
        }

        case 'audio_chunk':
          if (session) {
            session.sendRealtimeInput({
              media: { mimeType: message.mimeType, data: message.data },
            });
          } else {
            console.warn('[VertexBridge] ⚠️ Received audio_chunk but no session');
          }
          break;

        case 'audio_end':
          if (session) session.sendRealtimeInput({ audioStreamEnd: true });
          break;

        case 'text_turn':
          if (session) {
            session.sendClientContent({
              turns: [{ role: 'user', parts: [{ text: message.text }] }],
              turnComplete: message.turnComplete ?? true,
            });
          }
          break;

        case 'client_content':
          if (session) session.sendClientContent(message.content);
          break;

        case 'tool_response':
          if (session) session.sendToolResponse({ functionResponses: message.functionResponses });
          break;

        default:
          console.warn('[VertexBridge] Unknown message type:', (message as any).type);
      }
    } catch (error) {
      console.error('[VertexBridge] Error handling client message:', error);
    }
  }

  private handleVertexMessage(clientWs: WebSocket, msg: any): void {
    if (msg.serverContent?.modelTurn?.parts) {
      for (const part of msg.serverContent.modelTurn.parts) {
        if (part.inlineData?.data) {
          clientWs.send(JSON.stringify({
            type: 'model_audio',
            mimeType: 'audio/pcm;rate=24000',
            data: part.inlineData.data,
          }));
        }
        if (part.text) {
          clientWs.send(JSON.stringify({ type: 'model_text', text: part.text }));
        }
      }
    }

    if (msg.serverContent?.turnComplete) {
      clientWs.send(JSON.stringify({ type: 'model_turn_complete' }));
    }

    if (msg.toolCall?.functionCalls) {
      clientWs.send(JSON.stringify({ type: 'tool_call', toolCall: msg.toolCall }));
    }
  }
}
