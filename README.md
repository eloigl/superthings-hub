# SuperThings Hub

App de seguimiento automático de contenido sobre SuperThings.

5 pestañas:
- **LinkedIn** — posts de Magicbox vía RSS
- **YouTube** — vídeos de la playlist de Clan TVE vía API oficial
- **Pokédex** — checklist de personajes por series con progreso local
- **Fandom** — actividad reciente de la wiki de SuperThings
- **Película** — noticias de Google News sobre la película

---

## 🚀 Despliegue paso a paso

### Paso 1 — Sube los archivos a GitHub

1. Ve a **https://github.com/new** (inicia sesión si no lo estás).
2. **Repository name**: `superthings-hub` (o el que quieras).
3. Selecciona **Public** (así Vercel lo detecta gratis).
4. **NO marques** "Add a README file" (ya tenemos uno).
5. Pulsa **Create repository**.
6. En la página que aparece verás un enlace que dice **"uploading an existing file"**. Púlsalo.
7. **Descomprime el ZIP** que te dí y arrastra TODOS los ficheros y carpetas (NO la carpeta `superthings-hub` entera, sino su contenido) a la web de GitHub.
8. Abajo pon un mensaje tipo *"First commit"* y pulsa **Commit changes**.

### Paso 2 — Conecta Vercel

1. Ve a **https://vercel.com/signup**.
2. Pulsa **"Continue with GitHub"** (esto autoriza a Vercel a ver tus repos).
3. Una vez dentro, pulsa **"Add New..." → "Project"**.
4. Busca `superthings-hub` en la lista y pulsa **Import**.
5. **MUY IMPORTANTE**: antes de pulsar Deploy, expande **Environment Variables** y añade:
   - Name: `YOUTUBE_API_KEY`
   - Value: tu API key (la que empieza por `AIzaSy...`)
6. Pulsa **Deploy**.
7. Espera 1-2 minutos. Cuando termine, Vercel te dará una URL tipo `https://superthings-hub-xxx.vercel.app`.

### Paso 3 — ¡Listo!

Abre la URL en el móvil o escritorio. Todo debería funcionar:
- ✅ LinkedIn cargará los 10 posts de Magicbox
- ✅ YouTube cargará los 70 vídeos con duración
- ✅ Fandom cargará la actividad reciente
- ✅ Google News cargará las noticias de la película
- ✅ Pokédex funcionará con persistencia local (localStorage)

---

## 🔧 Cómo actualizar la app en el futuro

**Opción fácil**: edita los archivos directamente en GitHub (botón del lápiz ✏️). Cada commit dispara un redeploy automático en Vercel.

**Opción técnica** (si sabes Git):
```bash
git clone https://github.com/tuusuario/superthings-hub.git
cd superthings-hub
# edita lo que quieras
git commit -am "update"
git push
```

---

## 🖥️ Probar en local (opcional)

Si quieres ejecutar la app en tu ordenador antes de desplegar:

```bash
npm install
cp .env.example .env.local
# edita .env.local y pon tu YOUTUBE_API_KEY
npm run dev
```

Abre http://localhost:3000 en tu navegador.

Requiere Node.js 18+. Descarga en https://nodejs.org/

---

## 📂 Estructura

```
superthings-hub/
├── app/
│   ├── api/
│   │   ├── rss/route.js         ← Proxy CORS para feeds RSS
│   │   └── youtube/route.js     ← API de YouTube (con API key oculta)
│   ├── SuperthingsHub.jsx       ← Componente principal (5 pestañas)
│   ├── layout.js
│   └── page.js
├── package.json
├── next.config.js
├── .env.example                  ← Plantilla de variables
└── .gitignore
```

---

## 🔐 Seguridad de la API key

La API key de YouTube **solo existe en el servidor de Vercel** (variable de entorno).
Los usuarios de la web NO pueden verla desde el navegador. 👌

---

## ⚙️ Variables de entorno

Solo es **obligatoria**:

- `YOUTUBE_API_KEY` — tu API key de YouTube Data v3

Las demás URLs y configuraciones viven en el código y pueden cambiarse desde la pestaña de Ajustes (⚙️) de la app.
