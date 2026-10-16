# Correcciones del Excel de cartas (BD cardGame, hoja cardsInDataBase)

Revisión del 15-10-2026. Número = columna `number`.

## 1. Bloquean la carga (estas cartas NO están en la BD)

Ya corregidas y cargadas: 31 Grover, el Goblin Guardián, 52 Orco Conjurador, 261 Búho del bosque oscuro y 306 Licántropo Guardián.

| Nº | Carta | Qué falta |
|---|---|---|
| 196 | Grifo | Atk, Vida, Nivel y efecto |
| 197 | Hipogrifo | Atk, Vida, Nivel y efecto |
| 198 | Mantícora | Atk, Vida, Nivel y efecto |
| 313 | Licántropo Albino | Rareza, Atk, Vida, Nivel, efecto y state |
| 117 | ??? (Reino, efecto de Pasto de Huesos) | Nombre |
| 289 | ?? (Veloz, sacrifica 1 Planta) | Nombre — y su efecto es casi el mismo que el 284 «El poder de las plantas» |

Además hay filas vacías con nombre «???»: 79-100, 120-130, 229, 253-259 y 314-330.

## 2. Errores de datos

| Nº | Carta | Problema | Propuesta |
|---|---|---|---|
| 311 / 312 | Llamada Simple | Dos cartas con el mismo nombre y efectos distintos | Renombrar una |
| 118 / 119 | Banshee / Mimeto | Filas sueltas repetidas (solo imagen y descripción) bajo las cartas 113 y 102. Mimeto dice Raro en una y Común en la otra | Pasar la imagen/descripción a la fila buena (113 / 102) y borrar 118-119 |
| 104, 113, 132, 137, 174, 238 | Slime, Banshee, Héroe Silencioso, Héroe Corrupto, Valkiria, Gigante de Rocas | La descripción empieza y termina con comillas | Quitarlas (en la BD ya están quitadas) |
| 290 | Tarasca, el Titán del Reino | Sin breed (tipo) ni atributo (receta ya añadida) | Completar |
| 50 | Orco Jefe | Sin efecto | Completar o «Monstruo sin efecto.» |
| 269 | Raíz Centenaria | Ahora es Continuo, pero el texto habla de «el monstruo equipado» (eso es de un Equipo) | Elegir: Equipo, o cambiar el texto |
| — | Counter → Contraefecto | En «Counter» (3 cartas) poner «Contraefecto». En el juego ya se muestra «Contraefecto» | Cambiar en el Excel |

## 3. state (banlist)

Ya añadido en la BD según su rareza (pon el mismo valor en el Excel): 177 Des - Compilación 4, 215 Sunne, Princesa Llama 2, 266 Pantano del Bosque Oscuro 4, 269 Raíz Centenaria 4, 274 Guardián del Bosque Oscuro 2, 276 Extensor de Vida 2, 278 El Bosque Oscuro 1, 284 El poder de las plantas 3, 298 Barrida de Licántropos 4, 304 Búsqueda Normal 2, 306 Licántropo Guardián 3, 311 Llamada Simple 3.

State distinto del normal de su rareza (¿a propósito?):

| Nº | Carta | Rareza | state | Normal |
|---|---|---|---|---|
| 51 | Orco Lanzador de Dardos | Raro | 4 | 3 |
| 52 | Orco Conjurador | Raro | 4 | 3 |
| 199 | Cuenco de Lava | Raro | 4 | 3 |
| 212 | Equipo Sunne - Plan Maestro | Épico | 4 | 2 |
| 280 | Clionne, Dama Ramificada del Bosque | Raro | 4 | 3 |
| 281 | Grook, el Árbol Guardián | Raro | 4 | 3 |

## 4. Nombres citados que no existen

Los efectos buscan por nombre: si no coincide, el efecto no encuentra la carta.

| Nº | Carta | Cita | Debería ser |
|---|---|---|---|
| 133 | Murcielago | «Murciélago» | El nombre de la carta no lleva tilde: unificar |
| 200-202, 212, 215 | Equipo Sunne / Sunne | «Armadura Sunne» | No existe ninguna carta así (¿«Equipo Sunne»?) |
| 42 | Grover, el Goblin | «Catedral Goblin» | «Catedral de los Goblins» |
| 75 | Draña | «Araña Oscura», «Drañar» | No existen |
| 272 | Engranaje maestro | «Gear» | ¿«Engranaje»? |
| 302 | El Primer Infectado | «Licano» entre comillas | Es un tipo, no un nombre: quitar las comillas |

## 5. Erratas

**Nombres de carta:**

- 191 «Solar, el Vergudo de los Cielos» → Verdugo
- 110 «Intercanvio del Pequeño» → Intercambio
- 9 «Safira, la Dragóna Real» → Dragona, sin tilde
- 19 «El Primer Ginete» → Jinete (lo cita la receta de la 18)

