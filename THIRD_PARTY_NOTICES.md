# Dependencias y servicios

El panel ejecuta únicamente módulos estándar de Node.js (Node conserva sus licencias y avisos). La imagen Node se referencia desde el registro oficial y no se redistribuye dentro del repositorio.

Dependencias de desarrollo: pg (MIT), embedded-postgres (MIT y licencias de sus dependencias) y los binarios PostgreSQL de su paquete específico de plataforma. Consultar sus archivos LICENSE incluidos por npm y package-lock.json. No forman parte de la imagen de producción.

Servicios externos no incluidos: n8n (Sustainable Use License y condiciones Enterprise donde correspondan), Supabase y Meta/Instagram con sus términos propios. Un uso permitido de este código no reemplaza permisos, licencias ni aprobaciones de estos servicios.

Referencias: https://github.com/n8n-io/n8n/blob/master/LICENSE.md · https://www.postgresql.org/about/licence/ · https://github.com/brianc/node-postgres
