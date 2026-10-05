// Casos clínicos y construcción del protocolo según la configuración elegida.

export const LEVELS = [
  {
    id: 1, cavity: 'claseI', matrix: false, fiber: false,
    title: 'Nivel 1 · Clase I oclusal',
    desc: 'Lesión oclusal en molar. Domina el protocolo adhesivo, el control de la humedad y el resin coat.',
  },
  {
    id: 2, cavity: 'mod', matrix: true, fiber: true,
    title: 'Nivel 2 · Biomimética: MOD profunda',
    desc: 'Cavidad MOD con pérdida de rebordes marginales. Matriz, resin coat, fibra de polietileno y estratificación dentina/esmalte.',
  },
];

export const WHY = {
  aislar: 'El dique evita la contaminación con saliva, sangre y la humedad del aliento, que reducen la resistencia adhesiva y aumentan la microfiltración.',
  matriz: 'En clase II, la matriz seccional y las cuñas reconstruyen las paredes proximales, devuelven el punto de contacto y evitan excesos o escalones cervicales.',
  limpiar: 'Elimina biofilm y restos que interfieren con el grabado y con la humectación del adhesivo.',
  grabarTotal: 'Aplica primero en esmalte y luego en dentina para que cada tejido reciba su tiempo. Esmalte 15 s: disolución selectiva de prismas (microrretención). Dentina 10 s: elimina el barrillo y desmineraliza unas pocas micras, exponiendo colágeno. Un tiempo mayor desmineraliza más de lo que el adhesivo puede infiltrar y deja colágeno desprotegido.',
  grabarSel: 'Ácido solo sobre el esmalte, 15 s. La dentina no se graba con ácido fosfórico: el autograbante conserva hidroxiapatita alrededor del colágeno para la unión química del 10-MDP (nanocapas MDP-Ca).',
  lavar: 'Lava abundantemente hasta eliminar todo el gel y los productos de la reacción. El tiempo de grabado se detiene al retirar el ácido.',
  secarTotal: 'Esmalte seco (aspecto blanco tiza). Dentina húmeda y brillante, sin charcos: el agua mantiene expandida la red de colágeno. Si la desecas, el colágeno colapsa y el adhesivo no infiltra. Retira los excesos con un microbrush seco y usa el aire solo sobre el esmalte.',
  secarSel: 'Esmalte seco, blanco tiza. La dentina no grabada puede secarse suavemente, sin desecarla ni dejar charcos que diluyan el primer.',
  univ: 'Frota activamente durante 20 s: mejora la infiltración y la evaporación del solvente, y favorece la interacción química del MDP.',
  univAire: 'Aire suave hasta que la capa deje de moverse (≈5 s). El agua o el solvente residual dejan poros y degradan la interfase.',
  curar10: 'Lámpara LED de intensidad adecuada, con la punta cerca y perpendicular, durante 10 s.',
  primer: 'El primer autograbante con 10-MDP desmineraliza e infiltra a la vez. Déjalo actuar 20 s; no se lava.',
  primerAire: 'Aire suave para evaporar el agua y el solvente del primer antes de colocar el adhesivo.',
  bond: 'Capa de adhesivo hidrófobo que sella la dentina hibridizada y el esmalte grabado.',
  bondAire: 'Aire suave para uniformar la capa y evitar acumulaciones en los ángulos internos.',
  coat: 'Resin coat: capa delgada de resina fluida sobre la dentina hibridizada. Protege la capa híbrida, mejora el sellado y actúa como capa elástica que absorbe las tensiones de contracción.',
  curar20: 'Polimeriza la resina fluida 20 s antes de continuar.',
  fibra: 'Fibra de polietileno sobre una capa de resina fluida en el piso: refuerza el remanente, detiene la propagación de grietas y redistribuye las tensiones. Es un sustituto biomimético de la dentina.',
  dentina: 'Reemplaza la dentina con composite opaco de dentina en incrementos de 2 mm como máximo, polimerizando cada uno. Así reduces la tensión de contracción y aseguras la polimerización en profundidad. Construye hasta la unión amelodentinaria (UAD).',
  esmalte: 'Capa final de composite de esmalte translúcido, del espesor del esmalte natural (≈2 mm), que reproduce la anatomía oclusal.',
  pulir: 'El acabado y pulido eliminan excesos y dan brillo. También reducen la acumulación de placa y la tinción marginal.',
};

