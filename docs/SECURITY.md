# Modelo de seguridad

## Frontera

Una cuenta profesional y un administrador por instalación. No multiusuario, no SaaS de clientes, no aislamiento de varios operadores dentro de una instancia n8n/Supabase. Un administrador de n8n, Supabase, Docker o VPS puede acceder a los secretos backend: debe ser de confianza. Cada persona instala sus propios recursos; no comparte las cuentas de quien publicó esta plantilla.

El navegador no recibe tokens Meta, claves n8n/Supabase ni la clave interna. La contraseña se almacena con scrypt N=131072,r=8,p=1 y sal aleatoria. Cookies de producción `__Host-`, Secure, HttpOnly, SameSite Strict, sin Domain; sesiones guardadas como hash del token y limitadas por tiempo. El reinicio invalida sesiones. No se usa almacenamiento local del navegador para autenticación.

Las acciones requieren sesión, origen exacto y token CSRF. El login requiere JSON y origen exacto; tiene límites por IP, globales y de concurrencia. Por defecto se ignoran cabeceras de proxy suministradas por visitantes. Hay límites de cuerpo, conexiones y tiempos; no son una defensa completa ante DDoS distribuido.

CSP restringe scripts/estilos a archivos propios, prohíbe framing y objetos. Los datos dinámicos se representan con `textContent`, nunca HTML. El proxy mantiene TLS. El servidor acepta solo rutas estáticas expresas; no sirve directorios, .env, migraciones o estado.

La resolución de publicaciones solo consulta la API de la cuenta por el endpoint fijo de n8n; no descarga URLs introducidas por el usuario. Se comprueba origen Instagram, formato y pertenencia. Los IDs suministrados por el navegador se sustituyen por los verificados. Las URLs de servicios son configuración del administrador, nunca entradas de visitantes. Las peticiones con secretos no siguen redirecciones.

## Base y webhooks

Tablas con RLS, permisos revocados para anon/authenticated y funciones SECURITY INVOKER con search_path vacío. Solo service_role usa estas RPC. Se requiere esquema dedicado y una sola cuenta configurada. HMAC SHA-256 verifica bytes originales del webhook antes de aceptar eventos; hay ventanas temporales, corte de campaña y deduplicación por persona/comentario. No hay SQL dinámico construido desde comentarios.

La clave service_role y el secreto de app existen únicamente en backend; el secreto se guarda en un esquema privado de la base y queda en los backups de esa base. No equivale a cifrado por aplicación ni a un vault externo. n8n cifra sus credenciales con su clave de instancia: protege y respalda esa clave.

## Controles del operador

- HTTPS obligatorio; panel solo en loopback detrás del proxy. Firewall: publica únicamente servicios necesarios.
- No desactivar autenticación, RLS ni verificación de firma para resolver problemas.
- Credenciales distintas por instalación; contraseña larga y administrador único de confianza.
- Control de acceso a host, copias cifradas y actualizaciones periódicas.
- Rotación de credenciales y revisión de logs sin datos de seguidores.

## Alcance de las pruebas

Consulta SECURITY-REVIEW.md. Las pruebas del laboratorio incluyen ataques a sesión, CSRF, rutas, límites, cabeceras, SSRF, inyección de palabras clave, permisos SQL, firma, duplicados y escaneo de datos privados. No atacan Meta, Hostinger, Supabase ni instancias ajenas. No constituyen certificación, auditoría independiente acreditada, garantía de disponibilidad ni garantía de que una instalación no pueda ser comprometida.

Referencias de diseño: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html · https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html · https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
