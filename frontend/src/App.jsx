import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, Cell, ResponsiveContainer } from "recharts";

// ═══════════════════════════════════════════════════════════
// API LAYER
// ═══════════════════════════════════════════════════════════
const API_BASE = "/api";

async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

function inToHt(inches) {
  if (!inches) return "—";
  const ft = Math.floor(inches / 12);
  const inn = Math.round(inches % 12);
  return `${ft}'${inn}"`;
}

// Transform API profile → frontend format
function transformProfile(name, p) {
  const ht = p.ht || 0;
  const badges = p.badges ? p.badges.split("|").filter(Boolean) : [];
  const redFlags = p.red_flags ? p.red_flags.split("|").filter(Boolean) : [];
  return {
    name,
    team: p.team || "", pos: p.pos || "Wing",
    age: p.age || 20, ht: inToHt(ht), htIn: ht, wt: p.wt || 200,
    ws: p.comb_ws || 0, wsDelta: p.ws_delta || 0,
    cls: p.cls || "", recRank: null, yr: p.yr, conf: p.conf || "", confTier: p.conf_tier || "",
    seasonsPlayed: p.seasons || 1,
    gp: p.gp || 0, min: p.min || 0, mp: Math.round((p.gp || 0) * (p.min || 0)),
    pts: p.pts || 0, reb: p.reb || 0, ast: p.ast || 0,
    stl: p.stl || 0, blk: p.blk || 0, to: p.to || 0, foul: p.pf || 0,
    p36: { pts: p.pts36 || 0, reb: p.reb36 || 0, ast: p.ast36 || 0, stl: p.stl36 || 0, blk: p.blk36 || 0 },
    bpm: p.bpm, obpm: p.obpm, dbpm: p.dbpm, ortg: p.ortg, usg: p.usg,
    astP: p.ast_p, toP: p.to_p, orbP: p.orb_p, drbP: p.drb_p,
    stlP: p.stl_p, blkP: p.blk_p, astTov: p.ast_tov,
    ts: p.ts, fg: p.fg_pct, tp: p.tp_pct, ft: p.ft_pct, efg: p.efg,
    rimF: p.rim_f || 0, rimPct: null, midF: p.mid_f || 0, midPct: null,
    threeF: p.three_f || 0, threePct: p.tp_pct, dunkR: p.dunk_r || 0, ftr: p.ftr || 0,
    rimAst: null, midAst: null, threeAst: null, tpaPerG: null,
    ff: { efg: p.ff_efg, tov: p.ff_tov, orb: p.ff_orb, ftr: p.ff_ftr, comp: p.ff_comp },
    pctl: {
      bpm: p.pctl_bpm, usg: p.pctl_usg, ts: p.pctl_ts,
      ast: p.pctl_ast, to: p.pctl_to, orb: p.pctl_orb, drb: p.pctl_drb,
      stl: p.pctl_stl, blk: p.pctl_blk,
      pts36: p.pctl_pts36, ast36: p.pctl_ast36, reb36: p.pctl_reb36,
    },
    comb: p.comb_hgt ? {
      hgt: p.comb_hgt, wgt: p.comb_wgt, ws: p.comb_ws, sr: p.comb_sr,
      hl: p.comb_hl, hw: p.comb_hw, bf: p.comb_bf,
      sv: p.comb_sv, mv: p.comb_mv, sprint: p.comb_sprint, lane: p.comb_lane,
    } : null,
    traj: { bpm: p.traj_bpm, ts: p.traj_ts, usg: p.traj_usg, comp: p.traj_comp, seasons: p.seasons || 1 },
    feel: p.feel || 0, funcAth: p.func_ath || 0, shootScore: p.shoot_score || 0,
    defScore: p.def_score || 0, overall: p.overall || 0,
    floor: p.floor || 0, ceiling: p.ceiling || 0,
    risk: p.risk || "Medium Risk", safeBet: p.safe_bet || 0,
    selfCreation: p.self_creation || 0,
    projNba3p: p.proj_3p, projNba3pa: null, projNba3par: p.proj_3par, projNbaTs: p.proj_ts,
    roles: {
      playmaker: p.role_playmaker || 0, scorer: p.role_scorer || 0,
      spacer: p.role_spacer || 0, driver: p.role_driver || 0, crasher: p.role_crasher || 0,
      onball: p.role_onball || 0, rimProt: p.role_rim_prot || 0,
      rebounder: p.role_rebounder || 0, switchPot: p.role_switch || 0,
    },
    badges, redFlags,
    mu: p.pred_mu || 0, sigma: p.pred_sigma || 0.03, pNba: p.pred_p_nba || 0,
    tiers: {
      Superstar: p.prob_super || 0, "All-Star": p.prob_allstar || 0,
      Starter: p.prob_starter || 0, "Role Player": p.prob_role || 0,
      Replacement: p.prob_repl || 0, Negative: p.prob_neg || 0,
      "Never NBA": Math.max(0, 100 - (p.prob_super||0) - (p.prob_allstar||0) - (p.prob_starter||0) - (p.prob_role||0) - (p.prob_repl||0) - (p.prob_neg||0)),
    },
    actual: p.tier || "", peakPie: p.peak_pie, nbaName: p.nba_name || "",
    madeNba: p.made_nba || false,
    // Comps loaded separately
    statComps: [], anthroComps: [], seasonLines: [],
  };
}

function transformStatComps(data) {
  return (data.comps || []).map(c => ({
    name: c.name, pos: c.position, sim: Math.round((c.similarity || 0) * 100),
    tier: c.tier || "", nba: c.made_nba || false,
    bpm: c.bpm, usg: c.usg, ts: c.ts, astP: c.ast_p, blkP: c.blk_p,
    badges: c.badges ? c.badges.split("|").filter(Boolean) : [],
  }));
}

