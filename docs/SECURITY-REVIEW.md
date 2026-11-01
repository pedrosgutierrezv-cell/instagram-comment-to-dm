# Revisión de seguridad · versión 0.1.0

Fecha: 2026-11-01. Evaluación técnica asistida por IA del paquete comunitario y un laboratorio local. No es una certificación ni un pentest profesional independiente. Se revisaron únicamente recursos propios del laboratorio; no se escanearon servicios de terceros ni la infraestructura de una instalación de otro usuario.

## Resultado y alcance

- 28 pruebas HTTP, de lógica e instalación: autenticación, CSRF, límites, cookie segura, fijación/revocación/expiración de sesión, host, rutas sensibles, tipos de cuerpo, SSRF, pertenencia de publicación, configuración y reintentos inciertos.
- 66 comprobaciones sobre una instalación nueva de PostgreSQL 17.11: migración, roles anon/authenticated sin acceso, RLS, funciones invoker, verificación de webhook, palabra clave, corte temporal, deduplicación y rotación.
- Integración real con n8n **2.45.7**, PostgreSQL 17 y PostgREST 14.7: importación y activación mediante el instalador; firma HMAC sobre bytes originales; cuatro DMs y respuestas ficticias en orden 1–2–3–1; replay sin una nueva entrega. API Meta simulada, cero mensajes reales. 14 comprobaciones.
- Imagen de producción Node **24.22.2**: usuario no root; no copia .env ni estado; sin dependencias npm en runtime. Se probó el entorno real de Docker Compose con credenciales sintéticas para comprobar el hash literal y la lista de variables entregadas.
- Navegador real con datos ficticios: un payload de imagen/onerror se presentó como texto literal, sin crear elementos de imagen; cerrar sesión eliminó campañas, cuenta y vista previa del DOM.
- npm audit: cero vulnerabilidades conocidas reportadas en las dependencias fijadas a la fecha de revisión. Esto no cubre todas las vulnerabilidades del SO o de servicios externos.
- Escaneo del inventario del paquete y comparación local con valores privados conocidos, sin imprimirlos ni incluirlos en el repositorio. No se hallaron coincidencias en el contenido preparado. Una lista conocida no prueba ausencia de cualquier otro dato sensible imaginable.
- Instalación desde un clon limpio: `npm ci --ignore-scripts`, las 28 pruebas de aplicación y las 66 comprobaciones PostgreSQL pasaron sin conexiones de producción. El inventario de publicación contiene 51 archivos; la comparación con 40 valores privados conocidos pasó también sobre los blobs y metadatos del historial Git que se publicará. La lista privada de comparación no forma parte del proyecto.

## Hallazgos corregidos antes de publicar

| Hallazgo | Impacto | Corrección y comprobación |
|---|---|---|
| La interpolación de .env en Docker podía alterar los `$` del hash scrypt | El contenedor podía rechazar la contraseña/configuración y no arrancar | Escritura literal con comillas simples y prueba de las variables reales mediante docker inspect |
| Repetir una creación n8n con respuesta perdida podía duplicar recursos | Credenciales o workflows duplicados y recuperación confusa | Intención persistida antes del POST, bloqueo de reintentos ambiguos y reconciliación explícita por ID |
| El contenedor recibía secretos administrativos innecesarios del instalador | Mayor alcance de una futura exposición del proceso | Allowlist de variables del panel; verificado que claves Meta, Supabase y administración n8n no están presentes |
| Una base nueva no tenía USAGE del esquema de criptografía | Las funciones de firma fallaban en instalaciones limpias | Permiso explícito para service_role; pruebas en PostgreSQL nuevo |

La revisión independiente de otro agente detectó los dos primeros fallos y el exceso de variables; las correcciones se verificaron con pruebas de regresión. La revisión también señaló la falta de prueba en n8n real; esa prueba se añadió y pasó. Esto no convierte a los agentes en auditores acreditados.

## Límites y responsabilidades pendientes de cada instalación

- Una cuenta y un administrador; no hay aislamiento multiusuario, MFA, recuperación por correo ni autorización por equipos.
- El administrador de VPS/n8n/Supabase puede leer datos y secretos backend. Los backups deben protegerse y cifrarse.
- Los límites en memoria se reinician con el proceso y no protegen de DDoS distribuido. El operador debe proteger host, proxy y red.
- La renovación automática de Instagram no está implementada. Los permisos y la revisión de Meta dependen de cada app.
- Las pruebas Meta son simuladas: cada operador debe completar una prueba real autorizada con su cuenta secundaria.
- No hay garantía absoluta contra intrusiones, contra vulnerabilidades desconocidas ni contra una configuración insegura posterior. Una instalación expuesta debe mantenerse y, si su uso lo requiere, someterse a una auditoría profesional independiente.

Comandos de reproducción y pruebas opcionales de Docker: [TESTING.md](TESTING.md). Política para reportar fallos: [../SECURITY.md](../SECURITY.md).
