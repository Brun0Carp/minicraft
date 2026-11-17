# LinkCraft 5.1

Juego de supervivencia y construcción con bloques que corre en el navegador, en **un solo archivo HTML**. Antes se llamaba MiniCraft. La 5.0 cierra la evolución que empezó en MiniCraft 4.0. Los mundos, ajustes, logros y servidores de MiniCraft siguen funcionando.

## Cómo jugar

**En el navegador, sin instalar nada**

1. Abre `index.html` con Chrome, Edge, Firefox o Safari, en computadora o en celular.
   - También sirve la versión publicada: <https://brun0carp.github.io/minicraft/>.
2. Necesitas conexión la primera vez: el motor 3D (Three.js) se descarga de un CDN.
3. Elige **Jugar → Crear mundo nuevo**.

Las partidas se guardan solas en el navegador (IndexedDB), con copias de seguridad automáticas.

**Multijugador**

El multijugador real va por WebSocket, con el servidor de la carpeta [`server`](server/README.md):

```
cd server
node server.js            # Node.js 18 o superior, sin dependencias
```

1. Abre `http://localhost:8080` (o `http://IP-de-tu-equipo:8080` desde otro dispositivo de la red).
2. Elige **Multijugador**.
3. Crea una sala o entra con el código de un amigo.

Para jugar por internet, opciones y comandos, mira [`server/README.md`](server/README.md).

**Controles**

| | Teclado y ratón | Pantalla táctil | Mando |
|---|---|---|---|
| Moverse / mirar | WASD + ratón | joystick + arrastrar | sticks |
| Saltar / agacharse / correr | Espacio / Mayús / Ctrl | botones Saltar y Agachar | A / B / stick izquierdo |
| Minar / usar | clic izquierdo / derecho | botones Minar y Usar | RT / LT |
| Inventario, mapa, misiones | E, M, J | 🎒 🗺 📜 | Y, Select, cruceta |
| Personaje, mochila, enciclopedia | H, B, K | Pausa → … | Pausa → … |
| Chat y panel de grupo (multijugador) | T, G (Tab: lista de jugadores) | 💬 👥 | Pausa → Grupo |

Todas las teclas y botones del mando se pueden cambiar en **Ajustes → Controles** y **Ajustes → Mando**. Los botones táctiles se pueden mover desde **Ajustes → Controles**.

## Qué tiene de nuevo respecto de MiniCraft 4.0

Cada versión intermedia está detallada en el juego, en **Novedades**.

**Mundo (4.2)**
- Generador nuevo con llanos, colinas, mesetas y tres tipos de montaña.
- Ríos con valles, lagos con orilla, cascadas, islas, cavernas, barrancos y geodas.
- 7 biomas y 7 lugares nuevos, decoración natural y minerales según el bioma.

**Aldeas (4.3)**
- Los aldeanos tienen rutina diaria, buscan caminos y se refugian.
- Tienen vida social, memoria y amistad.
- Las aldeas se especializan y tienen economía con precios variables, prosperidad que hace crecer la aldea y misiones comunitarias.
- Nuevos eventos: caravana, mercader ambulante y visitante misterioso.

**Zonas de exploración (4.4)**
- Catacumbas, templo antiguo, castillo en ruinas, laboratorio, cámara secreta, islas flotantes y ciudad sumergida.
- Cofres sellados con guardianes.
- Criaturas nuevas: arpía, centinela marino y autómata.
- Materiales nuevos: aerita y perla abisal.

**Progresión del personaje (4.5)**
- Árbol de 25 habilidades en 5 ramas.
- Bonos de conjunto y armaduras nuevas.
- Accesorios, mochilas y armas legendarias.
- Mascotas con ánimo y cuidados.
- Grifo como montura voladora.

**Combate y jefes (4.6)**
- Los enemigos telegrafían sus golpes, rodean obstáculos, se avisan entre ellos y pelean cada uno a su manera.
- Golpes con impacto e indicador de daño.
- Enemigos exclusivos de cada zona.
- Tres jefes nuevos con fases, ataques avisados y recompensas únicas: Liche, Rey caído y Roc de la tormenta.

**Actividades (4.7)**
- Pesca con minijuego y peces por tipo de agua.
- 5 cultivos nuevos, regadera y abono.
- Recolección silvestre.
- Cocina con 12 platos.
- Comedero para la cría.
- Expediciones y eventos nuevos.

**Construcción y mecanismos (4.8)**
- Bloques de decoración y muebles.
- Tolva, cinta transportadora, dispensador, detector y panel de almacén.
- Puertas y trampillas de hierro y de cristal, puertas dobles y elevadores.
- Compuerta Y, biestable y reloj.
- Lámparas de color y trampas.

**Multijugador (4.9)**
- Panel de grupo y lista de jugadores con latencia.
- Invitaciones entre salas.
- Equipos con chat y cofre compartido.
- Comercio seguro entre jugadores.
- Terrenos protegidos y cofres con candado.
- Permisos por jugador.
- Misiones cooperativas y eventos de grupo.
- Mascotas sincronizadas.
- Margen de reconexión.