function transformAnthroComps(data) {
  return (data.comps || []).map(c => ({
    name: c.n || c.name || "", dist: c.d || c.distance || 0,
    sim: Math.max(0, Math.round((1 - (c.d || 0) / 25) * 100)),
    ht: c.ht, wt: c.wt, ws: c.ws,
    nba: c.nba || c.made_nba || false, tier: c.tier || "",
  }));
}

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════
const TC = { Superstar:"#fbbf24","All-Star":"#f97316",Starter:"#3b82f6","Role Player":"#06b6d4",Replacement:"#8b5cf6",Negative:"#6b7280","Never Made NBA":"#374151" };
const valColor = (pctl) => { if(pctl==null)return"#6b7280";if(pctl>=90)return"#22c55e";if(pctl>=75)return"#86efac";if(pctl>=60)return"#a3e635";if(pctl>=40)return"#fbbf24";if(pctl>=25)return"#f97316";return"#ef4444"; };
const valBg = (pctl) => valColor(pctl)+"18";
const fmt = (v,d=1) => v!=null?Number(v).toFixed(d):"—";

const REPL = {
  Playmaker:{bpm:2.0,usg:20,ts:52,ast_p:22,to_p:16,stl_p:2.0,blk_p:0.5,orb_p:2,drb_p:12,ortg:105},
  Wing:{bpm:1.5,usg:18,ts:53,ast_p:10,to_p:14,stl_p:1.5,blk_p:1.5,orb_p:3,drb_p:15,ortg:106},
  Big:{bpm:2.5,usg:19,ts:55,ast_p:8,to_p:14,stl_p:1.0,blk_p:5.0,orb_p:8,drb_p:18,ortg:108},
};

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
// METHODOLOGY DEFINITIONS
// ═══════════════════════════════════════════════════════════
const METHODS = {
  feel: {
    name: "Feel / IQ Score",
    formula: "AST/TO pctl × 0.30 + Stocks pctl × 0.20 + Foul Discipline pctl × 0.15 + FTR pctl × 0.15 + ORB pctl × 0.10 + TO Control pctl × 0.10 + Usage Bonuses",
    inputs: (p) => `AST/TO: ${fmt(p.astTov)} | Stocks: ${fmt((p.stlP||0)+(p.blkP||0),1)} | TO%: ${fmt(p.toP)} | FTR: ${fmt(p.ftr)} | ORB%: ${fmt(p.orbP)}`,
    desc: "Measures basketball IQ through decision-making proxies. High AST/TO + low fouls + drawing contact = smart player.",
  },
  funcAth: {
    name: "Functional Athleticism",
    formula: "FTR pctl × 0.25 + Dunk Rate pctl × 0.20 + DRB% pctl × 0.15 + Stocks pctl × 0.20 + Rim Freq pctl × 0.20 + Combine Bonus (0-10)",
    inputs: (p) => `FTR: ${fmt(p.ftr)} | Dunk%: ${fmt(p.dunkR)} | DRB%: ${fmt(p.drbP)} | Rim%: ${fmt(p.rimF)} | Stocks: ${fmt((p.stlP||0)+(p.blkP||0),1)}`,
    desc: "Not raw combine athleticism, but how athletic gifts manifest in games.",
  },
  shootScore: {
    name: "Shooting Score",
    formula: "FT% pctl × 0.30 + 3P% pctl × 0.25 + TS% pctl × 0.20 + Mid% pctl × 0.15 + 3P Freq pctl × 0.10 + Volume Bonus",
    inputs: (p) => `FT%: ${fmt(p.ft)} | 3P%: ${fmt(p.tp)} | TS%: ${fmt(p.ts)} | 3PAr: ${fmt(p.threeF)}`,
    desc: "FT% weighted highest — single best predictor of NBA shooting translation (Berger, 2023).",
  },
  defScore: {
    name: "Defensive Impact",
    formula: "DBPM pctl × 0.30 + STL% pctl × W_stl + BLK% pctl × W_blk + DRB% pctl × 0.15 + Foul Disc pctl × 0.10",
    inputs: (p) => `DBPM: ${fmt(p.dbpm)} | STL%: ${fmt(p.stlP)} | BLK%: ${fmt(p.blkP)} | DRB%: ${fmt(p.drbP)} | Pos: ${p.pos}`,
    desc: "Position-weighted: STL% matters more for guards, BLK% for bigs.",
  },
  overall: {
    name: "Overall Production Rating",
    formula: "Age-Adj BPM pctl × 0.30 + Feel × 0.15 + Func Ath × 0.15 + Shooting × 0.20 + Defense × 0.15 + Height/Wingspan Bonus",
    inputs: (p) => `BPM: ${fmt(p.bpm)} | Age: ${fmt(p.age)} | Ht: ${p.ht} | WS Delta: ${p.wsDelta?fmt(p.wsDelta):"N/A"}`,
    desc: "Master composite capturing total prospect value.",
  },
  floor: {
    name: "Floor Score",
    formula: "FT% pctl × 0.35 + DRB% pctl × 0.20 + AST/TO pctl × 0.25 + Height pctl × 0.20",
    inputs: (p) => `FT%: ${fmt(p.ft)} | DRB%: ${fmt(p.drbP)} | AST/TO: ${fmt(p.astTov)} | Height: ${p.ht}`,
    desc: "What keeps a player in the league. High floor = safe pick.",
  },
  ceiling: {
    name: "Ceiling Score",
    formula: "Age-Adj Production pctl × 0.45 + Func Athleticism × 0.30 + Shooting Score × 0.25",
    inputs: (p) => `Func Ath: ${fmt(p.funcAth,0)} | Shoot: ${fmt(p.shootScore,0)}`,
    desc: "Upside potential. Young + productive + athletic + shooting = highest ceiling.",
  },
  selfCreation: {
    name: "Self-Creation Index",
    formula: "(USG / 100) × (1 - AST% / 100) × 200",
    inputs: (p) => `USG: ${fmt(p.usg)} | AST%: ${fmt(p.astP)}`,
    desc: "Proxy for how much scoring comes from self-created opportunities.",
  },
  projNba3p: {
    name: "Projected NBA 3P%",
    formula: "0.35 × college_3P% + 0.25 × FT% + 0.15 × Midrange% + 5.0",
    inputs: (p) => `3P%: ${fmt(p.tp)} | FT%: ${fmt(p.ft)}`,
    desc: "FT% is the strongest single predictor of NBA 3P translation.",
  },
  projNba3pa: {
    name: "Projected NBA 3PA/game",
    formula: "college_3PA/G × 1.2 + FT% Bonus + Era Adjustment",
    inputs: (p) => `FT%: ${fmt(p.ft)} | 3P Freq: ${fmt(p.threeF)}`,
    desc: "Base: college attempts × 1.2 (NBA spacing effect).",
  },
  projNba3par: {
    name: "Projected NBA 3P Attempt Rate",
    formula: "3P_freq × 0.8 + FT% Bonus + 5 (era)",
    inputs: (p) => `3P Freq: ${fmt(p.threeF)} | FT%: ${fmt(p.ft)}`,
    desc: "What % of NBA shots will be threes.",
  },
  projNbaTs: {
    name: "Projected NBA TS%",
    formula: "0.50 × college_TS% + 0.25 × FT% + 0.10 × 3P% + 10.0",
    inputs: (p) => `TS%: ${fmt(p.ts)} | FT%: ${fmt(p.ft)} | 3P%: ${fmt(p.tp)}`,
    desc: "Overall efficiency projection.",
  },
  fourFactors: {
    name: "Four Factors Composite",
    formula: "eFG_norm × 0.40 + (1-TO%)_norm × 0.25 + ORB%_norm × 0.20 + FTR_norm × 0.15",
    inputs: (p) => `eFG%: ${fmt(p.efg)} | TO%: ${fmt(p.toP)} | ORB%: ${fmt(p.orbP)} | FTR: ${fmt(p.ftr)}`,
    desc: "Dean Oliver's Four Factors of basketball success, weighted by empirical importance.",
  },
};

