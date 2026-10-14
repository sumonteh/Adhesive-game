// Casos, cementos, instrumentos y reglas del protocolo de cementación.
// Los valores de adhesión se modelan en evaluate.js a partir de docs/literatura-cementacion.md.

export const CASES = [
  {
    id: 'zr', resto: 'crown', material: 'zirconia', tooth: 'molar',
    title: 'Corona de zirconia monolítica · 3.6',
    patient: 'Hombre de 52 años · pieza 3.6 vital con gran destrucción coronaria',
    story: 'Preparación periférica total con terminación en chaflán. Corona monolítica de zirconia 3Y-TZP fresada en el laboratorio.',
    findings: ['Preparación casi toda en dentina', 'Esmalte solo en el margen cervical', 'Altura axial ≈ 4 mm: hay retención mecánica', 'Zirconia opaca: llega poca luz al cemento'],
    enamelFrac: 0.15, translucency: 0.2, retentive: true, idsRecommended: true,
  },
  {
    id: 'ld', resto: 'onlay', material: 'disilicate', tooth: 'molar',
    title: 'Onlay de disilicato de litio · 3.6',
    patient: 'Mujer de 34 años · pieza 3.6 vital con restauración MOD fracturada',
    story: 'Preparación para onlay con cubrimiento cuspídeo: reducción oclusal anatómica de 1.5–2 mm y caja central. Onlay de disilicato de litio inyectado.',
    findings: ['Márgenes en esmalte', 'Dentina expuesta extensa en el piso', 'Geometría no retentiva: depende de la adhesión', 'Espesor 1.5–2 mm: la luz llega parcialmente'],
    enamelFrac: 0.4, translucency: 0.55, retentive: false, idsRecommended: true,
  },
  {
    id: 'fp', resto: 'veneer', material: 'feldspathic', tooth: 'incisor',
    title: 'Carilla feldespática · 1.1',
    patient: 'Mujer de 28 años · pieza 1.1 con fractura del ángulo y cambio de color leve',
    story: 'Preparación conservadora en esmalte (≈0.5 mm), sin cubrimiento incisal. Carilla de porcelana feldespática de 0.5 mm.',
    findings: ['Preparación en esmalte', 'Pequeña exposición de dentina cervical', 'Carilla muy delgada y translúcida', 'El color del cemento es crítico'],
    enamelFrac: 0.85, translucency: 0.95, retentive: false, idsRecommended: false,
  },
  {
    id: 'me', resto: 'crown', material: 'metal', tooth: 'molar',
    title: 'Corona metálica de Co-Cr · 3.6',
    patient: 'Hombre de 61 años · pieza 3.6 con tratamiento de conducto y muñón de composite',
    story: 'Preparación periférica total con chaflán. Corona colada de cobalto-cromo.',
    findings: ['Muñón mayormente de dentina y composite', 'Esmalte solo en el margen cervical', 'Altura axial ≈ 4 mm: hay retención mecánica', 'Metal: la luz no lo atraviesa'],
    enamelFrac: 0.15, translucency: 0, retentive: true, idsRecommended: true,
  },
];

export const MATERIALS = {
  zirconia: { name: 'Zirconia 3Y-TZP', group: 'zirconia', color: '#f3f1ec', hfTarget: 0 },
  disilicate: { name: 'Disilicato de litio', group: 'glass', color: '#e9dccb', hfTarget: 20 },
  feldspathic: { name: 'Porcelana feldespática', group: 'glass', color: '#efe7d8', hfTarget: 60 },
  metal: { name: 'Aleación Co-Cr', group: 'metal', color: '#9ea7b0', hfTarget: 0 },
};
export const matGroup = (c) => MATERIALS[c.material].group;