**Interfaz, gráficos, rendimiento y guardado (5.0)**
- Calidad gráfica **Bajo / Medio / Alto / Ultra**.
- Ajustes de partículas, detalle lejano, tamaño de la interfaz y zoom del minimapa.
- Registro de avisos.
- Estadísticas por secciones.
- Guardado comprobado y copia verificada antes de tocar partidas antiguas.
- Copia diaria y pantalla de copias por mundo.
- Papelera de mundos.
- Exportar e importar todos los mundos.

**Agua y lava que corren (5.1)**
- El agua y la lava caen formando cascadas por los bordes, por ejemplo desde un arroyo hacia una cueva, y se extienden hacia el desnivel más cercano.
- Hay niveles (el agua llega a 7 bloques; la lava a 3, o 7 en el Inframundo) y la superficie se ve en pendiente.
- Lo que corre se retira al quitar la fuente.
- Agua y lava que se tocan forman obsidiana, roca o piedra.
- Al cargar una zona, los fluidos que quedaron al borde de un hueco empiezan a correr.

## Funciones existentes que se mejoraron

- **Generación del mundo:** ríos, cuevas y fronteras de biomas más naturales. Los mundos anteriores conservan su terreno.
- **Aldeanos:** ya no se traban, tienen horarios y reaccionan a los peligros.
- **Comercio con aldeanos:** precios dinámicos, descuentos por amistad y encargo del día.
- **IA de los enemigos:** esquivan obstáculos, no se tiran a pozos y los arqueros apuntan adonde vas.
- **Jefes anteriores:** el Dragón, el Gólem, el Señor de las brasas y el Heraldo del vacío ahora usan todos sus ataques.
- **Agua:** antes solo rellenaba el hueco al romper un bloque a su lado; ahora corre y cae con gravedad, y la lava también (5.1).
- **Agricultura:** la tierra regada y abonada crece según el bioma.
- **Cría de animales:** el comedero los alimenta solo.
- **Monturas:** cada caballo tiene su velocidad.
- **Circuitos:** compuertas y relojes nuevos y puertas dobles.
- **Multijugador:**
  - Permisos más finos, inventario guardado en el servidor al cambiar y mejor reconexión.
  - Los mecanismos respetan el permiso de construir.
- **Calidad automática:** baja de nivel en nivel.
- **Partículas y carga de chunks:** más eficientes.
- **Avisos:** se ven también en los menús.
- **Exportar e importar:** acepta el formato nuevo y el de MiniCraft.

## Errores corregidos

- Varios jefes nunca usaban algunos de sus ataques: sus tiempos de espera no bajaban (4.6).
- Los huevos de algunas criaturas guardados en cofres e inventarios se convertían en los de otra (4.4).
- En pantallas táctiles, la barra del jefe quedaba debajo de los botones de arriba (4.6).
- La barra del minijuego de pesca tapaba la vida en celulares (4.7).
- Dos recetas chocaban entre sí: cajonera con armario y dispensador con lanzaflechas (4.8).
- En multijugador, sin permiso de construir todavía se podían usar tolvas, dispensadores y otros mecanismos (4.9).
- El efecto «Hambre» de los mutantes no existía: rompía la barra de efectos y llenaba la consola de errores (5.0).
- Los avisos que el juego daba en los menús no se veían (5.0).
- Una partida de la 5.0 podía rechazarse como «versión desconocida» al cargarla o importarla, porque el validador solo aceptaba hasta la versión 4. Se corrigió antes de publicar (5.0).

## Explicación de los cambios

- **Un solo HTML.** El juego sigue siendo un único `index.html` hecho por secciones numeradas (§1 núcleo, §2 bloques… §49 multijugador 4.9, §50 LinkCraft 5.0).
  - Cada versión agrega su sección y engancha sus cambios en las funciones existentes envolviéndolas, sin reemplazar sistemas completos.
  - Así no se eliminó ninguna función anterior.
- **Compatibilidad de mundos:**
  - Los mundos creados antes de la 4.2 conservan su generador (`gen`).
  - Los bloques nuevos usan identificadores a partir de 1024 y no cambian los anteriores.
  - Las partidas guardadas se migran sin perder datos: formato 5, con el número de versión del juego.
- **Seguridad del guardado:**
  - Antes de modificar una partida de una versión anterior se guarda una copia (`-v3`, `-v4`), se vuelve a leer y solo entonces se continúa.
  - Además existen el guardado anterior (`-bak`), la copia diaria (`-day`), la copia previa a cada restauración (`-restore`) y la papelera.
  - Nada se borra sin una copia comprobada.
- **Multijugador:**
  - Todo pasa por el servidor WebSocket real (`server/server.js`): el servidor valida los permisos, los terrenos, los candados, el comercio y el cofre de equipo.
  - El protocolo sigue siendo el 4. El juego detecta qué funciones anuncia el servidor y no muestra las que un servidor anterior no tiene.
- **Rendimiento:**
  - Las entidades lejanas se actualizan con menos frecuencia, según el nivel de detalle.
  - Las partículas usan una reserva de objetos.
  - La descarga de chunks es más barata.
  - Las geometrías de chunks y criaturas se liberan al descargarse; se comprobó que la memoria no crece al recorrer el mundo ni al aparecer y desaparecer cientos de criaturas.

## Archivos

- `index.html`: el juego completo.
- `server/server.js`: el servidor multijugador (Node.js, sin dependencias).
- `server/README.md`: instrucciones del servidor.
