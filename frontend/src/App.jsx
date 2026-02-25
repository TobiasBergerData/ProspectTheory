import { useState, useEffect, useMemo, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, Cell, ResponsiveContainer } from "recharts";

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════
const TC = { Superstar:"#fbbf24","All-Star":"#f97316",Starter:"#3b82f6","Role Player":"#06b6d4",Replacement:"#8b5cf6",Negative:"#6b7280","Never Made NBA":"#374151" };
const valColor = (pctl) => { if(pctl==null)return"#6b7280";if(pctl>=90)return"#22c55e";if(pctl>=75)return"#86efac";if(pctl>=60)return"#a3e635";if(pctl>=40)return"#fbbf24";if(pctl>=25)return"#f97316";return"#ef4444"; };
const valBg = (pctl) => valColor(pctl)+"18";
const fmt = (v,d=1) => v!=null?Number(v).toFixed(d):"—";

// Comparison tier thresholds by position
// Each tier represents the MEDIAN stats for that performance level
const TIER_THRESHOLDS = {
  Replacement: {
    Playmaker:{bpm:2.0,usg:20,ts:52,ast_p:22,to_p:16,stl_p:2.0,blk_p:0.5,orb_p:2,drb_p:12,ortg:105},
    Wing:{bpm:1.5,usg:18,ts:53,ast_p:10,to_p:14,stl_p:1.5,blk_p:1.5,orb_p:3,drb_p:15,ortg:106},
    Big:{bpm:2.5,usg:19,ts:55,ast_p:8,to_p:14,stl_p:1.0,blk_p:5.0,orb_p:8,drb_p:18,ortg:108},
  },
  "Role Player": {
    Playmaker:{bpm:4.5,usg:22,ts:54,ast_p:25,to_p:15,stl_p:2.3,blk_p:0.6,orb_p:2.5,drb_p:13,ortg:108},
    Wing:{bpm:4.0,usg:20,ts:55,ast_p:12,to_p:13,stl_p:1.8,blk_p:2.0,orb_p:3.5,drb_p:16,ortg:109},
    Big:{bpm:5.0,usg:21,ts:57,ast_p:10,to_p:13,stl_p:1.2,blk_p:6.0,orb_p:9,drb_p:20,ortg:111},
  },
  Starter: {
    Playmaker:{bpm:7.0,usg:25,ts:56,ast_p:28,to_p:14,stl_p:2.5,blk_p:0.8,orb_p:3,drb_p:14,ortg:112},
    Wing:{bpm:6.5,usg:23,ts:57,ast_p:14,to_p:12,stl_p:2.0,blk_p:2.5,orb_p:4,drb_p:17,ortg:112},
    Big:{bpm:7.5,usg:23,ts:59,ast_p:12,to_p:12,stl_p:1.5,blk_p:7.0,orb_p:10,drb_p:22,ortg:114},
  },
  "All-Star": {
    Playmaker:{bpm:10.0,usg:28,ts:59,ast_p:32,to_p:13,stl_p:2.8,blk_p:1.0,orb_p:3.5,drb_p:15,ortg:118},
    Wing:{bpm:9.5,usg:26,ts:60,ast_p:16,to_p:11,stl_p:2.3,blk_p:3.0,orb_p:5,drb_p:19,ortg:117},
    Big:{bpm:10.5,usg:26,ts:62,ast_p:14,to_p:11,stl_p:1.8,blk_p:8.5,orb_p:11,drb_p:24,ortg:119},
  },
};
const REPL = TIER_THRESHOLDS.Replacement; // backward compat