const BADGE_DEFS = {
  "Floor General Spacer": { rule: "3P% > 35 AND AST% > 20", desc: "Can shoot AND run an offense — the modern PG archetype." },
  "Stretch Big": { rule: "Height ≥ 6'8\" AND 3P Freq > 25% AND 3P% > 32%", desc: "Tall player who spaces the floor." },
  "High Feel Athlete": { rule: "Func Athleticism > 70 AND Feel > 70", desc: "Athletic AND smart — rare combo that translates." },
  "3-and-D": { rule: "3P% > 33 AND STL% > 2.0 AND Dunk% > 5", desc: "Can shoot threes and defend multiple positions." },
  "Rim Pressure": { rule: "Rim Freq > 30% AND Dunk% > 10 AND FTR > 35", desc: "Attacks the basket relentlessly. Draws fouls." },
  "Modern Big": { rule: "BLK% > 4.0 AND AST% > 12", desc: "Protects the rim AND creates for others." },
  "Efficient High Usage": { rule: "USG > 28 AND TO% < 15", desc: "Handles massive offensive load without turnovers." },
  "Elite Shooting": { rule: "FT% > 80 AND 3P% > 36", desc: "Top-tier shooting across both lines." },
  "Stocks Machine": { rule: "STL% > 2.5 AND BLK% > 2.5", desc: "Creates turnovers everywhere. Extremely rare." },
  "High TO Wing": { rule: "Wing with TO% > 22", desc: "Wings shouldn't turn it over this much." },
  "Non-Blocking Big": { rule: "Big with BLK% < 2.0", desc: "Bigs without rim protection have lower NBA value." },
  "Poor 3P Shooting PG": { rule: "PG with 3P% < 28 AND 3P Freq > 20%", desc: "Shoots threes but can't make them." },
  "Low Assist Playmaker": { rule: "PG with AST% < 15", desc: "Labeled playmaker but doesn't create for others." },
  "FT Concern": { rule: "FT% < 60 AND USG > 25", desc: "Poor FT shooting on high usage = Hack-a-Player risk." },
  "Undersized": { rule: "Height < 6'2\" AND not a PG", desc: "Size disadvantage outside the point guard position." },
};

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

const ScoreGauge = ({label,value,max=100,color="#f97316",methodKey,p}) => {
  const m = methodKey && METHODS[methodKey];
  const bar = (
    <div className="flex items-center gap-3 py-2" style={{borderBottom:"1px solid #1f293744"}}>
      <div className="w-32 text-sm flex items-center gap-1" style={{color:"#9ca3af"}}>
        {label}{m&&<span className="text-xs" style={{color:"#475569"}}>ⓘ</span>}
      </div>
      <div className="flex-1 h-5 rounded-full overflow-hidden" style={{background:"#1f2937"}}>
        <div className="h-full rounded-full flex items-center justify-end pr-2" style={{width:`${((value||0)/max)*100}%`,background:`linear-gradient(90deg,${color}55,${color})`}}>
          {(value||0)>15&&<span className="text-xs font-bold text-white">{Math.round(value)}</span>}
        </div>
      </div>
      <div className="w-10 text-sm font-bold text-right" style={{color}}>{Math.round(value||0)}</div>
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

// Loading spinner
const Spinner = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{borderColor:"#f97316",borderTopColor:"transparent"}}/>
  </div>
);

