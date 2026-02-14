# FrenchyAPP 🇫🇷

Chatbot de voz en tiempo real para aprender francés, utilizando Gemini Live 2.5 Flash Native Audio.

## Desarrollo Local

### Requisitos Previos

1. **Node.js** - Versión 18 o superior
2. **Cuenta de Google Cloud** con Vertex AI habilitado

### Instalación

```bash
# Instalar dependencias del servidor
cd server
npm install

# Instalar dependencias del cliente
cd ../client
npm install
```

### Ejecución

**Terminal 1 - Bridge:**
```bash
cd server
npm run dev
```

**Terminal 2 - Cliente:**
```bash
cd client
npm run dev
```

## Deploy a Render.com (Producción)

### Paso 1: Subir a GitHub

1. Crea un repositorio en GitHub
2. Sube todo el código (incluyendo `.gitignore`)

### Paso 2: Configurar Google Cloud

1. Crea un proyecto en [Google Cloud Console](https://console.cloud.google.com/)
2. Habilita **Vertex AI API**
3. Crea una **Service Account** con rol `Vertex AI User`
4. Descarga el JSON de credenciales

### Paso 3: Deploy en Render

1. Ve a [Render.com](https://render.com/) y crea una cuenta
2. Crea un nuevo **Web Service**
3. Conecta tu repositorio de GitHub
4. Configura:

   **Build Command:**
   ```bash
   npm run build:client && npm run build
   ```

   **Start Command:**
   ```bash
   npm run start
   ```

5. Añade estas **Environment Variables**:
   - `VERTEX_PROJECT_ID` = tu-project-id-de-gcp
   - `VERTEX_LOCATION` = us-central1 (o tu región)
   - `GOOGLE_APPLICATION_CREDENTIALS` = contenido del JSON de credenciales
   - `NODE_ENV` = production

### Paso 4: Probar

1. Accede a `https://tu-servicio.onrender.com`
2. Pon la password: `bananaface`
3. Selecciona voz y nivel
4. ¡Listo!

## Estructura

```
FrenchyAPP/
├── client/           # App React (frontend)
│   └── src/
│       ├── App.tsx
│       └── services/
│           └── LanguageGeminiService.ts
└── server/          # Bridge Gemini Live (Vertex AI)
    ├── src/
    │   ├── index.ts
    │   └── vertex-live-bridge.ts
    └── package.json
```

## Características

- 🎤 Chat de voz en Tiempo Real con Gemini Live
- 🇫🇷 Tutor de francés "Frenchy"
- 🌱 Tres niveles: Principiante, Intermedio, Avanzado
- 🔐 Password de acceso (bananaface)
- 🎙️ 10 voces diferentes para elegir
- 💬 Modo conversación libre
- 📝 Modo ejercicios guiados

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind
- **Backend**: Node.js + WebSocket + Google Gemini Live (Vertex AI)
- **Hosting**: Render.com (o similar)