// ═══════════════════════════════════════════════════════════
// TOOLTIP COMPONENT
// ═══════════════════════════════════════════════════════════
function Tip({children, content, wide=false}) {
  const [show,setShow] = useState(false);
  const [pos,setPos] = useState({x:0,y:0});
  const ref = useRef(null);
  const handleEnter = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({x:rect.left+rect.width/2, y:rect.top});
    setShow(true);
  };
  return (
    <span className="relative inline-block cursor-help" onMouseEnter={handleEnter} onMouseLeave={()=>setShow(false)} ref={ref}>
      {children}
      {show && (
        <div className={`fixed z-50 ${wide?"w-80":"w-64"} p-3 rounded-lg shadow-2xl text-xs leading-relaxed pointer-events-none`}
          style={{left:Math.min(pos.x-128,window.innerWidth-300),top:Math.max(pos.y-8,8),transform:"translateY(-100%)",
            background:"#1e293b",border:"1px solid #475569",color:"#e2e8f0"}}>
          {content}
        </div>
      )}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════
// METHODOLOGY DEFINITIONS (used for tooltips AND methodology page)
// ═══════════════════════════════════════════════════════════
const METHODS = {
  feel: {
    name: "Feel / IQ Score",
    formula: "AST/TO pctl × 0.30 + Stocks pctl × 0.20 + Foul Discipline pctl × 0.15 + FTR pctl × 0.15 + ORB pctl × 0.10 + TO Control pctl × 0.10 + Usage Bonuses",
    inputs: (p) => `AST/TO: ${fmt(p.astTov)} | Stocks: ${fmt(p.stlP+p.blkP,1)} | TO%: ${fmt(p.toP)} | FTR: ${fmt(p.ftr)} | ORB%: ${fmt(p.orbP)}`,
    desc: "Measures basketball IQ through decision-making proxies. High AST/TO + low fouls + drawing contact = smart player. Bonus for high-usage players who maintain low turnover rates; penalty for low-usage players with high turnovers.",
  },
  funcAth: {
    name: "Functional Athleticism",
    formula: "FTR pctl × 0.25 + Dunk Rate pctl × 0.20 + DRB% pctl × 0.15 + Stocks pctl × 0.20 + Rim Freq pctl × 0.20 + Combine Bonus (0-10)",
    inputs: (p) => `FTR: ${fmt(p.ftr)} | Dunk%: ${fmt(p.dunkR)} | DRB%: ${fmt(p.drbP)} | Rim%: ${fmt(p.rimF)} | Stocks: ${fmt(p.stlP+p.blkP,1)}`,
    desc: "Not raw combine athleticism, but how athletic gifts manifest in games. Driving to the rim, dunking, defensive rebounding, and creating turnovers all require functional athleticism. Combine data provides bonus where available.",
  },
  shootScore: {
    name: "Shooting Score",
    formula: "FT% pctl × 0.30 + 3P% pctl × 0.25 + TS% pctl × 0.20 + Mid% pctl × 0.15 + 3P Freq pctl × 0.10 + Volume Bonus",
    inputs: (p) => `FT%: ${fmt(p.ft)} | 3P%: ${fmt(p.tp)} | TS%: ${fmt(p.ts)} | Mid%: ${fmt(p.midPct)} | 3PAr: ${fmt(p.threeF)}`,
    desc: "FT% weighted highest because it's the single best predictor of NBA shooting translation (Berger, 2023). Volume bonus (+5) for >5 3PA/game, (+3) for >3 3PA/game. Self-creation index measured separately.",
  },
  defScore: {
    name: "Defensive Impact",
    formula: "DBPM pctl × 0.30 + STL% pctl × W_stl + BLK% pctl × W_blk + DRB% pctl × 0.15 + Foul Disc pctl × 0.10 + Stocks Threshold Bonus",
    inputs: (p) => `DBPM: ${fmt(p.dbpm)} | STL%: ${fmt(p.stlP)} | BLK%: ${fmt(p.blkP)} | DRB%: ${fmt(p.drbP)} | Pos: ${p.pos}`,
    desc: "Position-weighted: STL% matters more for guards (0.25), BLK% for bigs (0.25). Stocks threshold bonus: +8 if both STL>2.0 AND BLK>3.0, +4 if either exceeds elite threshold. Foul discipline inverted (fewer fouls = better).",
  },
  overall: {
    name: "Overall Production Rating",
    formula: "Age-Adj BPM pctl × 0.30 + Feel × 0.15 + Func Ath × 0.15 + Shooting × 0.20 + Defense × 0.15 + Height-for-Position Bonus + Wingspan Delta Bonus",
    inputs: (p) => `BPM: ${fmt(p.bpm)} | Age: ${fmt(p.age)} | Ht: ${p.ht} | WS Delta: ${p.wsDelta?"+"+fmt(p.wsDelta):"N/A"}`,
    desc: "Master composite. Age-adjusted BPM: BPM - (age-20)×0.5 penalizes older players. Height bonus: +1.5pts per inch above position average (max +10). Wingspan delta bonus: +1pt per inch of positive delta (max +8). Captures total prospect value.",
  },
  floor: {
    name: "Floor Score",
    formula: "FT% pctl × 0.35 + DRB% pctl × 0.20 + AST/TO pctl × 0.25 + Height pctl × 0.20",
    inputs: (p) => `FT%: ${fmt(p.ft)} | DRB%: ${fmt(p.drbP)} | AST/TO: ${fmt(p.astTov)} | Height: ${p.ht}`,
    desc: "What keeps a player in the league. These skills translate to any role: shootable free throws, defensive rebounding, smart decisions, and physical size. High floor = safe pick.",
  },
  ceiling: {
    name: "Ceiling Score",
    formula: "Age-Adj Production pctl × 0.45 + Func Athleticism × 0.30 + Shooting Score × 0.25",
    inputs: (p) => `Age-Adj BPM: ${fmt(p.bpm-(p.age-20)*0.5)} | Func Ath: ${fmt(p.funcAth,0)} | Shoot: ${fmt(p.shootScore,0)}`,
    desc: "Upside potential. Young players producing at high levels with functional athleticism and shooting projection have the highest ceilings. Age-adjustment is critical: a 19-year-old at BPM 10 > a 23-year-old at BPM 12.",
  },
  selfCreation: {
    name: "Self-Creation Index",
    formula: "(USG / 100) × (1 - AST% / 100) × 200",
    inputs: (p) => `USG: ${fmt(p.usg)} | AST%: ${fmt(p.astP)}`,
    desc: "Proxy for how much scoring comes from self-created opportunities vs assisted baskets. Higher usage combined with lower assist dependency = more self-creation. Scale 0-100.",
  },
  projNba3p: {
    name: "Projected NBA 3P%",
    formula: "0.35 × college_3P% + 0.25 × FT% + 0.15 × Midrange% + 5.0",
    inputs: (p) => `3P%: ${fmt(p.tp)} | FT%: ${fmt(p.ft)} | Mid%: ${fmt(p.midPct)}`,
    desc: "FT% is the strongest single predictor of NBA 3P translation. Midrange shooting shows touch/craft. Intercept of 5.0 accounts for NBA coaching/development. Clipped to 20-50% range.",
  },
  projNba3pa: {
    name: "Projected NBA 3PA/game",
    formula: "college_3PA/G × 1.2 + FT% Bonus + Era Adjustment",
    inputs: (p) => `College 3PA/G: ${fmt(p.tpaPerG)} | FT%: ${fmt(p.ft)} | 3P Freq: ${fmt(p.threeF)}`,
    desc: "Base: college attempts × 1.2 (NBA spacing effect). FT% bonus: good shooters (>75%) evolve to shoot more 3s. +0.5 3PA/G per 5 FT% points above 75. Era: +1.5 for modern NBA.",
  },
  projNba3par: {
    name: "Projected NBA 3P Attempt Rate",
    formula: "3P_freq × 0.8 + FT% Bonus (if >75: (FT%-75)×0.3) + 5 (era)",
    inputs: (p) => `3P Freq: ${fmt(p.threeF)} | FT%: ${fmt(p.ft)}`,
    desc: "What % of NBA shots will be threes. College 3P frequency as base, adjusted for FT% shooting signal and modern NBA three-point inflation.",
  },
  projNbaTs: {
    name: "Projected NBA TS%",
    formula: "0.50 × college_TS% + 0.25 × FT% + 0.10 × 3P% + 10.0",
    inputs: (p) => `TS%: ${fmt(p.ts)} | FT%: ${fmt(p.ft)} | 3P%: ${fmt(p.tp)}`,
    desc: "Overall efficiency projection. College TS% as anchor, boosted by FT% (free throws are free points) and 3P shooting. Clipped to 40-70%.",
  },
  fourFactors: {
    name: "Four Factors Composite",
    formula: "eFG_norm × 0.40 + (1-TO%)_norm × 0.25 + ORB%_norm × 0.20 + FTR_norm × 0.15",
    inputs: (p) => `eFG%: ${fmt(p.efg)} | TO%: ${fmt(p.toP)} | ORB%: ${fmt(p.orbP)} | FTR: ${fmt(p.ftr)}`,
    desc: "Dean Oliver's Four Factors of basketball success. Each factor min-max normalized within season to prevent cross-era bias, then weighted by Oliver's empirical findings: eFG (shooting) most important at 40%, turnover avoidance 25%, offensive rebounding 20%, getting to the line 15%. Measures possession quality.",
  },
  posClassification: {
    name: "Position Classification (3-Role Model)",
    formula: "Soft-clustering: Height + Wingspan + AST% + USG% + BLK% → One-Hot Encoding with size × stats interactions",
    inputs: () => "Height, Wingspan, AST%, USG%, BLK%, BartTorvik half-positions (PG/CG/WG/WF/PF/C)",
    desc: "Assigns each prospect to Playmaker, Wing, or Big based on measurables and statistical profile. Known limitations: (1) SG-type players with high AST% may be classified as Playmakers instead of Wings; (2) Modern stretch-4s may be classified as Bigs when they functionally play as large Wings in the NBA. Position soft-probabilities (pos_playmaker, pos_wing, pos_big) are included for nuanced analysis. Future: BartTorvik half-position soft-clustering for better granularity.",
  },
};

// Badge definitions for tooltips
const BADGE_DEFS = {
  "Floor General Spacer": { rule: "3P% > 35 AND AST% > 20", desc: "Can shoot AND run an offense — the modern PG archetype." },
  "Stretch Big": { rule: "Height ≥ 6'8\" AND 3P Freq > 25% AND 3P% > 32%", desc: "Tall player who spaces the floor. Premium NBA skill." },
  "High Feel Athlete": { rule: "Func Athleticism > 70 AND Feel > 70", desc: "Athletic AND smart — rare combo that translates." },
  "3-and-D": { rule: "3P% > 33 AND STL% > 2.0 AND Dunk% > 5", desc: "Can shoot threes and defend multiple positions." },
  "Rim Pressure": { rule: "Rim Freq > 30% AND Dunk% > 10 AND FTR > 35", desc: "Attacks the basket relentlessly. Draws fouls." },
  "Modern Big": { rule: "BLK% > 4.0 AND AST% > 12", desc: "Protects the rim AND creates for others — the new age center." },
  "Efficient High Usage": { rule: "USG > 28 AND TO% < 15", desc: "Handles massive offensive load without coughing it up." },
  "Elite Shooting": { rule: "FT% > 80 AND 3P% > 36", desc: "Top-tier shooting across both lines. Translatable." },
  "Stocks Machine": { rule: "STL% > 2.5 AND BLK% > 2.5", desc: "Creates turnovers everywhere. Extremely rare." },
  "High TO Wing": { rule: "Wing with TO% > 22", desc: "Wings shouldn't be turning it over this much. Limits ceiling." },
  "Non-Blocking Big": { rule: "Big with BLK% < 2.0", desc: "Bigs without rim protection have lower NBA value floor." },
  "Poor 3P Shooting PG": { rule: "PG with 3P% < 28 AND 3P Freq > 20%", desc: "Shoots threes but can't make them. Limits spacing." },
  "Low Assist Playmaker": { rule: "PG with AST% < 15", desc: "Labeled playmaker but doesn't create for others." },
  "FT Concern": { rule: "FT% < 60 AND USG > 25", desc: "Poor free throw shooting on high usage = Hack-a-Player risk." },
  "Undersized": { rule: "Height < 6'2\" AND not a PG", desc: "Size disadvantage outside the point guard position." },
};

// ═══════════════════════════════════════════════════════════
// SAMPLE DATA
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// API DATA LAYER
// ═══════════════════════════════════════════════════════════
const API_BASE = "/api";

function mapProfile(d) {
  /* Transform flat API profile → nested structure expected by components */
  if(!d) return null;
  // Auto-scale: if a percentage value is < 1.0, multiply by 100
  const pct = (v) => v!=null && v < 1.0 && v > 0 ? v*100 : v;
  // Same but for percentiles (should be 0-100)
  const p100 = (v) => v!=null && v <= 1.0 && v >= 0 ? Math.round(v*100) : (v!=null ? Math.round(v) : null);
  const badges = typeof d.badges==="string" ? d.badges.split("|").filter(Boolean) : (d.badges||[]);
  const redFlags = typeof d.red_flags==="string" ? d.red_flags.split("|").filter(Boolean) : (d.redFlags||d.red_flags||[]);
  return {
    name:d.name, team:d.team, pos:d.pos, yr:d.yr, cls:d.cls||"",
    conf:d.conf||"", confTier:d.conf_tier||d.confTier||"",
    ht:d.ht!=null?`${Math.floor(d.ht/12)}'${Math.round(d.ht%12)}"`:null,
    htIn:d.ht, wt:d.wt, age:d.age, recRank:d.recRank,
    seasonsPlayed:d.seasons, gp:d.gp, min:d.min,
    pts:d.pts, reb:d.reb, ast:d.ast, stl:d.stl, blk:d.blk,
    to:null, foul:null, mp:d.gp&&d.min?Math.round(d.gp*d.min):null,
    p36:{pts:d.pts36,reb:d.reb36,ast:d.ast36,stl:d.stl36,blk:d.blk36},
    bpm:d.bpm, obpm:d.obpm, dbpm:d.dbpm, ortg:d.ortg, usg:d.usg,
    astP:d.ast_p, toP:d.to_p, orbP:d.orb_p, drbP:d.drb_p,
    stlP:d.stl_p, blkP:d.blk_p, astTov:d.ast_tov,
    ts:d.ts, fg:pct(d.fg_pct), tp:pct(d.tp_pct), ft:pct(d.ft_pct), efg:d.efg,
    rimF:d.rim_f, rimPct:pct(d.rim_pct), midF:d.mid_f, midPct:pct(d.mid_pct),
    threeF:d.three_f, threePct:pct(d.tp_pct), dunkR:d.dunk_r, ftr:d.ftr,
    threePar:d.three_par,
    ff:{efg:pct(d.ff_efg),tov:pct(d.ff_tov),orb:pct(d.ff_orb),ftr:pct(d.ff_ftr),comp:pct(d.ff_comp)},
    pctl:{bpm:p100(d.pctl_bpm),usg:p100(d.pctl_usg),ts:p100(d.pctl_ts),ast:p100(d.pctl_ast),
          to:p100(d.pctl_to),orb:p100(d.pctl_orb),drb:p100(d.pctl_drb),stl:p100(d.pctl_stl),blk:p100(d.pctl_blk),
          pts36:p100(d.pctl_pts36),ast36:p100(d.pctl_ast36),reb36:p100(d.pctl_reb36)},
    comb:d.comb_hgt?{hgt:d.comb_hgt,wgt:d.comb_wgt,ws:d.comb_ws,sr:d.comb_sr,
      hl:d.comb_hl,hw:d.comb_hw,bf:d.comb_bf,sv:d.comb_sv,mv:d.comb_mv,
      sprint:d.comb_sprint,lane:d.comb_lane,bench:d.comb_bench}:null,
    wsDelta:d.ws_delta,
    traj:{bpm:d.traj_bpm,ts:d.traj_ts,usg:d.traj_usg,ast:d.traj_ast,comp:d.traj_comp},
    deltaBpm:d.delta_bpm, deltaTs:d.delta_ts,
    feel:d.feel, funcAth:d.func_ath, shootScore:d.shoot_score, defScore:d.def_score,
    overall:d.overall, selfCreation:d.self_creation,
    projNba3p:d.proj_3p, projNba3pa:null, projNba3par:d.proj_3par, projNbaTs:d.proj_ts,
    roles:{playmaker:d.role_playmaker,scorer:d.role_scorer,spacer:d.role_spacer,
      driver:d.role_driver,crasher:d.role_crasher,onball:d.role_onball,
      rimProt:d.role_rim_prot,rebounder:d.role_rebounder,switchPot:d.role_switch},
    roleVersatility:d.role_versatility,
    floor:d.floor, ceiling:d.ceiling, margin:d.margin, risk:d.risk, safeBet:d.safe_bet,
    badges, redFlags,
    posPlaymaker:d.pos_playmaker, posWing:d.pos_wing, posBig:d.pos_big,
    mu:d.pred_mu, sigma:d.pred_sigma, pNba:d.pred_p_nba, predTier:d.pred_tier,
    tiers:{
      Superstar:((d.prob_super||0)*100),
      "All-Star":((d.prob_allstar||0)*100),
      Starter:((d.prob_starter||0)*100),
      "Role Player":((d.prob_role||0)*100),
      Replacement:((d.prob_repl||0)*100),
      Negative:((d.prob_neg||0)*100),
      "Never NBA":((d.prob_never||0)*100),
    },
    actual:d.tier, peakPie:d.peak_pie, nbaName:d.nba_name||"",
    madeNba:d.made_nba, draftYear:d.draft_year, draftPick:d.draft_pick,
    confidence:d.confidence||"full", sampleMin:d.sample_min, sampleGp:d.sample_gp,
    statComps:[], anthroComps:[], seasonLines:[],
  };
}

// Placeholder — populated by App on mount
let PLAYERS = {};
let PLAYER_LIST = [];

// ═══════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════
const Sec = ({children,icon,title,sub}) => (
  <div className="rounded-xl p-5" style={{background:"#111827"}}>
    <h3 className="text-base font-bold uppercase tracking-widest mb-1 flex items-center gap-2" style={{color:"#e5e7eb",fontFamily:"'Oswald',sans-serif"}}>
      {icon&&<span style={{color:"#f97316"}}>{icon}</span>}{title}
    </h3>
    {sub&&<div className="text-xs mb-4" style={{color:"#6b7280"}}>{sub}</div>}
    {!sub&&<div className="mb-3"/>}
    {children}
  </div>
);

const BadgeChip = ({text,color="#22c55e"}) => {
  const def = BADGE_DEFS[text];
  const inner = <span className="px-2 py-0.5 rounded-full text-xs font-semibold inline-block" style={{background:color+"22",color,border:`1px solid ${color}44`}}>{text}</span>;
  if (!def) return inner;
  return (
    <Tip content={<div><div className="font-bold mb-1" style={{color}}>{text}</div><div className="mb-1"><span style={{color:"#94a3b8"}}>Rule:</span> {def.rule}</div><div style={{color:"#cbd5e1"}}>{def.desc}</div></div>}>
      {inner}
    </Tip>
  );
};

const TierBadge = ({tier}) => <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{background:(TC[tier]||"#6b7280")+"22",color:TC[tier]||"#6b7280",border:`1px solid ${(TC[tier]||"#6b7280")}44`}}>{tier}</span>;