export const CEMENTS = {
  panavia: {
    name: 'Panavia V5', sub: 'Resina dual con MDP · sucesor de Panavia F 2.0', cure: 'dual', mdp: 1, selfAdhesive: false,
    toothPrimer: 'toothprimer', restPrimer: { glass: 'ccpp', zirconia: 'ccpp', metal: 'ccpp' }, dentin: 38,
    protocol: 'Diente: Tooth Primer 20 s y aire suave (no se fotopolimeriza). Restauración: Clearfil Ceramic Primer Plus (silano + MDP).',
    note: 'Panavia F 2.0 usaba ED Primer II (A+B, 30 s) y Clearfil Ceramic Primer.',
  },
  multilink: {
    name: 'Multilink Automix', sub: 'Resina dual autopolimerizable', cure: 'dual', mdp: 0, selfAdhesive: false,
    toothPrimer: 'mlprimer', restPrimer: { glass: 'monobond', zirconia: 'monobond', metal: 'monobond' }, dentin: 31,
    protocol: 'Diente: Multilink Primer A+B frotando 30 s y aire. Restauración: Monobond Plus 60 s.',
  },
  ultimate: {
    name: 'RelyX Ultimate', sub: 'Resina dual "adhesiva" + Scotchbond Universal', cure: 'dual', mdp: 0, selfAdhesive: false, activator: true,
    toothPrimer: 'sbu', restPrimer: { glass: 'silano', zirconia: 'sbu', metal: 'sbu' }, dentin: 34.7,
    protocol: 'Diente: Scotchbond Universal frotando 20 s y aire 5 s (el cemento trae activador para el adhesivo). Restauración: silano en cerámica vítrea; Scotchbond Universal en zirconia y metal.',
  },
  u200: {
    name: 'RelyX U200', sub: 'Cemento de resina autoadhesivo', cure: 'dual', mdp: 0.5, selfAdhesive: true,
    toothPrimer: null, restPrimer: { glass: 'silano', zirconia: null, metal: null }, dentin: 15,
    protocol: 'Diente: sin acondicionar la dentina; grabado selectivo del esmalte recomendado. Restauración: silano en cerámica vítrea; solo arenado en zirconia y metal.',
  },
  variolinkLC: {
    name: 'Variolink Esthetic LC', sub: 'Resina solo fotopolimerizable', cure: 'light', mdp: 0, selfAdhesive: false,
    toothPrimer: 'adhese', restPrimer: { glass: 'monobond', zirconia: 'monobond', metal: 'monobond' }, dentin: 33,
    protocol: 'Diente: grabado del esmalte + Adhese Universal 20 s, aire y luz 10 s. Restauración: Monobond Plus 60 s. Solo polimeriza con luz.',
  },
};

// Idoneidad del cemento para cada caso (decisión clínica que se evalúa).
const FIT = {
  zr: { panavia: ['ideal', 'MDP en el cemento y el primer: la unión química a la zirconia arenada más estable.'],
    multilink: ['ok', 'Con Monobond Plus (contiene MDP) sobre zirconia arenada logra buena adhesión.'],
    ultimate: ['ok', 'Scotchbond Universal aporta MDP sobre la zirconia arenada.'],
    u200: ['ok', 'Aceptable en una corona retentiva con zirconia arenada; menor durabilidad que con MDP.'],
    variolinkLC: ['contra', 'Cemento solo fotopolimerizable bajo zirconia opaca: no polimeriza.'] },
  ld: { panavia: ['ideal', 'Adhesión de varios pasos con silano: adecuada para una onlay no retentiva.'],
    multilink: ['ideal', 'Primer autograbante + Monobond Plus: adecuado para una onlay no retentiva.'],
    ultimate: ['ideal', 'Adhesivo universal + silano: adecuado para una onlay no retentiva.'],
    u200: ['no', 'Una onlay no retentiva depende de la adhesión; el autoadhesivo adhiere menos a dentina y esmalte.'],
    variolinkLC: ['no', 'Con 1.5–2 mm de cerámica llega poca luz: se prefiere un cemento dual.'] },
  fp: { panavia: ['ok', 'Funciona, pero las aminas de los cementos duales pueden cambiar de color con el tiempo.'],
    multilink: ['ok', 'Funciona, pero un cemento dual tiene menos estabilidad de color en una carilla delgada.'],
    ultimate: ['ok', 'Funciona, pero un cemento dual tiene menos estabilidad de color en una carilla delgada.'],
    u200: ['no', 'Adhesión baja al esmalte sin grabar y poca estabilidad estética: no se recomienda en carillas.'],
    variolinkLC: ['ideal', 'Cemento fotopolimerizable: mayor tiempo de trabajo y mejor estabilidad de color en una carilla translúcida.'] },
  me: { panavia: ['ideal', 'El MDP se une químicamente a los óxidos del metal arenado.'],
    multilink: ['ok', 'Monobond Plus sobre metal arenado: buena adhesión.'],
    ultimate: ['ok', 'Scotchbond Universal (MDP) sobre metal arenado: buena adhesión.'],
    u200: ['ok', 'En una corona metálica retentiva, el autoadhesivo sobre metal arenado es una opción aceptable.'],
    variolinkLC: ['contra', 'El metal no deja pasar la luz: un cemento solo fotopolimerizable no polimeriza.'] },
};
export const cementFit = (cfg) => FIT[cfg.case.id][cfg.cement];

