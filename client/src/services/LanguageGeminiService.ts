/**
 * LanguageGeminiService - Chatbot de voz para aprender francés
 * Sin efectos de radio - audio directo
 */

interface ServerContent {
  modelTurn?: {
    parts?: Array<{ text?: string; inlineData?: { data: string } }>;
  };
  turnComplete?: boolean;
}

interface LiveServerMessage {
  serverContent?: ServerContent;
  toolCall?: any;
}

type AudioCallback = (active: boolean) => void;
type TranscriptCallback = (text: string, isFinal: boolean) => void;

export class LanguageGeminiService {
  private static instance: LanguageGeminiService | null = null;
  private static instanceId: number = 0;
  private readonly instanceId: number;

  public static getInstance(
    onMicStateChange: AudioCallback,
    onSpeakingStateChange: AudioCallback,
    onTranscriptUpdate: TranscriptCallback,
  ): LanguageGeminiService {
    if (LanguageGeminiService.instance) {
      LanguageGeminiService.instance.onMicStateChange = onMicStateChange;
      LanguageGeminiService.instance.onSpeakingStateChange = onSpeakingStateChange;
      LanguageGeminiService.instance.onTranscriptUpdate = onTranscriptUpdate;
      return LanguageGeminiService.instance;
    }

    LanguageGeminiService.instanceId++;
    LanguageGeminiService.instance = new LanguageGeminiService(
      onMicStateChange,
      onSpeakingStateChange,
      onTranscriptUpdate,
    );
    return LanguageGeminiService.instance;
  }

  public static destroyInstance(): void {
    if (LanguageGeminiService.instance) {
      LanguageGeminiService.instance.disconnect();
      LanguageGeminiService.instance = null;
    }
  }

  private session: any = null;
  private bridgeWs: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private useAudioWorklet: boolean = true;
  private stream: MediaStream | null = null;

  private nextStartTime = 0;
  private audioQueue: AudioBufferSourceNode[] = [];

  private onMicStateChange: AudioCallback;
  private onSpeakingStateChange: AudioCallback;
  private onTranscriptUpdate: TranscriptCallback;
  private isRecording = false;

  private wsReadyState: number = 3;
  private readonly WS_CONNECTING = 0;
  private readonly WS_OPEN = 1;
  private readonly WS_CLOSING = 2;
  private readonly WS_CLOSED = 3;

  private isConnecting: boolean = false;
  private isConnected: boolean = false;
  private isSessionFullyReady: boolean = false;

  private lastTurnTime: Date = new Date();
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private selectedVoice: string = 'Kore';

  constructor(
    onMicStateChange: AudioCallback,
    onSpeakingStateChange: AudioCallback,
    onTranscriptUpdate: TranscriptCallback,
  ) {
    this.instanceId = LanguageGeminiService.instanceId;
    this.onMicStateChange = onMicStateChange;
    this.onSpeakingStateChange = onSpeakingStateChange;
    this.onTranscriptUpdate = onTranscriptUpdate;
  }

  public setVoice(voice: string): void {
    this.selectedVoice = voice;
    console.log('[FrenchyAPP] 🎙️ Voice set to:', voice);
  }

  private isSessionReady(): boolean {
    return !!(this.session && this.isConnected && this.isSessionFullyReady && this.wsReadyState === this.WS_OPEN);
  }

  private async initializeAudio(): Promise<void> {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) throw new Error("AudioContext not supported");

    if (this.audioContext) {
      try { await this.audioContext.close(); } catch {}
    }

