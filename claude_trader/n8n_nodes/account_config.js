// Copiado tal cual del nodo n8n "Account Config". No editar aqui: lo ejecuta run_n8n_node() en finalize.js.
// Balance real de la cuenta, leido de la pestana "Balance" del Sheet.
//
// Antes esto era un Set node con balance: 6500 fijo. El balance de la cuenta
// cambia con cada operacion y con los depositos, asi que un numero quemado
// aqui produce lotes mal dimensionados en cuanto la cuenta se mueve.
//
// Se lee en vivo en cada corrida: si depositas y editas la celda, la proxima
// senal ya usa el balance nuevo.
//
// El nodo conserva el nombre "Account Config" a proposito: el nodo de lote lo
// referencia como $('Account Config').item.json.balance.

const RISK_PERCENT = 1;      // objetivo de riesgo por operacion
const TEST_BALANCE = 6500;   // cifra de prueba fija, para validar la herramienta -- no depende del Sheet
const MAX_RISK_PERCENT = 2;  // tope duro: por encima de esto no se opera
const MIN_BALANCE = 50;
const MAX_BALANCE = 1000000;

const raw = $input.first().json.data ?? '';

// El CSV llega como:  "Balance"\n"$884.00"
const lines = String(raw).split(/\r?\n/).filter(l => l.trim() !== '');
if (lines.length < 2) {
    throw new Error(`Pestana Balance ilegible: se esperaban 2+ lineas, llegaron ${lines.length}. Contenido: ${String(raw).slice(0, 200)}`);
}

// Quita comillas, $, espacios y separador de miles ("$1,234.56" -> 1234.56)
const balance = Number.parseFloat(lines[1].replace(/["\s$,]/g, ''));

if (!Number.isFinite(balance)) {
    throw new Error(`No se pudo leer el balance. Celda: "${lines[1]}"`);
}
if (balance < MIN_BALANCE || balance > MAX_BALANCE) {
    throw new Error(`Balance fuera de rango: ${balance}. Se aborta antes de calcular lotes.`);
}

// Se lanza error en vez de usar un valor por defecto a proposito: un default
// haria que el workflow siguiera calculando lotes con un balance inventado.

return [{
    json: {
          balance,
          riskPercent: RISK_PERCENT,
          testBalance: TEST_BALANCE,
          maxRiskPercent: MAX_RISK_PERCENT,
          balanceSource: 'sheet:Balance',
          balanceReadAt: new Date().toISOString(),
    },
}];