// Estrategia en el diente: total (fosfórico esmalte 15 s + dentina 10 s), selective (solo esmalte), self (sin ácido).
export function strategyFit(cfg) {
  const s = cfg.strategy, c = cfg.cement;
  if (c === 'u200') {
    if (s === 'total') return ['no', 'Ácido fosfórico en dentina con un autoadhesivo: la adhesión a dentina cae a ≈6 MPa (infiltración incompleta del colágeno).'];
    if (s === 'selective') return ['ideal', 'Grabado selectivo del esmalte: duplica la adhesión del autoadhesivo al esmalte sin dañar la dentina.'];
    return ['ok', 'Sin grabar, el autoadhesivo adhiere poco al esmalte (≈15–20 MPa).'];
  }
  if (c === 'panavia' || c === 'multilink') {
    if (s === 'total') return ['no', 'El primer autograbante con MDP necesita la hidroxiapatita de la dentina: no se graba la dentina con ácido fosfórico.'];
    if (s === 'selective') return ['ideal', 'Grabado selectivo del esmalte + primer autograbante en dentina.'];
    return ['ok', 'Solo primer autograbante: adhesión al esmalte algo menor que con grabado selectivo.'];
  }
  if (s === 'self') return ['ok', 'Modo autograbante: adhesión al esmalte menor que grabándolo.'];
  return ['ideal', s === 'total' ? 'Grabado total con adhesivo universal (técnica húmeda en dentina).' : 'Grabado selectivo del esmalte con adhesivo universal en dentina.'];
}

export const PRIMERS = {
  toothprimer: { side: 'tooth', time: 20, rub: false, air: 2, light: false },
  mlprimer: { side: 'tooth', time: 30, rub: true, air: 2, light: false },
  adhese: { side: 'tooth', time: 20, rub: true, air: 5, light: true },
  sbu: { side: 'both', time: 20, rub: true, air: 5, light: false },
  silano: { side: 'resto', time: 60, rub: false, air: 2 },
  monobond: { side: 'resto', time: 60, rub: false, air: 2 },
  ccpp: { side: 'resto', time: 10, rub: false, air: 2 },
};

