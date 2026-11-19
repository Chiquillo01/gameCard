# Pendientes

Cosas detectadas en la auditoría que se dejan para más adelante, agrupadas por cuándo tocarlas.

## Admin de usuarios

- La página `/user` se ve bien en escritorio, pero en ventanas estrechas la tabla se descoloca
  (cabeceras apiladas y la foto de perfil a tamaño completo). Falta hacerla responsive.

## Email de bienvenida (SendGrid): configurarlo

El código ya está (`backend/src/services/sendgrid.js`): al registrarse se envía un email en español
(HTML + texto) sin hacer esperar ni romper el registro. Hoy no hay nada en el `.env` del backend,
así que no se envía (lo dice una vez en el log). Para activarlo:

- Crear en SendGrid una API key con permiso "Mail Send" y ponerla en `SENDGRID_API_KEY`
  (empieza por `SG.`).
- Verificar en SendGrid la dirección remitente (Single Sender Verification, o el dominio) y ponerla
  en `EMAIL`.
- Opcional: `SENDGRID_WELCOME_TEMPLATE_ID` (`d-...`) para usar una plantilla dinámica de SendGrid
  en vez del email del código; recibe la variable `{{userName}}`.
- Reiniciar el backend, y en producción poner las mismas variables en el servidor.

## Amigos

Hecho: solicitudes por nombre de usuario (enviar, aceptar, rechazar, cancelar), lista real de
amigos, eliminar amigos, avisos en tiempo real solo al destinatario y desafíos a duelo solo entre
amigos (con lista de desafíos pendientes y opción de rechazarlos), e intercambio de cartas
repetidas entre amigos (proponer, aceptar, rechazar, cancelar). Queda:

- Los desafíos a duelo viven en memoria: un reinicio del servidor los borra (igual que las
  partidas).

## Noticias

Hecho: campana con noticias sin leer y página `/news` (noticias, cambios de balance, eventos,
mantenimiento). Solo los administradores publican, editan y borran, desde la misma página (al
editar se mantiene la fecha de publicación y se muestra la de edición).

## Mercado

- **Brillo (foil):** se implementará más adelante. Hoy la colección no distingue copias con brillo,
  así que el Mercado no lo pide. Para hacerlo hará falta:
  - Guardar el brillo de cada copia en la colección (por ejemplo, las cantidades por tipo: normal,
    superRara, secreta, collector, que eran los valores del esquema antiguo).
  - Decidir cómo se obtienen las copias con brillo (cofres, mazos de estructura…).
  - Que el Mercado venda y compre por carta y brillo, y mostrarlo en la carta.

## Tienda

- **Cómo se consiguen monedas y gemas:** se empieza con 1000 monedas y 0 gemas. Los duelos ya dan
  recompensa (`duelRewards` en `game_rules_final.json`: contra el bot 50 monedas al ganar y nada al
  perder, para que no se pueda farmear; contra otro jugador 100 monedas y 2 gemas al ganar y 25 al perder; nada si te rindes o si
  la partida acaba antes del turno 3). Falta: los packs de gemas con euros (sin pasarela de pago),
  y quizá un límite diario o un bonus por la primera victoria del día.
- **Cofres SBE, PAO y NdM:** ya dan sus cartas (30 de SBE, 30 de PAO y 30 de NdM). Después de
  cambiar cartas o efectos hay que volver a cargar la semilla (`node src/data/seed/seedCardsAndEffects.js`
  en backend/) para que el servidor los vea.
- **Nacimiento de la Magia, por revisar:**
  - Duérgar ya no está en la lista de NdM: está apartado en cards_parked.json.
  - Sunna invoca la Armadura de su Mazo-C sin materiales (el texto dice «invoca», no «compila»).
  - Anciana de los libros destruye la carta con más Atk de todo el Campo, ella incluida si es la
    más fuerte (es lo que dice el texto).
