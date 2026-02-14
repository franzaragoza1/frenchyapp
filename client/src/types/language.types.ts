// Tipos para la aplicación de idiomas

export type AppMode = 'conversation' | 'exercises';

export type GeminiState = 
  | 'disconnected'
  | 'connecting' 
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Exercise {
  id: string;
  type: 'repetition' | 'fill-blank' | 'roleplay' | 'vocabulary';
  title: string;
  instructions: string;
  question?: string;
  correctAnswer?: string;
  options?: string[];
  vocabulary?: VocabularyItem[];
}

export interface VocabularyItem {
  word: string;
  translation: string;
  example?: string;
  category: string;
}

export interface UserProgress {
  totalConversations: number;
  totalExercises: number;
  correctAnswers: number;
  vocabularyLearned: number;
  streak: number;
  lastPractice: number;
}

export interface LanguageSession {
  mode: AppMode;
  currentExercise?: Exercise;
  messages: Message[];
  isRecording: boolean;
  isSpeaking: boolean;
}