export function buildSteps(cfg) {
  const total = cfg.protocol === 'total';
  const univ = cfg.adhesive === 'universal';
  const S = [];
  const add = (id, label, why, check) => S.push({ id, label, why, check, done: false });
  const lastCured = g => g.incs.length > 0 && g.incs[g.incs.length - 1].cureQ !== null;

  add('aislar', 'Aislamiento absoluto con dique de goma', WHY.aislar, g => g.flags.isolated);
  if (cfg.level.matrix) add('matriz', 'Matriz seccional + cuñas', WHY.matriz, g => g.flags.matrix);
  add('limpiar', 'Limpieza de la cavidad (piedra pómez)', WHY.limpiar, g => g.flags.cleaned);
  if (total) add('grabar', 'Ácido fosfórico 37%: esmalte 15 s · dentina 10 s', WHY.grabarTotal, g => !!g.etch.final);
  else add('grabar', 'Grabado selectivo: solo esmalte, 15 s', WHY.grabarSel, g => !!g.etch.final);
  add('lavar', 'Lavado abundante hasta retirar todo el gel', WHY.lavar, g => !!g.etch.final && g.etch.rinseTime >= 5);
  add('secar',
    total ? 'Secado: esmalte seco · dentina húmeda (no desecar)' : 'Secado: esmalte blanco tiza · dentina sin desecar',
    total ? WHY.secarTotal : WHY.secarSel,
    g => g.adh.started || (!!g.etch.final && g.etch.rinseTime >= 5 && g.live.wetE < 0.5 && g.live.wetD < 0.82 && (!total || g.live.wetD >= 0.3)));

  if (univ) {
    add('univ', total ? 'Adhesivo universal (modo grabado total): frotar 20 s' : 'Adhesivo universal (modo autograbante en dentina): frotar 20 s', WHY.univ, g => g.adh.rub >= 20 || g.adh.air > 0);
    add('univAire', 'Aire suave 5 s (evaporar solvente)', WHY.univAire, g => g.adh.air >= 5 || g.adh.cureQ !== null);
    add('adhCurar', 'Fotopolimerizar 10 s', WHY.curar10, g => g.adh.cureQ !== null);
  } else {
    add('primer', 'Primer autograbante (frasco 1): dejar actuar 20 s', WHY.primer, g => g.adh.primerDwell !== null);
    add('primerAire', 'Aire: evaporar el solvente del primer', WHY.primerAire, g => g.adh.primerAir >= 1.5 || g.adh.bondStarted);
    add('bond', 'Adhesivo (frasco 2): capa uniforme', WHY.bond, g => g.adh.bondStarted && g.live.adhD >= 0.75);
    add('bondAire', 'Aire suave: adelgazar la capa', WHY.bondAire, g => g.adh.bondAir >= 1 || g.adh.cureQ !== null);
    add('adhCurar', 'Fotopolimerizar 10 s', WHY.curar10, g => g.adh.cureQ !== null);
  }

  add('coat', 'Resin coat: resina fluida delgada sobre la dentina', WHY.coat, g => g.coat.started && g.live.coatD >= 0.75);
  add('coatCurar', 'Fotopolimerizar el resin coat 20 s', WHY.curar20, g => g.coat.cureQ !== null);
  if (cfg.level.fiber) add('fibra', 'Fibra de polietileno en el piso + fotopolimerizar', WHY.fibra, g => g.fiber.placed && g.fiber.cureQ !== null);
  add('dentina', 'Composite de dentina: incrementos ≤ 2 mm hasta la UAD', WHY.dentina,
    g => g.incs.some(i => i.shade === 'dentina' && i.cureQ !== null) && g.level >= g.tooth.dejY - 0.12 && lastCured(g));
  add('esmalte', 'Capa de esmalte ≤ 2 mm reproduciendo la anatomía', WHY.esmalte,
    g => g.incs.some(i => i.shade === 'esmalte' && i.cureQ !== null) && g.level >= g.tooth.fillTarget - 0.05 && lastCured(g));
  add('pulir', 'Acabado y pulido', WHY.pulir, g => g.polished);
  return S;
}