// ═══════════════════════════════════════════════════════════
// TAB: OVERVIEW
// ═══════════════════════════════════════════════════════════
function OverviewTab({p}) {
  const repl = REPL[p.pos]||REPL.Wing;
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
          ["Age",(p.age||0).toFixed?p.age.toFixed(1):p.age,"#e5e7eb"],["Seasons",p.seasonsPlayed,"#e5e7eb"],
          ["Conf Tier",p.confTier||"—",p.confTier==="Power"?"#10b981":"#f97316"],
          ["Draft",p.yr||"—","#e5e7eb"],
        ].map(([l,v,c])=>(
          <div key={l} className="rounded-lg p-3" style={{background:"#111827"}}>
            <div className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>{l}</div>
            <div className="font-semibold mt-0.5" style={{color:c,fontFamily:"'Oswald',sans-serif"}}>{v||"—"}</div>
          </div>
        ))}
      </div>
      <Sec icon="▦" title="Box Score" sub={`${p.gp} GP · ${fmt(p.min)} MIN/G · ${p.mp} Total MIN`}>
        <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
          {[["PTS",p.pts,p.pctl.pts36],["REB",p.reb,p.pctl.reb36],["AST",p.ast,p.pctl.ast36],
            ["STL",p.stl,p.pctl.stl],["BLK",p.blk,p.pctl.blk],["TO",p.to,p.pctl.to?100-p.pctl.to:null],["PF",p.foul,null]
          ].map(([l,v,pc])=><StatCell key={l} label={l} val={v} pctl={pc}/>)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" style={{color:"#6b7280"}}>
          <span>Efficiency:</span>
          {[["TS%",p.ts,p.pctl.ts],["FG%",p.fg,null],["3P%",p.tp,null],["FT%",p.ft,null]].map(([l,v,pc])=>(
            <span key={l} className="px-2 py-0.5 rounded" style={{background:valBg(pc),color:pc?valColor(pc):"#e5e7eb"}}>{l} {fmt(v)}</span>
          ))}
        </div>
      </Sec>
      <Sec icon="⚡" title="Advanced" sub="Era-adjusted percentile coloring">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {[["BPM",p.bpm,p.pctl.bpm],["OBPM",p.obpm,null],["DBPM",p.dbpm,null],["ORtg",p.ortg,null],
            ["USG%",p.usg,p.pctl.usg],["TS%",p.ts,p.pctl.ts],["AST%",p.astP,p.pctl.ast],["TO%",p.toP,p.pctl.to],
            ["ORB%",p.orbP,p.pctl.orb],["DRB%",p.drbP,p.pctl.drb],["STL%",p.stlP,p.pctl.stl],["BLK%",p.blkP,p.pctl.blk]
          ].map(([l,v,pc])=><StatCell key={l} label={l} val={v} pctl={pc}/>)}
        </div>
      </Sec>
      <Sec icon="↗" title="Four Factors">
        <Tip wide content={<div><div className="font-bold mb-1" style={{color:"#f97316"}}>{METHODS.fourFactors.name}</div><code className="text-xs" style={{color:"#7dd3fc"}}>{METHODS.fourFactors.formula}</code><div className="mt-1" style={{color:"#cbd5e1"}}>{METHODS.fourFactors.desc}</div></div>}>
          <div className="text-xs mb-4 cursor-help" style={{color:"#6b7280"}}>Dean Oliver's Four Factors ⓘ</div>
        </Tip>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[["eFG%","Shooting efficiency",p.ff.efg,"#fbbf24"],["TO Control","Avoids turnovers",p.ff.tov,"#3b82f6"],
            ["ORB%","Offensive glass",p.ff.orb,"#06b6d4"],["FT Rate","Gets to the line",p.ff.ftr,"#8b5cf6"]
          ].map(([l,d,v,c])=>(
            <div key={l}>
              <div className="text-sm font-semibold mb-1" style={{color:"#e5e7eb"}}>{l}</div>
              <div className="text-xs mb-2" style={{color:"#6b7280"}}>{d}</div>
              <HBar value={v||0} color={c} right={`${v||0}`}/>
            </div>
          ))}
        </div>
        {p.ff.comp!=null&&<div className="mt-3 pt-3 flex items-center justify-between" style={{borderTop:"1px solid #1f2937"}}>
          <span className="text-sm" style={{color:"#6b7280"}}>Composite</span>
          <span className="text-xl font-bold" style={{color:"#f97316",fontFamily:"'Oswald',sans-serif"}}>{p.ff.comp}</span>
        </div>}
      </Sec>
      <Sec icon="📊" title={`vs. NBA Replacement (${p.pos})`} sub="Green = clears the bar">
        <div className="space-y-2">
          {compData.map(({s,v,r,pc})=>{
            const above=(v||0)>=r; const c=above?"#22c55e":"#ef4444"; const pct=r>0?((v||0)/r)*100:100;
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
  const zones=[{z:"@Rim",f:p.rimF,pct:p.rimPct,c:"#ef4444"},{z:"Mid-Range",f:p.midF,pct:p.midPct,c:"#f97316"},
    {z:"3-Point",f:p.threeF,pct:p.threePct,c:"#3b82f6"},{z:"Dunks",f:p.dunkR,pct:null,c:"#10b981"}];
  return (
    <div className="space-y-5">
      <Sec icon="🏀" title="Shot Profile" sub="Zone breakdown: frequency and accuracy">
        <div className="grid grid-cols-4 gap-3 mb-4">
          {zones.map(z=>(
            <div key={z.z} className="rounded-lg p-3 text-center" style={{background:"#0d1117",border:`1px solid ${z.c}33`}}>
              <div className="text-xs uppercase tracking-wider mb-2" style={{color:z.c}}>{z.z}</div>
              <div className="text-2xl font-bold" style={{color:"#e5e7eb",fontFamily:"'Oswald',sans-serif"}}>{z.f||0}%</div>
              <div className="text-xs" style={{color:"#6b7280"}}>of shots</div>
              {z.pct!=null&&<><div className="text-lg font-bold mt-2" style={{color:z.pct>45?"#22c55e":z.pct>35?"#fbbf24":"#ef4444",fontFamily:"'Oswald',sans-serif"}}>{z.pct}%</div><div className="text-xs" style={{color:"#6b7280"}}>accuracy</div></>}
            </div>
          ))}
        </div>
        <div className="flex gap-4 text-xs" style={{color:"#6b7280"}}>
          <span>FT Rate: <span style={{color:"#e5e7eb"}}>{p.ftr||0}%</span></span>
          <Tip content={<div><div className="font-bold mb-1" style={{color:"#f97316"}}>{METHODS.selfCreation.name}</div><code className="text-xs" style={{color:"#7dd3fc"}}>{METHODS.selfCreation.formula}</code><div className="mt-1">{METHODS.selfCreation.inputs(p)}</div></div>}>
            <span>Self-Creation: <span style={{color:"#f97316"}}>{fmt(p.selfCreation,0)}</span> ⓘ</span>
          </Tip>
        </div>
      </Sec>
      <Sec icon="🔮" title="NBA Shooting Projection" sub="Hover each metric for methodology ⓘ">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[["projNba3p","Proj. 3P%",p.projNba3p,p.projNba3p>36?"#22c55e":p.projNba3p>32?"#fbbf24":"#ef4444"],
            ["projNba3par","Proj. 3PAr",p.projNba3par,p.projNba3par>30?"#3b82f6":"#6b7280"],
            ["projNbaTs","Proj. TS%",p.projNbaTs,p.projNbaTs>56?"#22c55e":p.projNbaTs>52?"#fbbf24":"#ef4444"],
          ].map(([key,l,v,c])=>(
            <Tip key={key} wide content={
              <div><div className="font-bold mb-1" style={{color:"#f97316"}}>{METHODS[key]?.name||key}</div>
              <div className="mb-1"><code className="text-xs" style={{color:"#7dd3fc"}}>{METHODS[key]?.formula||""}</code></div>
              <div style={{color:"#cbd5e1"}}>{METHODS[key]?.desc||""}</div></div>
            }>
              <div className="rounded-lg p-4 text-center cursor-help" style={{background:"#0d1117"}}>
                <div className="text-xs uppercase tracking-wider mb-1" style={{color:"#6b7280"}}>{l} ⓘ</div>
                <div className="text-3xl font-bold" style={{color:c||"#6b7280",fontFamily:"'Oswald',sans-serif"}}>{fmt(v)}</div>
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
      <Sec icon="🏃" title="Combine Drills" sub={`vs ${p.pos}s`}>
        <div className="space-y-3">{drills.map(([l,v,u,thresholds])=>{
          const th = thresholds[p.pos]||thresholds.Wing;
          const inv = l.includes("Sprint")||l.includes("Lane");
          let pctl=50;
          if(v!=null){if(inv){pctl=v<=th[2]?90:v<=th[1]?65:v<=th[0]?40:20;}else{pctl=v>=th[2]?90:v>=th[1]?65:v>=th[0]?40:20;}}
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
// TAB: COMPS
// ═══════════════════════════════════════════════════════════
function CompsTab({p}) {
  const [nbaOnly,setNbaOnly]=useState(false);
  const [wsAdj,setWsAdj]=useState(0);
  const [wtAdj,setWtAdj]=useState(0);

  const dynamicAnthro = useMemo(()=>{
    if(!p.anthroComps.length)return[];
    const baseWt=p.comb?.wgt||p.wt;
    const baseWs=p.comb?.ws||0;
    const adjWt=baseWt+wtAdj;
    const adjWs=baseWs+wsAdj;
    return p.anthroComps.map(c=>{
      const wtDiff=Math.abs((c.wt||0)-adjWt);
      const wsDiff=Math.abs((c.ws||0)-adjWs);
      const htDiff=Math.abs((c.ht||0)-(p.htIn||0));
      const rawDist=Math.sqrt(htDiff*htDiff + wtDiff*0.5*wtDiff*0.5 + wsDiff*1.5*wsDiff*1.5);
      const sim=Math.max(0,Math.round((1-rawDist/25)*100));
      return {...c,sim,rawDist};
    }).sort((a,b)=>b.sim-a.sim);
  },[p,wsAdj,wtAdj]);

  const fStat=nbaOnly?p.statComps.filter(c=>c.nba):p.statComps;
  const fAnth=nbaOnly?dynamicAnthro.filter(c=>c.nba):dynamicAnthro;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={()=>setNbaOnly(!nbaOnly)} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{background:nbaOnly?"#f97316":"#1f2937",color:nbaOnly?"#000":"#9ca3af"}}>
          {nbaOnly?"★ NBA Only":"All Players"}
        </button>
      </div>
      <Sec icon="📊" title="Statistical Comps" sub="Colors = absolute strength/weakness">
        {fStat.length>0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead><tr>
            {["Name","Pos","Sim","BPM","USG","TS%","AST%","BLK%","Tier"].map(h=><th key={h} className="text-left px-2 py-1.5 text-xs uppercase" style={{color:"#6b7280",borderBottom:"1px solid #1f2937"}}>{h}</th>)}
          </tr></thead><tbody>
            <tr style={{background:"#f9731611"}}>
              <td className="px-2 py-2 font-bold" style={{color:"#f97316"}}>{p.name}</td>
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
        ) : <div className="text-center py-6" style={{color:"#6b7280"}}>No statistical comps available.</div>}
      </Sec>
      <Sec icon="📏" title="Anthropometric Comps" sub="Adjust sliders to project weight/wingspan">
        {fAnth.length>0 ? <>
          <div className="flex gap-6 mb-4 p-3 rounded-lg" style={{background:"#0d1117"}}>
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1"><span style={{color:"#9ca3af"}}>Weight Adjust</span><span style={{color:"#f97316"}}>{wtAdj>0?"+":""}{wtAdj} lbs</span></div>
              <input type="range" min={-20} max={20} value={wtAdj} onChange={e=>setWtAdj(+e.target.value)} className="w-full"/>
            </div>
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1"><span style={{color:"#9ca3af"}}>Wingspan Adjust</span><span style={{color:"#f97316"}}>{wsAdj>0?"+":""}{wsAdj}"</span></div>
              <input type="range" min={-4} max={4} step={0.25} value={wsAdj} onChange={e=>setWsAdj(+e.target.value)} className="w-full"/>
            </div>
          </div>
          <div className="space-y-2">
            {fAnth.map((c,i)=>(
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={{background:"#0d1117"}}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{background:"#1f2937",color:"#9ca3af"}}>{i+1}</div>
                <div className="flex-1"><div className="font-semibold text-sm" style={{color:"#e5e7eb"}}>{c.name}</div><div className="text-xs" style={{color:"#6b7280"}}>{c.ht}" · {c.wt} lbs{c.ws?` · WS ${c.ws}"`:""}</div></div>
                <div className="text-sm font-bold" style={{color:"#3b82f6"}}>{c.sim}%</div>
                {c.tier&&<TierBadge tier={c.tier}/>}
              </div>
            ))}
          </div>
        </> : <div className="text-center py-6" style={{color:"#6b7280"}}>No combine data — no anthropometric comps.</div>}
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
        {[["P(NBA)",`${((p.pNba||0)*100).toFixed(0)}%`,"#f97316"],["μ Peak PIE",(p.mu||0).toFixed(3),"#e5e7eb"],["σ",`± ${(p.sigma||0).toFixed(3)}`,"#6b7280"]].map(([l,v,c])=>(
          <div key={l} className="rounded-xl p-5 text-center" style={{background:"#111827"}}>
            <div className="text-xs uppercase tracking-wider mb-1" style={{color:"#6b7280"}}>{l}</div>
            <div className="text-3xl font-bold" style={{color:c,fontFamily:"'Oswald',sans-serif"}}>{v}</div>
          </div>
        ))}
      </div>
      <Sec icon="◆" title="Projected Outcome" sub="Tier probability distribution">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={tierData} margin={{top:5,right:5,bottom:5,left:5}}>
            <XAxis dataKey="name" tick={{fill:"#9ca3af",fontSize:11}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:"#6b7280",fontSize:11}} axisLine={false} tickLine={false} domain={[0,50]} tickFormatter={v=>`${v}%`}/>
            <RTooltip contentStyle={{background:"#1f2937",border:"1px solid #374151",borderRadius:8,color:"#e5e7eb"}} formatter={v=>[`${v}%`,"Probability"]}/>
            <Bar dataKey="pct" radius={[6,6,0,0]}>{tierData.map((e,i)=><Cell key={i} fill={e.fill}/>)}</Bar>
          </BarChart>
        </ResponsiveContainer>
        {p.actual&&p.actual!=="Never Made NBA"&&<div className="mt-3 flex items-center gap-3 p-3 rounded-lg" style={{background:"#0c1222",border:"1px solid #1e3a5f"}}>
          <span className="text-xs" style={{color:"#6b7280"}}>Actual:</span><TierBadge tier={p.actual}/>{p.peakPie&&<span className="text-sm" style={{color:"#9ca3af"}}>Peak PIE: {p.peakPie?.toFixed(3)}</span>}
        </div>}
      </Sec>
      <Sec icon="📈" title="Development Trajectory">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[["BPM Slope",p.traj.bpm],["TS Slope",p.traj.ts],["USG Slope",p.traj.usg],["Composite",p.traj.comp]].map(([l,v])=>(
            <div key={l} className="rounded-lg p-3 text-center" style={{background:"#0d1117"}}>
              <div className="text-xs" style={{color:"#6b7280"}}>{l}</div>
              <div className="text-lg font-bold" style={{color:v>0?"#22c55e":v<0?"#ef4444":"#6b7280",fontFamily:"'Oswald',sans-serif"}}>{v!=null?`${v>0?"+":""}${fmt(v)}`:"—"}</div>
            </div>
          ))}
        </div>
        {p.seasonsPlayed<=1&&<div className="text-center py-3 text-xs" style={{color:"#6b7280"}}>One-and-done — limited trajectory data.</div>}
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
      <Sec icon="⭐" title="Scouting Scores" sub="Hover any score for methodology ⓘ">
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
          <Tip wide content={<div><div className="font-bold mb-1" style={{color:"#22c55e"}}>{METHODS.floor.name}</div><code className="text-xs" style={{color:"#7dd3fc"}}>{METHODS.floor.formula}</code><div className="mt-1" style={{color:"#cbd5e1"}}>{METHODS.floor.desc}</div></div>}>
            <div className="rounded-lg p-4 text-center cursor-help" style={{background:"#0d1117"}}>
              <div className="text-xs uppercase" style={{color:"#6b7280"}}>Floor ⓘ</div>
              <div className="text-3xl font-bold" style={{color:"#22c55e",fontFamily:"'Oswald',sans-serif"}}>{Math.round(p.floor)}</div>
            </div>
          </Tip>
          <Tip wide content={<div><div className="font-bold mb-1" style={{color:"#fbbf24"}}>{METHODS.ceiling.name}</div><code className="text-xs" style={{color:"#7dd3fc"}}>{METHODS.ceiling.formula}</code><div className="mt-1" style={{color:"#cbd5e1"}}>{METHODS.ceiling.desc}</div></div>}>
            <div className="rounded-lg p-4 text-center cursor-help" style={{background:"#0d1117"}}>
              <div className="text-xs uppercase" style={{color:"#6b7280"}}>Ceiling ⓘ</div>
              <div className="text-3xl font-bold" style={{color:"#fbbf24",fontFamily:"'Oswald',sans-serif"}}>{Math.round(p.ceiling)}</div>
            </div>
          </Tip>
          <div className="rounded-lg p-4 text-center" style={{background:"#0d1117"}}>
            <div className="text-xs uppercase" style={{color:"#6b7280"}}>Risk Profile</div>
            <div className="text-sm font-bold mt-1" style={{color:p.risk.includes("Low")?"#22c55e":p.risk.includes("High Risk")?"#ef4444":"#fbbf24"}}>{p.risk}</div>
          </div>
        </div>
      </Sec>
      <Sec icon="🏅" title="Skill Badges" sub="Hover for criteria">
        <div className="flex flex-wrap gap-2 mb-4">
          {p.badges.map((b,i)=><BadgeChip key={i} text={b} color="#22c55e"/>)}
          {p.badges.length===0&&<span className="text-sm" style={{color:"#6b7280"}}>No badges earned</span>}
        </div>
        {p.redFlags.length>0&&<><div className="text-xs uppercase tracking-wider mb-2 mt-4" style={{color:"#ef4444"}}>⚠️ Red Flags</div>
          <div className="flex flex-wrap gap-2">{p.redFlags.map((f,i)=><BadgeChip key={`rf${i}`} text={f} color="#ef4444"/>)}</div>
        </>}
      </Sec>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: METHODOLOGY (no data needed)
// ═══════════════════════════════════════════════════════════
function MethodologyTab() {
  const sections = [
    {cat:"Scouting Scores",items:["feel","funcAth","shootScore","defScore","overall"]},
    {cat:"Margin of Error",items:["floor","ceiling"]},
    {cat:"Shooting Projection",items:["projNba3p","projNba3par","projNbaTs","selfCreation"]},
    {cat:"Four Factors",items:["fourFactors"]},
  ];
  return (
    <div className="space-y-6">
      <Sec icon="📖" title="Methodology" sub="Complete documentation of all computed metrics.">
        <div className="text-sm mb-4" style={{color:"#9ca3af"}}>
          All scores computed as position-aware era-adjusted percentiles (0-100). Data: Barttorvik, NBA API, Draft Combine.
        </div>
      </Sec>
      {sections.map(({cat,items})=>(
        <Sec key={cat} icon="▸" title={cat}>
          <div className="space-y-5">{items.map(key=>{
            const m=METHODS[key]; if(!m)return null;
            return (
              <div key={key} className="p-4 rounded-lg" style={{background:"#0d1117",border:"1px solid #1f2937"}}>
                <div className="font-bold text-sm mb-2" style={{color:"#f97316"}}>{m.name}</div>
                <div className="mb-2"><span className="text-xs uppercase" style={{color:"#6b7280"}}>Formula</span>
                  <div className="mt-1 px-3 py-2 rounded text-xs font-mono" style={{background:"#111827",color:"#7dd3fc"}}>{m.formula}</div>
                </div>
                <div className="text-sm" style={{color:"#cbd5e1"}}>{m.desc}</div>
              </div>
            );
          })}</div>
        </Sec>
      ))}
      <Sec icon="🏅" title="Badge Definitions">
        <div className="space-y-3">{Object.entries(BADGE_DEFS).map(([name,def])=>(
          <div key={name} className="flex gap-3 items-start p-3 rounded-lg" style={{background:"#0d1117"}}>
            <BadgeChip text={name} color={["High TO","Non-Block","Poor 3P","Low Assist","FT Concern","Undersized"].some(x=>name.includes(x))?"#ef4444":"#22c55e"}/>
            <div className="flex-1"><div className="text-xs mb-1" style={{color:"#94a3b8"}}>Rule: {def.rule}</div><div className="text-sm" style={{color:"#cbd5e1"}}>{def.desc}</div></div>
          </div>
        ))}</div>
      </Sec>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
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
  const [sel,setSel] = useState(null);       // selected player name
  const [player,setPlayer] = useState(null); // transformed player data
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState(null);
  const [tab,setTab] = useState("overview");

  // Search
  const [search,setSearch] = useState("");
  const [searchResults,setSearchResults] = useState([]);
  const [showS,setShowS] = useState(false);
  const searchTimer = useRef(null);

  // Debounced search
  useEffect(()=>{
    if(search.length<2){setSearchResults([]);return;}
    if(searchTimer.current)clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async()=>{
      try {
        const data = await apiFetch(`/players/search?q=${encodeURIComponent(search)}&limit=20`);
        setSearchResults(data.results||[]);
      } catch(e) {
        console.error("Search failed:",e);
        setSearchResults([]);
      }
    }, 300);
    return ()=>{ if(searchTimer.current)clearTimeout(searchTimer.current); };
  },[search]);

  // Load player data
  const loadPlayer = useCallback(async(name)=>{
    setLoading(true);
    setError(null);
    setSel(name);
    setSearch("");
    setShowS(false);
    setTab("overview");
    try {
      // Fetch profile
      const profileData = await apiFetch(`/player/${encodeURIComponent(name)}`);
      const p = transformProfile(profileData.name, profileData.profile);

      // Fetch comps in parallel
      const [statData, anthroData] = await Promise.allSettled([
        apiFetch(`/comps/stats/${encodeURIComponent(name)}`),
        apiFetch(`/comps/anthro/${encodeURIComponent(name)}`),
      ]);

      if(statData.status==="fulfilled") {
        p.statComps = transformStatComps(statData.value);
      }
      if(anthroData.status==="fulfilled") {
        p.anthroComps = transformAnthroComps(anthroData.value);
      }

      setPlayer(p);
    } catch(e) {
      console.error("Load failed:",e);
      setError(`Player "${name}" not found or API error.`);
      setPlayer(null);
    } finally {
      setLoading(false);
    }
  },[]);

  // Load a default player on mount
  useEffect(()=>{
    loadPlayer("Anthony Davis");
  },[loadPlayer]);

  const p = player;

  return (
    <div className="min-h-screen" style={{background:"#080b12",fontFamily:"'Barlow',sans-serif",color:"#e5e7eb"}}>
      <header className="sticky top-0 z-50 px-4 md:px-8 py-3" style={{background:"rgba(8,11,18,0.92)",backdropFilter:"blur(12px)",borderBottom:"1px solid #1f293744"}}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={()=>p&&setTab("overview")}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm" style={{background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#000"}}>PT</div>
            <div><div className="font-bold text-sm tracking-wider" style={{fontFamily:"'Oswald',sans-serif",color:"#f97316"}}>PROSPECT THEORY</div><div className="text-xs" style={{color:"#6b7280"}}>NBA Draft Intelligence</div></div>
          </div>
          <div className="relative">
            <input className="w-48 md:w-72 px-4 py-2 rounded-lg text-sm outline-none" style={{background:"#111827",border:"1px solid #374151",color:"#e5e7eb"}} placeholder="Search 34,000+ players..." value={search}
              onChange={e=>{setSearch(e.target.value);setShowS(true)}} onFocus={()=>setShowS(true)} onBlur={()=>setTimeout(()=>setShowS(false),200)}/>
            {showS&&searchResults.length>0&&<div className="absolute top-full mt-1 left-0 right-0 rounded-lg overflow-hidden shadow-2xl z-50" style={{background:"#111827",border:"1px solid #374151",maxHeight:300,overflowY:"auto"}}>
              {searchResults.map(r=><button key={r.name+r.year} className="w-full text-left px-4 py-2.5 text-sm hover:bg-white hover:bg-opacity-5" onMouseDown={()=>loadPlayer(r.name)} style={{color:"#e5e7eb",borderBottom:"1px solid #1f2937"}}>
                <span className="font-semibold">{r.name}</span>
                <span className="ml-2 text-xs" style={{color:"#6b7280"}}>{r.position} · {r.team} · {r.year}</span>
                {r.made_nba&&<span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{background:"#f9731622",color:"#f97316"}}>NBA</span>}
                {r.tier&&r.tier!=="Never Made NBA"&&<span className="ml-1 text-xs" style={{color:TC[r.tier]||"#6b7280"}}>{r.tier}</span>}
              </button>)}
            </div>}
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6">
        {loading && <Spinner/>}
        {error && <div className="text-center py-20"><div className="text-lg mb-2" style={{color:"#ef4444"}}>⚠️ {error}</div><div className="text-sm" style={{color:"#6b7280"}}>Try searching for another player.</div></div>}
        {!loading && !error && p && <>
          {tab!=="methodology" && (
            <div className="mb-5 rounded-2xl p-5 relative overflow-hidden" style={{background:"linear-gradient(135deg,#111827 0%,#0f172a 50%,#1e1b4b 100%)",border:"1px solid #1f2937"}}>
              <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-5" style={{background:"radial-gradient(circle,#f97316,transparent)",transform:"translate(30%,-30%)"}}/>
              <div className="flex flex-col md:flex-row md:items-center gap-3 relative z-10">
                <div className="flex-1">
                  <div className="text-xs uppercase tracking-widest mb-1" style={{color:"#6b7280"}}>{p.yr} Draft Class</div>
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight" style={{fontFamily:"'Oswald',sans-serif"}}>{p.name}</h1>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-sm" style={{color:"#9ca3af"}}>
                    <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{background:"#f9731622",color:"#f97316"}}>{p.pos}</span>
                    <span>{p.team}</span><span>·</span><span>{p.ht} · {p.wt} lbs</span><span>·</span><span>Age {(p.age||0).toFixed(1)}</span>
                    {p.madeNba&&<span className="px-2 py-0.5 rounded text-xs font-semibold" style={{background:"#22c55e22",color:"#22c55e"}}>NBA</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.badges.slice(0,3).map((b,i)=><BadgeChip key={i} text={b}/>)}
                  {p.redFlags.slice(0,2).map((f,i)=><BadgeChip key={`rf${i}`} text={f} color="#ef4444"/>)}
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-1 mb-5 overflow-x-auto pb-2" style={{scrollbarWidth:"none"}}>
            {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} className="px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap"
              style={{background:tab===t.id?"#f97316":"transparent",color:tab===t.id?"#000":"#9ca3af"}}>
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>)}
          </div>
          {tab==="overview"&&<OverviewTab p={p}/>}
          {tab==="shooting"&&<ShootingTab p={p}/>}
          {tab==="body"&&<BodyTab p={p}/>}
          {tab==="comps"&&<CompsTab p={p}/>}
          {tab==="projection"&&<ProjectionTab p={p}/>}
          {tab==="scouting"&&<ScoutingTab p={p}/>}
          {tab==="methodology"&&<MethodologyTab/>}
        </>}
        {!loading && !error && !p && <div className="text-center py-20"><div className="text-lg" style={{color:"#6b7280"}}>Search for a player to get started.</div></div>}
      </main>
      <footer className="mt-12 py-6 text-center text-xs" style={{color:"#374151",borderTop:"1px solid #111827"}}>
        <span style={{color:"#6b7280"}}>ProspectTheory</span> · NBA Draft Intelligence · Data: Barttorvik, NBA API, Draft Combine
      </footer>
    </div>
  );
}
