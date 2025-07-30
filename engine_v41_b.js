/*! Hinowa Engine v4.1-b (FAS_composite) */
(function(global){
  const W = {
    EmotionDensity:.20, BreakdownDepth:.12, SilenceTrend:.10, RiseTrend:.08,
    DeltaTemp:.06, SimilarityChange:.05, SemanticDrift:.05, ArousalVariance:.05,
    LinguisticEnergy:.04, TemporalCompression:.03, PhysioFlag:.02, ExternalContextWeight:.02,
    inv_CUS:.08, inv_RIS:.05, inv_EIS:.03, inv_SSS:.02
  };
  const CFG = { alpha:.70, hysteresis:.02, nightHours:[0,1,2,3,4,5], nightBonusBase:.08 };
  function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
  function tokJa(text){ const t=(text||"").toLowerCase().replace(/\s+/g," ").trim(); return t.split(/[^a-z0-9ぁ-んァ-ン一-龥ー]+/).filter(Boolean); }
  function freqWeighted(text, clusters){
    if(!clusters) return {score:0, physio:0, crisis:0, hits:[]};
    const t=(text||""); const hits=[]; let sum=0, physio=0, crisis=0;
    for(const c of clusters){
      const weight=+c.weight||0.3;
      const applyShard = (pat)=>{
        try{ const re=new RegExp(pat,"gi"); const m=t.match(re);
          if(m&&m.length){ const s=Math.min(1, m.length*weight*0.5); sum+=s; hits.push({tag:c.tag,count:m.length,w:weight,s});
            if(c.tag==="体感") physio+=Math.min(1,m.length*0.2);
            if(c.tag==="希死"||c.tag==="救援") crisis+=Math.min(1,m.length*0.3);
          }
        }catch(_){}
      };
      if (c.shards) for(const sh of c.shards){ applyShard(sh.pattern); }
      if (c.entries) for(const e of c.entries.slice(0,2000)){ applyShard(e.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')); }
    }
    if(/(.)\1{2,}/.test(t) || /(助けて){2,}/.test(t)) sum+=0.3;
    sum += Math.min(0.2, physio*0.3 + crisis*0.3);
    const score = clamp(1/(1+Math.exp(-sum))-0.5+0.5,0,1);
    return {score, physio:clamp(physio,0,1), crisis:clamp(crisis,0,1), hits};
  }
  function coherence(text){
    const s=(text||"").replace(/[\r\n]+/g,"\n").split(/[。\.！？!\?…\n]/).map(x=>x.trim()).filter(Boolean);
    if(s.length<2) return 0.65; let o=0,p=0;
    const sets=s.map(u=>new Set(tokJa(u).filter(w=>w.length>=2)));
    for(let i=1;i<sets.length;i++){ const a=sets[i-1],b=sets[i]; const inter=[...a].filter(x=>b.has(x)).length; const denom=Math.max(1, Math.min(a.size,b.size)); o+=inter/denom; p++; }
    return clamp(o/Math.max(1,p),0,1);
  }
  function computeCUS(text){
    const pos=/安心|楽|穏やか|落ち着|よかった|感謝|ありがとう/g; const self=/感じ|思|気づ|考|振り返/g; const prob=/やってみ|試|計画|段取り|解決|準備/g; const calm=/呼吸|深呼吸|ゆっくり|落ち着/g;
    return clamp(0.30*Math.tanh(((text||"").match(pos)||[]).length/4)+0.25*coherence(text)+0.20*Math.tanh(((text||"").match(self)||[]).length/3)+0.15*Math.tanh(((text||"").match(prob)||[]).length/3)+0.10*Math.tanh(((text||"").match(calm)||[]).length/3),0,1);
  }
  function computeRIS(text){
    const coping=/休む|運動|散歩|相談|深呼吸|瞑想|睡眠/g, eff=/できる|やれる|乗り越え|いける/g, past=/以前|前(は|に).+できた|過去/g, support=/家族|友人|支援|専門家/g, growth=/学ぶ|成長|改善/g;
    return clamp(0.35*Math.tanh(((text||"").match(coping)||[]).length/3)+0.25*Math.tanh(((text||"").match(eff)||[]).length/3)+0.20*Math.tanh(((text||"").match(past)||[]).length/2)+0.10*Math.tanh(((text||"").match(support)||[]).length/2)+0.10*Math.tanh(((text||"").match(growth)||[]).length/2),0,1);
  }
  function computeEIS(text){ const direct=/灯輪|あなた|君/g; return clamp(0.30*0.8 + 0.25*0.6 + 0.20*0.6 + 0.15*Math.tanh(((text||"").match(direct)||[]).length/2) + 0.10*0.7, 0, 1); }
  function computeSSS(text){
    const rout=/食べ|寝|起き|入浴|掃除|勉強|連絡|片付/g, plan=/明日|今週|予定|計画|予約/g, proa=/自分で|準備|手配|先に/g, dep=/助けて|頼り|依存|無理/g, ext=/外出|買い物|散歩|会う/g;
    return clamp(0.30*Math.tanh(((text||"").match(rout)||[]).length/4)+0.25*Math.tanh(((text||"").match(plan)||[]).length/3)+0.20*Math.tanh(((text||"").match(proa)||[]).length/3)+0.15*(1-Math.tanh(((text||"").match(dep)||[]).length/3))+0.10*Math.tanh(((text||"").match(ext)||[]).length/3),0,1);
  }
  function coreFromMi(Mi, CUS,RIS,EIS,SSS){
    let core=0; for(const k in Mi){ core += (W[k]||0)*Mi[k]; }
    core += W.inv_CUS*(1-CUS)+W.inv_RIS*(1-RIS)+W.inv_EIS*(1-EIS)+W.inv_SSS*(1-SSS);
    return clamp(core,0,1);
  }
  function decide(FAS,CUS){
    const mode = (FAS>=0.85) ? "E1" : (FAS>=0.68) ? (CUS>=0.66?"P1":(CUS>=0.33?"P2":"EPR")) : (FAS>=0.50) ? (CUS>=0.66?"R1":(CUS>=0.33?"S2":"S1")) : (CUS>=0.66?"FirePath":(CUS>=0.33?"R3":"ε1"));
    const zone = (FAS>=0.85)?"Critical":(FAS>=0.68)?"High":(FAS>=0.50)?"Medium":"Low";
    const cz = (CUS>=0.66)?"High":(CUS>=0.33)?"Moderate":"Low";
    return {mode, FAS_zone:zone, CUS_zone:cz};
  }
  function compute(text, dict){
    const NEG = (function(){
      if(!dict||!dict.clusters) return {score:0,physio:0,crisis:0};
      let sum=0,physio=0,crisis=0; const t=(text||"");
      for(const c of dict.clusters){
        const w=+c.weight||0.3;
        const doMatch=(pat)=>{ try{ const re=new RegExp(pat,"g"); const m=t.match(re); if(m){ const inc=Math.min(1, m.length*w*0.5); sum+=inc; if(c.tag==="体感") physio+=Math.min(1,m.length*0.2); if(c.tag==="希死"||c.tag==="救援") crisis+=Math.min(1,m.length*0.3);} }catch(_){}};
        if(c.shards) for(const sh of c.shards){ doMatch(sh.pattern); }
        if(c.entries) for(const e of c.entries.slice(0,2000)){ doMatch(e.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')); }
      }
      if(/(.)\1{2,}/.test(t) || /(助けて){2,}/.test(t)) sum+=0.3;
      sum += Math.min(0.2, physio*0.3 + crisis*0.3);
      const score = clamp(1/(1+Math.exp(-sum))-0.5+0.5,0,1);
      return {score, physio:clamp(physio,0,1), crisis:clamp(crisis,0,1)};
    })();
    const Mi = {
      EmotionDensity: NEG.score,
      BreakdownDepth: 0.4,
      SilenceTrend: .5,
      RiseTrend: .5,
      DeltaTemp: clamp((NEG.physio*0.6 + NEG.crisis*0.7), 0, 1),
      SimilarityChange: .5, SemanticDrift: .5, ArousalVariance: .4, LinguisticEnergy: .5, TemporalCompression:.5,
      PhysioFlag: NEG.physio>0.2?1:0, ExternalContextWeight: .2
    };
    const CUS = computeCUS(text), RIS=computeRIS(text), EIS=computeEIS(text), SSS=computeSSS(text);
    const core = coreFromMi(Mi, CUS,RIS,EIS,SSS);
    const RUB = Math.min(0.05, (NEG.crisis>0?0.02:0) + (NEG.physio>0.3?0.02:0));
    const NB = (function(){ const h=new Date().getHours(); return [0,1,2,3,4,5].includes(h)?0.08:0; })();
    const FAS = clamp(CFG.alpha*0.5 + (1-CFG.alpha)*clamp(core+RUB+NB,0,1), 0, 1);
    const dec = decide(FAS, CUS);
    return {FAS, core, Mi, CUS,RIS,EIS,SSS, RecentUtteranceBoost:RUB, NightBonus:NB, BaselineOffset:0, ...dec};
  }
  global.HinowaEngineV41 = { compute, weights:W, config:CFG };
})(window);
