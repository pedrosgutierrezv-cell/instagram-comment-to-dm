# Verificación reproducible

```sh
npm ci --ignore-scripts
npm test
npm run test:database
npm run scan
npm audit --omit=dev
```

`npm test` levanta servidores HTTP efímeros en loopback con servicios ficticios. No lee .env. `test:database` crea su propio clúster PostgreSQL 17.11 mediante el paquete de desarrollo embedded-postgres, genera credenciales sintéticas, aplica la migración y destruye el clúster al terminar. **Ignora DATABASE_URL deliberadamente**: no admite apuntarlo a producción. Nunca cambies esa protección para probar contra una cuenta real.

El paquete de plataforma necesita sus enlaces simbólicos: la prueba activa `autoRehydrateSymlinks` para recrearlos tras `npm ci --ignore-scripts`. No requiere Docker ni credenciales externas; sí espacio local para el binario y un entorno capaz de ejecutar PostgreSQL como usuario no root. La imagen del panel no contiene estas dependencias.

`scan` inspecciona el inventario de publicación y bloquea archivos sensibles, secretos comunes y patrones privados indicados a través de un fichero externo. No imprime los valores detectados. Antes de publicar debes ejecutar también la búsqueda de valores específicos del propietario fuera de Git: el escáner genérico no puede conocer todos tus datos privados.

Las pruebas HTTP no entregan mensajes a Instagram. Para una prueba real posterior a instalar, usa únicamente una publicación y una cuenta secundaria acordadas. Una autorización para probar tu laboratorio no autoriza un escaneo de la infraestructura de terceros.

## Workflows en n8n real

`npm run test:n8n` requiere Docker y las imágenes oficiales `postgres:17-alpine`, `public.ecr.aws/supabase/postgrest:v14.7`, `node:24.22.2-alpine` y `docker.n8n.io/n8nio/n8n:2.45.7` previamente descargadas. Reserva al menos 5 GB libres antes de descargarlas. No las descarga automáticamente. El laboratorio crea contenedores con prefijo aleatorio `ctdm-lab-`, puertos ligados a loopback y una red Docker separada; elimina solo esos recursos al salir. No detengas ni borres contenedores ajenos.

La prueba aplica el esquema a PostgreSQL limpio, crea un administrador n8n ficticio, ejecuta el instalador real mediante un adaptador de URLs de laboratorio e importa/activa los tres workflows. Sustituye el schedule por un disparador protegido solo en memoria para no esperar minutos. Todos los nodos HTTP del workflow deben apuntar al PostgREST o Meta simulado del laboratorio. Las respuestas de Meta son ficticias; no se contactan cuentas de Instagram. Verifica rawBody/HMAC, configuración, pertenencia de publicación, cuatro entregas y respuestas 1–2–3–1, y replay sin duplicación.

`npm run test:container` construye la imagen, coloca temporalmente un archivo canario ficticio para comprobar `.dockerignore`, verifica usuario no root y ausencia de .env/estado/dependencias npm, y elimina el canario y su imagen de prueba. Se detiene si ya existe un .env del usuario.
