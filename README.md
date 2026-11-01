# Instagram Comment → DM

Panel privado para enviar un recurso por mensaje de Instagram cuando alguien comenta una palabra clave. Configura publicaciones, mensajes y tres respuestas públicas alternadas desde un formulario. **No utiliza IA ni consume tokens de IA durante la operación.**

Esta versión es autohospedada: una cuenta profesional Instagram y un administrador por instalación. Usa n8n y Supabase propios. El código es gratuito; alojamiento, dominios, cuotas y requisitos de las plataformas dependen de tus cuentas. La asistencia con IA durante la instalación puede consumir el plan del asistente que elijas.

## Instalar con ayuda de IA

Copia este repositorio con **Use this template** o clónalo. Abre la carpeta en Codex, Claude Code u otro asistente con acceso local y dale este encargo:

> Lee AGENTS.md y skills/install-instagram-automation/SKILL.md. Ayúdame a instalar este proyecto usando mis cuentas y sin contratar servicios. No me pidas secretos en el chat: usaré el asistente local de configuración. Verifica cada etapa y deja las campañas en pausa hasta acordar una prueba.

La skill **forma parte del repositorio**. No necesitas pagar una API de IA ni conectar un modelo al panel. La guía manual completa está en [docs/INSTALL.md](docs/INSTALL.md).

## Qué incluye

- Panel web adaptable a móvil, con autenticación propia y vista previa.
- Palabra clave por publicación, sin distinguir tildes ni mayúsculas.
- DM con el texto y enlace que escribas; una entrega por persona y publicación.
- Tres respuestas públicas en rotación, después de confirmar el DM.
- Crear, editar, activar y pausar campañas; contadores de resultados confirmados.
- Workflows n8n importables y migración de Supabase con RLS y RPC solo backend.
- Instalador local que oculta secretos, pruebas de seguridad y skill de instalación.

## Inicio rápido

Necesitas Node **24.22.2 o posterior de la rama 24**, n8n con API disponible, un proyecto Supabase autorizado, cuenta profesional Instagram, app Meta con los permisos y acceso aplicables y un origen HTTPS para el panel.

```sh
npm ci --ignore-scripts
npm test
npm run setup
# Aplica supabase/migrations/*_community_install.sql a tu proyecto autorizado.
npm run deploy:n8n
npm run doctor
docker compose up -d --build
# Configura el proxy HTTPS y verifica el webhook Meta: docs/INSTALL.md.
```

El asistente de instalación solicita los valores **en tu terminal**, con los secretos ocultos. Nunca publiques `.env` ni lo pegues al asistente. El panel tiene cero dependencias npm en ejecución; `pg` y PostgreSQL embebido solo se usan para pruebas.

## Uso

1. Inicia sesión en tu panel.
2. Crea una automatización, pega el enlace de tu publicación y verifícalo.
3. Escribe la palabra clave y el DM con el enlace público al recurso.
4. Personaliza tres respuestas o desactiva las respuestas públicas.
5. Guarda en pausa para revisar; activa cuando esté lista.

[Recorrido visual](docs/DEMO.md) · [Operación y límites](docs/OPERATIONS.md) · [Seguridad](docs/SECURITY.md) · [Pruebas](docs/TESTING.md)

## Arquitectura

```text
Navegador → Panel privado Node.js → API n8n con clave interna → Supabase
Instagram → Webhook firmado → Cola Supabase → Worker n8n → API oficial Instagram
```

Las credenciales nunca se envían al navegador. No se utiliza scraping ni automatización del navegador de Instagram para enviar mensajes. Este proyecto no pertenece a Meta, n8n ni Supabase. No incluye funciones para TikTok.

## Estado y contribuciones

Versión inicial comunitaria **0.1.0**. Revisa [el informe de seguridad](docs/SECURITY-REVIEW.md) y sus límites antes de exponer una instalación. Las pruebas de laboratorio no sustituyen la revisión de tu VPS ni garantizan ausencia de vulnerabilidades.

Para contribuir: abre un issue sin credenciales, reproduce con datos ficticios y ejecuta las pruebas. Reporta vulnerabilidades siguiendo SECURITY.md. Mantén los avisos de licencias de dependencias.

## Licencia

Código propio MIT, ver [LICENSE](LICENSE). n8n es una dependencia externa y mantiene su Sustainable Use License; este repositorio no redistribuye su motor ni concede derechos sobre él. Consulta sus condiciones antes de ofrecer un servicio comercial basado en n8n. [Licencia oficial](https://github.com/n8n-io/n8n/blob/master/LICENSE.md).