**Espacios de más en el nombre:**

- 4 «Safira, Bebé Dragón »
- 33 «Goblin  Ardiente » (doble espacio)
- 198 «Mantícora »
- 219 «Enano Constructor »

**Breed:**

- «Himenóptero » con espacio final (11 cartas, 64-78)
- «Besti Infernal» → Bestia Infernal (115, 192, 198)
- «Guerrero Aquatíco» → Acuático
- «Monstruo Maríno» → Marino
- «Crustaceo» → Crustáceo
- «Maquina» → Máquina

**Textos:**

| Nº | Carta | Errata |
|---|---|---|
| 175, 268, 285 | Contenedor sospechoso, Poder de las Plantas, Renovación de Vida | montruo → monstruo |
| 287, 312 | Xana del Bosque Oscuro, Llamada Simple | Vidaensa → Defensa |
| 154 | Héroe de Escarcha | 0ponente (con cero) → oponente |
| 144, 157 | Vampiro, Vampiresa | coantrolando → controlando |
| 49, 50 | Capitán Bandido, Orco Jefe | puede se invocado → puede ser invocado |
| 173 | Sátiro Vengador | controaslas → controlas |
| 64 | Avispa de Batalla | Su Atk de vuelve → se vuelve |
| 102 | Mimeto | boltear → voltear |
| 24 | Anillo de Boda | destuye → destruye |
| 1 | LenguAcida | 2 Dragónes → 2 Dragones |
| 301 | Cadejo | Monstuos → Monstruos |
| 17 | Sky | Añada → Añade |
| 306 | Licántropo Guardián | «campodel» → campo del; «Destruyelas» → Destrúyelas |

**Términos mezclados (unificar):**

- «Deck» en 72, 270, 279 y 286 → Mazo
- «enemigo» / «adversario» / «oponentes» en 2, 32, 52, 113, 153, 157, 184, 269 y 298 → oponente

## 6. Imágenes generadas

Todas las cartas tienen ya imagen en la BD. Estas 100 están generadas en pixel art (8 bits; las Compilaciones en 16 bits). Copia la ruta a la columna `text.image` del Excel:

| Nº | Carta | text.image |
|---|---|---|
| 4 | Safira, Bebé Dragón | `/assets/CardImg/generated/safira-bebe-dragon.png` |
| 9 | Safira, la Dragóna Real | `/assets/CardImg/generated/safira-la-dragona-real.png` |
| 10 | Safira, la Reina Dragón | `/assets/CardImg/generated/safira-la-reina-dragon.png` |
| 15 | Safira, la Joven Heredera | `/assets/CardImg/generated/safira-la-joven-heredera.png` |
| 18 | El Jinete Original, Draco | `/assets/CardImg/generated/el-jinete-original-draco.png` |
| 29 | Camino de la Reina | `/assets/CardImg/generated/camino-de-la-reina.png` |
| 31 | Grover, el Goblin Guardián | `/assets/CardImg/generated/grover-el-goblin-guardian.png` |
| 33 | Goblin Ardiente | `/assets/CardImg/generated/goblin-ardiente.png` |
| 34 | Goblin Guardián | `/assets/CardImg/generated/goblin-guardian.png` |
| 36 | Orco Traicionero | `/assets/CardImg/generated/orco-traicionero.png` |
| 37 | Orcos del primer Batallón | `/assets/CardImg/generated/orcos-del-primer-batallon.png` |
| 41 | Grover, el Goblin Solitario | `/assets/CardImg/generated/grover-el-goblin-solitario.png` |
| 42 | Grover, el Goblin | `/assets/CardImg/generated/grover-el-goblin.png` |
| 43 | Ciudadela de los Verdes | `/assets/CardImg/generated/ciudadela-de-los-verdes.png` |
| 44 | En busca del Goblin | `/assets/CardImg/generated/en-busca-del-goblin.png` |
| 45 | Catedral de los Goblins | `/assets/CardImg/generated/catedral-de-los-goblins.png` |
| 49 | Capitán Bandido | `/assets/CardImg/generated/capitan-bandido.png` |
| 50 | Orco Jefe | `/assets/CardImg/generated/orco-jefe.png` |
| 52 | Orco Conjurador | `/assets/CardImg/generated/orco-conjurador.png` |
| 53 | Grover, el Goblin Ardiente | `/assets/CardImg/generated/grover-el-goblin-ardiente.png` |
| 55 | Goblin Solitario | `/assets/CardImg/generated/goblin-solitario.png` |
| 57 | Conjurador Orco | `/assets/CardImg/generated/conjurador-orco.png` |
| 60 | El Duende Elegido | `/assets/CardImg/generated/el-duende-elegido.png` |
| 63 | Araña de Fase | `/assets/CardImg/generated/arana-de-fase.png` |
| 64 | Avispa de Batalla | `/assets/CardImg/generated/avispa-de-batalla.png` |
| 67 | Cucaracha de Combate | `/assets/CardImg/generated/cucaracha-de-combate.png` |
| 68 | Insecto Buscador | `/assets/CardImg/generated/insecto-buscador.png` |
| 72 | Avispa de Respaldo | `/assets/CardImg/generated/avispa-de-respaldo.png` |
| 74 | Avispa Reina | `/assets/CardImg/generated/avispa-reina.png` |
| 75 | Draña | `/assets/CardImg/generated/drana.png` |
| 76 | Avispa Arquera | `/assets/CardImg/generated/avispa-arquera.png` |
| 101 | Esqueleto Parásito | `/assets/CardImg/generated/esqueleto-parasito.png` |
| 109 | Armadura Animada | `/assets/CardImg/generated/armadura-animada.png` |
| 136 | Herida Sangrante | `/assets/CardImg/generated/herida-sangrante.png` |
| 148 | Cáliz de Sangre | `/assets/CardImg/generated/caliz-de-sangre.png` |
| 152 | Héroe Frío Polar | `/assets/CardImg/generated/heroe-frio-polar.png` |
| 159 | Venganza de los Héroes | `/assets/CardImg/generated/venganza-de-los-heroes.png` |
| 160 | Noche Eterna | `/assets/CardImg/generated/noche-eterna.png` |
| 161 | Perla de Fuego | `/assets/CardImg/generated/perla-de-fuego.png` |
| 162 | Perla de Hielo | `/assets/CardImg/generated/perla-de-hielo.png` |
| 163 | Perla Oscura | `/assets/CardImg/generated/perla-oscura.png` |
| 164 | Token de Balista | `/assets/CardImg/generated/token-de-balista.png` |
| 165 | Token del Tesoro | `/assets/CardImg/generated/token-del-tesoro.png` |
| 166 | Tentáculo Musculoso | `/assets/CardImg/generated/tentaculo-musculoso.png` |
| 173 | Sátiro Vengador | `/assets/CardImg/generated/satiro-vengador.png` |
| 177 | Des - Compilación | `/assets/CardImg/generated/des-compilacion.png` |
| 179 | La Virtud del Más Débil | `/assets/CardImg/generated/la-virtud-del-mas-debil.png` |
| 183 | Planetar | `/assets/CardImg/generated/planetar.png` |
| 186 | El Vacío | `/assets/CardImg/generated/el-vacio.png` |
| 187 | Hoguera | `/assets/CardImg/generated/hoguera.png` |
| 194 | Sombra | `/assets/CardImg/generated/sombra.png` |
| 200 | Equipo Sunne - Astas de Combate | `/assets/CardImg/generated/equipo-sunne-astas-de-combate.png` |
| 201 | Equipo Sunne - Espada Solar | `/assets/CardImg/generated/equipo-sunne-espada-solar.png` |
| 202 | Equipo Sunne - Resonador | `/assets/CardImg/generated/equipo-sunne-resonador.png` |
| 203 | Familiar Mágico - Gus | `/assets/CardImg/generated/familiar-magico-gus.png` |
| 204 | Familiar Mágico - Mochi | `/assets/CardImg/generated/familiar-magico-mochi.png` |
| 205 | Familiar Mágico - Monin | `/assets/CardImg/generated/familiar-magico-monin.png` |
| 207 | Libro de hechizos - Castigo | `/assets/CardImg/generated/libro-de-hechizos-castigo.png` |
| 208 | Libro de hechizos - Fulminar | `/assets/CardImg/generated/libro-de-hechizos-fulminar.png` |
| 209 | Anciana de los libros | `/assets/CardImg/generated/anciana-de-los-libros.png` |
| 210 | Bibliotecaria | `/assets/CardImg/generated/bibliotecaria.png` |
| 212 | Equipo Sunne - Plan Maestro | `/assets/CardImg/generated/equipo-sunne-plan-maestro.png` |
| 215 | Sunne, Princesa Llama | `/assets/CardImg/generated/sunne-princesa-llama.png` |
| 216 | Zona de Impacto | `/assets/CardImg/generated/zona-de-impacto.png` |
| 217 | Biblioteca Ancestral | `/assets/CardImg/generated/biblioteca-ancestral.png` |
| 220 | Bibliotecario | `/assets/CardImg/generated/bibliotecario.png` |
| 224 | Libro de hechizos - Dragar | `/assets/CardImg/generated/libro-de-hechizos-dragar.png` |
| 225 | Libro de hechizos - Necronomicon | `/assets/CardImg/generated/libro-de-hechizos-necronomicon.png` |
| 230 | Héroe Aprendiz | `/assets/CardImg/generated/heroe-aprendiz.png` |
| 243 | Koi Mágico | `/assets/CardImg/generated/koi-magico.png` |
| 245 | Tiburón de Grandes Fauces | `/assets/CardImg/generated/tiburon-de-grandes-fauces.png` |
| 249 | Manta-Raya | `/assets/CardImg/generated/manta-raya.png` |
| 251 | Hidra | `/assets/CardImg/generated/hidra.png` |
| 252 | Pecera de Cristal | `/assets/CardImg/generated/pecera-de-cristal.png` |
| 261 | Búho del bosque oscuro | `/assets/CardImg/generated/buho-del-bosque-oscuro.png` |
| 263 | Cuélebre del Bosque Oscuro | `/assets/CardImg/generated/cuelebre-del-bosque-oscuro.png` |
| 265 | Nuberu del Bosque Oscuro | `/assets/CardImg/generated/nuberu-del-bosque-oscuro.png` |
| 266 | Pantano del Bosque Oscuro | `/assets/CardImg/generated/pantano-del-bosque-oscuro.png` |
| 267 | Pétalos de Rosa | `/assets/CardImg/generated/petalos-de-rosa.png` |
| 268 | Poder de las Plantas | `/assets/CardImg/generated/poder-de-las-plantas.png` |
| 269 | Raíz Centenaria | `/assets/CardImg/generated/raiz-centenaria.png` |
| 270 | Atalaya del Bosque Oscuro | `/assets/CardImg/generated/atalaya-del-bosque-oscuro.png` |
| 271 | Busgosu del Bosque Oscuro | `/assets/CardImg/generated/busgosu-del-bosque-oscuro.png` |
| 272 | Engranaje maestro | `/assets/CardImg/generated/engranaje-maestro.png` |
| 274 | Guardián del Bosque Oscuro | `/assets/CardImg/generated/guardian-del-bosque-oscuro.png` |
| 276 | Extensor de Vida | `/assets/CardImg/generated/extensor-de-vida.png` |
| 277 | Raiz Asfixiante | `/assets/CardImg/generated/raiz-asfixiante.png` |
| 278 | El Bosque Oscuro | `/assets/CardImg/generated/el-bosque-oscuro.png` |
| 280 | Clionne, Dama Ramificada del Bosque | `/assets/CardImg/generated/clionne-dama-ramificada-del-bosque.png` |
| 281 | Grook, el Árbol Guardián | `/assets/CardImg/generated/grook-el-arbol-guardian.png` |
| 284 | El poder de las plantas | `/assets/CardImg/generated/el-poder-de-las-plantas.png` |
| 285 | Renovación de Vida | `/assets/CardImg/generated/renovacion-de-vida.png` |
| 286 | Sabio del Bosque Oscuro | `/assets/CardImg/generated/sabio-del-bosque-oscuro.png` |
| 287 | Xana del Bosque Oscuro | `/assets/CardImg/generated/xana-del-bosque-oscuro.png` |
| 290 | Tarasca, el Titán del Reino | `/assets/CardImg/generated/tarasca-el-titan-del-reino.png` |
| 298 | Barrida de Licántropos | `/assets/CardImg/generated/barrida-de-licantropos.png` |
| 304 | Búsqueda Normal | `/assets/CardImg/generated/busqueda-normal.png` |
| 306 | Licántropo Guardián | `/assets/CardImg/generated/licantropo-guardian.png` |
| 311 | Llamada Simple | `/assets/CardImg/generated/llamada-simple-311.png` |
| 312 | Llamada Simple | `/assets/CardImg/generated/llamada-simple-312.png` |

Sin descripción (`text.history`) en la BD: 4, 9, 10, 15, 18, 29, 31, 33, 34, 36, 37, 41, 42, 43, 44, 45, 49, 50, 52, 53, 55, 57, 60, 63, 64, 67, 68, 72, 74, 75, 76, 101, 109, 136, 148, 152, 159, 160, 161, 162, 163, 164, 165, 166, 173, 175, 177, 179, 183, 186, 187, 194, 200, 201, 202, 203, 204, 205, 207, 208, 209, 210, 212, 215, 216, 217, 220, 224, 225, 230, 243, 245, 249, 251, 252, 261, 263, 265, 266, 267, 268, 269, 270, 271, 272, 274, 276, 277, 278, 280, 281, 284, 285, 286, 287, 290, 298, 304, 306, 311, 312.

## 7. Cartas por expansión (solo con datos completos)

AdB 30 · CdG 30 · EdC 30 · IdL 30 · SBE 30 · NdM 29 · PAO 23 · TP 23 · CE 18 · DsF 16 · EET 6 · GyH 3
