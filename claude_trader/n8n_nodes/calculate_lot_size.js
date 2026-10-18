// Copiado tal cual del nodo n8n "Code: Calculate Lot Size". No editar aqui: lo ejecuta run_n8n_node() en finalize.js.
const balance = $('Account Config').item.json.balance;
const riskPercent = $('Account Config').item.json.riskPercent;
const maxRiskPercent = $('Account Config').item.json.maxRiskPercent;

const data = $('Code: Build Alert Message1').item.json.finalData;
const symbol = (data.pair || '').toUpperCase();
const orderType = data.orderType;

function midOfZone(zoneStr) {
  if (!zoneStr || zoneStr === 'N/A') return null;
  const nums = String(zoneStr).split('-').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
  if (nums.length === 2) return (nums[0] + nums[1]) / 2;
  if (nums.length === 1) return nums[0];
  return null;
}

const entry = midOfZone(data.executionPlan && data.executionPlan.entryZone);
const sl = parseFloat(data.executionPlan && data.executionPlan.invalidation);

if (orderType === 'NONE' || entry === null || isNaN(sl)) {
  return [{ json: { lotSize: '0.000', riskAmountUSD: 0, note: 'No executable order -- lot size not applicable.' } }];
}

const riskAmountUSD = balance * (riskPercent / 100);
const riskDistance = Math.abs(entry - sl);

// Axi (and most retail MT4/MT5 brokers) only accept lot sizes in 0.01
// increments -- 0.01 is the smallest tradable unit, not 0.001. A computed
// "ideal" lot below that (e.g. 0.006) is not an order the broker will
// accept; it must be floored up to 0.01, which means the ACTUAL risk taken
// on wide-stop setups will sometimes exceed the target riskPercent. That's
// not a bug -- it's a real constraint of trading a small account on an
// instrument with $100/point-per-lot leverage. We surface it explicitly
// rather than silently understating risk.
const MIN_LOT = 0.01;
const LOT_STEP = 0.01;

let idealLotSize;
if (symbol.includes('XAU')) {
  // Gold: 1 standard lot = 100 oz -> $100 of P&L per $1 move per lot
  idealLotSize = riskAmountUSD / (riskDistance * 100);
} else {
  // USD-quoted FX pairs (e.g. EUR/USD): 1 standard lot = 100k units -> ~$10/pip
  const pipSize = 0.0001;
  const pips = riskDistance / pipSize;
  idealLotSize = riskAmountUSD / (pips * 10);
}

// round DOWN to the broker's step -- never round position size up beyond target risk by rounding
let lotSize = Math.floor(idealLotSize / LOT_STEP) * LOT_STEP;
const minLotEnforced = lotSize < MIN_LOT;
if (minLotEnforced) lotSize = MIN_LOT;
lotSize = Math.round(lotSize * 100) / 100; // clean up float noise

const actualRiskUSD = symbol.includes('XAU')
  ? lotSize * riskDistance * 100
  : lotSize * (riskDistance / 0.0001) * 10;
const actualRiskPercent = Math.round((actualRiskUSD / balance) * 10000) / 100;

// Hard cap: if even the broker's smallest tradable lot would risk more than
// maxRiskPercent of the account, the setup is not tradeable at this account
// size -- full stop. Null it out rather than quietly taking oversized risk.
// This is independent of whether the technical setup (Order Type from
// Message a model) was good; it's a position-sizing feasibility gate, not a
// technical-analysis judgment.
const riskCapped = actualRiskPercent > maxRiskPercent;

if (riskCapped) {
  return [{
    json: {
      lotSize: '0.00',
      idealLotSize: Math.round(idealLotSize * 1000) / 1000,
      minLotEnforced,
      rejected: true,
      wouldBeRiskPercent: actualRiskPercent,
      riskAmountUSD: 0,
      actualRiskPercent: 0,
      targetRiskPercent: riskPercent,
      maxRiskPercent,
      riskDistance,
      entryUsed: entry,
      slUsed: sl,
      balance,
      note: `SETUP NULLIFIED: the broker's ${MIN_LOT}-lot minimum would risk ${actualRiskPercent}% (target ${riskPercent}%), which exceeds the ${maxRiskPercent}% hard cap. Not tradeable at this account size -- skip.`
    }
  }];
}

return [{
  json: {
    lotSize: lotSize.toFixed(2),
    idealLotSize: Math.round(idealLotSize * 1000) / 1000,
    minLotEnforced,
    rejected: false,
    riskAmountUSD: Math.round(actualRiskUSD * 100) / 100,
    actualRiskPercent,
    targetRiskPercent: riskPercent,
    maxRiskPercent,
    riskDistance,
    entryUsed: entry,
    slUsed: sl,
    balance,
    note: minLotEnforced
      ? `Ideal size (${(Math.round(idealLotSize*1000)/1000).toFixed(3)}) is below the ${MIN_LOT} broker minimum -- risk on this trade is ${actualRiskPercent}% instead of the ${riskPercent}% target (within the ${maxRiskPercent}% cap).`
      : 'Within target risk.'
  }
}];
