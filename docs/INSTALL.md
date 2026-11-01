# Instalación en infraestructura propia

## 1. Requisitos y alcance

Una cuenta profesional Instagram, una app Meta propia, n8n 2.45.7 con API (versión probada), proyecto Supabase autorizado y un dominio HTTPS para el panel. Una instalación corresponde a una cuenta y un administrador. No mezclar con un esquema `ig_delivery_*` ya instalado. Preferir un proyecto Supabase dedicado dentro de un plan existente; no crear recursos de pago por inferencia.

Node 24.22.2 o posterior de la rama 24 para scripts. Docker Compose para ejecutar el panel. `Caddyfile.example` supone Caddy instalado en el host. Si ya usas otro proxy, conserva TLS y publica únicamente ese proxy: el panel está ligado a `127.0.0.1:3000`.

## 2. Preparar las cuentas

### Instagram / Meta

1. Crea una app propia en Meta for Developers y agrega el caso de uso de Instagram con inicio de sesión de Instagram.
2. Conecta la cuenta profesional correcta; completa roles o cuentas de prueba cuando aplique.
3. Obtén los permisos aplicables para gestionar mensajes y comentarios: la integración usa `instagram_business_basic`, `instagram_business_manage_comments` e `instagram_business_manage_messages`. Meta puede exigir revisión, acceso avanzado u otras verificaciones para tu escenario. Verifica los requisitos vigentes; publicar la app por sí solo no concede permisos.
4. Genera el acceso para la cuenta y confirma el **ID de la cuenta profesional**. No confundas IDs de app, publicación o usuario con ámbito de aplicación. En la API oficial consulta `/me?fields=id,user_id,username` con la credencial de la cuenta; usa el `user_id` profesional cuando corresponda al flujo de Instagram Login. Confirma que coincide con `entry.id` de un evento real.
5. Guarda token y secreto de app mediante el asistente local. No los escribas en un issue, chat o captura. Esta versión no implementa renovación automática.

