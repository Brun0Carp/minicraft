# Servidor multijugador de MiniCraft 3.0

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
| `seed` | al azar | Semilla del mundo (solo al crearlo) |
| `mode` | `survival` | `survival` o `creative` (solo al crearlo) |
| `pvp` | `on` | `off` para que los jugadores no puedan golpearse |
| `max` | `12` | Jugadores a la vez |
| `password` | ninguna | Contraseña para entrar |
| `name` | Servidor MiniCraft | Nombre que ven los jugadores |
| `data` | `./data` | Carpeta donde se guarda el mundo |
| `game` | automático | Ruta del `index.html` del juego |

Ejemplo: `node server.js --port=9000 --seed=12345 --pvp=off --password=amigos`

## Comandos

En la consola del servidor: `help`, `list`, `say <texto>`, `kick <nombre>`, `time <day|night|0..1>`, `weather <clear|rain|storm|fog>`, `save`, `stop`.

En el chat del juego: `/list`, `/seed`, `/help`.

## Qué se comparte

- El mundo: la semilla, cada bloque puesto o roto, cofres, hornos, soportes de pociones, carteles y cuadros.
- Los jugadores: posición, animación, nombre, vida, agacharse y golpes (PvP opcional).
- La hora, el clima y dormir en la cama.
- El chat y los avisos de entrada, salida y muerte.
- Los animales y enemigos: cada uno lo simula el jugador que lo tiene cerca y los demás lo ven y pueden golpearlo. El botín y la experiencia son para quien lo mata.
- Los objetos del suelo: todos ven cada objeto tirado y se lo lleva el primero que pasa por encima. Desaparecen a los 5 minutos.
- Los jefes: hay un solo jefe para todos, con la misma vida. Lo simula quien lo despierta, cualquiera puede golpearlo y, al caer, queda derrotado para todo el servidor.

Cada jugador conserva su inventario, posición, vida y logros en el servidor, y los recupera al volver a entrar desde el mismo navegador.

**No se comparte todavía:** los aldeanos y los animales o guardias de las estructuras (cada jugador ve los suyos). Los enemigos y los jefes solo persiguen al jugador que los simula; a los demás, el jefe solo les hace daño si lo tocan.

## Datos

El mundo se guarda cada 30 segundos y al cerrar en `data/world.json` (con copia en `world.json.bak`). Para empezar un mundo nuevo, detén el servidor y borra esa carpeta.