// type: paint (aplicar manteniendo presionado), drop (soltar), hold (mantener sobre el diente), distractor.
// target: tooth | resto | both
export const TOOLS = {
  prueba: { name: 'Prueba clínica (ajuste y contactos)', icon: '🔍', color: '#8fb3c9', type: 'drop', target: 'resto' },
  hf: { name: 'Ácido fluorhídrico 5%', icon: '☣️', color: '#e0506b', type: 'paint', target: 'both', radius: 0.14 },
  arenado: { name: 'Arenado Al₂O₃ 50 µm', icon: '🌪️', color: '#c9b79c', type: 'paint', target: 'both', radius: 0.22 },
  ivoclean: { name: 'Pasta limpiadora (Ivoclean)', icon: '🧽', color: '#c9d9e8', type: 'paint', target: 'resto', radius: 0.2 },
  silano: { name: 'Silano (RelyX Ceramic Primer)', icon: '🧫', color: '#9fd1b5', type: 'paint', target: 'both', radius: 0.18 },
  ccpp: { name: 'Clearfil Ceramic Primer Plus', icon: '🧴', color: '#b9a6e8', type: 'paint', target: 'both', radius: 0.18 },
  monobond: { name: 'Monobond Plus', icon: '🫙', color: '#e8c36a', type: 'paint', target: 'both', radius: 0.18 },
  sbu: { name: 'Scotchbond Universal', icon: '🧪', color: '#f0c24b', type: 'paint', target: 'both', radius: 0.16 },
  aislamiento: { name: 'Aislamiento (dique / hilo retractor)', icon: '🛡️', color: '#1f9e8f', type: 'drop', target: 'tooth' },
  pomez: { name: 'Piedra pómez + cepillo', icon: '🪥', color: '#d9d2c3', type: 'drop', target: 'tooth' },
  fosforico: { name: 'Ácido fosfórico 37%', icon: '🔵', color: '#2f7cf6', type: 'paint', target: 'both', radius: 0.1 },
  agua: { name: 'Jeringa triple: agua', icon: '💧', color: '#7cc7ff', type: 'paint', target: 'both', radius: 0.26 },
  aire: { name: 'Jeringa triple: aire', icon: '💨', color: '#e3e9ef', type: 'paint', target: 'both', radius: 0.32 },
  toothprimer: { name: 'Panavia V5 Tooth Primer', icon: '🅿️', color: '#b48be0', type: 'paint', target: 'both', radius: 0.16 },
  mlprimer: { name: 'Multilink Primer A+B', icon: 'Ⓜ️', color: '#e89a6a', type: 'paint', target: 'both', radius: 0.16 },
  adhese: { name: 'Adhese Universal', icon: '🖊️', color: '#f3d27a', type: 'paint', target: 'both', radius: 0.16 },
  lampara: { name: 'Lámpara LED', icon: '🔦', color: '#3b55e6', type: 'drop', target: 'both' },
  cemento: { name: 'Cemento', icon: '💉', color: '#efe6d2', type: 'drop', target: 'resto' },
  asentar: { name: 'Asentar y presionar', icon: '👇', color: '#7ad1c3', type: 'hold', target: 'tooth' },
  excesos: { name: 'Explorador + hilo dental', icon: '🪡', color: '#cfd6dd', type: 'paint', target: 'both', radius: 0.18 },
  glicerina: { name: 'Gel de glicerina (barrera de oxígeno)', icon: '🫧', color: '#d8f0ff', type: 'drop', target: 'tooth' },
  pulido: { name: 'Gomas de pulido de márgenes', icon: '✨', color: '#ff9fb8', type: 'drop', target: 'tooth' },
  // Distractores
  hidroxido: { name: 'Hidróxido de calcio', icon: '🥛', color: '#e8e8e8', type: 'distractor', target: 'both',
    why: 'Se reserva para exposiciones pulpares. Bajo una restauración adhesiva ocupa superficie que debería estar hibridizada.' },
  eugenol: { name: 'Cemento provisorio con eugenol', icon: '🌿', color: '#d6c79b', type: 'distractor', target: 'both',
    why: 'El eugenol residual inhibe la polimerización de los cementos de resina. Para provisorios se usan cementos sin eugenol.' },
  hipoclorito: { name: 'Hipoclorito de sodio 5%', icon: '🫗', color: '#cfe8d0', type: 'distractor', target: 'both',
    why: 'Deja residuos oxidantes en la dentina que inhiben la polimerización de la resina.' },
  ionomero: { name: 'Ionómero de vidrio (cementado convencional)', icon: '🧱', color: '#d8d2c4', type: 'distractor', target: 'both',
    why: 'Es una alternativa de cementado convencional, no adhesivo. En este caso planificaste un cementado adhesivo.' },
};

export const DISTRACTORS = ['hidroxido', 'eugenol', 'hipoclorito', 'ionomero'];

export function catalog() {
  return Object.keys(TOOLS);
}

const uniq = (a) => a.filter((x, i) => a.indexOf(x) === i);

// Bandeja ideal en orden de primer uso.
export function expectedTray(cfg) {
  const g = matGroup(cfg.case), C = CEMENTS[cfg.cement];
  const L = ['prueba'];
  if (g === 'glass') L.push('hf', 'agua', 'aire'); else L.push('arenado');
  const rp = C.restPrimer[g];
  if (rp) L.push(rp, 'aire');
  L.push('aislamiento', 'pomez');
  if (cfg.strategy !== 'self') L.push('fosforico', 'agua', 'aire');
  if (C.toothPrimer) L.push(C.toothPrimer, 'aire');
  if (C.toothPrimer === 'adhese') L.push('lampara');
  L.push('cemento', 'asentar', 'lampara', 'excesos', 'glicerina', 'pulido');
  return uniq(L);
}

export function optionalTools(cfg) {
  const o = ['ivoclean'];
  if (CEMENTS[cfg.cement].toothPrimer === 'sbu') o.push('lampara');
  return o;
}

export function notIndicatedReason(id, cfg) {
  const t = TOOLS[id], g = matGroup(cfg.case), C = CEMENTS[cfg.cement];
  if (t.type === 'distractor') return t.why;
  if (id === 'hf' && g !== 'glass') return 'El ácido fluorhídrico no graba la zirconia ni el metal: no tienen fase vítrea que disolver.';
  if (id === 'arenado' && g === 'glass') return 'El arenado debilita la cerámica vítrea y no crea el patrón retentivo del ácido fluorhídrico.';
  if (id === 'silano' && g !== 'glass') return 'El silano no mejora la adhesión a la zirconia ni al metal: se necesita MDP.';
  if (id === 'fosforico' && cfg.strategy === 'self') return 'Elegiste la estrategia autograbante: no usarás ácido fosfórico.';
  if (['toothprimer', 'mlprimer', 'adhese', 'sbu', 'ccpp', 'monobond', 'silano'].includes(id)) return `No corresponde al sistema ${C.name}.`;
  return 'No corresponde a este protocolo.';
}