    this.audioContext = new AudioContextClass();
    console.log("[FrenchyAPP] ✅ AudioContext created");
  }

  private getBridgeUrl(): string {
    // En producción usa la misma host, en desarrollo usa localhost:8081
    if (typeof window === 'undefined') return 'ws://localhost:8081/gemini';
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isDev) return 'ws://localhost:8081/gemini';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/gemini`;
  }

  public async connect(): Promise<void> {
    if (this.session && this.isConnected) {
      console.log("[FrenchyAPP] ⏸️ Already connected");
      return;
    }

    if (this.isConnecting) {
      console.log("[FrenchyAPP] ⏸️ Already connecting");
      return;
    }

    this.isConnecting = true;
    console.log("[FrenchyAPP] 📍 Connecting to Gemini Live...");

    try {
      await this.initializeAudio();
      const systemInstruction = this.getFrenchTutorPrompt();
      const bridgeUrl = this.getBridgeUrl();
      console.log('[FrenchyAPP] 🔗 Connecting to:', bridgeUrl);

      await new Promise<void>((resolve, reject) => {
        const toLiveServerMessage = (payload: any): LiveServerMessage | null => {
          if (!payload || typeof payload !== "object") return null;
          if (payload.type === "model_audio") {
            return { serverContent: { modelTurn: { parts: [{ inlineData: { data: payload.data } }] } } } as any;
          }
          if (payload.type === "model_text") {
            return { serverContent: { modelTurn: { parts: [{ text: payload.text }] } } } as any;
          }
          if (payload.type === "model_turn_complete") {
            return { serverContent: { turnComplete: true } } as any;
          }
          if (payload.type === "tool_call") {
            return { toolCall: payload.toolCall } as any;
          }
          return null;
        };

        if (this.bridgeWs && this.bridgeWs.readyState === WebSocket.OPEN) {
          try { this.bridgeWs.close(1000, "Reconnect"); } catch {}
        }

        const ws = new WebSocket(bridgeUrl);
        this.bridgeWs = ws;
        this.wsReadyState = this.WS_CONNECTING;
        this.isSessionFullyReady = false;

        const sendJson = (data: any) => ws.send(JSON.stringify(data));

        const bridgeSession: any = {
          sendRealtimeInput: (input: any) => {
            if (input?.media?.mimeType && input?.media?.data) {
              sendJson({ type: "audio_chunk", mimeType: input.media.mimeType, data: input.media.data });
            }
            if (input?.audioStreamEnd) {
              sendJson({ type: "audio_end" });
            }
          },
          sendClientContent: (content: any) => sendJson({ type: "client_content", content }),
          sendToolResponse: (payload: any) => sendJson({ type: "tool_response", functionResponses: payload?.functionResponses || [] }),
          close: () => { try { ws.close(1000, "Client disconnect"); } catch {} },
        };

        let didResolve = false;

        ws.onopen = () => {
          this.wsReadyState = this.WS_OPEN;
          sendJson({ type: "setup", systemInstruction, voice: this.selectedVoice });
        };

        ws.onmessage = (event) => {
          let payload: any = null;
          try { payload = JSON.parse(event.data); } catch { return; }

          if (payload?.type === "connected") {
            if (!didResolve) {
              this.session = bridgeSession;
              this.isConnecting = false;
              this.isConnected = true;
              this.isSessionFullyReady = true;
              didResolve = true;
              resolve();
            }
            return;
          }

          if (payload?.type === "error") {
            if (!didResolve) reject(new Error(payload?.error || "Bridge error"));
            return;
          }

          const liveMsg = toLiveServerMessage(payload);
          if (liveMsg) this.handleMessage(liveMsg);
        };

        ws.onclose = () => {
          this.wsReadyState = this.WS_CLOSED;
          this.cleanupAudioPipeline();
          this.isSessionFullyReady = false;
          this.isConnected = false;
          if (!didResolve) reject(new Error("Connection closed"));
        };

        ws.onerror = () => {};
      });

      this.isConnecting = false;
      this.isConnected = true;
      this.lastTurnTime = new Date();
      this.startKeepAlive();
      console.log("[FrenchyAPP] ✅ Session established with voice:", this.selectedVoice);
    } catch (error) {
      console.error("[FrenchyAPP] ❌ Connection failed:", error);
      this.isConnecting = false;
      this.isConnected = false;
      throw error;
    }
  }

  private getFrenchTutorPrompt(): string {
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

  private startKeepAlive(): void {
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    this.keepAliveInterval = setInterval(() => {
      if (!this.isSessionReady()) return;
      const timeSinceLastTurn = Date.now() - this.lastTurnTime.getTime();
      if (timeSinceLastTurn > 2 * 60 * 1000) {
        try {
          this.session.sendClientContent({ turns: [{ role: "user", parts: [{ text: "[KEEP_ALIVE]" }] }] });
        } catch {}
      }
    }, 30 * 1000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) { clearInterval(this.keepAliveInterval); this.keepAliveInterval = null; }
  }

  private async setupAudioInput(): Promise<void> {
    if (!this.audioContext || !this.stream) throw new Error("AudioContext or stream not initialized");
    if (this.audioContext.state === "closed") throw new Error("AudioContext is closed");

    this.inputSource = this.audioContext.createMediaStreamSource(this.stream);

    if (this.useAudioWorklet && "audioWorklet" in this.audioContext) {
      try { await this.setupAudioWorklet(); return; } 
      catch (e) { console.warn("AudioWorklet failed:", e); this.useAudioWorklet = false; }
    }
    this.setupScriptProcessor();
  }

  private async setupAudioWorklet(): Promise<void> {
    if (!this.audioContext || !this.inputSource) throw new Error("AudioContext not initialized");
    await this.audioContext.audioWorklet.addModule("/audio-processor.js");
    this.workletNode = new AudioWorkletNode(this.audioContext, "gemini-audio-processor");

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type !== "audio") return;
      const inputData = event.data.buffer as Float32Array;
      const downsampledData = this.downsampleBuffer(inputData, this.audioContext!.sampleRate, 16000);
      const pcmData = this.floatTo16BitPCM(downsampledData);
      const base64Audio = this.arrayBufferToBase64(pcmData);
      try {
        this.session.sendRealtimeInput({ media: { mimeType: "audio/pcm;rate=16000", data: base64Audio } });
      } catch { this.stopRecording(); }
    };

    this.inputSource.connect(this.workletNode);
    const muteGain = this.audioContext.createGain();
    muteGain.gain.value = 0;
    this.workletNode.connect(muteGain);
    muteGain.connect(this.audioContext.destination);
  }

  private setupScriptProcessor(): void {
    if (!this.audioContext || !this.inputSource) throw new Error("AudioContext not initialized");
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    const muteGain = this.audioContext.createGain();
    muteGain.gain.value = 0;
    this.processor.connect(muteGain);
    muteGain.connect(this.audioContext.destination);

    this.processor.onaudioprocess = (e) => {
      if (!this.isRecording) return;
      const inputData = e.inputBuffer.getChannelData(0);
      const downsampledData = this.downsampleBuffer(inputData, this.audioContext!.sampleRate, 16000);
      const pcmData = this.floatTo16BitPCM(downsampledData);
      const base64Audio = this.arrayBufferToBase64(pcmData);
      try {
        this.session.sendRealtimeInput({ media: { mimeType: "audio/pcm;rate=16000", data: base64Audio } });
      } catch { this.stopRecording(); }
    };
  }

  public async startRecording(): Promise<void> {
    console.log("[FrenchyAPP] 🎤 Starting recording...");
    this.lastTurnTime = new Date();

    if (!this.isSessionReady()) { console.error("[FrenchyAPP] ❌ Session not ready"); return; }

    if (!this.stream) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("[FrenchyAPP] ✅ Microphone access granted");
      } catch (error) {
        console.error("[FrenchyAPP] ❌ Microphone denied:", error);
        alert("Microphone access required");
        return;
      }
    }

    if (!this.inputSource || (!this.processor && !this.workletNode)) await this.setupAudioInput();
    if (this.audioContext?.state === "suspended") await this.audioContext.resume();

    if (this.inputSource) {
      if (this.workletNode) this.workletNode.port.postMessage({ type: "start" });
      else if (this.processor) this.inputSource.connect(this.processor);
    }

    this.isRecording = true;
    this.onMicStateChange(true);
    console.log("[FrenchyAPP] ✅ Recording started");
  }

  public stopRecording(): void {
    console.log("[FrenchyAPP] 🛑 Stopping recording...");
    this.isRecording = false;

    try {
      if (this.session && this.isConnected) {
        try { this.session.sendRealtimeInput({ audioStreamEnd: true }); } catch {}
        this.session.sendClientContent({ turns: [{ role: "user", parts: [{ text: "" }] }], turnComplete: true });
      }
    } catch {}

    if (this.workletNode) this.workletNode.port.postMessage({ type: "stop" });
    if (this.inputSource && this.processor) { try { this.inputSource.disconnect(this.processor); } catch {} }
    this.onMicStateChange(false);
  }

  private async handleMessage(message: LiveServerMessage): Promise<void> {
    if (!this.isSessionFullyReady) { this.isSessionFullyReady = true; console.log("[FrenchyAPP] ✅ Session fully ready"); }
    this.lastTurnTime = new Date();

    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData) {
      this.onSpeakingStateChange(true);
      await this.playAudioChunk(audioData);
    }

    const textContent = message.serverContent?.modelTurn?.parts?.find((p: any) => p.text);
    if (textContent?.text) this.onTranscriptUpdate(textContent.text, true);

    if (message.serverContent?.turnComplete) setTimeout(() => this.onSpeakingStateChange(false), 800);
  }

  private async playAudioChunk(base64String: string): Promise<void> {
    if (!this.audioContext) return;

    const arrayBuffer = this.base64ToArrayBuffer(base64String);
    const float32Data = this.pcm16ToFloat32(arrayBuffer);

    const audioBuffer = this.audioContext.createBuffer(1, float32Data.length, 24000);
    audioBuffer.getChannelData(0).set(float32Data);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    const currentTime = this.audioContext.currentTime;
    if (this.nextStartTime < currentTime) this.nextStartTime = currentTime;
    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
    this.audioQueue.push(source);

    source.onended = () => {
      this.audioQueue = this.audioQueue.filter((s) => s !== source);
      if (this.audioQueue.length === 0) this.onSpeakingStateChange(false);
    };
  }

  private sendAndLog(content: any, _category: string): void {
    if (!this.session) return;
    try { this.session.sendClientContent(content); this.lastTurnTime = new Date(); } catch {}
  }

  public sendMessage(text: string): void {
    if (!this.isSessionReady()) return;
    this.sendAndLog({ turns: [{ role: "user", parts: [{ text }] }], turnComplete: true }, "user_message");
  }

  public disconnect(): void {
    console.log("[FrenchyAPP] 🔌 Disconnecting...");
    this.stopKeepAlive();
    this.cleanupAudioPipeline();
    if (this.session) { try { this.session.close(); } catch {} }
    this.session = null;
    this.bridgeWs = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.isSessionFullyReady = false;
    console.log("[FrenchyAPP] ✅ Disconnected");
  }

  private cleanupAudioPipeline(): void {
    this.stopKeepAlive();
    if (this.isRecording) {
      this.isRecording = false;
      if (this.inputSource && this.workletNode) { try { this.workletNode.port.postMessage({ type: "stop" }); this.inputSource.disconnect(this.workletNode); } catch {} }
      if (this.inputSource && this.processor) { try { this.inputSource.disconnect(this.processor); } catch {} }
      this.onMicStateChange(false);
    }
    if (this.inputSource) { try { this.inputSource.disconnect(); } catch {} this.inputSource = null; }
    if (this.workletNode) { try { this.workletNode.disconnect(); } catch {} this.workletNode = null; }
    if (this.processor) { try { this.processor.disconnect(); } catch {} this.processor = null; }
    if (this.stream) { try { this.stream.getTracks().forEach((t) => t.stop()); } catch {} this.stream = null; }
    this.audioQueue.forEach((s) => { try { s.stop(); } catch {} });
    this.audioQueue = [];
    this.nextStartTime = 0;
    this.onSpeakingStateChange(false);
  }

  private downsampleBuffer(buffer: Float32Array, inputRate: number, outputRate: number): Float32Array {
    if (outputRate === inputRate) return buffer;
    const ratio = inputRate / outputRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcIndex = Math.round(i * ratio);
      result[i] = srcIndex < buffer.length ? buffer[srcIndex] : 0;
    }
    return result;
  }

  private floatTo16BitPCM(input: Float32Array): ArrayBuffer {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output.buffer;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes.buffer;
  }

  private pcm16ToFloat32(buffer: ArrayBuffer): Float32Array {
    const int16 = new Int16Array(buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
    return float32;
  }
}
