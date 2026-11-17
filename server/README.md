# Servidor multijugador de LinkCraft (salas)

Un solo archivo (`server.js`), sin dependencias. Solo necesitas [Node.js](https://nodejs.org) 18 o superior.

## Iniciar

```
cd server
node server.js
```

El servidor muestra las direcciones para entrar:

- **En la misma PC:** abre `http://localhost:8080`
- **En la misma red Wi-Fi:** los demás abren `http://TU-IP:8080` (la IP aparece en la consola)

En el juego: **Multijugador → Conectar**. Si abriste el juego desde el servidor, la dirección ya viene escrita.

## Salas

Al conectarte aparece la **recepción** del servidor:

- **Unirse a una sala:** escribe el código de invitación (6 letras o números) o elige una de las salas públicas de la lista. La sala **INICIO** («Mundo principal») siempre existe y es el mundo de siempre del servidor.
- **Crear sala:** eliges nombre, semilla, modo, **límite de jugadores** (hasta el tope del servidor), PvP, trucos, **quién puede construir** (todos · anfitrión y jugadores de confianza · solo el anfitrión), si es **privada** (no sale en la lista, solo se entra con el código) y una contraseña opcional. Quien la crea es su **dueño** y anfitrión.

Dentro del juego, **Pausa → Sala y jugadores** muestra el código, un botón para copiarlo y un **enlace de invitación** (`?sala=CÓDIGO&srv=DIRECCIÓN`) que abre el juego listo para entrar.

**El anfitrión** puede, en cualquier momento: cambiar el límite de jugadores, el PvP, los trucos, los permisos de construcción, la privacidad, el nombre y la contraseña; dar o quitar **confianza**, **expulsar**, **vetar** (y levantar los vetos), **ceder** la sala a otro jugador o **borrarla**. Si el dueño no está, el anfitrión temporal es el jugador de confianza más antiguo (o el más antiguo de todos), y el dueño recupera el control al volver.

**Permisos:** quien no puede construir explora, lucha, comercia y chatea, pero no puede romper ni poner bloques ni abrir cofres. El servidor es la autoridad: si le llega un cambio sin permiso lo rechaza y el juego lo deshace.

**Reconexión:** si se corta la conexión (o se reinicia el servidor), el juego sigue y vuelve a entrar solo a la misma sala. Lo que construyas mientras tanto se envía al volver. Tras recargar la página aparece «Volver a la sala».

## Jugar por internet

El juego publicado en GitHub Pages usa `https`, y el navegador solo deja conectar desde ahí a servidores seguros (`wss://`). Hay tres formas de jugar con gente de fuera de tu red:

1. **Abrir el puerto 8080 en tu router** y pasarles `http://TU-IP-PÚBLICA:8080`. Juegan desde esa dirección, sin GitHub Pages.
2. **Usar un túnel** (por ejemplo Cloudflare Tunnel o ngrok) apuntando a `http://localhost:8080`. Te da una dirección `https://…` que sirve tanto para abrir el juego como para escribirla en «Dirección del servidor».
3. **Subirlo a un alojamiento de Node.js que admita WebSocket.** Comando de inicio: `node server/server.js`. El servidor usa la variable `PORT` que le dé la plataforma. Ojo: si el disco del alojamiento es temporal, el mundo se pierde al reiniciar.

## Opciones

Se pasan como `--opcion=valor` o como variable de entorno en mayúsculas (`PORT=9000`).

| Opción | Por defecto | Qué hace |
| --- | --- | --- |
| `port` | `8080` | Puerto |
| `max` | `16` | Tope de jugadores por sala (cada anfitrión elige hasta este número) |
| `rooms` | `40` | Salas guardadas como máximo (cada jugador puede ser dueño de 3) |
| `lobby` | `on` | `off` para no tener la sala pública INICIO |
| `password` | ninguna | Contraseña para entrar al servidor |
| `seed` | al azar | Semilla de la sala INICIO (solo al crearla) |
| `mode` | `survival` | Modo de la sala INICIO (solo al crearla) |
| `pvp` | `on` | PvP en la sala INICIO |
| `cheats` | `on` | `off` impide /tiempo y /clima en la sala INICIO |
| `name` | Servidor LinkCraft | Nombre que ven los jugadores |
| `data` | `./data` | Carpeta donde se guarda el mundo |
| `game` | automático | Ruta del `index.html` del juego |

Ejemplo: `node server.js --port=9000 --max=10 --rooms=20 --password=amigos`

## Comandos

En la consola del servidor: `help`, `rooms` (todas las salas), `list` (quién está en cada una), `say <texto>`, `kick <nombre>`, `time [CÓDIGO] <day|night|0..1>`, `weather [CÓDIGO] <clear|rain|storm|fog>`, `close <CÓDIGO>` (borra una sala), `save`, `stop`.

En el chat del juego (tecla T): `/list`, `/codigo`, `/semilla`, `/help`, `/e <mensaje>` (chat de equipo), `/expulsar <nombre>` y `/evento` (anfitrión), y `/tiempo` y `/clima` para el anfitrión y los jugadores de confianza si la sala tiene los trucos activados. Los comandos personales del juego (`/modo`, `/dar`, `/invocar`, `/tp`, `/curar`…) funcionan igual que en un jugador.

## Qué se comparte

- El mundo: la semilla, cada bloque puesto o roto, cofres, hornos, soportes de pociones, carteles y cuadros.
- Los jugadores: posición, animación, nombre, vida, agacharse y golpes (PvP opcional).
- La hora, el clima y dormir en la cama.
- El chat y los avisos de entrada, salida y muerte.
- Los animales y enemigos: cada uno lo simula el jugador que lo tiene cerca y los demás lo ven y pueden golpearlo. El botín y la experiencia son para quien lo mata.
- Las mascotas: los demás las ven con su nombre y el de su dueño, y no pueden atacarlas (4.9).
- Los objetos del suelo: todos ven cada objeto tirado y se lo lleva el primero que pasa por encima. Desaparecen a los 5 minutos.
- Los jefes: hay un solo jefe para todos, con la misma vida. Lo simula quien lo despierta, cualquiera puede golpearlo y, al caer, queda derrotado para todo el servidor.

Cada jugador conserva su inventario, posición, vida y logros en cada sala, y los recupera al volver a entrar desde el mismo navegador.

**No se comparte todavía:** los aldeanos y los animales o guardias de las estructuras (cada jugador ve los suyos). Los enemigos y los jefes solo persiguen al jugador que los simula; a los demás, el jefe solo les hace daño si lo tocan.

## Grupo, equipos, comercio y terrenos (4.9)

Desde la 4.9 el servidor lleva todo esto (el juego lo usa desde el **panel de grupo**: tecla G, botón 👥 o Pausa → Grupo):

- **Jugadores conectados:** cada 3 s envía a la sala la latencia y la vida de cada jugador. Con Tab se ve una lista rápida.
- **Invitaciones:** un jugador de una sala puede invitar a cualquiera que esté conectado al servidor (en la recepción o en otra sala). Si el que invita es el anfitrión, la invitación incluye la contraseña de la sala.
- **Equipos** (hasta 16 por sala): nombre y color, líder, invitaciones, expulsión. Entre compañeros no hay daño aunque el PvP esté activado. Chat de equipo con `/e`.
- **Cofre de equipo:** 27 espacios por equipo guardados en la sala. Solo un miembro a la vez lo tiene abierto (los demás ven quién lo usa). Si el equipo se disuelve, el último en salir recibe lo que quedaba.
- **Comercio:** el servidor abre el trato si los dos están a menos de 16 bloques, guarda las ofertas (hasta 9 pilas cada uno), quita las aceptaciones con cualquier cambio y, cuando los dos aceptan, le dice a cada uno qué recibe. Si uno se desconecta, el trato se cancela.
- **Terrenos protegidos** de 17×17, 33×33 o 49×49 (hasta 3 por jugador, sin superponerse con los de otros): el servidor rechaza los bloques y las entidades de bloque (cofres, hornos, carteles…) que cambie alguien que no sea el dueño, su equipo, un jugador autorizado o el anfitrión.
- **Candados:** el dueño de un cofre con candado (y el anfitrión) es el único que puede cambiar su contenido o romperlo.
- **Permisos por jugador:** el anfitrión puede dejar construir o no a cada jugador, por encima del permiso general de la sala («todos», «confianza» o «solo el anfitrión»).
- **Misiones cooperativas:** siempre hay una por sala (la siguiente empieza un minuto después de completar la anterior). Los jugadores informan su progreso y el servidor lo suma; cada jugador que ayudó recibe la recompensa, y si no está conectado la cobra al volver.
- **Eventos de grupo:** cada 15-25 minutos, si hay dos jugadores o más, un objetivo contra reloj. El anfitrión puede empezar uno con `/evento`.
- **Reconexión:** si a alguien se le corta la conexión, los demás lo ven «sin conexión» durante 20 s; si vuelve en ese tiempo, cuenta como reconexión. Al salir a propósito el juego lo avisa y los demás lo ven enseguida.

Todo se guarda en el archivo de la sala (`teams`, `claims`, `locks`, `perm`, `coop`, `names`). El protocolo sigue siendo el 4: el juego 4.9 detecta estas funciones porque el servidor las anuncia al entrar; con un servidor anterior no las muestra, y los juegos anteriores pueden entrar a un servidor 4.9 (solo que no ven estas funciones).

## Datos

Cada sala se guarda cada 30 segundos, cuando se queda vacía y al cerrar: la sala INICIO en `data/world.json` y las demás en `data/rooms/CÓDIGO.json` (con copia `.bak`). Las salas vacías se descargan de la memoria a los 5 minutos y se vuelven a cargar cuando alguien entra con su código. Para empezar de cero, detén el servidor y borra la carpeta `data`.

Los servidores de versiones anteriores siguen sirviendo: su `data/world.json` pasa a ser la sala INICIO tal cual. El juego 3.6 necesita este servidor (protocolo 4).

**4.1 y 4.2:** actualiza `server.js` (no cambia el protocolo ni el formato de los datos). Desde la 4.1 reenvía la luz que lleva cada jugador en la mano; desde la 4.2 las salas **nuevas** se crean con el generador de mundos nuevo (`gen: 3`). Las salas que ya existían conservan su mundo tal cual.


**4.4:** actualiza `server.js`. Acepta los bloques nuevos (identificadores a partir de 1024); con un servidor anterior esos bloques no se pueden colocar. Las salas **nuevas** se crean con `gen: 4` (el relieve de la 4.2 más las zonas de la 4.4); las existentes conservan su mundo. El formato de los datos guardados no cambia para los bloques anteriores.

**4.6:** actualiza `server.js`. Las salas **nuevas** se crean con `gen: 5` (el mundo de la 4.4 más las arenas de los tres jefes nuevos); las existentes conservan su mundo. No cambia el protocolo ni el formato de los datos.

**4.9:** actualiza `server.js` (un solo archivo, sin dependencias: copia el nuevo encima del anterior y reinicia con `node server.js`). Añade todo lo de la sección «Grupo, equipos, comercio y terrenos». No cambia el protocolo; las salas guardadas se cargan tal cual y ganan los campos nuevos al guardarse.

**5.0 (LinkCraft):** el juego y el servidor pasan a llamarse LinkCraft (el nombre por defecto del servidor es «Servidor LinkCraft»; `/status` responde también con la clave `minicraft` para herramientas viejas). No cambia el protocolo ni los datos: si ya tienes el servidor 4.9, solo cambia el nombre que muestra. El juego 5.0 entra a servidores 4.9 y 4.x sin problemas.
