# 🦷 CemLab 3D

Simulador 3D (Three.js) de **cementación adhesiva** para estudiantes. El alumno lee un caso clínico, elige el cemento y la estrategia en el diente, prepara su bandeja y ejecuta el protocolo sobre **la restauración** (en la mesa, con la superficie interna hacia arriba) y sobre **el diente** preparado. Al terminar ve su resistencia adhesiva **entre el peor y el mejor escenario posible** para ese cemento y material, con líneas de referencia, y una vista microscópica de las dos interfases: diente–cemento y cemento–restauración.

> Rama `claude/cementation-game`. El juego de restauraciones directas (BioBond 3D) sigue en la rama `claude/dental-adhesion-3d-game-qt8pda`.

## Cómo ejecutarlo

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

Son módulos ES sin compilación; Three.js r160 se carga desde jsDelivr.

## Casos

| Caso | Restauración | Material | Particularidad |
|---|---|---|---|
| Corona 3.6 | Corona completa | Zirconia 3Y-TZP | Opaca: llega poca luz; necesita arenado + MDP |
| Onlay 3.6 | Onlay con cubrimiento cuspídeo | Disilicato de litio | No retentiva; dentina extensa (IDS recomendado) |
| Carilla 1.1 | Carilla | Porcelana feldespática | Esmalte; muy translúcida; estética del cemento |
| Corona 3.6 | Corona completa | Co-Cr | Metal: la luz no lo atraviesa |

## Cementos

| Cemento | Diente | Restauración |
|---|---|---|
| **Panavia V5** (sucesor de F 2.0) | Tooth Primer 20 s, aire | Clearfil Ceramic Primer Plus |
| **Multilink Automix** | Multilink Primer A+B 30 s frotando, aire | Monobond Plus 60 s |
| **RelyX Ultimate** | Scotchbond Universal 20 s, aire 5 s | Silano (vítrea) / Scotchbond Universal (zirconia, metal) |
| **RelyX U200** | Sin acondicionar la dentina; grabado selectivo del esmalte | Silano (vítrea) / solo arenado |
| **Variolink Esthetic LC** | Grabado + Adhese Universal + luz 10 s | Monobond Plus · solo fotopolimerizable |

**Estrategia en el diente:** grabado total (fosfórico: esmalte 15 s, dentina 10 s), grabado selectivo del esmalte o sin ácido fosfórico. **IDS / resin coat** opcional, como si se hubiera hecho en la sesión de preparación.

## Flujo

1. **Caso clínico.**
2. **Protocolo:** cemento, estrategia en el diente, IDS, modo guiado y tiempo ×4.
3. **Bandeja:** el gabinete muestra todos los materiales desordenados, con distractores. El alumno elige y ordena; se corrige el primer intento, junto con las decisiones clínicas.
4. **Procedimiento:**
   - **Restauración:** prueba clínica (contamina con saliva), acondicionamiento (HF o arenado), primer y secado.
   - **Diente:** aislamiento, piedra pómez, grabado, primer o adhesivo.
   - **Cementado:** cargar el cemento, asentar con presión (≥ 5 s), luz 2–3 s, retirar excesos, glicerina, 20 s de luz por cara y pulido.
5. **Informe:**
   - Resistencia a 24 h y envejecida, sobre la franja peor ↔ mejor escenario.
   - Líneas de referencia: ≈ 6–8 MPa (riesgo de descementación), ≈ 17–20 MPa (resiste la contracción) y 25 MPa (ISO 9693, metal-cerámica).
   - Eslabón débil, decisiones clínicas y análisis paso a paso.

## Modelo de adhesión

`js/evaluate.js` calcula la adhesión del lado diente (esmalte y dentina, según el cemento, la estrategia, el IDS, la presión y la polimerización) y del lado restauración (HF + silano, arenado + MDP, contaminación). La adhesión final es la del **eslabón más débil**. Los valores base y los factores provienen de la síntesis bibliográfica de [`docs/literatura-cementacion.md`](docs/literatura-cementacion.md) (PubMed). Son **valores ilustrativos con fines didácticos**, no mediciones.

## Estructura

```
index.html · css/styles.css
js/main.js        escena, cámara, arrastrar y soltar, bucle
js/data.js        casos, cementos, instrumentos, bandeja esperada, pasos y decisiones
js/geometry.js    muñón + corona, onlay, carilla (geometría procedural)
js/paintable.js   estados por vértice (gel, arenado, contaminación, primers, cemento)
js/game.js        reglas del procedimiento, tiempos, errores, informe
js/evaluate.js    modelo de resistencia adhesiva y escenarios peor/mejor
js/micro.js       vista microscópica de las dos interfases
js/planner.js     preparación y corrección de la bandeja
js/ui.js          interfaz
js/tools3d.js     modelos 3D de los instrumentos
js/tooth.js       molar procedural (base compartida con BioBond 3D)
```