const StatCell = ({label,val,pctl,suffix=""}) => (
  <div className="text-center p-2 rounded-lg" style={{background:valBg(pctl)}}>
    <div className="text-xs uppercase tracking-wider mb-0.5" style={{color:"#9ca3af"}}>{label}</div>
    <div className="text-xl font-bold" style={{color:valColor(pctl),fontFamily:"'Oswald',sans-serif"}}>{fmt(val)}{suffix}</div>
    {pctl!=null&&<div className="text-xs mt-0.5" style={{color:valColor(pctl)}}>{Math.round(pctl)}th</div>}
  </div>
);

const HBar = ({value,max=100,color="#f97316",label,right}) => (
  <div className="flex items-center gap-2 mb-1.5">
    {label&&<div className="w-24 text-xs text-right shrink-0" style={{color:"#9ca3af"}}>{label}</div>}
    <div className="flex-1 h-4 rounded-full overflow-hidden" style={{background:"#1f2937"}}>
      <div className="h-full rounded-full" style={{width:`${Math.min(100,(value/max)*100)}%`,background:`linear-gradient(90deg,${color}88,${color})`}}/>
    </div>
    {right&&<div className="w-12 text-xs font-semibold text-right" style={{color}}>{right}</div>}
  </div>
);

// Score gauge WITH tooltip
const ScoreGauge = ({label,value,max=100,color="#f97316",methodKey,p}) => {
  const m = methodKey && METHODS[methodKey];
  const bar = (
    <div className="flex items-center gap-3 py-2" style={{borderBottom:"1px solid #1f293744"}}>
      <div className="w-32 text-sm flex items-center gap-1" style={{color:"#9ca3af"}}>
        {label}{m&&<span className="text-xs" style={{color:"#475569"}}>ⓘ</span>}
      </div>
      <div className="flex-1 h-5 rounded-full overflow-hidden" style={{background:"#1f2937"}}>
        <div className="h-full rounded-full flex items-center justify-end pr-2" style={{width:`${(value/max)*100}%`,background:`linear-gradient(90deg,${color}55,${color})`}}>
          {value>15&&<span className="text-xs font-bold text-white">{Math.round(value)}</span>}
        </div>
      </div>
      <div className="w-10 text-sm font-bold text-right" style={{color}}>{Math.round(value)}</div>
    </div>
  );
  if (!m) return bar;
  return (
    <Tip wide content={
      <div>
        <div className="font-bold mb-1" style={{color:"#f97316"}}>{m.name}</div>
        <div className="mb-1.5"><span style={{color:"#94a3b8"}}>Formula:</span><br/><code className="text-xs" style={{color:"#7dd3fc"}}>{m.formula}</code></div>
        {p&&<div className="mb-1.5"><span style={{color:"#94a3b8"}}>Inputs:</span><br/><span style={{color:"#e2e8f0"}}>{m.inputs(p)}</span></div>}
        <div style={{color:"#cbd5e1"}}>{m.desc}</div>
      </div>
    }>{bar}</Tip>
  );
};

