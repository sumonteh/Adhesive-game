# 🦷 BioBond 3D

Simulador 3D (Three.js) de **adhesión dental y odontología biomimética** para estudiantes. Se juega arrastrando instrumentos y materiales desde la bandeja hasta el diente, siguiendo el protocolo adhesivo. Cada decisión (tiempos de grabado, humedad, frotado, evaporación del solvente, polimerización, grosor de los incrementos) cambia la capa híbrida, el sellado y la tensión de contracción. Todo se puede ver en la **vista microscópica**.

## Cómo ejecutarlo

Son módulos ES sin compilación; solo se necesita un servidor estático:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

Three.js se carga desde jsDelivr (r160).

### Publicarlo en GitHub Pages

1. En el repositorio: **Settings → Pages**.
2. En *Build and deployment*, elige **Source: Deploy from a branch**.
3. Selecciona la rama `claude/dental-adhesion-3d-game-qt8pda` (o `main` si luego la fusionas), carpeta **/ (root)**, y guarda.
4. En uno o dos minutos el juego queda en `https://sumonteh.github.io/Adhesive-game/`.

El archivo `.nojekyll` hace que GitHub sirva los archivos tal cual, sin procesarlos con Jekyll.

## Flujo de la partida

1. **Caso clínico:** se presenta al paciente, la pieza y los hallazgos (profundidad, rebordes, márgenes).
2. **Protocolo:** el alumno decide la estrategia de grabado, el sistema adhesivo y si usará refuerzo biomimético con fibra. También elige el modo guiado o sin guía, y si juega contrarreloj.
3. **Bandeja:** el gabinete muestra todos los materiales desordenados, incluidos algunos distractores (hidróxido de calcio, ácido fluorhídrico, silano, hipoclorito, eugenol, amalgama…). El alumno elige solo los que usará y los ordena según el momento de uso. Al verificar, ve el orden recomendado, lo que faltó y por qué no corresponde cada distractor. Se evalúa el primer intento.
4. **Procedimiento:** trabaja con su propia bandeja. Si le falta algo puede usar **＋ Pedir material** (−2 puntos), y usar un distractor sobre el diente penaliza.

## Casos y protocolos

| Nivel | Caso | Incluye |
|---|---|---|
| 1 | Clase I oclusal | Protocolo adhesivo completo + resin coat + estratificación |
| 2 | MOD profunda (biomimética) | Matriz seccional, resin coat, fibra de polietileno, incrementos dentina/esmalte |

**Modo ⏱ contrarreloj** (opcional, en el menú): 5 min para el Nivel 1 y 7 min para el Nivel 2. Si terminas y pules a tiempo, el tiempo sobrante suma hasta +15 puntos. Si se agota, el procedimiento se evalúa tal como quedó. El récord de cada configuración se guarda en el navegador.

**Estrategias de grabado**
- **Grabado total:** ácido ortofosfórico 37%, **esmalte 15 s y dentina 10 s**, y luego adhesivo universal en modo grabado total con técnica húmeda.
- **Grabado selectivo del esmalte:** ácido solo sobre el esmalte (15 s). La dentina se trata en modo autograbante con:
  - **adhesivo universal**, o
  - **autograbante de 2 frascos** (primer con MDP 20 s, aire, adhesivo, aire suave, luz).

Las dos estrategias continúan con **resin coat** (resina fluida delgada, 20 s de luz) antes de estratificar en incrementos ≤ 2 mm: composite de dentina hasta la UAD y composite de esmalte en la superficie. Al final van el acabado y el pulido.

## Controles

- **Arrastra** un instrumento al diente, o tócalo para tomarlo y después presiona sobre el diente.
- **Líquidos** (ácido, agua, aire, microbrush, adhesivos, fluida): se aplican mientras mantienes presionado y recorres la superficie. El adhesivo universal solo cuenta como *frotado activo* si mueves el puntero.
- **Composite:** mantén presionado dentro de la cavidad para extruir (1 mm/s) y suelta para cerrar el incremento.
- **Lámpara:** queda encendida hasta que pulses *Apagar lámpara*; tú controlas el tiempo.
- Con un instrumento en la mano, el clic derecho o dos dedos giran la vista. **Esc** suelta el instrumento.
- **🔬 Microscopio:** muestra la interfase en dentina (colágeno infiltrado o expuesto, tags de resina, hidroxiapatita residual) y en esmalte (patrón de grabado, microrretención).

## Estructura

```
index.html          interfaz y mapa de importaciones
css/styles.css
js/main.js          escena, cámara, arrastrar y soltar, bucle
js/tooth.js         molar procedural, cavidades, estados por vértice, relleno por incrementos
js/tools.js         instrumentos de la bandeja y sus modelos 3D
js/levels.js        casos clínicos, pasos del protocolo y explicaciones
js/game.js          reglas del procedimiento, tiempos, errores
js/evaluate.js      modelo de evaluación (adhesión, microfiltración, tensión, biomimetismo)
js/micro.js         vista microscópica de la interfase
```

> Los valores de MPa y los porcentajes salen de un modelo didáctico simplificado; no son mediciones de laboratorio.
