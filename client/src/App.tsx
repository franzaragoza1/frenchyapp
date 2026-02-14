/**
 * FrenchyAPP - Chatbot de voz para aprender francés
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { LanguageGeminiService } from './services/LanguageGeminiService';
import type { AppMode, GeminiState, Message } from './types/language.types';

// Voice options for Gemini
const VOICES = {
  female: [
    { id: 'Charon', name: 'Charon' },
    { id: 'Kore', name: 'Kore' },
    { id: 'Aoede', name: 'Aoede' },
    { id: 'Autonoe', name: 'Autonoe' },
    { id: 'Vindemiatrix', name: 'Vindemiatrix' },
  ],
  male: [
    { id: 'Puck', name: 'Puck' },
    { id: 'Iapetus', name: 'Iapetus' },
    { id: 'Rasalgethi', name: 'Rasalgethi' },
    { id: 'Achird', name: 'Achird' },
    { id: 'Sadaltager', name: 'Sadaltager' },
  ],
};

// App stages
type AppStage = 'login' | 'voice-select' | 'level-select' | 'main';

function App() {
  // Stage management
  const [stage, setStage] = useState<AppStage>('login');
  
  // Login state
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState(false);
  
  // Voice selection state
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  
  // Level selection state
  const [userLevel, setUserLevel] = useState<string>('');
  const [isLevelSet, setIsLevelSet] = useState(false);
  
  // App state
  const [geminiState, setGeminiState] = useState<GeminiState>('disconnected');
  const [isMicActive, setIsMicActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [mode, setMode] = useState<AppMode>('conversation');
  const [messages, setMessages] = useState<Message[]>([]);

  // Refs
  const geminiServiceRef = useRef<LanguageGeminiService | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Callbacks
  const handleMicStateChange = useCallback((active: boolean) => {
    setIsMicActive(active);
    if (active) {
      setGeminiState('listening');
    }
  }, []);

  const handleSpeakingStateChange = useCallback((speaking: boolean) => {
    if (speaking) {
      setGeminiState('speaking');
      setIsSpeaking(true);
    } else if (!isMicActive) {
      setGeminiState('idle');
      setIsSpeaking(false);
    }
  }, [isMicActive]);

  const handleTranscriptUpdate = useCallback((text: string, isFinal: boolean) => {
    if (isFinal && text) {
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, userMessage]);
      setGeminiState('thinking');
    }
  }, []);

  // Connect to Gemini with selected voice
  const connectToGemini = useCallback((voice: string) => {
    const service = LanguageGeminiService.getInstance(
      handleMicStateChange,
      handleSpeakingStateChange,
      handleTranscriptUpdate,
    );
    
    service.setVoice(voice);
    geminiServiceRef.current = service;

    console.log('[App] 🤖 Connecting to Gemini Live...');
    setGeminiState('connecting');
    service.connect().then(() => {
      setGeminiState('idle');
      console.log('[App] ✅ Connected');
    }).catch((err) => {
      console.error('[App] ❌ Connection failed:', err);
      setGeminiState('disconnected');
    });
  }, [handleMicStateChange, handleSpeakingStateChange, handleTranscriptUpdate]);

  // Handle password submit
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'bananaface') {
      setStage('voice-select');
      setLoginError(false);
    } else {
      setLoginError(true);
    }
  };

  // Handle voice selection
  const handleVoiceSelect = (voiceId: string) => {
    setSelectedVoice(voiceId);
  };

  // Handle voice confirm
  const handleVoiceConfirm = () => {
    setStage('level-select');
    connectToGemini(selectedVoice);
  };

  // Handle level submit
  const handleLevelSubmit = (level: string) => {
    setUserLevel(level);
    setIsLevelSet(true);
    setStage('main');
    
    let introMessage = '';
    switch (level) {
      case 'beginner':
        introMessage = "Bonjour! Je suis Frenchy, ton tuteur de français. Je vais t'aider à apprendre le français de manière amusante et efficace. Je commence? Parle-moi un peu de toi!";
        break;
      case 'intermediate':
        introMessage = "Salut! Je suis Frenchy. Bienvenue! On va pratiquer ton français ensemble. Raconte-moi un peu ce que tu fais dans la vie, tes hobbies, ce que tu aimes en France...";
        break;
      case 'advanced':
        introMessage = "Ah, un francophone avancé! Parfait. On va pouvoir discuter de sujets passionnants: actualité, culture, philosophie, ce que tu veux. Quel sujet t'intéresse aujourd'hui?";
        break;
    }

    const assistantMessage: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: introMessage,
      timestamp: Date.now(),
    };
    setMessages([assistantMessage]);
  };

  // Toggle microphone
  const handleMicToggle = async () => {
    if (!geminiServiceRef.current || geminiState === 'disconnected') return;

    if (isMicActive) {
      geminiServiceRef.current.stopRecording();
    } else {
      await geminiServiceRef.current.startRecording();
    }
  };

  // Change mode
  const handleModeChange = (newMode: AppMode) => {
    setMode(newMode);
    
    let modeMessage = '';
    if (newMode === 'conversation') {
      modeMessage = "D'accord! Passons en mode conversation libre. On peut parler de ce que tu veux. Vas-y, dis-moi quelque chose en français!";
    } else {
      modeMessage = "Parfait! Passons aux exercices. Tu veux travailler quoi? Le vocabulaire, la grammaire, la prononciation, ou peut-être un role-play?";
    }

    const modeMsg: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: modeMessage,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, modeMsg]);
  };

  // Get status icon
  const getStatusIcon = () => {
    switch (geminiState) {
      case 'disconnected': return '🔴';
      case 'connecting': return '🟡';
      case 'idle': return '🟢';
      case 'listening': return '🎤';
      case 'thinking': return '💭';
      case 'speaking': return '🔊';
      default: return '⚪';
    }
  };

  // Get level text
  const getLevelText = (level: string) => {
    switch (level) {
      case 'beginner': return 'Débutant';
      case 'intermediate': return 'Intermédiaire';
      case 'advanced': return 'Avancé';
      default: return '';
    }
  };

  // ==================== LOGIN SCREEN ====================
  if (stage === 'login') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass max-w-md w-full p-8">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img 
              src="/frenchylogo.png" 
              alt="FrenchyAPP Logo" 
              className="w-48 h-auto rounded-2xl"
            />
          </div>
          
          <p className="text-white/70 text-center mb-8">
            Accès sécurisé
          </p>

          <form onSubmit={handlePasswordSubmit}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe"
              className={`w-full py-4 px-6 bg-white/10 border-2 rounded-xl text-white text-center text-xl placeholder-white/30 focus:outline-none transition-colors ${
                loginError ? 'border-red-500' : 'border-white/20 focus:border-primary'
              }`}
            />
            
            {loginError && (
              <p className="text-red-400 text-center mt-4">Mot de passe incorrect</p>
            )}
            
            <button
              type="submit"
              className="w-full mt-6 py-4 bg-primary hover:bg-primary/80 text-white rounded-xl font-semibold transition-all"
            >
              Entrer
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==================== VOICE SELECT SCREEN ====================
  if (stage === 'voice-select') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass max-w-lg w-full p-8">
          <h1 className="text-2xl font-bold text-white mb-2 text-center">
            🎙️ Sélectionne ta voix
          </h1>
          <p className="text-white/60 text-center mb-6">
            Choisis la voix de Frenchy
          </p>

          <div className="space-y-6">
            {/* Female Voices */}
            <div>
              <h3 className="text-white/80 font-semibold mb-3">Voces Femeninas</h3>
              <div className="grid grid-cols-2 gap-2">
                {VOICES.female.map((voice) => (
                  <button
                    key={voice.id}
                    onClick={() => handleVoiceSelect(voice.id)}
                    className={`py-3 px-4 rounded-lg font-medium transition-all ${
                      selectedVoice === voice.id
                        ? 'bg-primary text-white'
                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                    }`}
                  >
                    {voice.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Male Voices */}
            <div>
              <h3 className="text-white/80 font-semibold mb-3">Voces Masculinas</h3>
              <div className="grid grid-cols-2 gap-2">
                {VOICES.male.map((voice) => (
                  <button
                    key={voice.id}
                    onClick={() => handleVoiceSelect(voice.id)}
                    className={`py-3 px-4 rounded-lg font-medium transition-all ${
                      selectedVoice === voice.id
                        ? 'bg-primary text-white'
                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                    }`}
                  >
                    {voice.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={handleVoiceConfirm}
            className="w-full mt-8 py-4 bg-green-500 hover:bg-green-500/80 text-white rounded-xl font-semibold transition-all"
          >
            Confirmer
          </button>
        </div>
      </div>
    );
  }

  // ==================== LEVEL SELECT SCREEN ====================
  if (stage === 'level-select') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass max-w-md w-full p-8">
          <h1 className="text-4xl font-bold text-white mb-2 text-center">
            🇫🇷 FrenchyAPP
          </h1>
          <p className="text-white/70 text-center mb-8">
            Apprends le français avec un ami virtuel
          </p>

          <div className="space-y-4">
            <p className="text-white text-center mb-4">
              Quel est ton niveau de français?
            </p>
            
            <button
              onClick={() => handleLevelSubmit('beginner')}
              className="w-full py-4 px-6 bg-green-500/80 hover:bg-green-500 text-white rounded-xl font-semibold transition-all hover:scale-105"
            >
              🌱 Débutant
              <span className="block text-sm font-normal opacity-80">
                Je débute tout juste
              </span>
            </button>

            <button
              onClick={() => handleLevelSubmit('intermediate')}
              className="w-full py-4 px-6 bg-blue-500/80 hover:bg-blue-500 text-white rounded-xl font-semibold transition-all hover:scale-105"
            >
              📚 Intermédiaire
              <span className="block text-sm font-normal opacity-80">
                Je comprends assez bien
              </span>
            </button>

            <button
              onClick={() => handleLevelSubmit('advanced')}
              className="w-full py-4 px-6 bg-purple-500/80 hover:bg-purple-500 text-white rounded-xl font-semibold transition-all hover:scale-105"
            >
              🎓 Avancé
              <span className="block text-sm font-normal opacity-80">
                Je parle couramment
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== MAIN APP ====================
  return (
    <div className="min-h-screen flex flex-col p-4">
      {/* Header */}
      <header className="glass p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🇫🇷</span>
          <div>
            <h1 className="text-xl font-bold text-white">FrenchyAPP</h1>
            <p className="text-white/60 text-sm">{getLevelText(userLevel)} • Niveau {userLevel}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Selector de modo */}
          <div className="flex bg-white/10 rounded-lg p-1">
            <button
              onClick={() => handleModeChange('conversation')}
              className={`px-4 py-2 rounded-md transition-all ${
                mode === 'conversation' 
                  ? 'bg-primary text-white' 
                  : 'text-white/70 hover:text-white'
              }`}
            >
              💬
            </button>
            <button
              onClick={() => handleModeChange('exercises')}
              className={`px-4 py-2 rounded-md transition-all ${
                mode === 'exercises' 
                  ? 'bg-primary text-white' 
                  : 'text-white/70 hover:text-white'
              }`}
            >
              📝
            </button>
          </div>

          {/* Estado de conexión */}
          <div className="flex items-center gap-2 text-white">
            <span className="text-2xl">{getStatusIcon()}</span>
            <span className="text-sm capitalize">{geminiState}</span>
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 glass overflow-hidden flex flex-col mb-4">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] p-4 rounded-2xl ${
                  msg.role === 'user'
                    ? 'bg-primary text-white'
                    : 'bg-white/20 text-white'
                }`}
              >
                <p className="text-sm">{msg.content}</p>
                <span className="text-xs opacity-50 mt-1 block">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-white/10">
          {/* Toggle Button */}
          <div className="flex justify-center mb-4">
            <button
              onClick={handleMicToggle}
              disabled={geminiState === 'disconnected' || geminiState === 'connecting'}
              className={`
                relative w-24 h-24 rounded-full flex items-center justify-center text-4xl transition-all duration-300
                ${isMicActive 
                  ? 'bg-red-500 scale-110 shadow-[0_0_30px_rgba(239,68,68,0.8)]' 
                  : isSpeaking
                    ? 'bg-secondary scale-105'
                    : 'bg-white/20 hover:bg-white/30 scale-100'
                }
                ${geminiState === 'disconnected' || geminiState === 'connecting' 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'cursor-pointer'
                }
              `}
            >
              {isMicActive && (
                <span className="absolute inset-0 rounded-full animate-ping bg-red-500 opacity-75"></span>
              )}
              
              <span className="relative z-10">
                {isMicActive ? '🔴' : '🎤'}
              </span>
            </button>
          </div>
          
          <p className="text-center text-white/50 text-sm">
            {geminiState === 'listening' 
              ? 'Parle maintenant...' 
              : geminiState === 'speaking'
                ? 'Frenchy parle...'
                : geminiState === 'thinking'
                  ? 'Frenchy réfléchit...'
                  : isMicActive
                    ? 'Micro actif - parle!'
                    : 'Clique pour parler'
            }
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="glass p-3 flex justify-between items-center text-white/60 text-sm">
        <span>🇫🇷 FrenchyAPP v1.0</span>
        <span>Gemini Live • Voice Chat</span>
      </footer>
    </div>
  );
}

export default App;