// ═══════════════════════════════════════════════════════════
// TAB: OVERVIEW
// ═══════════════════════════════════════════════════════════
function OverviewTab({p, compTier, setCompTier}) {
  const tierData = TIER_THRESHOLDS[compTier] || TIER_THRESHOLDS.Replacement;
  const repl = tierData[p.pos]||tierData.Wing;
  const compData = [
    {s:"BPM",v:p.bpm,r:repl.bpm,pc:p.pctl.bpm},{s:"USG",v:p.usg,r:repl.usg,pc:p.pctl.usg},
    {s:"TS%",v:p.ts,r:repl.ts,pc:p.pctl.ts},{s:"AST%",v:p.astP,r:repl.ast_p,pc:p.pctl.ast},
    {s:"STL%",v:p.stlP,r:repl.stl_p,pc:p.pctl.stl},{s:"BLK%",v:p.blkP,r:repl.blk_p,pc:p.pctl.blk},
    {s:"ORB%",v:p.orbP,r:repl.orb_p,pc:p.pctl.orb},{s:"DRB%",v:p.drbP,r:repl.drb_p,pc:p.pctl.drb},
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[["Conference",p.conf,p.confTier==="Power"?"#10b981":"#f97316"],["Class",p.cls,"#e5e7eb"],
          ["Age",p.age.toFixed(1),"#e5e7eb"],["Recruit",p.recRank?`#${p.recRank}`:"Unranked","#e5e7eb"],
          ["Seasons",p.seasonsPlayed,"#e5e7eb"],["Conf Tier",p.confTier,p.confTier==="Power"?"#10b981":"#f97316"]
        ].map(([l,v,c])=>(
          <div key={l} className="rounded-lg p-3" style={{background:"#111827"}}>
            <div className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>{l}</div>
            <div className="font-semibold mt-0.5" style={{color:c,fontFamily:"'Oswald',sans-serif"}}>{v}</div>
          </div>
        ))}
      </div>
      <Sec icon="▦" title="Box Score" sub={`${p.gp} GP · ${p.min} MIN/G · ${p.mp} Total MIN`}>
        <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
          {[["PTS",p.pts,p.pctl.pts36],["REB",p.reb,p.pctl.reb36],["AST",p.ast,p.pctl.ast36],
            ["STL",p.stl,p.pctl.stl],["BLK",p.blk,p.pctl.blk],["TO",p.to,100-p.pctl.to],["PF",p.foul,null]
          ].map(([l,v,pc])=><StatCell key={l} label={l} val={v} pctl={pc}/>)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" style={{color:"#6b7280"}}>
          <span>Efficiency:</span>
          {[["TS%",p.ts,p.pctl.ts],["FG%",p.fg,null],["3P%",p.tp,null],["FT%",p.ft,null]].map(([l,v,pc])=>(
            <span key={l} className="px-2 py-0.5 rounded" style={{background:valBg(pc),color:pc?valColor(pc):"#e5e7eb"}}>{l} {fmt(v)}</span>
          ))}
        </div>
      </Sec>
      <Sec icon="⚡" title="Advanced" sub="Era-adjusted percentile coloring (green=elite, red=poor)">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {[["BPM",p.bpm,p.pctl.bpm],["OBPM",p.obpm,null],["DBPM",p.dbpm,null],["ORtg",p.ortg,null],
            ["USG%",p.usg,p.pctl.usg],["TS%",p.ts,p.pctl.ts],["AST%",p.astP,p.pctl.ast],["TO%",p.toP,p.pctl.to],
            ["ORB%",p.orbP,p.pctl.orb],["DRB%",p.drbP,p.pctl.drb],["STL%",p.stlP,p.pctl.stl],["BLK%",p.blkP,p.pctl.blk]
          ].map(([l,v,pc])=><StatCell key={l} label={l} val={v} pctl={pc}/>)}
        </div>
      </Sec>
      <Sec icon="↗" title="Four Factors" sub="">
        <Tip wide content={
          <div>
            <div className="font-bold mb-1" style={{color:"#f97316"}}>{METHODS.fourFactors.name}</div>
            <div className="mb-1"><span style={{color:"#94a3b8"}}>Formula:</span><br/><code className="text-xs" style={{color:"#7dd3fc"}}>{METHODS.fourFactors.formula}</code></div>
            <div className="mb-1"><span style={{color:"#94a3b8"}}>Inputs:</span> {METHODS.fourFactors.inputs(p)}</div>
            <div style={{color:"#cbd5e1"}}>{METHODS.fourFactors.desc}</div>
          </div>
        }>
          <div className="text-xs mb-4 cursor-help" style={{color:"#6b7280"}}>Dean Oliver's Four Factors — how does this player affect possession quality? <span style={{color:"#475569"}}>ⓘ hover for formula</span></div>
        </Tip>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[["eFG%","Shooting efficiency",p.ff.efg,"#fbbf24"],["TO Control","Avoids turnovers",p.ff.tov,"#3b82f6"],
            ["ORB%","Offensive glass",p.ff.orb,"#06b6d4"],["FT Rate","Gets to the line",p.ff.ftr,"#8b5cf6"]
          ].map(([l,d,v,c])=>(
            <div key={l}>
              <div className="text-sm font-semibold mb-1" style={{color:"#e5e7eb"}}>{l}</div>
              <div className="text-xs mb-2" style={{color:"#6b7280"}}>{d}</div>
              <HBar value={v} color={c} right={`${v}`}/>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 flex items-center justify-between" style={{borderTop:"1px solid #1f2937"}}>
          <span className="text-sm" style={{color:"#6b7280"}}>Composite</span>
          <span className="text-xl font-bold" style={{color:"#f97316",fontFamily:"'Oswald',sans-serif"}}>{p.ff.comp}</span>
        </div>
      </Sec>
      <Sec icon="📊" title={`vs. NBA ${compTier} (${p.pos})`} sub="Green = clears the bar. Red = below threshold.">
        <div className="flex items-center gap-3 mb-4 pb-3" style={{borderBottom:"1px solid #1f2937"}}>
          <span className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Compare against:</span>
          <div className="flex gap-1">
            {["Replacement","Role Player","Starter","All-Star"].map(tier=>(
              <button key={tier} onClick={()=>setCompTier(tier)} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{background:compTier===tier?"#f97316":"#1f2937",color:compTier===tier?"#000":"#9ca3af",
                  border:`1px solid ${compTier===tier?"#f97316":"#374151"}`}}>
                {tier}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          {compData.map(({s,v,r,pc})=>{
            const pct=r>0?(v/r)*100:100; const above=v>=r; const c=above?"#22c55e":"#ef4444";
            return (
              <div key={s} className="flex items-center gap-3">
                <div className="w-12 text-xs font-semibold text-right" style={{color:"#9ca3af"}}>{s}</div>
                <div className="flex-1 h-6 rounded-full relative overflow-hidden" style={{background:"#1f2937"}}>
                  <div className="absolute top-0 bottom-0 w-0.5" style={{left:"50%",background:"#ffffff33",zIndex:2}}/>
                  <div className="h-full rounded-full" style={{width:`${Math.min(100,pct*0.5)}%`,background:`linear-gradient(90deg,${c}88,${c})`}}/>
                </div>
                <div className="w-16 text-sm font-bold text-right" style={{color:c}}>{fmt(v)}</div>
                <div className="w-12 text-xs text-right" style={{color:"#6b7280"}}>({fmt(r)})</div>
              </div>
            );
          })}
        </div>
      </Sec>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: SHOOTING
// ═══════════════════════════════════════════════════════════
function ShootingTab({p}) {
  const zones=[{z:"@Rim",f:p.rimF,pct:p.rimPct,ast:p.rimAst,c:"#ef4444"},{z:"Mid-Range",f:p.midF,pct:p.midPct,ast:p.midAst,c:"#f97316"},
    {z:"3-Point",f:p.threeF,pct:p.threePct,ast:p.threeAst,c:"#3b82f6"},{z:"Dunks",f:p.dunkR,pct:null,ast:null,c:"#10b981"}];
  return (
    <div className="space-y-5">
      <Sec icon="🏀" title="Shot Profile" sub="Zone breakdown: frequency, accuracy, and assisted %">
        <div className="grid grid-cols-4 gap-3 mb-4">
          {zones.map(z=>(
            <div key={z.z} className="rounded-lg p-3 text-center" style={{background:"#0d1117",border:`1px solid ${z.c}33`}}>
              <div className="text-xs uppercase tracking-wider mb-2" style={{color:z.c}}>{z.z}</div>
              <div className="text-2xl font-bold" style={{color:"#e5e7eb",fontFamily:"'Oswald',sans-serif"}}>{z.f}%</div>
              <div className="text-xs" style={{color:"#6b7280"}}>of shots</div>
              {z.pct!=null&&<><div className="text-lg font-bold mt-2" style={{color:z.pct>45?"#22c55e":z.pct>35?"#fbbf24":"#ef4444",fontFamily:"'Oswald',sans-serif"}}>{z.pct}%</div><div className="text-xs" style={{color:"#6b7280"}}>accuracy</div></>}
              {z.ast!=null&&<div className="text-xs mt-1" style={{color:"#94a3b8"}}>{z.ast}% ast'd</div>}
            </div>
          ))}
        </div>
        <div className="flex gap-4 text-xs" style={{color:"#6b7280"}}>
          <span>FT Rate: <span style={{color:"#e5e7eb"}}>{p.ftr}%</span></span>
          <Tip content={<div><div className="font-bold mb-1" style={{color:"#f97316"}}>{METHODS.selfCreation.name}</div><code className="text-xs" style={{color:"#7dd3fc"}}>{METHODS.selfCreation.formula}</code><div className="mt-1">{METHODS.selfCreation.inputs(p)}</div><div className="mt-1" style={{color:"#cbd5e1"}}>{METHODS.selfCreation.desc}</div></div>}>
            <span>Self-Creation: <span style={{color:"#f97316"}}>{p.selfCreation}</span> <span style={{color:"#475569"}}>ⓘ</span></span>
          </Tip>
        </div>
      </Sec>
      <Sec icon="🔮" title="NBA Shooting Projection" sub="">
        <div className="text-xs mb-4 cursor-help" style={{color:"#6b7280"}}>Hover each metric for methodology ⓘ</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[["projNba3p","Proj. 3P%",p.projNba3p,p.projNba3p>36?"#22c55e":p.projNba3p>32?"#fbbf24":"#ef4444"],
            ["projNba3pa","Proj. 3PA/G",p.projNba3pa,p.projNba3pa>5?"#3b82f6":"#6b7280"],
            ["projNba3par","Proj. 3PAr",p.projNba3par,p.projNba3par>30?"#3b82f6":"#6b7280"],
            ["projNbaTs","Proj. TS%",p.projNbaTs,p.projNbaTs>56?"#22c55e":p.projNbaTs>52?"#fbbf24":"#ef4444"],
          ].map(([key,l,v,c])=>(
            <Tip key={key} wide content={
              <div><div className="font-bold mb-1" style={{color:"#f97316"}}>{METHODS[key].name}</div>
              <div className="mb-1"><span style={{color:"#94a3b8"}}>Formula:</span><br/><code className="text-xs" style={{color:"#7dd3fc"}}>{METHODS[key].formula}</code></div>
              <div className="mb-1"><span style={{color:"#94a3b8"}}>Inputs:</span> {METHODS[key].inputs(p)}</div>
              <div style={{color:"#cbd5e1"}}>{METHODS[key].desc}</div></div>
            }>
              <div className="rounded-lg p-4 text-center cursor-help" style={{background:"#0d1117"}}>
                <div className="text-xs uppercase tracking-wider mb-1" style={{color:"#6b7280"}}>{l} <span style={{color:"#475569"}}>ⓘ</span></div>
                <div className="text-3xl font-bold" style={{color:c,fontFamily:"'Oswald',sans-serif"}}>{fmt(v)}</div>
              </div>
            </Tip>
          ))}
        </div>
      </Sec>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: BODY
// ═══════════════════════════════════════════════════════════
function BodyTab({p}) {
  if(!p.comb)return<Sec icon="📏" title="Body"><div className="text-center py-8" style={{color:"#9ca3af"}}>No combine data available.</div></Sec>;
  const c=p.comb;
  const meas=[["Height",c.hgt,"in"],["Weight",c.wgt,"lbs"],["Wingspan",c.ws,"in"],["Stand. Reach",c.sr,"in"],
    ["Hand Length",c.hl,"in"],["Hand Width",c.hw,"in"],["Body Fat",c.bf,"%"],["WS-Ht Delta",p.wsDelta,'"']];
  const drills=[["Stand. Vert",c.sv,"in",{Big:[28,32,36],Wing:[30,34,38],Playmaker:[31,35,39]}],
    ["Max Vert",c.mv,"in",{Big:[30,34,38],Wing:[33,37,41],Playmaker:[34,38,42]}],
    ["3/4 Sprint",c.sprint,"sec",{Big:[3.45,3.30,3.15],Wing:[3.35,3.22,3.10],Playmaker:[3.30,3.18,3.05]}],
    ["Lane Agility",c.lane,"sec",{Big:[11.8,11.2,10.6],Wing:[11.2,10.7,10.2],Playmaker:[11.0,10.5,10.0]}]];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Sec icon="📏" title="Measurements">
        <div className="space-y-2">{meas.map(([l,v,u])=>(
          <div key={l} className="flex justify-between items-center py-1.5" style={{borderBottom:"1px solid #1f2937"}}>
            <span className="text-sm" style={{color:"#9ca3af"}}>{l}</span>
            <span className="font-semibold" style={{color:"#e5e7eb",fontFamily:"'Oswald',sans-serif"}}>{v!=null?`${v} ${u}`:"—"}</span>
          </div>
        ))}</div>
      </Sec>
      <Sec icon="🏃" title="Combine Drills" sub={`Percentile vs ${p.pos}s: 🟢 above avg, 🟡 avg, 🔴 below`}>
        <div className="space-y-3">{drills.map(([l,v,u,thresholds])=>{
          const th = thresholds[p.pos]||thresholds.Wing;
          const inv = l.includes("Sprint")||l.includes("Lane");
          let pctl=50;
          if(v!=null){
            if(inv){pctl=v<=th[2]?90:v<=th[1]?65:v<=th[0]?40:20;}
            else{pctl=v>=th[2]?90:v>=th[1]?65:v>=th[0]?40:20;}
          }
          return (
            <div key={l} className="flex justify-between items-center py-2.5 px-3 rounded-lg" style={{background:valBg(v!=null?pctl:null)}}>
              <span className="text-sm" style={{color:"#9ca3af"}}>{l}</span>
              <div className="text-right">
                <span className="font-bold" style={{color:valColor(v!=null?pctl:null),fontFamily:"'Oswald',sans-serif"}}>{v!=null?`${v} ${u}`:"—"}</span>
                {v!=null&&<div className="text-xs" style={{color:valColor(pctl)}}>{pctl>=75?"Above avg":pctl>=40?"Average":"Below avg"}</div>}
              </div>
            </div>
          );
        })}</div>
      </Sec>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: COMPS (with dynamic sliders)
// ═══════════════════════════════════════════════════════════
function CompsTab({p}) {
  const [nbaOnly,setNbaOnly]=useState(false);
  const [wsAdj,setWsAdj]=useState(0);
  const [wtAdj,setWtAdj]=useState(0);

  // Dynamic anthropometric re-ranking
  const dynamicAnthro = useMemo(()=>{
    if(!(p.anthroComps||[]).length)return[];
    const baseWt=p.comb?.wgt||p.wt;
    const baseWs=p.comb?.ws||0;
    const adjWt=baseWt+wtAdj;
    const adjWs=baseWs+wsAdj;
    return (p.anthroComps||[]).map(c=>{
      const wtDiff=Math.abs((c.wt||0)-adjWt);
      const wsDiff=Math.abs((c.ws||0)-adjWs);
      const htDiff=Math.abs((c.ht||0)-(p.htIn||0));
      const rawDist=Math.sqrt(htDiff*htDiff + wtDiff*0.5*wtDiff*0.5 + wsDiff*1.5*wsDiff*1.5);
      const maxDist=25;
      const sim=Math.max(0,Math.round((1-rawDist/maxDist)*100));
      return {...c,sim,rawDist};
    }).sort((a,b)=>b.sim-a.sim);
  },[p,wsAdj,wtAdj]);

  const fStat=nbaOnly?(p.statComps||[]).filter(c=>c.nba):(p.statComps||[]);
  const fAnth=nbaOnly?dynamicAnthro.filter(c=>c.nba):dynamicAnthro;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={()=>setNbaOnly(!nbaOnly)} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{background:nbaOnly?"#f97316":"#1f2937",color:nbaOnly?"#000":"#9ca3af"}}>
          {nbaOnly?"★ NBA Only":"All Players"}
        </button>
      </div>
      <Sec icon="📊" title="Statistical Comps" sub="Similarity based on era-adjusted percentiles. Colors = absolute strength/weakness.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead><tr>
            {["Name","Pos","Sim","BPM","USG","TS%","AST%","BLK%","Tier"].map(h=><th key={h} className="text-left px-2 py-1.5 text-xs uppercase" style={{color:"#6b7280",borderBottom:"1px solid #1f2937"}}>{h}</th>)}
          </tr></thead><tbody>
            <tr style={{background:"#f9731611"}}>
              <td className="px-2 py-2 font-bold" style={{color:"#f97316"}}>{p.nbaName||"Selected"}</td>
              <td className="px-2" style={{color:"#9ca3af"}}>{p.pos}</td><td className="px-2" style={{color:"#f97316"}}>—</td>
              <td className="px-2 font-semibold" style={{color:valColor(p.pctl.bpm)}}>{fmt(p.bpm)}</td>
              <td className="px-2 font-semibold" style={{color:valColor(p.pctl.usg)}}>{fmt(p.usg)}</td>
              <td className="px-2 font-semibold" style={{color:valColor(p.pctl.ts)}}>{fmt(p.ts)}</td>
              <td className="px-2 font-semibold" style={{color:valColor(p.pctl.ast)}}>{fmt(p.astP)}</td>
              <td className="px-2 font-semibold" style={{color:valColor(p.pctl.blk)}}>{fmt(p.blkP)}</td>
              <td className="px-2">{p.actual?<TierBadge tier={p.actual}/>:"—"}</td>
            </tr>
            {fStat.map((c,i)=>(
              <tr key={i} className="hover:bg-white hover:bg-opacity-5" style={{borderBottom:"1px solid #1f293744"}}>
                <td className="px-2 py-2 font-semibold" style={{color:"#e5e7eb"}}>{c.name}</td>
                <td className="px-2" style={{color:"#6b7280"}}>{c.pos}</td>
                <td className="px-2 font-bold" style={{color:"#f97316"}}>{c.sim}%</td>
                <td className="px-2" style={{color:valColor(c.bpm>10?90:c.bpm>5?65:35)}}>{fmt(c.bpm)}</td>
                <td className="px-2" style={{color:valColor(c.usg>27?80:c.usg>22?55:30)}}>{fmt(c.usg)}</td>
                <td className="px-2" style={{color:valColor(c.ts>58?80:c.ts>53?55:30)}}>{fmt(c.ts)}</td>
                <td className="px-2" style={{color:valColor(c.astP>20?80:c.astP>12?55:30)}}>{fmt(c.astP)}</td>
                <td className="px-2" style={{color:valColor(c.blkP>5?80:c.blkP>2?55:30)}}>{fmt(c.blkP)}</td>
                <td className="px-2"><TierBadge tier={c.tier}/></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </Sec>
      <Sec icon="📏" title="Anthropometric Comps" sub="Physical similarity. Adjust sliders to project weight gain/wingspan if unknown.">
        {(p.comb||(p.anthroComps||[]).length>0) ? <>
          <div className="flex gap-6 mb-4 p-3 rounded-lg" style={{background:"#0d1117"}}>
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1"><span style={{color:"#9ca3af"}}>Weight Adjust</span><span style={{color:"#f97316"}}>{wtAdj>0?"+":""}{wtAdj} lbs</span></div>
              <input type="range" min={-20} max={20} value={wtAdj} onChange={e=>setWtAdj(+e.target.value)} className="w-full" style={{accentColor:"#f97316"}}/>
            </div>
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1"><span style={{color:"#9ca3af"}}>Wingspan Adjust</span><span style={{color:"#f97316"}}>{wsAdj>0?"+":""}{wsAdj}"</span></div>
              <input type="range" min={-4} max={4} step={0.25} value={wsAdj} onChange={e=>setWsAdj(+e.target.value)} className="w-full" style={{accentColor:"#f97316"}}/>
            </div>
          </div>
          <div className="space-y-2">
            {fAnth.map((c,i)=>(
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={{background:"#0d1117"}}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{background:"#1f2937",color:"#9ca3af"}}>{i+1}</div>
                <div className="flex-1"><div className="font-semibold text-sm" style={{color:"#e5e7eb"}}>{c.name}</div><div className="text-xs" style={{color:"#6b7280"}}>{c.ht}" · {c.wt} lbs · WS {c.ws}"</div></div>
                <div className="text-sm font-bold" style={{color:"#3b82f6"}}>{c.sim}%</div>
                {c.tier&&<TierBadge tier={c.tier}/>}
              </div>
            ))}
          </div>
          {(wsAdj!==0||wtAdj!==0)&&<div className="mt-2 text-xs" style={{color:"#6b7280"}}>Adjusted base: {(p.comb?.wgt||p.wt)+wtAdj} lbs, WS {((p.comb?.ws||0)+wsAdj).toFixed(1)}"</div>}
        </> : <div className="text-center py-6" style={{color:"#6b7280"}}>No combine data available.</div>}
      </Sec>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: PROJECTION
// ═══════════════════════════════════════════════════════════
function ProjectionTab({p}) {
  const tierOrder=["Superstar","All-Star","Starter","Role Player","Replacement","Negative","Never NBA"];
  const tierData=tierOrder.map(t=>({name:t.replace("Never NBA","Never\nNBA"),pct:p.tiers[t]||0,fill:TC[t]||"#374151"}));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[["Chance of NBA Career",`${p.pNba!=null?((p.pNba*100).toFixed(0))+"%":"—"}`,p.pNba!=null?"#f97316":"#6b7280"],["μ Peak PIE",p.mu!=null?p.mu.toFixed(3):"—","#e5e7eb"],["σ",p.sigma!=null?`± ${p.sigma.toFixed(3)}`:"—","#6b7280"]].map(([l,v,c])=>(
          <div key={l} className="rounded-xl p-5 text-center" style={{background:"#111827"}}>
            <div className="text-xs uppercase tracking-wider mb-1" style={{color:"#6b7280"}}>{l}</div>
            <div className="text-3xl font-bold" style={{color:c,fontFamily:"'Oswald',sans-serif"}}>{v}</div>
          </div>
        ))}
      </div>
      <Sec icon="◆" title="Projected Outcome" sub="Monte Carlo (20k samples) — tier probability distribution">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={tierData} margin={{top:5,right:5,bottom:5,left:5}}>
            <XAxis dataKey="name" tick={{fill:"#9ca3af",fontSize:11}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:"#6b7280",fontSize:11}} axisLine={false} tickLine={false} domain={[0,50]} tickFormatter={v=>`${v}%`}/>
            <RTooltip contentStyle={{background:"#1f2937",border:"1px solid #374151",borderRadius:8,color:"#e5e7eb"}} formatter={v=>[`${v}%`,"Probability"]}/>
            <Bar dataKey="pct" radius={[6,6,0,0]}>{tierData.map((e,i)=><Cell key={i} fill={e.fill}/>)}</Bar>
          </BarChart>
        </ResponsiveContainer>
        {p.actual&&<div className="mt-3 flex items-center gap-3 p-3 rounded-lg" style={{background:"#0c1222",border:"1px solid #1e3a5f"}}>
          <span className="text-xs" style={{color:"#6b7280"}}>Actual:</span><TierBadge tier={p.actual}/><span className="text-sm" style={{color:"#9ca3af"}}>Peak PIE: {p.peakPie?.toFixed(3)}</span>
        </div>}
      </Sec>
      <Sec icon="📈" title="Season-by-Season" sub="▲▼ shows change from previous season">
        {(p.seasonLines||[]).length>1?(
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
            {["Year","Cls","GP","MIN","PTS","REB","AST","STL","BLK","BPM","TS%","USG"].map(h=><th key={h} className="px-2 py-1 text-xs uppercase text-left" style={{color:"#6b7280",borderBottom:"1px solid #1f2937"}}>{h}</th>)}
          </tr></thead><tbody>
            {(p.seasonLines||[]).map((s,i)=>{
              const prev=i>0?(p.seasonLines||[])[i-1]:null;
              const D=(cur,prv,inv)=>{if(!prev)return null;const d=cur-prv;const c=inv?(d<0?"#22c55e":d>0?"#ef4444":"#6b7280"):(d>0?"#22c55e":d<0?"#ef4444":"#6b7280");return<span className="text-xs ml-1" style={{color:c}}>{d>0?"▲":"▼"}{Math.abs(d).toFixed(1)}</span>;};
              return(<tr key={i} style={{borderBottom:"1px solid #1f293744"}}>
                <td className="px-2 py-2 font-semibold" style={{color:"#e5e7eb"}}>{s.yr}</td><td className="px-2" style={{color:"#9ca3af"}}>{s.cls}</td>
                <td className="px-2">{s.gp}</td><td className="px-2">{s.min}</td>
                <td className="px-2">{s.pts}{D(s.pts,prev?.pts)}</td><td className="px-2">{s.reb}{D(s.reb,prev?.reb)}</td>
                <td className="px-2">{s.ast}{D(s.ast,prev?.ast)}</td><td className="px-2">{s.stl}{D(s.stl,prev?.stl)}</td>
                <td className="px-2">{s.blk}{D(s.blk,prev?.blk)}</td>
                <td className="px-2 font-semibold" style={{color:valColor(s.bpm>10?85:s.bpm>5?60:30)}}>{s.bpm}{D(s.bpm,prev?.bpm)}</td>
                <td className="px-2" style={{color:valColor(s.ts>58?80:s.ts>53?55:30)}}>{s.ts}{D(s.ts,prev?.ts)}</td>
                <td className="px-2">{s.usg}{D(s.usg,prev?.usg)}</td>
              </tr>);
            })}
          </tbody></table></div>
        ):<div className="text-center py-6" style={{color:"#9ca3af"}}>One-and-done — no multi-season trajectory.</div>}
      </Sec>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: SCOUTING
// ═══════════════════════════════════════════════════════════
function ScoutingTab({p}) {
  const roleOff=[["Playmaker",p.roles.playmaker],["Scorer",p.roles.scorer],["Spacer",p.roles.spacer],["Driver",p.roles.driver],["Crasher",p.roles.crasher]];
  const roleDef=[["On-Ball D",p.roles.onball],["Rim Protect",p.roles.rimProt],["Rebounder",p.roles.rebounder],["Switch Pot.",p.roles.switchPot]];
  return (
    <div className="space-y-5">
      <Sec icon="⭐" title="Scouting Scores" sub="Hover any score for formula, inputs, and methodology ⓘ">
        <ScoreGauge label="Overall" value={p.overall} color="#f97316" methodKey="overall" p={p}/>
        <ScoreGauge label="Feel / IQ" value={p.feel} color="#fbbf24" methodKey="feel" p={p}/>
        <ScoreGauge label="Func. Athleticism" value={p.funcAth} color="#ef4444" methodKey="funcAth" p={p}/>
        <ScoreGauge label="Shooting" value={p.shootScore} color="#3b82f6" methodKey="shootScore" p={p}/>
        <ScoreGauge label="Defense" value={p.defScore} color="#10b981" methodKey="defScore" p={p}/>
      </Sec>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Sec icon="⚔️" title="Offensive Roles">{roleOff.sort((a,b)=>b[1]-a[1]).map(([r,v])=><ScoreGauge key={r} label={r} value={v} color="#f97316"/>)}</Sec>
        <Sec icon="🛡" title="Defensive Roles">{roleDef.sort((a,b)=>b[1]-a[1]).map(([r,v])=><ScoreGauge key={r} label={r} value={v} color="#3b82f6"/>)}</Sec>
      </div>
      <Sec icon="🎯" title="Margin of Error" sub="Hover for formula ⓘ">
        <div className="grid grid-cols-3 gap-4 mb-4">
          <Tip wide content={<div><div className="font-bold mb-1" style={{color:"#22c55e"}}>{METHODS.floor.name}</div><code className="text-xs" style={{color:"#7dd3fc"}}>{METHODS.floor.formula}</code><div className="mt-1">{METHODS.floor.inputs(p)}</div><div className="mt-1" style={{color:"#cbd5e1"}}>{METHODS.floor.desc}</div></div>}>
            <div className="rounded-lg p-4 text-center cursor-help" style={{background:"#0d1117"}}>
              <div className="text-xs uppercase" style={{color:"#6b7280"}}>Floor <span style={{color:"#475569"}}>ⓘ</span></div>
              <div className="text-3xl font-bold" style={{color:"#22c55e",fontFamily:"'Oswald',sans-serif"}}>{Math.round(p.floor)}</div>
            </div>
          </Tip>
          <Tip wide content={<div><div className="font-bold mb-1" style={{color:"#fbbf24"}}>{METHODS.ceiling.name}</div><code className="text-xs" style={{color:"#7dd3fc"}}>{METHODS.ceiling.formula}</code><div className="mt-1">{METHODS.ceiling.inputs(p)}</div><div className="mt-1" style={{color:"#cbd5e1"}}>{METHODS.ceiling.desc}</div></div>}>
            <div className="rounded-lg p-4 text-center cursor-help" style={{background:"#0d1117"}}>
              <div className="text-xs uppercase" style={{color:"#6b7280"}}>Ceiling <span style={{color:"#475569"}}>ⓘ</span></div>
              <div className="text-3xl font-bold" style={{color:"#fbbf24",fontFamily:"'Oswald',sans-serif"}}>{Math.round(p.ceiling)}</div>
            </div>
          </Tip>
          <div className="rounded-lg p-4 text-center" style={{background:"#0d1117"}}>
            <div className="text-xs uppercase" style={{color:"#6b7280"}}>Risk Profile</div>
            <div className="text-sm font-bold mt-1" style={{color:p.risk.includes("Low")?"#22c55e":p.risk.includes("High Risk")?"#ef4444":"#fbbf24"}}>{p.risk}</div>
          </div>
        </div>
      </Sec>
      <Sec icon="🏅" title="Skill Badges" sub="Hover badges for qualification criteria">
        <div className="flex flex-wrap gap-2 mb-4">
          {(p.badges||[]).map((b,i)=><BadgeChip key={i} text={b} color="#22c55e"/>)}
          {(p.badges||[]).length===0&&<span className="text-sm" style={{color:"#6b7280"}}>No badges earned</span>}
        </div>
        {(p.redFlags||[]).length>0&&<><div className="text-xs uppercase tracking-wider mb-2 mt-4" style={{color:"#ef4444"}}>⚠️ Red Flags</div>
          <div className="flex flex-wrap gap-2">{(p.redFlags||[]).map((f,i)=><BadgeChip key={i} text={f} color="#ef4444"/>)}</div>
        </>}
      </Sec>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: METHODOLOGY
// ═══════════════════════════════════════════════════════════
function MethodologyTab() {
  const sections = [
    {cat:"Scouting Scores",items:["feel","funcAth","shootScore","defScore","overall"]},
    {cat:"Margin of Error",items:["floor","ceiling"]},
    {cat:"Shooting Projection",items:["projNba3p","projNba3pa","projNba3par","projNbaTs","selfCreation"]},
    {cat:"Four Factors",items:["fourFactors"]},
    {cat:"Position Classification",items:["posClassification"]},
  ];
  return (
    <div className="space-y-6">
      <Sec icon="📖" title="Methodology" sub="Complete documentation of all computed metrics, formulas, and their inputs.">
        <div className="text-sm mb-4" style={{color:"#9ca3af"}}>
          All scores are computed as position-aware era-adjusted percentiles (0-100 scale) unless otherwise noted. Data from Barttorvik (college stats), NBA API (career outcomes), and NBA Draft Combine.
        </div>
      </Sec>
      {sections.map(({cat,items})=>(
        <Sec key={cat} icon="▸" title={cat}>
          <div className="space-y-5">
            {items.map(key=>{
              const m=METHODS[key]; if(!m)return null;
              return (
                <div key={key} className="p-4 rounded-lg" style={{background:"#0d1117",border:"1px solid #1f2937"}}>
                  <div className="font-bold text-sm mb-2" style={{color:"#f97316"}}>{m.name}</div>
                  <div className="mb-2">
                    <span className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Formula</span>
                    <div className="mt-1 px-3 py-2 rounded text-xs font-mono" style={{background:"#111827",color:"#7dd3fc"}}>{m.formula}</div>
                  </div>
                  <div className="text-sm" style={{color:"#cbd5e1"}}>{m.desc}</div>
                </div>
              );
            })}
          </div>
        </Sec>
      ))}
      <Sec icon="🏅" title="Badge Definitions">
        <div className="space-y-3">
          {Object.entries(BADGE_DEFS).map(([name,def])=>(
            <div key={name} className="flex gap-3 items-start p-3 rounded-lg" style={{background:"#0d1117"}}>
              <BadgeChip text={name} color={def.rule.includes("Wing")||def.rule.includes("Big with")||def.rule.includes("PG with")||def.rule.includes("FT%<")||def.rule.includes("Height<")?"#ef4444":"#22c55e"}/>
              <div className="flex-1">
                <div className="text-xs mb-1" style={{color:"#94a3b8"}}>Rule: {def.rule}</div>
                <div className="text-sm" style={{color:"#cbd5e1"}}>{def.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Sec>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// BIG BOARD LANDING PAGE
// ═══════════════════════════════════════════════════════════
function BigBoardView({onSelect}) {
  const [sortBy,setSortBy]=useState("ceiling");
  const [posFilter,setPosFilter]=useState("All");
  const [yearFilter,setYearFilter]=useState("All");

  // Fetch board for a specific year
  const fetchBoard = (year) => {
    setLoading(true);
    const url = year && year!=="All" 
      ? `${API_BASE}/board?n=500&year=${year}`
      : `${API_BASE}/board?n=500`;
    fetch(url)
      .then(r=>r.json())
      .then(d=>{
        const players = d.players||[];
        setBoardData(players);
        PLAYERS={};PLAYER_LIST=[];
        players.forEach(pl=>{
          const mapped = mapProfile(pl);
          PLAYERS[pl.name]=mapped;
          PLAYER_LIST.push(pl.name);
        });
        setLoading(false);
      })
      .catch(e=>{console.error("Board fetch failed:",e);setLoading(false);});
  };

  // Handle year change — re-fetch from API
  const handleYearChange = (newYear) => {
    setYearFilter(newYear);
    fetchBoard(newYear);
  };

  const allPlayers = useMemo(()=>{
    return PLAYER_LIST.map(n=>{
      const p=PLAYERS[n];
      return {name:n,...p};
    });
  },[boardData]); // re-compute when boardData changes

  const filtered = useMemo(()=>{
    let list = allPlayers;
    if(posFilter!=="All") list = list.filter(p=>p.pos===posFilter);
    // Year filtering is now done server-side via API
    list = list.filter(p=>p.confidence!=="very_low");
    // Sort
    const sortFn = {
      ceiling: (a,b)=>(b.ceiling||0)-(a.ceiling||0),
      overall: (a,b)=>(b.overall||0)-(a.overall||0),
      mu: (a,b)=>(b.mu||0)-(a.mu||0),
      pNba: (a,b)=>(b.pNba||0)-(a.pNba||0),
      floor: (a,b)=>(b.floor||0)-(a.floor||0),
      bpm: (a,b)=>(b.bpm||0)-(a.bpm||0),
    };
    list = [...list].sort(sortFn[sortBy]||sortFn.ceiling);
    return list.slice(0,60);
  },[allPlayers,sortBy,posFilter]);

  const posColors = {Playmaker:"#3b82f6",Wing:"#f97316",Big:"#8b5cf6"};

  return (
    <div className="space-y-5">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold tracking-tight" style={{fontFamily:"'Oswald',sans-serif",color:"#f97316"}}>
          BIG BOARD
        </h2>
        <p className="text-sm mt-1" style={{color:"#6b7280"}}>
          Top 60 prospects ranked by statistical projection model
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl" style={{background:"#111827",border:"1px solid #1f2937"}}>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Sort:</span>
          {[["ceiling","Ceiling"],["overall","Overall"],["mu","Peak PIE"],["pNba","NBA Prob"],["floor","Floor"],["bpm","BPM"]].map(([k,l])=>(
            <button key={k} onClick={()=>setSortBy(k)} className="px-3 py-1 rounded-lg text-xs font-semibold"
              style={{background:sortBy===k?"#f97316":"#1f2937",color:sortBy===k?"#000":"#9ca3af",border:`1px solid ${sortBy===k?"#f97316":"#374151"}`}}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Pos:</span>
          {["All","Playmaker","Wing","Big"].map(pos=>(
            <button key={pos} onClick={()=>setPosFilter(pos)} className="px-3 py-1 rounded-lg text-xs font-semibold"
              style={{background:posFilter===pos?(posColors[pos]||"#f97316"):"#1f2937",
                color:posFilter===pos?"#000":"#9ca3af",border:`1px solid ${posFilter===pos?(posColors[pos]||"#f97316"):"#374151"}`}}>
              {pos}
            </button>
          ))}
        </div>
        {availableYears.length>2 && <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Year:</span>
          <select value={yearFilter} onChange={e=>handleYearChange(e.target.value)}
            className="px-3 py-1 rounded-lg text-xs font-semibold outline-none"
            style={{background:"#1f2937",color:"#e5e7eb",border:"1px solid #374151"}}>
            {availableYears.map(y=><option key={y} value={y}>{y==="All"?"All Years":y}</option>)}
          </select>
        </div>}
      </div>

      {/* Board Table */}
      <div className="rounded-xl overflow-hidden" style={{background:"#111827",border:"1px solid #1f2937"}}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{background:"#0c1222"}}>
                {["#","Player","Pos","Team","Age","Ceiling","Floor","Overall","Peak PIE","NBA%","Risk"].map(h=>(
                  <th key={h} className="px-3 py-3 text-xs uppercase tracking-wider text-left font-semibold" style={{color:"#6b7280",borderBottom:"2px solid #f9731633"}}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((pl,idx)=>{
                const rank=idx+1;
                const riskColor = pl.risk?.includes("Low")?"#22c55e":pl.risk?.includes("High")&&pl.risk?.includes("Upside")?"#fbbf24":pl.risk?.includes("High")?"#ef4444":"#6b7280";
                return (
                  <tr key={pl.name} className="cursor-pointer hover:bg-white hover:bg-opacity-5 transition-colors"
                    onClick={()=>onSelect(pl.name)}
                    style={{borderBottom:"1px solid #1f293744"}}>
                    <td className="px-3 py-2.5 font-bold" style={{color:rank<=10?"#f97316":rank<=30?"#e5e7eb":"#9ca3af",fontFamily:"'Oswald',sans-serif",fontSize:rank<=3?"1.1rem":"0.875rem"}}>
                      {rank}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold" style={{color:"#e5e7eb"}}>{pl.name}</div>
                      {pl.recRank && <div className="text-xs" style={{color:"#6b7280"}}>#{pl.recRank} Recruit</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{background:(posColors[pl.pos]||"#6b7280")+"22",color:posColors[pl.pos]||"#6b7280"}}>
                        {pl.pos}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs" style={{color:"#9ca3af"}}>{pl.team}</td>
                    <td className="px-3 py-2.5" style={{color:"#e5e7eb"}}>{pl.age?.toFixed(1)}</td>
                    <td className="px-3 py-2.5 font-bold" style={{color:valColor(pl.ceiling),fontFamily:"'Oswald',sans-serif"}}>{pl.ceiling!=null?Math.round(pl.ceiling):"—"}</td>
                    <td className="px-3 py-2.5 font-bold" style={{color:valColor(pl.floor),fontFamily:"'Oswald',sans-serif"}}>{pl.floor!=null?Math.round(pl.floor):"—"}</td>
                    <td className="px-3 py-2.5 font-bold" style={{color:valColor(pl.overall),fontFamily:"'Oswald',sans-serif"}}>{pl.overall!=null?Math.round(pl.overall):"—"}</td>
                    <td className="px-3 py-2.5" style={{color:"#e5e7eb"}}>{pl.mu?.toFixed(3)||"—"}</td>
                    <td className="px-3 py-2.5" style={{color:pl.pNba>0.7?"#22c55e":pl.pNba>0.4?"#fbbf24":"#ef4444"}}>{pl.pNba?(pl.pNba*100).toFixed(0)+"%":"—"}</td>
                    <td className="px-3 py-2.5 text-xs" style={{color:riskColor}}>
                      {pl.risk||"—"}
                      {pl.confidence==="limited"&&<span title="Limited sample size" style={{color:"#fbbf24"}}> ⚡</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="p-3 text-center text-xs" style={{color:"#6b7280",borderTop:"1px solid #1f2937"}}>
          Showing top {filtered.length} prospects (≥100 min sample) · ⚡ = limited sample · Click any row for full profile
        </div>
      </div>
    </div>
  );
}

const TABS = [
  {id:"overview",label:"Overview",icon:"▦"},
  {id:"shooting",label:"Shooting",icon:"🏀"},
  {id:"body",label:"Body",icon:"📏"},
  {id:"comps",label:"Comps",icon:"⇄"},
  {id:"projection",label:"Projection",icon:"◆"},
  {id:"scouting",label:"Scouting",icon:"⭐"},
  {id:"methodology",label:"Method",icon:"📖"},
];

export default function App() {
  const [sel,setSel]=useState(null);
  const [tab,setTab]=useState("overview");
  const [search,setSearch]=useState("");
  const [showS,setShowS]=useState(false);
  const [compTier,setCompTier]=useState("Replacement");

  // ── API State ──
  const [boardData,setBoardData]=useState([]);       // BigBoard entries (summary)
  const [profileCache,setProfileCache]=useState({}); // name → full mapped profile
  const [loading,setLoading]=useState(true);
  const [profileLoading,setProfileLoading]=useState(false);
  const [searchResults,setSearchResults]=useState([]);

  // Load fonts
  useEffect(()=>{const l=document.createElement("link");l.href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Barlow:wght@400;500;600;700&display=swap";l.rel="stylesheet";document.head.appendChild(l);},[]);

  const [availableYears,setAvailableYears]=useState(["All"]);

  // Fetch BigBoard on mount — detect latest year, then fetch that year
  useEffect(()=>{
    setLoading(true);
    fetch(`${API_BASE}/years`)
      .then(r=>r.json())
      .then(yearData=>{
        const yrs = yearData.years || [];
        setAvailableYears(["All", ...yrs]);
        const latestYear = yearData.latest || 2025;
        setYearFilter(String(latestYear));
        return fetch(`${API_BASE}/board?n=500&year=${latestYear}`)
          .then(r=>r.json())
          .then(d=>{
            const players = d.players||[];
            setBoardData(players);
            PLAYERS={};PLAYER_LIST=[];
            players.forEach(pl=>{
              const mapped = mapProfile(pl);
              PLAYERS[pl.name]=mapped;
              PLAYER_LIST.push(pl.name);
            });
            setLoading(false);
          });
      })
      .catch(e=>{
        console.error("Board fetch failed:",e);
        setLoading(false);
      });
  },[]);

  // Fetch full profile when player selected
  const selectPlayer = async (name) => {
    setSel(name);setSearch("");setShowS(false);setTab("overview");
    if(profileCache[name]) return; // already cached
    setProfileLoading(true);
    try {
      const [profRes,statsRes,anthroRes] = await Promise.all([
        fetch(`${API_BASE}/player/${encodeURIComponent(name)}`).then(r=>r.ok?r.json():null),
        fetch(`${API_BASE}/comps/stats/${encodeURIComponent(name)}`).then(r=>r.ok?r.json():null).catch(()=>null),
        fetch(`${API_BASE}/comps/anthro/${encodeURIComponent(name)}`).then(r=>r.ok?r.json():null).catch(()=>null),
      ]);
      if(profRes?.profile){
        const mapped = mapProfile(profRes.profile);
        // Attach comps
        if(statsRes?.comps) mapped.statComps = statsRes.comps.map(c=>({
          name:c.name,pos:c.position||c.pos,
          sim: c.similarity!=null ? (c.similarity > 1 ? Math.round(c.similarity) : Math.round(c.similarity*100)) : null,
          tier:c.tier||"",nba:!!c.made_nba,bpm:c.bpm,usg:c.usg,ts:c.ts,
          astP:c.ast_p,blkP:c.blk_p,badges:c.badges?c.badges.split("|").filter(Boolean):[],
        }));
        if(anthroRes?.comps) mapped.anthroComps = anthroRes.comps.map(c=>({
          name:c.name,dist:c.distance,sim:Math.round(c.similarity||0),
          ht:c.height||c.ht,wt:c.weight||c.wt,ws:c.wingspan||c.ws,
          nba:!!c.made_nba,tier:c.tier||"",
        }));
        // Update caches
        PLAYERS[name]=mapped;
        setProfileCache(prev=>({...prev,[name]:mapped}));
      }
    } catch(e){ console.error("Profile fetch failed:",e); }
    setProfileLoading(false);
  };

  // Search: local filter + API fallback
  useEffect(()=>{
    if(!search||search.length<2){setSearchResults([]);return;}
    const local = PLAYER_LIST.filter(n=>n.toLowerCase().includes(search.toLowerCase())).slice(0,15);
    if(local.length>0){setSearchResults(local);return;}
    // API fallback for names not in board
    const t=setTimeout(()=>{
      fetch(`${API_BASE}/players/search?q=${encodeURIComponent(search)}&limit=15`)
        .then(r=>r.json())
        .then(d=>{
          const names=(d.results||[]).map(r=>r.name);
          setSearchResults(names);
          // Add to PLAYER_LIST for future lookups
          names.forEach(n=>{if(!PLAYERS[n]){PLAYER_LIST.push(n);PLAYERS[n]={name:n,pos:"",team:""};}});
        })
        .catch(()=>{});
    },300);
    return ()=>clearTimeout(t);
  },[search]);

  const p = sel ? (profileCache[sel] || PLAYERS[sel] || null) : null;

  return (
    <div className="min-h-screen" style={{background:"#080b12",fontFamily:"'Barlow',sans-serif",color:"#e5e7eb"}}>
      <header className="sticky top-0 z-50 px-4 md:px-8 py-3" style={{background:"rgba(8,11,18,0.92)",backdropFilter:"blur(12px)",borderBottom:"1px solid #1f293744"}}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={()=>{setSel(null);setTab("overview");}}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm" style={{background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#000"}}>PT</div>
            <div><div className="font-bold text-sm tracking-wider" style={{fontFamily:"'Oswald',sans-serif",color:"#f97316"}}>PROSPECT THEORY</div><div className="text-xs" style={{color:"#6b7280"}}>NBA Draft Intelligence</div></div>
          </div>
          <div className="relative">
            <input className="w-48 md:w-72 px-4 py-2 rounded-lg text-sm outline-none" style={{background:"#111827",border:"1px solid #374151",color:"#e5e7eb"}} placeholder="Search players..." value={search}
              onChange={e=>{setSearch(e.target.value);setShowS(true)}} onFocus={()=>setShowS(true)} onBlur={()=>setTimeout(()=>setShowS(false),200)}/>
            {showS&&search&&<div className="absolute top-full mt-1 left-0 right-0 rounded-lg overflow-hidden shadow-2xl z-50" style={{background:"#111827",border:"1px solid #374151",maxHeight:200,overflowY:"auto"}}>
              {searchResults.map(n=><button key={n} className="w-full text-left px-4 py-2.5 text-sm hover:bg-white hover:bg-opacity-5" onMouseDown={()=>selectPlayer(n)} style={{color:"#e5e7eb",borderBottom:"1px solid #1f2937"}}>
                <span className="font-semibold">{n}</span><span className="ml-2 text-xs" style={{color:"#6b7280"}}>{PLAYERS[n]?.pos} · {PLAYERS[n]?.team}</span>
              </button>)}
            </div>}
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6">
        {!sel ? (
          /* ── BIG BOARD LANDING ── */
          loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin mb-4" style={{borderColor:"#f97316",borderTopColor:"transparent"}}/>
              <p className="text-sm" style={{color:"#6b7280"}}>Loading prospects...</p>
            </div>
          ) : (
            <BigBoardView onSelect={selectPlayer}/>
          )
        ) : profileLoading && !p ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin mb-4" style={{borderColor:"#f97316",borderTopColor:"transparent"}}/>
            <p className="text-sm" style={{color:"#6b7280"}}>Loading profile...</p>
          </div>
        ) : !p ? (
          <div className="text-center py-20">
            <p style={{color:"#6b7280"}}>Player not found</p>
            <button onClick={()=>setSel(null)} className="mt-4 px-4 py-2 rounded-lg text-sm" style={{background:"#f97316",color:"#000"}}>Back to Board</button>
          </div>
        ) : (
          /* ── PLAYER PROFILE ── */
          <>
            {/* Back button */}
            <button onClick={()=>setSel(null)} className="mb-4 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:bg-white hover:bg-opacity-5"
              style={{color:"#9ca3af",border:"1px solid #374151"}}>
              <span>←</span> Back to Big Board
            </button>
            {tab!=="methodology" && <>
              <div className="mb-5 rounded-2xl p-5 relative overflow-hidden" style={{background:"linear-gradient(135deg,#111827 0%,#0f172a 50%,#1e1b4b 100%)",border:"1px solid #1f2937"}}>
                <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-5" style={{background:"radial-gradient(circle,#f97316,transparent)",transform:"translate(30%,-30%)"}}/>
                <div className="flex flex-col md:flex-row md:items-center gap-3 relative z-10">
                  <div className="flex-1">
                    <div className="text-xs uppercase tracking-widest mb-1" style={{color:"#6b7280"}}>{p.yr} Draft Class</div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight" style={{fontFamily:"'Oswald',sans-serif"}}>{sel}</h1>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-sm" style={{color:"#9ca3af"}}>
                      <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{background:"#f9731622",color:"#f97316"}}>{p.pos}</span>
                      <span>{p.team}</span><span>·</span><span>{p.ht} · {p.wt?`${p.wt} lbs`:""}</span><span>·</span><span>Age {p.age!=null?Number(p.age).toFixed(1):"—"}</span>
                      {p.recRank&&<><span>·</span><span>#{p.recRank} Recruit</span></>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(p.badges||[]).slice(0,3).map((b,i)=><BadgeChip key={i} text={b}/>)}
                    {(p.redFlags||[]).slice(0,2).map((f,i)=><BadgeChip key={`rf${i}`} text={f} color="#ef4444"/>)}
                  </div>
                </div>
              </div>
            </>}
            {/* Confidence Banner */}
            {p.confidence==="very_low"&&(
              <div className="mb-4 p-3 rounded-lg text-sm" style={{background:"#7f1d1d",border:"1px solid #991b1b",color:"#fca5a5"}}>
                ⚠️ <strong>Insufficient Data</strong> — This player has only {Math.round(p.sample_min||0)} minutes of college play. Scouting scores and role classifications are not available.
              </div>
            )}
            {p.confidence==="limited"&&(
              <div className="mb-4 p-3 rounded-lg text-sm" style={{background:"#78350f",border:"1px solid #92400e",color:"#fcd34d"}}>
                ⚡ <strong>Limited Sample</strong> — Based on {Math.round(p.sample_min||0)} minutes ({p.sample_gp||"?"} games). Scores should be interpreted with caution.
              </div>
            )}
            <div className="flex gap-1 mb-5 overflow-x-auto pb-2" style={{scrollbarWidth:"none"}}>
              {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} className="px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap"
                style={{background:tab===t.id?"#f97316":"transparent",color:tab===t.id?"#000":"#9ca3af"}}>
                <span className="mr-1">{t.icon}</span>{t.label}
              </button>)}
            </div>
            {tab==="overview"&&<OverviewTab p={p} compTier={compTier} setCompTier={setCompTier}/>}
            {tab==="shooting"&&<ShootingTab p={p}/>}
            {tab==="body"&&<BodyTab p={p}/>}
            {tab==="comps"&&<CompsTab p={p}/>}
            {tab==="projection"&&<ProjectionTab p={p}/>}
            {tab==="scouting"&&<ScoutingTab p={p}/>}
            {tab==="methodology"&&<MethodologyTab/>}
          </>
        )}
      </main>
      <footer className="mt-12 py-6 text-center text-xs" style={{color:"#374151",borderTop:"1px solid #111827"}}>
        <span style={{color:"#6b7280"}}>ProspectTheory</span> · NBA Draft Intelligence · Data: Barttorvik, NBA API, Draft Combine
      </footer>
    </div>
  );
}