- **Tiempo Primitivo:**
  - Usa como imagen temporal la ilustración de Licántropo Alfa; falta su imagen propia.
  - Cuesta 400 gemas, cuando la relación de los cofres (100 monedas = 10 gemas) daría 40. Por
    decidir.
- **Ediciones Especiales:** el filtro ya existe, pero muestra "¡Próximamente!" porque sus dos
  productos (Ganancia por Honor y Ediocion Espacial Tokens) siguen ocultos hasta tener imagen
  propia (la tienda esconde los que usan la imagen provisional).
  - Ganancia por Honor lleva una tabla de premios provisional (2 comunes, 2 épicas y 1 épica con un
    10% de ser legendaria): su expansión no tiene raras. Revisarla al ponerle imagen.
  - El nombre "Ediocion Espacial Tokens" tiene erratas; como la semilla busca los productos por
    nombre, cambiarlo crearía uno nuevo en vez de renombrar este.

## IA del bot

Fase 1 hecha (`backend/src/game/bot/`): el bot prueba cada jugada en una copia de la partida (sin
ver tu mano, tu Mazo ni tus cartas boca abajo), puntúa el tablero resultante y juega la mejor. Lo
que valora está en `bot/weights.js`; no conoce cartas por nombre, así que los cambios de balance
no le afectan. Siguientes fases:

- **Fase 2 – Guardar cada partida:** al terminar un duelo, guardar en MongoDB los mazos, las
  jugadas, un resumen del tablero por turno y quién ganó (hoy las partidas solo viven en memoria).
- **Fase 3 – Aprender de esos datos:** ajustar los pesos de `weights.js` con las partidas
  guardadas (por ejemplo, un modelo que estime la probabilidad de ganar), y enfrentar bots entre sí
  para generar partidas de entrenamiento.
- **Fase 4 – Búsqueda más profunda (opcional):** MCTS (simular partidas hasta el final para cada
  jugada candidata) y niveles de dificultad según cuánto piensa.
- Limitaciones actuales: mira una jugada cada vez (no planea combos de varias cartas ni el turno
  del rival más allá de una estimación de daño) y supone que el rival no responde en la Pila.

## Antes de la beta

- **URLs fijas en el código:** el cliente ya usa `VITE_SOCKET_URL` (o el origen de
  `VITE_BACKEND_API_URL`), pero el CORS del socket solo acepta `http://localhost:3000`. Pasarlo a
  una variable de entorno.
- **Partidas en memoria:** un reinicio del servidor termina todas las partidas en curso. Para la
  beta, guardarlas en la base de datos (o en Redis) para poder recuperarlas.
- **Límite de intentos de login en memoria:** con más de un servidor habría que compartirlo
  (Redis). Detrás de un proxy (Koyeb) hay que poner `TRUST_PROXY=1` en el `.env` para que cuente
  por la IP real del cliente.
- **CORS de la API abierto a cualquier origen** (`cors()` sin opciones).
- **Mongoose 6** está desfasado (actual: 8).
- **Los tests del frontend no arrancan:** `jest.setup.js` importa
  `@testing-library/jest-dom/extend-expect`, que ya no existe en la versión instalada (ahora es
  `@testing-library/jest-dom`). La CI solo compila el frontend, así que no lo detecta.
- **12 avisos de `npm audit`** (9 moderados, 3 críticos), todos en herramientas de desarrollo,
  nada que llegue a producción: la cadena de vitest 3 (`vitest`, `@vitest/browser`,
  `@vitest/mocker`, `@vitest/coverage-v8`, `tinypool`, `test-exclude`, `glob`, `minimatch`) exige
  saltar a vitest 5; `@storybook/experimental-addon-test` no tiene versión parcheada (en Storybook 9
  pasa a ser `@storybook/addon-vitest`) y `@storybook/react-vite` + su plugin de docgen solo se
  arreglan migrando a Storybook 9; `nodemon` arrastra un `minimatch` vulnerable.