export const NEED = {
  prueba: 'Verificar ajuste, contactos y color antes de acondicionar. Contamina la restauración con saliva.',
  hf: 'Graba la fase vítrea de la cerámica y crea microrretención.',
  arenado: 'Limpia y crea rugosidad en zirconia y metal; necesario para la unión química del MDP.',
  agua: 'Lava el ácido y detiene el grabado.',
  aire: 'Seca la superficie y evapora el solvente de los primers.',
  silano: 'Une químicamente la cerámica vítrea con la resina.',
  ccpp: 'Primer cerámico del sistema Panavia (silano + MDP).',
  monobond: 'Primer universal del sistema Multilink/Variolink (silano + MDP + sulfuro).',
  sbu: 'Adhesivo universal del sistema RelyX Ultimate.',
  aislamiento: 'Control de la humedad: saliva, sangre y fluido crevicular contaminan la interfase.',
  pomez: 'Elimina restos del cemento provisorio y el biofilm.',
  fosforico: 'Graba el esmalte (y la dentina en el grabado total).',
  toothprimer: 'Primer autograbante del sistema Panavia.',
  mlprimer: 'Primer autograbante del sistema Multilink.',
  adhese: 'Adhesivo universal del sistema Variolink.',
  lampara: 'Fotopolimeriza el adhesivo y el cemento.',
  cemento: 'Agente cementante elegido.',
  asentar: 'Asienta la restauración y mantiene presión durante el fraguado inicial.',
  excesos: 'Retira los excesos de cemento después de una polimerización inicial breve.',
  glicerina: 'Evita la capa inhibida por oxígeno en los márgenes.',
  pulido: 'Pule los márgenes del cemento.',
};

export const WHY = {
  prueba: 'Prueba la restauración antes de acondicionarla: ajuste marginal, contactos y color. La saliva la contamina, así que la limpieza y el acondicionamiento van después.',
  restMech: {
    glass: (t) => `Ácido fluorhídrico ${t} s: disuelve la fase vítrea y crea microrretención. Luego lava y seca.`,
    zirconia: () => 'Arenado con Al₂O₃ 50 µm: limpia la contaminación de la prueba y aumenta la superficie para el MDP. El HF no graba la zirconia.',
    metal: () => 'Arenado con Al₂O₃ 50 µm: limpia y crea rugosidad. Los óxidos del metal se unen al MDP.',
  },
  restPrimer: 'El primer de la restauración une químicamente el material con el cemento: silano en la cerámica vítrea y MDP en la zirconia y el metal.',
  aislamiento: 'El control de la humedad es crítico: la saliva y el fluido crevicular reducen la adhesión.',
  pomez: 'Limpia los restos del cemento provisorio. Si hiciste IDS, no arenes encima: el arenado reduce la adhesión al sellado.',
  grabado: {
    total: 'Ácido fosfórico 37%: esmalte 15 s y dentina 10 s. Lava y deja la dentina húmeda, sin desecar.',
    selective: 'Ácido fosfórico solo en el esmalte, 15 s. No toques la dentina.',
  },
  toothPrimer: 'Aplica el primer o adhesivo del sistema respetando sus tiempos. Después evapora el solvente con aire suave.',
  cemento: 'Carga el cemento en la restauración, cubriendo toda la superficie interna.',
  asentar: 'Asienta y mantén la presión. Una presión mayor que la presión digital, sostenida durante el fraguado inicial, mejora la adhesión.',
  excesos: 'Polimerización breve (2–3 s) y luego retira los excesos en estado de gel con explorador e hilo dental.',
  glicerina: 'El oxígeno inhibe la polimerización superficial del cemento en los márgenes. La glicerina lo evita.',
  final: 'Fotopolimeriza cada cara 20 s. La luz que atraviesa la restauración depende del material.',
  pulido: 'Pule los márgenes para dejarlos lisos.',
};

