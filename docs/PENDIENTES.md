# Pendientes

Cosas detectadas en la auditoría que se dejan para más adelante, agrupadas por cuándo tocarlas.

## Perfil de usuario

- **Cloudinary sin configurar.** El `.env` del backend no tiene las claves de Cloudinary, así que
  subir una foto de perfil falla. Editar el perfil sin foto ya funciona (la foto es opcional).
  Hace falta `CLOUDINARY_URL` (o `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` +
  `CLOUDINARY_API_SECRET`) y revisar el flujo completo de subida.

## Admin de usuarios

- La página `/user` se ve bien en escritorio, pero en ventanas estrechas la tabla se descoloca
  (cabeceras apiladas y la foto de perfil a tamaño completo). Falta hacerla responsive.

## Email de bienvenida (SendGrid)

Se implementará desde cero más adelante. De momento no falla sin avisar: si no está configurado,
no intenta enviarlo y lo dice una vez en el log del servidor. Lo que pide el código actual, por si
sirve de referencia:

- `SENDGRID_API_KEY`: una API key de SendGrid con permiso "Mail Send" (empieza por `SG.`).
- `EMAIL`: la dirección remitente, verificada en SendGrid (Single Sender o dominio).
- `SENDGRID_WELCOME_TEMPLATE_ID` (opcional): la plantilla dinámica `d-...`. Si no se pone, usa
  `d-88253b5135d245879f9cd3d23ead5191`, que tiene que existir en esa cuenta de SendGrid y usar la
  variable `{{userName}}`.

## Amigos (rama propia)

- La lista de amigos del frontend es falsa, está escrita a mano.
- Las invitaciones se mandan a todos los sockets conectados (`io.emit`), no solo al destinatario.
- No existe forma de aceptar una invitación.
- El listener de invitaciones se limpia con el nombre equivocado (`'ping'`), así que se acumula.
- La amistad no se comprueba al desafiar a un duelo.

## Mercado (rama propia)

- La ruta `/market` muestra "Próximamente".
- No existe comprar.
- Retirar una carta de la venta no la devuelve a la colección, así que se pierde.

## Tienda

- **Cómo se consiguen monedas y gemas:** se empieza con 1000 monedas y 0 gemas, las partidas no
  dan recompensa y los packs de gemas son con euros (aún sin pasarela de pago). Se implementará más
  adelante.
- **Cofres de expansiones sin cartas:** Sombras del Bosque Encantado, Perdición del Arrecife Oculto
  y Nacimiento de la Magia (SBE, PAO, NDM) no tienen cartas todavía; comprarlos da error sin cobrar.
- **Precio en gemas de Tiempo Primitivo:** 400 gemas, cuando la relación de los cofres (100
  monedas = 10 gemas) daría 40. Por decidir.

## Antes de la beta

- **URLs fijas en el código:** los sockets apuntan a `http://localhost:3001` (Duelo y Amigos) y el
  CORS del socket solo acepta `http://localhost:3000`. Pasarlas a variables de entorno.
- **Ping de depuración:** el servidor emite un `ping` a todos los clientes en cada conexión.
- **Partidas en memoria:** un reinicio del servidor termina todas las partidas en curso. Para la
  beta, guardarlas en la base de datos (o en Redis) para poder recuperarlas.
- **Límite de intentos de login en memoria:** con más de un servidor habría que compartirlo
  (Redis). Detrás de un proxy (Koyeb) hay que poner `TRUST_PROXY=1` en el `.env` para que cuente
  por la IP real del cliente.
- **CORS de la API abierto a cualquier origen** (`cors()` sin opciones).
- **Mongoose 6** está desfasado (actual: 8).
- **5 avisos moderados de `npm audit`** en las herramientas de test del frontend (vitest 3);
  arreglarlos exige saltar a vitest 5.
- **Validación de contraseña distinta** en el frontend (exige carácter especial) y en el backend
  (no lo exige).