Referencias primarias: [Instagram Platform](https://developers.facebook.com/docs/instagram-platform/) y [Private replies](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/private-replies/). Los nombres y requisitos de Meta pueden cambiar.

### n8n

Usa una instancia que controles, HTTPS y autenticación del editor. Genera una clave API desde sus ajustes. Configura y conserva una `N8N_ENCRYPTION_KEY` estable para proteger las credenciales; incluye esa clave únicamente en tu copia de recuperación cifrada. No expongas el editor sin autenticación.

### Supabase

Usa la URL y la clave backend `service_role` del proyecto autorizado. Nunca la clave service_role en JavaScript del navegador. No se necesitan cuentas públicas de Supabase Auth ni permisos de tablas para `anon` o `authenticated`.

## 3. Configurar sin entregar secretos a la IA

```sh
npm ci --ignore-scripts
npm test
npm run scan
npm run setup
```

Ejecuta `setup` tú mismo en una terminal interactiva. Los campos secretos no se muestran. La contraseña del panel se guarda como hash scrypt, no en texto plano. `.env` se crea con permisos 0600 y `wx`: nunca se sobrescribe silenciosamente una instalación existente.

Para desarrollo local exclusivamente se admite `NODE_ENV=development` con `APP_ORIGIN=http://127.0.0.1:3000`. En producción es obligatorio HTTPS. No conviertas una instalación pública a modo development.

## 4. Migración y workflows

Aplica el contenido de `supabase/migrations/*_community_install.sql` mediante el SQL Editor del proyecto autorizado o una conexión administrativa propia. La migración se ejecuta dentro de una transacción y falla si sus objetos ya existen. No borres objetos existentes para conseguir que pase; identifica antes si pertenecen a otra instalación.

Después:

```sh
npm run deploy:n8n
npm run doctor
```

El instalador crea tres credenciales y tres workflows (ingress, worker, API privada). Conserva `state/installation.json`, que registra IDs sin valores secretos, dentro de su directorio privado 0700. Los workflows comienzan activos, pero no existen campañas: no se envían mensajes hasta crear y activar una campaña.

Si hay un fallo parcial, conserva el estado y vuelve a ejecutar con la misma configuración cuando la causa esté resuelta. El instalador no busca ni modifica workflows ajenos. Rechaza cambiar de cuenta o credenciales por un cambio silencioso de `.env`; consulta la rotación en OPERATIONS.md. No borres el estado para forzar una reinstalación.

También puedes importar los JSON manualmente, sustituyendo sus marcadores y asociando las tres credenciales backend; el script reduce errores en estas asociaciones. Los JSON del repositorio no contienen credenciales ni IDs de instalaciones reales.

## 5. Panel y HTTPS

```sh
docker compose up -d --build
```

Configura DNS y Caddy u otro proxy hacia `127.0.0.1:3000`, manteniendo el `Host` original. Nunca publiques el puerto 3000 directamente en una interfaz pública. No se monta `.env` como archivo del contenedor: Compose inyecta solo la lista de variables necesarias para el panel; las claves de instalación de Meta, Supabase y administración de n8n no entran en ese contenedor. Solo se copian `panel/` y package.json en la imagen, que ejecuta como usuario `node`, con filesystem de solo lectura y capacidades eliminadas.

`TRUSTED_PROXIES` queda vacío por defecto. Esto limita por IP del proxy, de forma conservadora. Solo si necesitas distinguir IP reales, declara las IP exactas del proxy que sobrescribe X-Forwarded-For; no uses comodines ni confíes en cabeceras suministradas por visitantes.

Entra con tu usuario y contraseña. Las sesiones expiran a las 8 horas o tras 30 minutos de inactividad, se invalidan al reiniciar y no se guardan en localStorage. No hay autorregistro ni recuperación de contraseña por correo.

## 6. Webhook Meta y prueba acordada

- Callback: `https://TU_N8N/webhook/comment-to-dm`.
- Verification token: `META_VERIFY_TOKEN` de tu `.env`; consúltalo únicamente en tu terminal local y pégalo directamente en Meta. No lo muestres al asistente.
- Verifica el callback y suscribe el campo `comments` para la cuenta conectada.
- Proporciona en Meta tu propia política de privacidad y procedimiento de eliminación de datos, con tus datos de contacto. No uses los de otra persona. Consulta `docs/privacy-policy.example.md` como base para describir tu instalación.
- Completa publicación/revisión/acceso de la app cuando Meta lo exija para el escenario real.

Crea una campaña en **pausa**, verifica el enlace propio, escribe un recurso accesible, revisa el preview y acuerda una cuenta secundaria para probar. Activa y publica desde esa cuenta un comentario nuevo con la palabra clave. Confirma la recepción del DM, que el enlace abre y que la respuesta pública llegó después. No importes históricos ni vuelvas a enviar un resultado incierto para “ver si funciona”.

La instalación está completa cuando se ha comprobado acceso, pertenencia de publicación, guardado y entrega acordada. Las pruebas automáticas aisladas usan datos ficticios y no envían mensajes reales.

### Creación incierta en n8n

Si se corta la conexión al crear una credencial o workflow, n8n puede haberlo creado aunque no haya devuelto el ID. El instalador registra `pendingCreation` **antes** de enviar el POST y se detiene al reintentar para no duplicar recursos. Usa `node scripts/installation-status.mjs` para ver el tipo y nombre pendientes (sin claves). Busca ese recurso en tu propia instancia n8n y verifica si existe. Recupera su ID, asígnalo a la propiedad indicada por `pendingCreation.key` en tu state/installation.json local y retira `pendingCreation` solamente después de la comprobación. Si confirmas que no se creó, puedes retirar únicamente esa marca y reintentar. No adivines IDs ni borres el estado completo; si no puedes resolverlo, conserva el estado y solicita ayuda sin secretos.
