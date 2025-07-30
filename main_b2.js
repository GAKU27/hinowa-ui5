// Hinowa v5b scale & nonstandard templates
const $ = id=>document.getElementById(id);
const state = { dict:null, templates:null, mode:null, palette:null };

function setStatus(elId, text, ok=false){ const el=$(elId); if(!el) return; el.textContent=text; if(ok) el.parentElement.classList.add('ok'); }
function labelByFAS(f, thr){ if(f>=thr.critical) return 'critical'; if(f>=thr.high) return 'high'; if(f>=thr.medium) return 'medium'; return 'low'; }
function badge(level){ const b=$('fasBadge'); b.className='pill '+level; b.textContent=level; }

async function loadJSON(path, id){
  try{
    const res = await fetch(path, {cache:'no-store'});
    if(!res.ok) throw new Error(res.status+" "+res.statusText);
    const data = await res.json(); setStatus(id,'ready',true); return data;
  }catch(e){ console.error('load fail', path, e); setStatus(id,'error'); return null; }
}

const History = {
  read(){ try{ return JSON.parse(localStorage.getItem('hinowa_hist')||'[]'); }catch(_){ return []; } },
  write(a){ localStorage.setItem('hinowa_hist', JSON.stringify(a.slice(-100))); },
  push(item){ const a=this.read(); a.push({...item, t:Date.now()}); this.write(a); },
  clear(){ localStorage.removeItem('hinowa_hist'); }
};

function colorForFAS(f){
  const PAL = state.palette || [];
  for(const p of PAL){ const [lo,hi]=p.range; if(f>=lo && f<hi) return p; }
  return PAL[0] || {hex:"transparent", jp:""};
}
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function assembleSummary(level){
  const T = state.templates;
  if(!T || !T.slots) return "[INFO]";
  const s = T.slots;
  const out = [pick(s.preface[level]), pick(s.core[level]), pick(s.step[level])];
  if (Math.random() < 0.7 && s.closing[level]) out.push(pick(s.closing[level]));
  const maxS = (T.options && T.options.max_sentences) || 3;
  return out.slice(0, maxS).join("");
}
function summarize(result){
  const thr = state.mode?.thresholds || {critical:.85,high:.68,medium:.50};
  const lvl = labelByFAS(result.FAS, thr);
  return assembleSummary(lvl);
}

function scanDictScore(text, dict){
  const negTags=['危機','希死','救援','体感','感情/ネガ'];
  const posTags=['感情/ポジ','対処','支援','予定'];
  let neg=0,pos=0,physio=0,crisis=0,hits=0;
  if(!dict || !dict.clusters) return {neg,pos,physio,crisis,hits};
  const t = text || "";
  for(const c of dict.clusters){
    const weight = +c.weight || 0.4;
    const isNeg = negTags.includes(c.tag), isPos = posTags.includes(c.tag);
    if(!(isNeg||isPos)) continue;
    if (c.shards && c.shards.length){
      for(const sh of c.shards){
        try{
          const re = new RegExp(sh.pattern, "g");
          const m = t.match(re);
          if(m){
            const inc = m.length * weight;
            if(isNeg) neg += inc; else pos += inc*0.7;
            if(c.tag==='体感') physio += Math.min(1, m.length*0.2);
            if(c.tag==='危機' || c.tag==='希死' || c.tag==='救援') crisis += Math.min(1, m.length*0.3);
            hits += m.length;
          }
        }catch(_){}
      }
    }
  }
  if(/(.)\1{2,}/.test(t)) neg+=0.8;
  if(/(助けて){2,}/.test(t)) neg+=2.2;
  if(/(死にたい|消えたい)/.test(t)) neg+=3.0;
  if(/(深呼吸|散歩|相談|水)/.test(t)) pos+=1.0;
  return {neg,pos,physio,crisis,hits};
}