export function faceList(c) { return c.tooth === 'incisor' ? ['V', 'P'] : ['O', 'V', 'L']; }
export const FACE_NAME = { O: 'oclusal', V: 'vestibular', L: 'lingual', P: 'palatina' };

export function buildSteps(cfg) {
  const g = matGroup(cfg.case), C = CEMENTS[cfg.cement], M = MATERIALS[cfg.case.material];
  const S = [];
  const add = (id, label, why, check) => S.push({ id, label, why, check, done: false });
  add('prueba', 'Prueba clínica de la restauración', WHY.prueba, s => s.restoS.tried);
  add('restMech', g === 'glass' ? `Ácido fluorhídrico ${M.hfTarget} s, lavar y secar` : 'Arenado Al₂O₃ 50 µm de la superficie interna',
    WHY.restMech[g](M.hfTarget), s => g === 'glass' ? (s.restoS.hfDone && s.restoS.rinsed) : s.restoS.apaCov >= 0.7);
  const rp = C.restPrimer[g];
  if (rp) add('restPrimer', `${TOOLS[rp].name} en la restauración y secar`, WHY.restPrimer, s => s.restoS.primer === rp && s.restoS.primerAir >= 1);
  add('aislamiento', 'Aislamiento', WHY.aislamiento, s => s.flags.isolated);
  add('pomez', 'Limpieza con piedra pómez', WHY.pomez, s => s.flags.cleaned);
  if (cfg.strategy !== 'self') add('grabado', cfg.strategy === 'total' ? 'Ácido fosfórico: esmalte 15 s · dentina 10 s' : 'Grabado selectivo del esmalte 15 s', WHY.grabado[cfg.strategy], s => !!s.tooth.etchFinal);
  if (C.toothPrimer) add('toothPrimer', `${TOOLS[C.toothPrimer].name} en el diente${C.toothPrimer === 'adhese' ? ' + luz 10 s' : ''}`, WHY.toothPrimer,
    s => s.tooth.primer === C.toothPrimer && s.tooth.primerAir >= 1 && (C.toothPrimer !== 'adhese' || s.tooth.primerLight >= 9));
  add('cemento', `Cargar ${C.name} en la restauración`, WHY.cemento, s => s.cement.loaded);
  add('asentar', 'Asentar y mantener presión ≥ 5 s', WHY.asentar, s => s.seat.seated && s.seat.pressT >= 5);
  add('excesos', 'Luz 2–3 s y retirar excesos', WHY.excesos, s => s.seat.excessRemoved >= 0.85);
  add('glicerina', 'Glicerina en los márgenes', WHY.glicerina, s => s.seat.glycerin);
  add('final', `Fotopolimerizar ${faceList(cfg.case).map(f => FACE_NAME[f]).join(', ')} · 20 s cada una`, WHY.final,
    s => faceList(cfg.case).every(f => (s.seat.faceT[f] || 0) >= 19));
  add('pulido', 'Pulido de márgenes', WHY.pulido, s => s.finishedPolish);
  return S;
}

// Decisiones del protocolo frente a la indicación del caso.
export function decisions(cfg) {
  const out = [];
  const [cl, ct] = cementFit(cfg);
  out.push({ key: 'cement', title: `Cemento: ${CEMENTS[cfg.cement].name}`, level: cl, text: ct });
  const [sl, st] = strategyFit(cfg);
  const sn = { total: 'Grabado total', selective: 'Grabado selectivo del esmalte', self: 'Autograbante (sin ácido fosfórico)' }[cfg.strategy];
  out.push({ key: 'strategy', title: `Diente: ${sn}`, level: sl, text: st });
  const rec = cfg.case.idsRecommended;
  if (rec && !cfg.ids) out.push({ key: 'ids', title: 'Sin IDS', level: 'ok', text: 'Con dentina expuesta extensa se recomienda sellarla de inmediato (IDS / resin coat) en la sesión de preparación.' });
  else if (cfg.ids && !rec) out.push({ key: 'ids', title: 'IDS', level: 'ok', text: 'En una preparación casi toda en esmalte el IDS aporta poco y puede interferir con el asentamiento de una carilla delgada.' });
  else out.push({ key: 'ids', title: cfg.ids ? 'IDS realizado' : 'Sin IDS', level: 'ideal', text: cfg.ids ? 'Dentina sellada en la sesión de preparación: más adhesión y mejor durabilidad.' : 'Correcto: la preparación está casi toda en esmalte.' });
  return out;
}
export const DECISION_PEN = { ideal: 0, ok: 0, no: 6, contra: 12 };
