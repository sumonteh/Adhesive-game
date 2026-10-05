# 🦷 BioBond 3D

Simulador 3D (Three.js) de **adhesión dental y odontología biomimética** para estudiantes. Se juega arrastrando instrumentos y materiales desde la bandeja hasta el diente, siguiendo el protocolo adhesivo. Cada decisión (tiempos de grabado, humedad, frotado, evaporación del solvente, polimerización, grosor de los incrementos) cambia la capa híbrida, el sellado y la tensión de contracción. Todo se puede ver en la **vista microscópica**.

## Cómo ejecutarlo

Son módulos ES sin compilación; solo se necesita un servidor estático:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

También funciona en GitHub Pages. Three.js se carga desde jsDelivr (r160).

## Casos y protocolos

| Nivel | Caso | Incluye |
|---|---|---|
| 1 | Clase I oclusal | Protocolo adhesivo completo + resin coat + estratificación |
| 2 | MOD profunda (biomimética) | Matriz seccional, resin coat, fibra de polietileno, incrementos dentina/esmalte |

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
