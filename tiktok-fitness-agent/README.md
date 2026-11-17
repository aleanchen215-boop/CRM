# TikTok Fitness Agent 🤖🎬

Agente que corre **todos los días** y:

1. **Busca virales de fitness en TikTok** (hashtags configurables) y los rankea por vistas, engagement y
   "outlier ratio" (vistas ÷ seguidores, para premiar ideas que viralizan por contenido y no por fama).
2. **Transcribe** cada viral (subtítulos de TikTok → Whisper como respaldo).
3. **Desarma la estructura con Claude**: gancho (y tipo de gancho), beats del cuerpo, CTA, mecanismos de
   retención, ritmo, disparadores emocionales y una *fórmula reutilizable*.
4. **Escribe N variaciones originales** (otro gancho, otro ángulo, otro formato) — copia la estructura, nunca las frases.
5. **Genera la voz en off** (ElevenLabs con timestamps por palabra; OpenAI TTS + Whisper como respaldo).
6. **Descarga B-roll vertical** de stock por escena (Pexels, licencia libre).
7. **Renderiza el video 1080×1920 con Remotion** — sin avatar, todo animado:
   - subtítulos estilo TikTok palabra por palabra con resaltado y palabras clave en color,
   - texto cinético por escena (pop, slide-up, typewriter, zoom punch, glitch),
   - gráficos animados (contador, checklist, timer, anillo de progreso, versus, explosión de emojis),
   - transiciones (fade, slide, wipe, flip, clock-wipe, corte seco),
   - B-roll con zoom Ken Burns, o fondo de motion graphics si no hay clip,
   - barra de progreso y música de fondo opcional.
8. Deja en `out/AAAA-MM-DD/` los `.mp4`, el guion (`.script.json`), la descripción + hashtags (`.caption.txt`)
   y un `REPORTE.md` con el análisis de cada viral.

## Puesta en marcha

```bash
cd tiktok-fitness-agent
npm install
cp .env.example .env      # completá las keys
npm run demo              # prueba el render sin usar ninguna API
npm run daily             # corrida real
npm run studio            # editor visual de Remotion para ajustar el diseño
```

### Claves (todas en `.env` o como *secrets* de GitHub)

| Variable | Para qué | ¿Obligatoria? |
|---|---|---|
| `APIFY_TOKEN` | Buscar videos en TikTok (actor `clockworks/tiktok-scraper`) | Sí |
| `ANTHROPIC_API_KEY` | Análisis y guiones con Claude | Sí |
| `ELEVENLABS_API_KEY` | Voz en off de mejor calidad, con timestamps | Recomendado |
| `OPENAI_API_KEY` | Whisper (transcripción) y TTS de respaldo | Recomendado |
| `PEXELS_API_KEY` | B-roll de stock (gratis) | Recomendado |

Sin ElevenLabs ni OpenAI el video sale mudo (subtítulos con tiempos estimados). Sin Pexels, las escenas usan fondos animados.

### Música
Poné pistas libres de derechos (`.mp3`) en `assets/music/`; el agente elige una al azar por video (volumen 10 %).

## Ejecución diaria (GitHub Actions)

El workflow `.github/workflows/tiktok-fitness-agent.yml` corre todos los días a las 10:17 UTC.

1. En GitHub → *Settings → Secrets and variables → Actions*, cargá los secrets de la tabla.
2. Opcional, como *variables*: `TIKTOK_HASHTAGS`, `TOP_VIDEOS`, `VARIATIONS_PER_VIDEO`, `BRAND_CTA`, `ELEVENLABS_VOICE_ID`.
3. Los videos quedan como *artifact* descargable de cada corrida (14 días).
   También podés lanzarlo a mano desde *Actions → Run workflow* (con opción demo).

## Ajustes (`.env`)

Ver `.env.example`: hashtags, mínimo de vistas, antigüedad máxima, cantidad de virales por día,
variaciones por viral, idioma, CTA de marca, voz y modelo de Claude.

## Costos aproximados por día (3 virales × 3 variaciones)
- Apify: ~US$0,30–1 según resultados scrapeados.
- Claude: ~US$0,20–0,60.
- ElevenLabs: ~9 voces de 30 s (≈ 4.500 caracteres).
- Pexels: gratis. GitHub Actions: dentro del plan gratuito en repos privados con uso moderado.

## Notas importantes
- **Originalidad**: el agente reutiliza *estructuras* y fórmulas, no texto ni imágenes del video original.
  No descarga ni reutiliza el video viral en el render final.
- **Plataforma**: el scraping de TikTok lo hace Apify (tercero); revisá sus términos y los de TikTok.
- **Fitness**: el prompt prohíbe promesas milagrosas y consejos médicos; igual revisá cada guion antes de publicar.
- La publicación es manual a propósito: revisás, elegís las mejores variaciones y subís.