function compute(text){
  // まずはエンジンに委譲してMi系を算出（辞書もエンジン内で使える形式）
  let viaEngine = null;
  try{ viaEngine = HinowaEngineV41.compute(text, state.dict); }catch(_){}
  if (viaEngine){
    return viaEngine;
  }
  // フェイルセーフ
  const meter = scanDictScore(text, state.dict);
  const neg = meter.neg, pos = meter.pos;
  const CUS = Math.max(0, Math.min(1, 0.3 + 0.05*pos));
  const RIS = Math.max(0, Math.min(1, 0.22 + 0.05*pos));
  const EIS = 0.6;
  const SSS = Math.max(0, Math.min(1, 0.3 + 0.03*pos - 0.02*neg));
  const fasCore = Math.max(0, Math.min(1, 0.5 + 0.1*neg - 0.07*pos));
  const FAS = fasCore;
  const thr = state.mode?.thresholds || {critical:.85,high:.68,medium:.50};
  const mode = (FAS>=0.85)?'E1':(FAS>=0.68)?(CUS>=0.66?'P1':(CUS>=0.33?'P2':'EPR')):(FAS>=0.50)?(CUS>=0.66?'R1':(CUS>=0.33?'S2':'S1')):(CUS>=0.66?'FirePath':(CUS>=0.33?'R3':'ε1'));
  return {FAS,CUS,RIS,EIS,SSS,mode,RecentUtteranceBoost: (meter.crisis>0?0.02:0) + (meter.physio>0.3?0.02:0), NightBonus: 0, BaselineOffset:0};
}

function renderFP(hist, currentFAS){
  const recent = hist.slice(-5);
  const avg = recent.length ? recent.map(x=>x.FAS).reduce((a,b)=>a+b,0)/recent.length : 0.5;
  const past = colorForFAS(avg), now = colorForFAS(currentFAS);
  const delta = recent.length ? (currentFAS - recent[recent.length-1].FAS) : 0;
  const futureGuess = Math.max(0, Math.min(1, currentFAS + 0.3*delta));
  const future = colorForFAS(futureGuess);
  $('colorPast').style.background=past.hex; $('colorNow').style.background=now.hex; $('colorFuture').style.background=future.hex;
  $('colorPast').title='昔の色: '+past.jp; $('colorNow').title='今の色: '+now.jp; $('colorFuture').title='未来の色: '+future.jp;
}

function resetOutputs(full=false){
  $('fasVal').textContent='—'; badge('low');
  $('sumOut').textContent='(入力が空です)'; $('jsonOut').textContent='{}';
  ['colorPast','colorNow','colorFuture'].forEach(id=>{ const el=$(id); el.style.background='transparent'; el.title=''; });
  if(full) History.clear();
}

function onCalc(){
  const text = $('txt').value.trim();
  if(!text){ resetOutputs(); return; }
  const r = compute(text);
  renderFP(History.read(), r.FAS);
  $('fasVal').textContent = r.FAS.toFixed(3);
  const lvl = labelByFAS(r.FAS, state.mode.thresholds);
  badge(lvl);
  $('sumOut').textContent = summarize(r);
  $('jsonOut').textContent = JSON.stringify({
    schema_version:"5.0-deepsea",
    FAS_composite:+r.FAS.toFixed(3),
    CUS:+(r.CUS??0).toFixed(3),
    RIS:+(r.RIS??0).toFixed(3),
    EIS:+(r.EIS??0).toFixed(3),
    SSS:+(r.SSS??0).toFixed(3),
    RecentUtteranceBoost:+(r.RecentUtteranceBoost??0).toFixed(3),
    NightBonus:+(r.NightBonus??0).toFixed(3),
    BaselineOffset:+(r.BaselineOffset??0).toFixed(3),
    FlameState:{
      mode:r.mode,
      FAS_zone: lvl,
      CUS_zone: (r.CUS>=.66?'High':(r.CUS>=.33?'Moderate':'Low')),
      confidence: 0.82
    }
  }, null, 2);
  History.push({FAS:r.FAS, mode:r.mode});
}

async function boot(){
  state.dict      = await loadJSON('./dictionary_mega_compiled.json','dictStatus');
  state.templates = await loadJSON('./summary_templates_b2.json','tplStatus');
  state.mode      = await loadJSON('./mode_config.json','modeStatus');
  state.palette   = await loadJSON('./firepath_palette.json','fpStatus');
  $('calcBtn').onclick = onCalc;
  $('demoBtn').onclick = ()=>{ $('txt').value='もう無理…って詰まった。でも今朝、窓を開けて深呼吸をしたら少し楽になった。今日は誰かに一行だけ連絡して、できることを一つだけやってみる。'; onCalc(); };
  $('clearBtn').onclick = ()=>{ $('txt').value=''; resetOutputs(true); };
  $('demoBtn').click();
}
document.addEventListener('DOMContentLoaded', boot);
