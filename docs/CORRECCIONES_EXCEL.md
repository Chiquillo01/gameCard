# Correcciones del Excel de cartas (BD cardGame, hoja cardsInDataBase)

Revisión del 15-10-2026. Número = columna `number`.

## 1. Bloquean la carga (estas cartas NO están en la BD)

| Nº | Carta | Qué falta |
|---|---|---|
| 31 | Grover, el Goblin Guardián | Atk, Vida y Nivel (`-`) |
| 52 | Orco Conjurador | Atk, Vida y Nivel (`-`) |
| 196 | Grifo | Atk, Vida, Nivel y efecto |
| 197 | Hipogrifo | Atk, Vida, Nivel y efecto |
| 198 | Mantícora | Atk, Vida, Nivel y efecto |
| 261 | Búho del bosque oscuro | Atk, Vida y Nivel (vacíos) |
| 306 | Licántropo Guardián | Atk, Vida y Nivel (`-`) |
| 313 | Licántropo Albino | Rareza, Atk, Vida, Nivel, efecto y state |
| 117 | ??? (Reino, efecto de Pasto de Huesos) | Nombre |
| 289 | ?? (Veloz, sacrifica 1 Planta) | Nombre — y su efecto es casi el mismo que el 284 «El poder de las plantas» |

Además hay filas vacías con nombre «???»: 79-100, 120-130, 229, 253-259 y 314-330.

## 2. Errores de datos

| Nº | Carta | Problema | Propuesta |
|---|---|---|---|
| 311 / 312 | Llamada Simple | Dos cartas con el mismo nombre y efectos distintos | Renombrar una |
| 118 / 119 | Banshee / Mimeto | Filas sueltas repetidas (solo imagen y descripción) bajo las cartas 113 y 102. Mimeto dice Raro en una y Común en la otra | Pasar la imagen/descripción a la fila buena (113 / 102) y borrar 118-119 |
| 104 | Slime | En `text.invocation` está la descripción de un licántropo | Poner `-` |
| 290 | Tarasca, el Titán del Reino | Compilación sin receta, sin breed y sin atributo | Completar |
| 277 | Raiz Asfixiante | Soporte sin coste (`-`) | Poner «Activación - …» |
| 50 | Orco Jefe | Sin efecto | Completar o «Monstruo sin efecto.» |
| 269 | Raíz Centenaria | Tipo «Equpo» | «Equipo» |
| — | Counter / Contraefecto | Dos nombres para el mismo tipo (3 «Counter», 2 «Contraefecto») | Usar solo uno |

## 3. state (banlist)

Sin state (la BD usa el de su rareza): 177 Des - Compilación, 215 Sunne, Princesa Solar, 266 Pantano del Bosque Oscuro, 269 Raíz Centenaria, 274 Guardián del Bosque Oscuro, 276 Extensor de Vida, 278 El Bosque Oscuro, 284 El poder de las plantas, 298 Barrida de Licántropos, 304 Búsqueda Normal, 306 Licántropo Guardián, 311 Llamada Simple.

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
| 283 | Carnívora Bestia-Moss | «Carnívora Come-Humanos» (receta) | «Carnivora Come Hombres» (o renombrar la 262) |
| 133 | Murcielago | «Murciélago» | El nombre de la carta no lleva tilde: unificar |
| 156 | Súcubo | «Incubo» | «Íncubo» |
| 216 | Zona de Impacto | «Sunne, Princesa del Sol» | «Sunne, Princesa Solar» |
| 200-202, 212, 215 | Equipo Sunne / Sunne | «Armadura Sunne» | No existe ninguna carta así (¿«Equipo Sunne»?) |
| 42 | Grover, el Goblin | «Catedral Goblin» | «Catedral de los Goblins» |
| 75 | Draña | «Araña Oscura», «Drañar» | No existen |
| 218 | Motor de Engranaje | «Engranage» | «Engranaje» |
| 272 | Engranaje maestro | «Gear» | ¿«Engranaje»? |
| 302 | El Primer Infectado | «Licano» entre comillas | Es un tipo, no un nombre: quitar las comillas |

## 5. Erratas

**Nombres de carta:**

- 192 «Can del Infireno» → Infierno
- 191 «Solar, el Vergudo de los Cielos» → Verdugo
- 110 «Intercanvio del Pequeño» → Intercambio
- 9 «Safira, la Dragóna Real» → Dragona, sin tilde
- 19 «El Primer Ginete» → Jinete (lo cita la receta de la 18)
- 285 «Renovación de Vida.» → sin el punto final

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
| 175, 268, 285 | Contenedor sospechoso, Poder de las Plantas, Renovación de Vida. | montruo → monstruo |
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

**Términos mezclados (unificar):**

- «Deck» en 72, 270, 279 y 286 → Mazo
- «enemigo» / «adversario» / «oponentes» en 2, 32, 52, 113, 153, 157, 184, 269 y 298 → oponente

## 6. Sin imagen

Ya tienen una imagen generada en la BD (pon la ruta en el Excel): 49 Capitán Bandido, 64 Avispa de Batalla, 72 Avispa de Respaldo, 74 Avispa Reina, 76 Avispa Arquera, 161-166 tokens, 268 Poder de las Plantas, 280 Clionne, 281 Grook, 285 Renovación de Vida. — ruta `/assets/CardImg/generated/<nombre>.png`.

Sin ninguna imagen (salen con la imagen genérica):

| Expansión | Nº |
|---|---|
| AdB | 4, 9, 10, 15, 18, 29 |
| CdG | 31, 33, 34, 36, 37, 41, 42, 43, 44, 45, 50, 52, 53, 55, 57, 60 |
| CE | 63, 67, 68, 75 |
| DsF | 101, 109, 113 (la 118 sí la tiene) |
| EdC | 136, 148, 152, 159, 160 |
| IdL | 173, 177, 179, 183, 186, 187, 194, 196, 197, 198 |
| NdM | 200-205, 207-210, 212, 215-217, 220, 224, 225 |
| PAO | 230, 243, 245, 249, 251, 252 |
| SBE | 261, 263, 265-267, 269-272, 274, 276-278, 284, 286, 287, 290 |
| TP | 298, 304, 306, 311, 312 |

Las mismas cartas tampoco tienen descripción (`text.history`); además faltan las de 102 Mimeto y 175 Contenedor sospechoso.

## 7. Cartas por expansión (solo con datos completos)

AdB 30 · CdG 30 · EdC 30 · IdL 30 · SBE 30 · NdM 29 · PAO 23 · TP 23 · CE 18 · DsF 16 · EET 6 · GyH 3
