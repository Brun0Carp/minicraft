# LinkCraft 5.7

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
| Cámara (1.ª / 3.ª persona) | V o F5 | 🎥 | Pausa → Cámara |
| Inventario, mapa, misiones | E, M, J | 🎒 🗺 📜 | Y, Select, cruceta |
| Personaje, mochila, enciclopedia | H, B, K | Pausa → … | Pausa → … |
| Habilidad de clase / zoom | C / Z (mantener) | ✦ / 🔍 | Cruceta derecha / mantener R3 |
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

**Tercera persona y texturas (5.2)**
- Cámara en tercera persona, detrás o de frente (tecla V o F5, botón 🎥 en el celular, Pausa → Cámara), sin atravesar paredes.
- Personaje propio y personalizable en Pausa → Aspecto: piel, pelo, peinado, ojos, ropa y complemento.
  - Muestra la armadura y el objeto en la mano, con animaciones.
  - Los demás jugadores lo ven en un servidor 5.2.
- Texturas de bloques con relieve.
- Criaturas, jefes y jugadores con textura «pixelada» en lugar de colores lisos.
- Cama con patas y almohada, y cofres con tapa y cerrojo en 3D.

**Criaturas y jefes rediseñados (5.3)**
- Modelos 3D nuevos, mucho más detallados, para la araña, el murciélago, las aves, el calamar y los jefes: Gólem ancestral, Dragón de las ruinas, Guardián de las profundidades, Señor de las brasas y Heraldo del vacío.
- Las animaciones y los ataques no cambian.

**Gráficos renovados (5.4)**
- Gran mejora visual: luz, sombras, reflejos y color mucho más detallados; las texturas de bloques, criaturas y agua ganan volumen y brillo con la luz del sol.
- Nuevo ajuste en Ajustes → Gráficos → Shaders, con dos niveles: Suaves (lo trae la calidad Alto) y Completos (la calidad Ultra).
- **Suaves:** luz del sol con dirección y color, agua con olas, reflejos y brillo del sol, atardeceres naranjas y violetas, resplandor de las luces, rayos de sol y curva de tono cinematográfica.
- **Completos:** además, sombras reales del sol, el mundo reflejado en el agua y vegetación que se mece con el viento.
- Necesita WebGL 2.

**Libro de aventuras (5.5)**
- El registro de misiones (J) es ahora un libro abierto de pergamino con tapa de cuero, lomo, cinta y pestañas de colores: Misiones, Completadas, Aldeas y Oficios (LB/RB con mando).
- Misiones activas en cintas con rombo de estado, barra de progreso, «¡Lista para entregar!» y ✕ para abandonar (con confirmación). Tocando una, la página derecha muestra su detalle con Seguir y Abandonar.
- Diario del aventurero: puntos de misión, encargos n/5, completadas y avance de la historia.
- Reputación por oficios (Cazador, Recolector, Artesano, Explorador y Comerciante) calculada con tus estadísticas reales, con siete rangos de Novato a Leyenda.
- Doble página en PC y teléfono horizontal; una columna en teléfono vertical.
- Corregido el nombre «…undefined» de algunas aldeas.

**Combate RPG (5.6)**
- Lanzas, hachas de batalla, martillos de guerra y dagas en ocho materiales, cada familia con su mecánica (alcance y carga, barrido y sangrado, onda de choque, golpe por la espalda y dos dagas).
- Escudos de madera, hierro, diamante y vacuita, y parada perfecta de 0,25 s.
- Combo de tres golpes con estela, pausa en los críticos y reacción de los enemigos, también en tercera persona y multijugador.
- Peso de la armadura, armaduras de infernita y vacuita, conjuntos nuevos y detalles 3D (hombreras, visera, cresta y capa).
- Clases (Vanguardia, Lancero, Pícaro y Arcanista) con habilidad en la tecla C, botón táctil ✦ o cruceta derecha del mando.
- Oficios (Herrería con calidad y gemas, Cocina, Minería y Domador), planos de forja y Enciclopedia → Saber.
- Luna carmesí, tormentas que cargan cristales y runas, y zoom (Z, 🔍 o mantener R3).

**Menús con estilo (5.7)**
- Cada menú lleva la textura de lo que representa: la mesa de fabricación es de madera con patas, el cofre tiene cerrojo, el horno brilla, los encantamientos son de obsidiana, el mapa es de pergamino, los logros de oro, la enciclopedia una estantería…
- Se puede apagar en Ajustes → Gráficos.

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
