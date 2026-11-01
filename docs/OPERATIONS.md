# Operación y mantenimiento

## Entregas

El worker reclama hasta un DM y una respuesta pública por minuto en total, no por campaña. Una cola puede tardar más. Solo procesa comentarios nuevos desde la activación; no consulta históricos. Una persona recibe un DM por campaña/publicación. La rotación asigna la variante al reclamar; una respuesta fallida puede producir un salto visible.

`sent` requiere un identificador devuelto por Meta. `failed` representa rechazo o expiración; `uncertain` un resultado ambiguo o una reclamación sin cierre durante 10 minutos. Ninguno se reintenta automáticamente. Si hay incertidumbre, comprueba el inbox o el registro oficial antes de cualquier reenvío manual. No afirmamos entrega exactamente una vez frente a todos los fallos de red.

Al pausar no se reclaman trabajos nuevos para esa campaña; los ya en curso pueden terminar. Los pendientes ya aceptados permanecen en cola y pueden completarse al reactivar. Una activación establece un nuevo corte para comentarios que aún no habían ingresado. Para una eliminación definitiva de datos usa un procedimiento administrativo con copia y autorización, no borres filas al diagnosticar.

## Credenciales

El token Instagram expira según su tipo y las condiciones de Meta. La renovación automática queda fuera de 0.1.0. Renueva el acceso con la API o flujo oficial aplicable, actualiza directamente la credencial **Comment to DM · Instagram** en n8n y el valor local de `META_ACCESS_TOKEN`. Comprueba `npm run doctor`, que consulta publicaciones/campañas sin enviar DMs. La lectura de campañas no prueba por sí sola que el token de Instagram siga válido: verifica también una publicación desde el panel.

El instalador guarda una huella de los valores de instalación para bloquear cambios silenciosos. Después de renovar secretos, no borres `state/installation.json`: para actualizar workflows conserva sus IDs y realiza la actualización manual con las nuevas referencias o prepara una migración explícita de credenciales. Esta primera versión prioriza fallar de forma segura sobre rotar credenciales automáticamente. No compartas el estado ni el .env al pedir ayuda.

Contraseña del panel: genera un hash nuevo con el asistente en una copia local segura y reemplaza únicamente `ADMIN_PASSWORD_HASH` en tu .env; reinicia el panel para invalidar todas las sesiones. El asistente no sobrescribe .env existente. No pases contraseñas en argumentos de shell ni generes una cuenta compartida entre personas.

## Copias y actualizaciones

Conserva copias cifradas de base de datos, .env, state/installation.json y la clave de cifrado/volumen de n8n. Un backup sin su clave de cifrado puede no restaurar credenciales. Limita acceso al VPS y actualiza SO, proxy, Node, n8n y Supabase. Las imágenes fijadas hacen reproducible una versión; necesitan mantenimiento de seguridad y actualización deliberada de sus digests.

Revisa errores del worker sin guardar cuerpos completos ni datos personales en tickets. Las exportaciones de n8n pueden incluir nombres/IDs de credenciales; sanea cualquier exportación antes de compartirla. Se desactiva el almacenamiento de ejecuciones del proyecto, incluidas las manuales, pero el operador debe comprobar también su configuración global de logs y backups.

## Privacidad y eliminación

Se almacenan IDs de comentario/destinatario, vínculo con campaña y estado de entrega; la base no necesita guardar el texto completo del comentario recibido. Las respuestas públicas elegidas se guardan para trazabilidad. Define una retención proporcional y documenta cómo atender solicitudes. Los contadores no equivalen a métricas de alcance ni de lectura.
