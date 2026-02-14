/**
 * Configuración embebida - Solo para builds de Electron
 *
 * INSTRUCCIONES:
 * 1. Copia este archivo a config.ts
 * 2. Reemplaza los valores con tus credenciales reales
 * 3. NO subas config.ts a Git (está en .gitignore)
 */

export const EMBEDDED_CONFIG = {
  VERTEX_PROJECT_ID: 'tu-project-id',
  VERTEX_LOCATION: 'us-central1',
  GOOGLE_APPLICATION_CREDENTIALS_JSON: `{
  "type": "service_account",
  "project_id": "tu-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",
  "client_email": "...",
  ...
}`,
};
