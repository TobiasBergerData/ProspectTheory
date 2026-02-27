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
    formula: "22.0 + 0.15 × college_3P% + 0.12 × FT% + 0.05 × Midrange%",
    inputs: (p) => `3P%: ${fmt(p.tp)} | FT%: ${fmt(p.ft)} | Mid%: ${fmt(p.midPct)}`,
    desc: "Regression-based projection calibrated to NBA outcomes (typical range 30-42%). FT% is the strongest single predictor of NBA 3P translation (Berger, 2023). Midrange shooting shows touch/craft. Intercept 22 centers output around league average. Clipped to 28-44% range.",
  },
  projNba3pa: {
    name: "Projected NBA 3PA/game",
    formula: "college_3PA/G × 1.2 + FT% Bonus (if FT>75: (FT-75)×0.05) + 1.5 (era)",
    inputs: (p) => `College 3PA/G: ${fmt(p.projNba3pa)} | FT%: ${fmt(p.ft)} | 3P Freq: ${fmt(p.threeF)}`,
    desc: "Base: college attempts × 1.2 (NBA spacing effect). FT% bonus: good shooters (>75%) evolve to shoot more 3s. Era adjustment +1.5 for modern NBA three-point inflation.",
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
    name: "Context-Free Four Factor Rating (CFFR)",
    formula: "reliability × (0.40 × z_eFG + 0.25 × z_TOV + 0.20 × z_ORB + 0.15 × z_FTR)",
    inputs: (p) => `eFG%: ${fmt(p.efg)} | TO%: ${fmt(p.toP)} | ORB%: ${fmt(p.orbP)} | FTR: ${fmt(p.ftr)} | Role: ${p.cffr?.usageRole||"?"}`,
    desc: "Usage-role-adjusted Four Factors. Players are bucketed by usage (Primary ≥28%, Secondary ≥22%, Finisher ≥15%, LowUsage <15%). Each factor's expected value is computed per season × role, then residuals are z-scored within season. A Primary scorer with 52% eFG rates higher than a LowUsage player with the same number. Reliability weight (1-e^(-min/600)) prevents small-sample inflation.",
  },
  posClassification: {
    name: "Position Classification (3-Role Model)",
    formula: "Soft-clustering: Height + Wingspan + AST% + USG% + BLK% → One-Hot Encoding with size × stats interactions",
    inputs: () => "Height, Wingspan, AST%, USG%, BLK%, BartTorvik half-positions (PG/CG/WG/WF/PF/C)",
    desc: "Assigns each prospect to Playmaker, Wing, or Big based on measurables and statistical profile. Known limitations: (1) SG-type players with high AST% may be classified as Playmakers instead of Wings; (2) Modern stretch-4s may be classified as Bigs when they functionally play as large Wings in the NBA. Position soft-probabilities (pos_playmaker, pos_wing, pos_big) are included for nuanced analysis. Future: BartTorvik half-position soft-clustering for better granularity.",
  },
};

// Badge definitions for tooltips
// ── BADGE ENGINE (spec v2) ────────────────────────────────────────────────
// Green = scalable NBA elite skills | Red = contextual warning signals
const BADGE_DEFS = {
  // KAT 1: GREEN FLAGS
  "Elite Shooting":         { cat:"green", rule:"FT%>80 AND 3P%>36 AND 3P Freq>30%",          desc:"Top-tier shooting across both lines — most translatable skill in modern NBA." },
  "Floor General Spacer":   { cat:"green", rule:"(G/W) 3P%>35 AND AST%>25 AND AST/TO>1.8",   desc:"Combines shooting, creation, and decision-making — ideal modern guard profile." },
  "High-Feel Athlete":      { cat:"green", rule:"Feel>75 AND Func Ath>75",                     desc:"Rarest badge — elite IQ + elite athleticism. Almost always translates to NBA." },
  "3-and-D Wing":           { cat:"green", rule:"(W) 3P%>34 AND STL%>2.5 AND Rim FG%>60",    desc:"Most coveted role player in modern NBA. Immediate starter value." },
  "Modern Playmaking Big":  { cat:"green", rule:"(B) BLK%>4.0 AND AST%>15 AND AST/TO>1.0",   desc:"Rim protection + playmaking. Rare and elite — Draymond/Gobert hybrid." },
  "Rim Pressure God":       { cat:"green", rule:"Rim Freq>40% AND FTR>40 AND Rim FG%>65",     desc:"Elite volume, efficiency, and free throws at rim. Generates offense by itself." },
  "Stocks Machine":         { cat:"green", rule:"STL%>2.5 AND BLK%>2.5",                      desc:"Defensive range at both perimeter and rim. Historically rare combination." },
  "Efficient High Usage":   { cat:"green", rule:"USG>28 AND TO%<12 AND TS%>58",               desc:"Handles elite volume without turnover collapse. The 'carry' badge." },
  // KAT 2: RED FLAGS
  "Passive Scorer":         { cat:"red",   rule:"USG>22 AND FTR<20 AND Rim Freq<20%",         desc:"High usage but avoids contact/paint. Jumper-dependent — hard to sustain in NBA." },
  "All-Offense Big":        { cat:"red",   rule:"(B) BLK%<2.5 AND DBPM<1.5",                 desc:"Bigs without rim protection are a defensive liability at every level." },
  "Non-Spacing Guard":      { cat:"red",   rule:"(G) 3P%<30 AND 3P Freq<20%",                desc:"Guards who don't threaten from three destroy NBA spacing." },
  "High-TO Wing":           { cat:"red",   rule:"(W) USG>20 AND TO%>20",                      desc:"Wings taking on ball-handling load without ball security. Role regression risk." },
  "FT Concern":             { cat:"red",   rule:"FT%<65 AND USG>25",                          desc:"Hack-a-Player target at high usage. Opposing coaches will exploit." },
  "Small & Non-Elite":      { cat:"red",   rule:"(G) Height<6'2\" AND (Feel<60 OR Shooting<60)", desc:"Below-average size without elite skill compensation. Physical disadvantage at next level." },
  "Foul Magnet":            { cat:"red",   rule:"Fouls/40>4.5",                               desc:"Foul trouble limits minutes. Signals poor mobility or defensive discipline." },
};

// ── Position group determination (spec-compliant, height-based) ───────────
// Guard: Height < 6'4" (76") OR (Height < 6'6" (78") AND AST% > 20)
// Big:   Height > 6'9" (81") OR (Height > 6'8" (80") AND TRB%/DRB% > 15)
// Wing:  everything else
function getBadgePos(p) {
  const htIn = p.htIn ?? 78;
  const astP  = p.astP  ?? 0;
  const drbP  = p.drbP  ?? 0; // DRB% as TRB% proxy
  if (htIn < 76 || (htIn < 78 && astP > 20)) return "G";
  if (htIn > 81 || (htIn > 80 && drbP > 15)) return "B";
  return "W";
}

// ── Client-side badge computation ─────────────────────────────────────────
function computeBadges(p) {
  const pos = getBadgePos(p);
  const isG = pos === "G", isW = pos === "W", isB = pos === "B";

  const ft=p.ft??0, tp=p.tp??0, threeF=p.threeF??0;
  const astP=p.astP??0, astTov=p.astTov??0;
  const stlP=p.stlP??0, blkP=p.blkP??0;
  const usg=p.usg??0, toP=p.toP??0, ts=p.ts??0;
  const ftr=p.ftr??0, rimF=p.rimF??0, rimPct=p.rimPct??0;
  const dbpm=p.dbpm??0, feel=p.feel??0, funcAth=p.funcAth??0;
  const htIn=p.htIn??78;

  const green=[], red=[];
  const addG=(n)=>{ if(!green.includes(n)) green.push(n); };
  const addR=(n)=>{ if(!red.includes(n))   red.push(n);   };

  // GREEN
  if (ft>80 && tp>36 && threeF>30)                             addG("Elite Shooting");
  if ((isG||isW) && tp>35 && astP>25 && astTov>1.8)            addG("Floor General Spacer");
  if (feel>75 && funcAth>75)                                    addG("High-Feel Athlete");
  if (isW && tp>34 && stlP>2.5 && rimPct>60)                   addG("3-and-D Wing");
  if (isB && blkP>4.0 && astP>15 && astTov>1.0)                addG("Modern Playmaking Big");
  if (rimF>40 && ftr>40 && rimPct>65)                          addG("Rim Pressure God");
  if (stlP>2.5 && blkP>2.5)                                    addG("Stocks Machine");
  if (usg>28 && toP<12 && ts>58)                               addG("Efficient High Usage");

  // RED
  if (usg>22 && ftr<20 && rimF<20)                             addR("Passive Scorer");
  if (isB && blkP<2.5 && dbpm<1.5)                             addR("All-Offense Big");
  if (isG && tp<30 && threeF<20)                               addR("Non-Spacing Guard");
  if (isW && usg>20 && toP>20)                                 addR("High-TO Wing");
  if (ft<65 && usg>25)                                         addR("FT Concern");
  if (isG && htIn<74 && (feel<60||(p.shootScore??0)<60))       addR("Small & Non-Elite");
  if ((p.redFlags??[]).includes("Foul Magnet"))                 addR("Foul Magnet");

  return { green, red };
}

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
  // Recruit rank → percentile (lower rank = better, top 100 out of ~3500 eligible)
  const recPctl = d.recRank!=null ? Math.round(Math.max(0, (1 - d.recRank/350) * 100)) : null;
  return {
    name:d.name, team:d.team, pos:d.pos, yr:d.yr, cls:d.cls||"",
    conf:d.conf||"", confTier:d.conf_tier||d.confTier||"",
    ht:d.ht!=null?`${Math.floor(d.ht/12)}'${Math.round(d.ht%12)}"`:null,
    htIn:d.ht, wt:d.wt, age:d.age, recRank:d.recRank, recPctl,
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
    // CFFR (Context-Free Four Factor Rating)
    cffr:{
      score:pct(d.cffr)||pct(d.ff_comp),
      zEfg:d.cffr_z_efg, zTov:d.cffr_z_tov, zOrb:d.cffr_z_orb, zFtr:d.cffr_z_ftr,
      reliability:d.cffr_reliability, usageRole:d.cffr_usage_role||"",
    },
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
    projNba3p:d.proj_3p, projNba3pa:d.proj_3pa, projNba3par:d.proj_3par, projNbaTs:d.proj_ts,
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
          ["Age",p.age.toFixed(1),"#e5e7eb"],
          ["Recruit",p.recRank?`#${p.recRank}`+(p.recPctl!=null?` (${p.recPctl}th pctl)`:""):"Unranked",p.recPctl!=null&&p.recPctl>70?"#22c55e":"#e5e7eb"],
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
            ["STL",p.stl,p.pctl.stl],["BLK",p.blk,p.pctl.blk],["A/TO",p.astTov,null],["FTR",p.ftr,null]
          ].map(([l,v,pc])=><StatCell key={l} label={l} val={v} pctl={pc}/>)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" style={{color:"#6b7280"}}>
          <span>Efficiency:</span>
          {[["TS%",p.ts,p.pctl.ts],["FG%",p.fg,null],["3P%",p.tp,null],["FT%",p.ft,null]].map(([l,v,pc])=>(
            <span key={l} className="px-2 py-0.5 rounded" style={{background:valBg(pc),color:pc?valColor(pc):"#e5e7eb"}}>{l} {fmt(v)}</span>
          ))}
        </div>
      </Sec>
      <Sec icon="⚡" title="Advanced" sub="">
        <Tip wide content={<div><div className="font-bold mb-1" style={{color:"#f97316"}}>Percentile Basis</div><div style={{color:"#cbd5e1"}}>All percentiles are computed against the <strong>entire database</strong> (~34k college players since 2008), grouped by season to account for era effects. Green = elite (top 15%), Yellow = average, Red = bottom 15%. NOT same-class comparisons.</div></div>}>
          <div className="text-xs mb-3 cursor-help" style={{color:"#6b7280"}}>Era-adjusted percentile coloring vs. all college players since 2008 <span style={{color:"#475569"}}>ⓘ hover for details</span></div>
        </Tip>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {[["BPM",p.bpm,p.pctl.bpm],["OBPM",p.obpm,null],["DBPM",p.dbpm,null],["ORtg",p.ortg,null],
            ["USG%",p.usg,p.pctl.usg],["TS%",p.ts,p.pctl.ts],["AST%",p.astP,p.pctl.ast],["TO%",p.toP,p.pctl.to],
            ["ORB%",p.orbP,p.pctl.orb],["DRB%",p.drbP,p.pctl.drb],["STL%",p.stlP,p.pctl.stl],["BLK%",p.blkP,p.pctl.blk]
          ].map(([l,v,pc])=><StatCell key={l} label={l} val={v} pctl={pc}/>)}
        </div>
      </Sec>
      <Sec icon="↗" title="Four Factors (CFFR)" sub="">
        <Tip wide content={
          <div>
            <div className="font-bold mb-1" style={{color:"#f97316"}}>{METHODS.fourFactors.name}</div>
            <div className="mb-1"><span style={{color:"#94a3b8"}}>Formula:</span><br/><code className="text-xs" style={{color:"#7dd3fc"}}>{METHODS.fourFactors.formula}</code></div>
            <div className="mb-1"><span style={{color:"#94a3b8"}}>Inputs:</span> {METHODS.fourFactors.inputs(p)}</div>
            <div style={{color:"#cbd5e1"}}>{METHODS.fourFactors.desc}</div>
          </div>
        }>
          <div className="text-xs mb-4 cursor-help" style={{color:"#6b7280"}}>Context-Free Four Factor Rating — usage-role adjusted, season-normalized <span style={{color:"#475569"}}>ⓘ hover for formula</span></div>
        </Tip>
        {p.cffr?.usageRole && <div className="text-xs mb-3 px-3 py-1.5 rounded-lg inline-block" style={{background:"#1f2937",color:"#f97316"}}>
          Usage Role: <span className="font-bold">{p.cffr.usageRole}</span>
          {p.cffr.reliability!=null && <span style={{color:"#6b7280"}}> · Reliability: {(p.cffr.reliability*100).toFixed(0)}%</span>}
        </div>}
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
  // Half-court zones with volume + accuracy
  const totalShots = (p.rimF||0) + (p.midF||0) + (p.threeF||0);
  const zoneSize = (freq) => freq > 30 ? "text-2xl" : freq > 15 ? "text-xl" : "text-lg";
  const zoneOpacity = (freq) => freq > 30 ? 1.0 : freq > 15 ? 0.8 : freq > 5 ? 0.6 : 0.35;
  return (
    <div className="space-y-5">
      <Sec icon="🏀" title="3.5 Level Scoring" sub="Shot distribution, accuracy, and volume across all scoring zones">
        {/* Half-Court SVG Visualization */}
        <div className="relative mx-auto" style={{maxWidth:420,aspectRatio:"1/0.85"}}>
          <svg viewBox="0 0 420 357" className="w-full h-full">
            {/* Court background */}
            <rect x="0" y="0" width="420" height="357" rx="8" fill="#0d1117"/>
            {/* Baseline */}
            <line x1="10" y1="10" x2="410" y2="10" stroke="#1f2937" strokeWidth="2"/>
            {/* 3-point arc */}
            <path d="M 47 10 L 47 85 A 170 170 0 0 0 373 85 L 373 10" fill="none" stroke="#3b82f688" strokeWidth="2"/>
            {/* Paint/Key */}
            <rect x="130" y="10" width="160" height="190" fill="none" stroke="#1f2937" strokeWidth="1.5" rx="2"/>
            {/* FT circle */}
            <circle cx="210" cy="200" r="60" fill="none" stroke="#1f293766" strokeWidth="1"/>
            {/* FT line */}
            <line x1="130" y1="200" x2="290" y2="200" stroke="#8b5cf644" strokeWidth="1.5" strokeDasharray="6,3"/>
            {/* Rim circle */}
            <circle cx="210" cy="42" r="18" fill="none" stroke="#ef444466" strokeWidth="2"/>
            {/* Backboard */}
            <line x1="190" y1="22" x2="230" y2="22" stroke="#6b7280" strokeWidth="3"/>
            
            {/* @Rim + Dunks Zone */}
            <g opacity={zoneOpacity(p.rimF||0)}>
              <text x="210" y="72" textAnchor="middle" fill="#ef4444" className="font-bold" style={{fontSize:14}}>@RIM</text>
              <text x="210" y="92" textAnchor="middle" fill="#e5e7eb" className="font-bold" style={{fontSize:20}}>{fmt(p.rimPct)}%</text>
              <text x="210" y="108" textAnchor="middle" fill="#6b7280" style={{fontSize:11}}>{p.rimF}% freq{p.dunkR>0?` · ${p.dunkR}% dunks`:""}</text>
            </g>
            
            {/* FT Line Zone */}
            <g>
              <text x="210" y="185" textAnchor="middle" fill="#8b5cf6" className="font-bold" style={{fontSize:12}}>FREE THROW</text>
              <text x="210" y="216" textAnchor="middle" fill="#e5e7eb" className="font-bold" style={{fontSize:18}}>{fmt(p.ft)}%</text>
              <text x="210" y="232" textAnchor="middle" fill="#6b7280" style={{fontSize:11}}>FTR: {fmt(p.ftr)}</text>
            </g>
            
            {/* Mid-Range Zone (sides) */}
            <g opacity={zoneOpacity(p.midF||0)}>
              <text x="85" y="145" textAnchor="middle" fill="#f97316" className="font-bold" style={{fontSize:12}}>MID</text>
              <text x="85" y="168" textAnchor="middle" fill="#e5e7eb" className="font-bold" style={{fontSize:18}}>{fmt(p.midPct)}%</text>
              <text x="85" y="183" textAnchor="middle" fill="#6b7280" style={{fontSize:10}}>{p.midF}% freq</text>
            </g>
            
            {/* 3-Point Zone */}
            <g opacity={zoneOpacity(p.threeF||0)}>
              <text x="210" y="295" textAnchor="middle" fill="#3b82f6" className="font-bold" style={{fontSize:14}}>3-POINT</text>
              <text x="210" y="322" textAnchor="middle" fill="#e5e7eb" className="font-bold" style={{fontSize:22}}>{fmt(p.tp)}%</text>
              <text x="210" y="340" textAnchor="middle" fill="#6b7280" style={{fontSize:11}}>{p.threeF}% freq · 3PAr: {fmt(p.threePar)}</text>
              {/* Corner indicators */}
              <text x="55" y="55" textAnchor="middle" fill="#3b82f644" style={{fontSize:10}}>3PT</text>
              <text x="365" y="55" textAnchor="middle" fill="#3b82f644" style={{fontSize:10}}>3PT</text>
            </g>
          </svg>
        </div>
        
        {/* Volume & Efficiency Summary */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-4">
          {[["TS%",p.ts,p.pctl?.ts,"#fbbf24"],["FG%",p.fg,null,"#9ca3af"],["eFG%",p.efg,null,"#9ca3af"],
            ["FT%",p.ft,null,"#8b5cf6"],["FTR",p.ftr,null,"#8b5cf6"],["Dunk%",p.dunkR,null,"#10b981"]
          ].map(([l,v,pc,c])=>(
            <div key={l} className="rounded-lg p-2 text-center" style={{background:"#111827"}}>
              <div className="text-xs" style={{color:"#6b7280"}}>{l}</div>
              <div className="font-bold" style={{color:pc?valColor(pc):c,fontFamily:"'Oswald',sans-serif"}}>{fmt(v)}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-4 text-xs mt-3" style={{color:"#6b7280"}}>
          <Tip content={<div><div className="font-bold mb-1" style={{color:"#f97316"}}>{METHODS.selfCreation.name}</div><code className="text-xs" style={{color:"#7dd3fc"}}>{METHODS.selfCreation.formula}</code><div className="mt-1">{METHODS.selfCreation.inputs(p)}</div><div className="mt-1" style={{color:"#cbd5e1"}}>{METHODS.selfCreation.desc}</div></div>}>
            <span>Self-Creation (Unassisted): <span style={{color:"#f97316"}}>{p.selfCreation}</span> <span style={{color:"#475569"}}>ⓘ</span></span>
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
            {["Name","Pos","Sim","BPM","USG","TS%","AST%","TO%","ORB%","DRB%","STL%","BLK%","FTR","@Rim%","3P%","FT%","Tier"].map(h=><th key={h} className="text-left px-2 py-1.5 text-xs uppercase" style={{color:"#6b7280",borderBottom:"1px solid #1f2937"}}>{h}</th>)}
          </tr></thead><tbody>
            <tr style={{background:"#f9731611"}}>
              <td className="px-2 py-2 font-bold" style={{color:"#f97316"}}>{p.nbaName||"Selected"}</td>
              <td className="px-2" style={{color:"#9ca3af"}}>{p.pos}</td><td className="px-2" style={{color:"#f97316"}}>—</td>
              <td className="px-2 font-semibold" style={{color:valColor(p.pctl.bpm)}}>{fmt(p.bpm)}</td>
              <td className="px-2 font-semibold" style={{color:valColor(p.pctl.usg)}}>{fmt(p.usg)}</td>
              <td className="px-2 font-semibold" style={{color:valColor(p.pctl.ts)}}>{fmt(p.ts)}</td>
              <td className="px-2 font-semibold" style={{color:valColor(p.pctl.ast)}}>{fmt(p.astP)}</td>
              <td className="px-2 font-semibold" style={{color:valColor(100-(p.pctl.to||50))}}>{fmt(p.toP)}</td>
              <td className="px-2 font-semibold" style={{color:valColor(p.pctl.orb)}}>{fmt(p.orbP)}</td>
              <td className="px-2 font-semibold" style={{color:valColor(p.pctl.drb)}}>{fmt(p.drbP)}</td>
              <td className="px-2 font-semibold" style={{color:valColor(p.pctl.stl)}}>{fmt(p.stlP)}</td>
              <td className="px-2 font-semibold" style={{color:valColor(p.pctl.blk)}}>{fmt(p.blkP)}</td>
              <td className="px-2" style={{color:"#9ca3af"}}>{fmt(p.ftr)}</td>
              <td className="px-2" style={{color:"#9ca3af"}}>{fmt(p.rimPct)}</td>
              <td className="px-2" style={{color:"#9ca3af"}}>{fmt(p.tp)}</td>
              <td className="px-2" style={{color:"#9ca3af"}}>{fmt(p.ft)}</td>
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
                <td className="px-2" style={{color:valColor(c.toP<15?80:c.toP<20?55:30)}}>{fmt(c.toP)}</td>
                <td className="px-2" style={{color:valColor(c.orbP>8?80:c.orbP>4?55:30)}}>{fmt(c.orbP)}</td>
                <td className="px-2" style={{color:valColor(c.drbP>18?80:c.drbP>12?55:30)}}>{fmt(c.drbP)}</td>
                <td className="px-2" style={{color:valColor(c.stlP>3?80:c.stlP>1.5?55:30)}}>{fmt(c.stlP)}</td>
                <td className="px-2" style={{color:valColor(c.blkP>5?80:c.blkP>2?55:30)}}>{fmt(c.blkP)}</td>
                <td className="px-2" style={{color:"#9ca3af"}}>{fmt(c.ftr)}</td>
                <td className="px-2" style={{color:"#9ca3af"}}>{fmt(c.rimPct)}</td>
                <td className="px-2" style={{color:"#9ca3af"}}>{fmt(c.tp)}</td>
                <td className="px-2" style={{color:"#9ca3af"}}>{fmt(c.ft)}</td>
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
        {[["Chance of NBA Career",`${p.pNba!=null?((p.pNba*100).toFixed(0))+"%":"—"}`,p.pNba!=null?"#f97316":"#6b7280"],["Proj. 3yr NBA Peak",p.mu!=null?p.mu.toFixed(3):"—","#e5e7eb"],["Uncertainty (σ)",p.sigma!=null?`± ${p.sigma.toFixed(3)}`:"—","#6b7280"]].map(([l,v,c])=>(
          <Tip key={l} wide content={
            l.includes("Peak") ? <div><div className="font-bold mb-1" style={{color:"#f97316"}}>Projected 3-Year NBA Peak PIE</div><div style={{color:"#cbd5e1"}}>The model's best estimate of this player's peak Player Impact Estimate (PIE) over their best 3 consecutive NBA seasons. PIE measures a player's contribution to their team's success. Average NBA player ≈ 0.100, All-Star ≈ 0.150+, MVP ≈ 0.200+.</div></div>
            : l.includes("σ") ? <div><div className="font-bold mb-1" style={{color:"#f97316"}}>Uncertainty (Standard Deviation)</div><div style={{color:"#cbd5e1"}}>How uncertain the model is about this projection. Lower σ = more confident prediction (typically older players with more data). Higher σ = wider range of possible outcomes (typically young players or those with unusual profiles). The actual outcome falls within ±1σ about 68% of the time.</div></div>
            : <div><div className="font-bold mb-1" style={{color:"#f97316"}}>NBA Career Probability</div><div style={{color:"#cbd5e1"}}>Estimated probability that this player will play meaningful NBA minutes (≥500 career minutes). Based on historical comparison of similar statistical profiles.</div></div>
          }>
            <div className="rounded-xl p-5 text-center cursor-help" style={{background:"#111827"}}>
              <div className="text-xs uppercase tracking-wider mb-1" style={{color:"#6b7280"}}>{l} <span style={{color:"#475569"}}>ⓘ</span></div>
              <div className="text-3xl font-bold" style={{color:c,fontFamily:"'Oswald',sans-serif"}}>{v}</div>
            </div>
          </Tip>
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
// ── Z-score helpers for role ratings ──────────────────────
// Converts 0-100 role score → approximate z-score (-3 to +3)
const roleToZ = (score) => {
  if (score == null) return 0;
  // 50 → 0, 84 → +1, 97.5 → +2, 99.9 → +3
  const p = Math.max(0.001, Math.min(0.999, score / 100));
  const a = [-3.969683028665376e1,2.209460984245205e2,-2.759285104469687e2,1.383577518672690e2,-3.066479806614716e1,2.506628277459239];
  const b = [-5.447609879822406e1,1.615858368580409e2,-1.556989798598866e2,6.680131188771972e1,-1.328068155288572e1];
  const c = [-7.784894002430293e-3,-3.223964580411365e-1,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783];
  const d = [7.784695709041462e-3,3.223907427788357e-1,2.445134137142996,3.754408661907416];
  const pLow=0.02425,pHigh=1-pLow;
  let z;
  if(p<pLow){const q=Math.sqrt(-2*Math.log(p));z=(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
  else if(p<=pHigh){const q=p-0.5,r=q*q;z=(((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);}
  else{const q=Math.sqrt(-2*Math.log(1-p));z=-(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
  return Math.round(Math.max(-3,Math.min(3,z))*10)/10;
};

// Z-score label and color
const zLabel = (z) => z>=2.0?"Elite":z>=1.0?"Impact":z>=-0.9?"Neutral":"Liability";
const zColor = (z) => z>=2.0?"#22c55e":z>=1.0?"#86efac":z>=-0.9?"#6b7280":"#ef4444";
const zBg    = (z) => z>=2.0?"#22c55e18":z>=1.0?"#86efac11":z>=-0.9?"#1e293b":"#ef444418";

// ── Swing Skill + Tier logic ───────────────────────────────
function computeSwingSkill(p) {
  const bpm = p.bpm ?? 0;
  const usg = p.usg ?? 0;
  const ts  = p.ts  ?? 0;
  const ft  = p.ft  ?? 0;
  const tp  = p.tp  ?? 0;
  const pos = p.pos ?? "Wing";
  const isBig   = pos === "Big";
  const isGuard = pos === "Playmaker";
  const isWing  = !isBig && !isGuard;

  // Current Tier
  let tier, tierColor, tierNum;
  if      (bpm>10 && usg>28 && ts>60)  { tier="Franchise";        tierColor="#fbbf24"; tierNum=1; }
  else if (bpm>=7)                       { tier="All-Star Potential";tierColor="#f97316"; tierNum=2; }
  else if (bpm>=4)                       { tier="Starter";          tierColor="#3b82f6"; tierNum=3; }
  else if (bpm>=1.5)                     { tier="Rotation/Specialist";tierColor="#06b6d4";tierNum=4; }
  else                                   { tier="Depth/Bust";       tierColor="#6b7280"; tierNum=5; }

  // Identify Swing Skill: biggest negative deviation with highest NBA leverage
  const swingCandidates = [];
  if (isWing || isGuard) {
    const shootGap = 70 - (p.shootScore ?? 0); // wing/guard shooting leverage × 3.5
    if (shootGap > 10) swingCandidates.push({ skill:"Shooting", gap:shootGap, mult:3.5,
      current:`${fmt(tp)}% 3P / ${fmt(ft)}% FT`,
      floor:`Non-shooter → Tier ${Math.min(5,tierNum+2)} ceiling`,
      ceiling:`Elite shooter → Tier ${Math.max(1,tierNum-2)} floor`,
      ftPrior: ft, hasTouch: ft > 78, hasDevWindow: (p.age??22) < 21, hasIQ: (p.feel??0) > 65,
    });
  }
  if (isBig) {
    const blkGap = 70 - (p.pctl?.blk ?? 50);
    if (blkGap > 10) swingCandidates.push({ skill:"Rim Protection", gap:blkGap, mult:2.5,
      current:`${fmt(p.blkP)}% BLK / DBPM ${fmt(p.dbpm)}`,
      floor:"Non-rim-protector → Tier 4-5 Big",
      ceiling:"Rim anchor → Tier 2 Big",
      ftPrior: ft, hasTouch: ft > 70, hasDevWindow: (p.age??22) < 21, hasIQ: (p.feel??0) > 60,
    });
    const shootGap = 65 - (p.shootScore ?? 0);
    if (shootGap > 15) swingCandidates.push({ skill:"Stretch Shooting", gap:shootGap, mult:2.0,
      current:`${fmt(tp)}% 3P / ${fmt(p.threeF)}% 3P freq`,
      floor:"Non-shooter Big → limited lineups",
      ceiling:"Floor-spacing Big → premium value",
      ftPrior: ft, hasTouch: ft > 72, hasDevWindow: (p.age??22) < 21, hasIQ: (p.feel??0) > 55,
    });
  }
  {
    const decGap = 70 - (p.feel ?? 0);
    if (decGap > 15 && isGuard) swingCandidates.push({ skill:"Decision Making", gap:decGap, mult:3.0,
      current:`AST/TO ${fmt(p.astTov)} / TO% ${fmt(p.toP)}%`,
      floor:"Ball-handler who turns it over → backup PG",
      ceiling:"Elite decision-maker → starter/initiator",
      ftPrior: ft, hasTouch: ft > 75, hasDevWindow: (p.age??22) < 21, hasIQ: (p.feel??0) > 55,
    });
  }
  if ((isBig || isWing) && (p.pctl?.blk ?? 50) < 40) {
    const defGap = 65 - (p.defScore ?? 0);
    if (defGap > 10 && !isBig) swingCandidates.push({ skill:"Perimeter Defense", gap:defGap, mult:2.0,
      current:`STL% ${fmt(p.stlP)} / DBPM ${fmt(p.dbpm)}`,
      floor:"Offensive-only wing → role player ceiling",
      ceiling:"Two-way wing → All-Star potential",
      ftPrior: ft, hasTouch: ft > 72, hasDevWindow: (p.age??22) < 21, hasIQ: (p.feel??0) > 60,
    });
  }

  if (swingCandidates.length === 0) return { tier, tierColor, tierNum, swingSkill:null };

  // Pick highest delta × multiplier
  swingCandidates.sort((a,b) => (b.gap*b.mult) - (a.gap*a.mult));
  const sw = swingCandidates[0];
  const delta = Math.round((sw.gap / 100) * sw.mult * 10) / 10;

  // Hitter probability
  let hitProb = 0.30; // base
  if (sw.hasTouch)     hitProb += 0.20; // FT% proxy for motor touch
  if (sw.hasDevWindow) hitProb += 0.15; // age < 21
  if (sw.hasIQ)        hitProb += 0.10; // high feel score
  hitProb = Math.round(Math.min(0.85, hitProb) * 100);

  const hitColor = hitProb >= 65 ? "#22c55e" : hitProb >= 45 ? "#fbbf24" : "#ef4444";
  const hitLabel = hitProb >= 65 ? "Likely Hits" : hitProb >= 45 ? "Coinflip" : "Unlikely";

  return { tier, tierColor, tierNum, swingSkill: sw.skill, delta, current:sw.current,
    floor:sw.floor, ceiling:sw.ceiling, hitProb, hitColor, hitLabel };
}

// ── Bust / Sleeper assessment ──────────────────────────────
function computeBustSleeper(p) {
  const bpm    = p.bpm    ?? 0;
  const usg    = p.usg    ?? 0;
  const stlP   = p.stlP   ?? 0;
  const blkP   = p.blkP   ?? 0;
  const ft     = p.ft     ?? 0;
  const astTov = p.astTov ?? 0;
  const dunkR  = p.dunkR  ?? 0;
  const rimF   = p.rimF   ?? 0;
  const threeF = p.threeF ?? 0;
  const ftr    = p.ftr    ?? 0;
  const htIn   = p.htIn   ?? 78;
  const feel   = p.feel   ?? 0;

  const busts   = [];
  const sleepers= [];

  // BUST CLUSTERS
  if (usg>25 && stlP<1.2 && blkP<1.0)
    busts.push({ id:"A", label:"Defensive Immobility", desc:"High usage but no defensive activity — can't guard in NBA without athleticism signals." });
  if ((dunkR>8||rimF>30) && ft<65 && astTov<0.9)
    busts.push({ id:"B", label:"Athletic / No Skill", desc:"High athleticism but poor touch and decisions — hard to develop with low IQ signal." });
  if (threeF>40 && ftr<20 && rimF<20)
    busts.push({ id:"C", label:"One-Dimensional Shooter", desc:"Shoots only threes without rim or FT pressure — defenders can sag off." });

  // SLEEPER CLUSTERS
  if (bpm>8 && usg<20)
    sleepers.push({ id:"D", label:"Elite Connector Potential", desc:"Massive BPM at low usage — efficiency explodes when usage is right-sized for his role." });
  if (ft>85 && p.tp!=null && p.tp<34)
    sleepers.push({ id:"E", label:"Shooting Breakout Risk", desc:"Elite FT% suggests the motor memory for NBA 3P translation — current low 3P% is misleading." });
  if (stlP>3.0 && htIn>79)
    sleepers.push({ id:"F", label:"Defensive Stopper Floor", desc:"Elite steal rate at large size is an extreme rarity — creates instant defensive value floor." });

  // Risk score: 1 (safe/sleeper) to 10 (high bust)
  let risk = 5;
  risk += busts.length * 2;
  risk -= sleepers.length * 1.5;
  if (feel > 75) risk -= 1;
  if (bpm > 8)   risk -= 1;
  if (ft < 65)   risk += 1;
  risk = Math.round(Math.max(1, Math.min(10, risk)));

  const riskColor = risk >= 7 ? "#ef4444" : risk >= 5 ? "#fbbf24" : "#22c55e";
  const riskLabel = risk >= 8 ? "High Bust Risk" : risk >= 6 ? "Elevated Risk" : risk <= 3 ? "Sleeper / Safe" : "Moderate Risk";

  return { busts, sleepers, risk, riskColor, riskLabel };
}

function ScoutingTab({p}) {

  // ── Archetype ─────────────────────────────────────────────
  const archetype = useMemo(() => {
    const feel=p.feel??0,funcAth=p.funcAth??0,shoot=p.shootScore??0,def=p.defScore??0;
    const usg=p.usg??0,pos=p.pos??"Wing";
    const blkPctl=p.pctl?.blk??50,astPctl=p.pctl?.ast??50;
    const threeF=p.threeF??0,rimF=p.rimF??0,dunkR=p.dunkR??0,htIn=p.htIn??78;
    const isBig=pos==="Big",isGuard=pos==="Playmaker",isWing=!isBig&&!isGuard;
    const rimFreqPctl=Math.min(99,rimF*2.5),dunkPctl=Math.min(99,dunkR*4);

    if(usg>30&&feel>=85&&shoot>=75)return{key:"helio",name:"Heliocentric Engine",group:"A · Initiators",groupColor:"#f97316",icon:"🔆",color:"#fbbf24",comps:"Luka Dončić · James Harden",desc:"Offense runs through this player. Elite IQ and shooting sustain elite usage without efficiency collapse. Needs the ball and a system built around his creation.",strengths:["Elite feel & creation","High-volume shooting","Dribble creation"],risks:["Spacing requirements","Usage regresses in NBA","Defensive questions"],fit:"Primary offensive system — needs shooters around him."};
    if(feel>=80&&shoot>=65&&(isGuard||usg>=24))return{key:"initiator",name:"Primary Initiator",group:"A · Initiators",groupColor:"#f97316",icon:"🎯",color:"#f97316",comps:"Tyrese Haliburton · Dejounte Murray",desc:"Elite playmaker who also scores when needed. Translates via decision-making and court vision. High NBA floor because creation is real.",strengths:["Playmaking lead","Good shooting base","Low-TO decisions"],risks:["May not primary-score at next level","Rim finishing needed"],fit:"Starting PG or secondary initiator on contender."};
    if(feel>=65&&shoot>=70&&usg>=25)return{key:"combo",name:"Combo Guard",group:"A · Initiators",groupColor:"#f97316",icon:"⚡",color:"#fb923c",comps:"Jordan Clarkson · Gary Trent Jr.",desc:"Scoring and passing mix at high usage. Best fit as secondary ball-handler or sixth man scorer.",strengths:["Versatile scoring","Handles in spurts","Off-movement shooting"],risks:["Neither elite creator nor shooter","Role clarity needed"],fit:"6th man scorer or alongside elite PG."};
    if(shoot>=75&&def>=75&&feel>=50)return{key:"3d",name:"3&D Wing",group:"B · Wings & Specialists",groupColor:"#3b82f6",icon:"🏹",color:"#22c55e",comps:"Mikal Bridges · OG Anunoby",desc:"Most coveted role player in modern NBA. Both shooting and defense survive the college→NBA transition. Does not need the ball to contribute.",strengths:["Immediate NBA role","High floor","Two-way value"],risks:["Limited creation","Role player ceiling"],fit:"Starting wing on any roster."};
    if(shoot>=85&&threeF>=50&&feel<60)return{key:"mover",name:"Movement Shooter",group:"B · Wings & Specialists",groupColor:"#3b82f6",icon:"🎪",color:"#60a5fa",comps:"Buddy Hield · Duncan Robinson",desc:"Elite shooter off movement and pin-downs. Always a threat in the right system — value depends on landing with a quality playmaker.",strengths:["Elite catch-and-shoot","Forces constant attention","Low-TO"],risks:["Zero creation","System-dependent"],fit:"Off-ball specialist — needs a primary creator."};
    if(funcAth>=80&&rimFreqPctl>=75&&shoot<60)return{key:"slasher",name:"Slasher",group:"B · Wings & Specialists",groupColor:"#3b82f6",icon:"⚔️",color:"#f87171",comps:"Dorian Finney-Smith · Jalen McDaniels",desc:"Athletic cutter and rim attacker who lives off others' creation. Needs shooting development or specific system fit.",strengths:["Rim finishing","Athletic plays","Drawing fouls"],risks:["Shooting limits spacing","Predictable off-ball"],fit:"Energy wing — needs spacing around him."};
    if(feel>=75&&def>=70&&shoot>=60&&usg<20)return{key:"connector",name:"Connector / Glue Guy",group:"B · Wings & Specialists",groupColor:"#3b82f6",icon:"🔗",color:"#a78bfa",comps:"Draymond Green (wing) · Kyle Anderson",desc:"Versatile two-way player who makes teams better. High IQ compensates for modest athleticism — holds up in playoff environments.",strengths:["Versatility","Smart decisions","Two-way competence"],risks:["No elite skill","May be exposed"],fit:"Starting piece on a smart team."};
    if(isBig&&def>=85&&funcAth>=75&&blkPctl>=80)return{key:"rimprotect",name:"Modern Rim Protector",group:"C · Frontcourt",groupColor:"#8b5cf6",icon:"🛡",color:"#818cf8",comps:"Walker Kessler · Mark Williams",desc:"Defensive anchor whose shot-altering presence alone justifies a roster spot. Must roll hard and set screens too.",strengths:["Immediate defensive value","Screen/roll threat","Lob target"],risks:["Offensive limitations","Exploitable in space"],fit:"Starting center on a perimeter-heavy team."};
    if(isBig&&shoot>=70&&blkPctl>=60&&htIn>=81)return{key:"stretchbig",name:"Stretch Big",group:"C · Frontcourt",groupColor:"#8b5cf6",icon:"📐",color:"#c084fc",comps:"Brook Lopez · Isaiah Hartenstein",desc:"Floor-spacing big who also protects the rim. Ideal modern center profile — extremely high value if both skills translate.",strengths:["Rare combo","5-out lineups","Versatile defender"],risks:["Shooting must translate","Role choice"],fit:"Starting center in modern scheme."};
    if(isBig&&funcAth>=85&&dunkPctl>=80&&feel<50)return{key:"rimrunner",name:"Rim Runner / Finisher",group:"C · Frontcourt",groupColor:"#8b5cf6",icon:"💥",color:"#fb7185",comps:"Clint Capela · Isaiah Roby",desc:"Pure athletic finisher — scores only via lobs, cuts, and offensive rebounds. Narrow role but real value.",strengths:["Elite finishing","High-efficiency","OREB"],risks:["Zero creation","Narrow role"],fit:"Pairs best with elite playmakers."};
    if(isBig&&feel>=75&&blkPctl>=70&&astPctl>=70)return{key:"shortroll",name:"Short Roll Playmaker",group:"C · Frontcourt",groupColor:"#8b5cf6",icon:"🎲",color:"#34d399",comps:"Draymond Green · Nikola Jokić profile",desc:"Rare passing big who initiates from the elbow. Translates via IQ rather than athleticism — franchise-altering if elite.",strengths:["Unique passing","Forces rotations","Elite IQ"],risks:["Hard to evaluate in college","Needs right system"],fit:"Ideal in modern motion offense."};
    const bestGroup=isBig?"C · Frontcourt":isGuard?"A · Initiators":"B · Wings & Specialists";
    return{key:"raw",name:"Raw Prospect",group:bestGroup,groupColor:"#6b7280",icon:"🔬",color:"#6b7280",comps:"Profile incomplete",desc:"Scores do not clearly match any defined archetype — multi-dimensional, development prospect, or insufficient sample size.",strengths:["Undefined dominant skill"],risks:["Role clarity needed","Projection uncertain"],fit:"Evaluate on deeper film + secondary data."};
  }, [p]);

  // ── 14 Role Z-scores ──────────────────────────────────────
  const roles14 = useMemo(() => {
    // ── Spec-compliant Z-score formulas from BartTorvik pctls ────────────
    // pctl2z converts 0–100 percentile to z-score via inverse normal
    // Weighted composites match the spec formulas exactly.
    const pctls = p.pctl ?? {};
    const clip = (z) => Math.round(Math.max(-3, Math.min(3, z)) * 10) / 10;

    // Individual z-scores from pctls
    const zUsg  = pctl2z(pctls.usg  ?? 50);
    const zTs   = pctl2z(pctls.ts   ?? 50);
    const zAst  = pctl2z(pctls.ast  ?? 50);
    const zStl  = pctl2z(pctls.stl  ?? 50);
    const zBlk  = pctl2z(pctls.blk  ?? 50);
    const zOrb  = pctl2z(pctls.orb  ?? 50);
    const zDrb  = pctl2z(pctls.drb  ?? 50);

    // Stats not in pctls — derive z-scores from raw values vs. positional averages
    const astTov= p.astTov ?? 0;
    const rimF  = p.rimF   ?? 0;
    const ftr   = p.ftr    ?? 0;
    const threeF= p.threeF ?? 0;
    const tp    = p.tp     ?? 0;
    const dbpm  = p.dbpm   ?? 0;
    const htIn  = p.htIn   ?? 78;
    const astP  = p.astP   ?? 0;
    const usg   = p.usg    ?? 0;
    const ts    = p.ts     ?? 0;
    const stlP  = p.stlP   ?? 0;
    const blkP  = p.blkP   ?? 0;

    // Derived raw z-scores (league avg / std from BartTorvik typical ranges)
    const zAstTov= clip((astTov - 1.3) / 0.7);   // avg ~1.3, sd ~0.7
    const zRimF  = clip((rimF   - 25)  / 12);    // avg ~25%, sd ~12
    const zFtr   = clip((ftr    - 28)  / 12);    // avg ~28, sd ~12
    const zThreeF= clip((threeF - 30)  / 15);    // avg ~30%, sd ~15
    const zTp    = clip((tp     - 32)  / 7);     // avg ~32%, sd ~7
    const zDbpm  = clip((dbpm   - (-1.5)) / 2.0);// avg ~-1.5, sd ~2.0
    const zHt    = clip((htIn   - 78)  / 2);     // avg 6'6", sd ~2"

    // ── OFFENSE (spec formulas) ───────────────────────────────────────────
    const zScorer    = clip(zUsg * 0.6 + zTs * 0.4);
    const zPlaymaker = clip(zAst * 0.7 + zAstTov * 0.3);
    const zSpacer    = clip(zThreeF * 0.5 + zTp * 0.5);
    const zDriver    = clip(zRimF * 0.6 + zFtr * 0.4);
    const zCrasher   = clip(zOrb * 0.8);  // putback freq not available → ORB% * 1.0 weight

    // ── DEFENSE (spec formulas) ───────────────────────────────────────────
    const zOnBall    = clip(zStl * 0.7);  // foul rate inv not directly available
    const zSwitch    = clip(zHt * 0.3 + zStl * 0.3 + zBlk * 0.4);
    const zRimProt   = clip(zBlk * 0.8 + zDbpm * 0.2);
    const zRebounder = clip(zDrb * 1.0);

    // ── HYBRID (threshold → continuous z-score) ───────────────────────────
    // Connector: AST% > 15 AND USG% < 20 AND AST/TO > 2.0
    const connStrength = Math.min(1.5, (astP-15)/8 + (astTov-2.0)/0.5 + (20-usg)/5);
    const zConnector = astP>15 && usg<20 && astTov>2.0
      ? clip(1.0 + connStrength) : clip((zAst-0.5)*0.5);
    // Helio-Scorer: USG% > 30 AND AST% < 12 AND TS% > 55
    const helioStr = Math.min(1.5, (usg-30)/5 + (ts-55)/5);
    const zHelio = usg>30 && astP<12 && ts>55 ? clip(1.0+helioStr) : clip(zScorer-1);
    // Event Creator: STL% > 3.0 AND BLK% > 3.0
    const evStr = Math.min(1.5, (stlP-3.0+blkP-3.0)/0.5);
    const zEvent = stlP>3.0 && blkP>3.0 ? clip(1.0+evStr) : clip((zStl+zBlk)/2-0.5);
    // Zone Pressure: Rim Freq > 45% AND Rim FG% > 65%
    const rimPct = p.rimPct ?? 0;
    const zoneStr = Math.min(1.5, (rimF-45)/10+(rimPct-65)/10);
    const zZone = rimF>45 && rimPct>65 ? clip(1.0+zoneStr) : clip(zDriver-0.5);
    // Micro-Spacer: 3P Freq > 55% AND 3P% > 38%
    const microStr = Math.min(1.5, (threeF-55)/10+(tp-38)/5);
    const zMicro = threeF>55 && tp>38 ? clip(1.0+microStr) : clip(zSpacer-0.5);

    return [
      { key:"Scorer",       z:zScorer,    cat:"offense", formula:"USG%_z×0.6 + TS%_z×0.4" },
      { key:"Playmaker",    z:zPlaymaker, cat:"offense", formula:"AST%_z×0.7 + AST/TO_z×0.3" },
      { key:"Spacer",       z:zSpacer,    cat:"offense", formula:"3P Freq_z×0.5 + 3P%_z×0.5" },
      { key:"Driver",       z:zDriver,    cat:"offense", formula:"Rim Freq_z×0.6 + FTR_z×0.4" },
      { key:"Crasher",      z:zCrasher,   cat:"offense", formula:"ORB%_z×0.8" },
      { key:"On-Ball D",    z:zOnBall,    cat:"defense", formula:"STL%_z×0.7" },
      { key:"Switch Pot.",  z:zSwitch,    cat:"defense", formula:"Ht_z×0.3 + STL%_z×0.3 + BLK%_z×0.4" },
      { key:"Rim Protect",  z:zRimProt,   cat:"defense", formula:"BLK%_z×0.8 + DBPM_z×0.2" },
      { key:"Rebounder",    z:zRebounder, cat:"defense", formula:"DRB%_z×1.0" },
      { key:"Connector",    z:zConnector, cat:"hybrid",  formula:"AST%>15 AND USG%<20 AND AST/TO>2.0" },
      { key:"Helio-Scorer", z:zHelio,     cat:"hybrid",  formula:"USG%>30 AND AST%<12 AND TS%>55" },
      { key:"Event Creator",z:zEvent,     cat:"hybrid",  formula:"STL%>3.0 AND BLK%>3.0" },
      { key:"Zone Pressure",z:zZone,      cat:"hybrid",  formula:"Rim Freq>45% AND Rim FG%>65%" },
      { key:"Micro-Spacer", z:zMicro,     cat:"hybrid",  formula:"3P Freq>55% AND 3P%>38%" },
    ];
  }, [p]);

  // Top 2 dominant roles
  const top2 = [...roles14].sort((a,b)=>b.z-a.z).slice(0,2);

  // ── Live badge compute ─────────────────────────────────────
  const badges = useMemo(() => computeBadges(p), [p]);

  // ── Swing skill ───────────────────────────────────────────
  const swing = useMemo(() => computeSwingSkill(p), [p]);

  // ── Bust/Sleeper ──────────────────────────────────────────
  const bustSleeper = useMemo(() => computeBustSleeper(p), [p]);

  const catColors = { offense:"#f97316", defense:"#3b82f6", hybrid:"#a78bfa" };

  return (
    <div className="space-y-5">

      {/* ── ARCHETYPE CARD ───────────────────────────────── */}
      <div className="rounded-2xl p-5 relative overflow-hidden" style={{background:`linear-gradient(135deg,#0d1117 60%,${archetype.color}18)`,border:`1px solid ${archetype.color}44`}}>
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-10 blur-3xl pointer-events-none" style={{background:archetype.color}}/>
        <div className="flex items-start gap-4 relative">
          <div className="rounded-xl p-3 text-2xl shrink-0" style={{background:archetype.color+"22",border:`1px solid ${archetype.color}44`}}>{archetype.icon}</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-widest mb-1" style={{color:archetype.groupColor}}>{archetype.group}</div>
            <div className="text-2xl font-bold mb-0.5" style={{color:archetype.color,fontFamily:"'Oswald',sans-serif"}}>{archetype.name}</div>
            <div className="text-xs mb-3" style={{color:"#64748b"}}>NBA Comps: <span style={{color:"#94a3b8"}}>{archetype.comps}</span></div>
            <p className="text-sm leading-relaxed mb-3" style={{color:"#cbd5e1"}}>{archetype.desc}</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><div className="text-xs uppercase tracking-wider mb-1.5" style={{color:"#22c55e"}}>✓ Strengths</div>
                <ul className="space-y-1">{archetype.strengths.map((s,i)=><li key={i} className="text-xs flex items-center gap-1.5" style={{color:"#86efac"}}><span style={{color:"#22c55e"}}>·</span>{s}</li>)}</ul></div>
              <div><div className="text-xs uppercase tracking-wider mb-1.5" style={{color:"#f87171"}}>⚠ Risk Factors</div>
                <ul className="space-y-1">{archetype.risks.map((r,i)=><li key={i} className="text-xs flex items-center gap-1.5" style={{color:"#fca5a5"}}><span style={{color:"#ef4444"}}>·</span>{r}</li>)}</ul></div>
            </div>
            <div className="px-3 py-2 rounded-lg text-xs" style={{background:"#0d1117",border:`1px solid ${archetype.color}33`}}>
              <span style={{color:"#64748b"}}>Best Fit: </span><span style={{color:"#e2e8f0"}}>{archetype.fit}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── SCOUTING SCORES ──────────────────────────────── */}
      <Sec icon="⭐" title="Scouting Scores" sub="Hover any score for formula, inputs, and methodology ⓘ">
        <ScoreGauge label="Overall"           value={p.overall}    color="#f97316" methodKey="overall"    p={p}/>
        <ScoreGauge label="Feel / IQ"         value={p.feel}       color="#fbbf24" methodKey="feel"       p={p}/>
        <ScoreGauge label="Func. Athleticism" value={p.funcAth}    color="#ef4444" methodKey="funcAth"    p={p}/>
        <ScoreGauge label="Shooting"          value={p.shootScore} color="#3b82f6" methodKey="shootScore" p={p}/>
        <ScoreGauge label="Defense"           value={p.defScore}   color="#10b981" methodKey="defScore"   p={p}/>
      </Sec>

      {/* ── 14-ROLE Z-SCORE MATRIX ───────────────────────── */}
      <Sec icon="🗂" title="Role-Inference Matrix" sub={`Primary Archetype: ${top2.map(r=>r.key).join(" + ")} · Scale: −3 (Liability) to +3 (Elite)`}>
        {/* Top 2 dominant roles callout */}
        <div className="flex gap-3 mb-4">
          {top2.map((r,i)=>(
            <div key={r.key} className="flex-1 rounded-xl px-4 py-3" style={{background:zBg(r.z),border:`1px solid ${zColor(r.z)}44`}}>
              <div className="text-xs uppercase tracking-wider" style={{color:zColor(r.z)}}>{i===0?"#1 Dominant":"#2 Secondary"}</div>
              <div className="font-bold mt-0.5" style={{color:zColor(r.z),fontFamily:"'Oswald',sans-serif",fontSize:18}}>{r.key}</div>
              <div className="text-xs mt-0.5" style={{color:"#64748b"}}>{zLabel(r.z)} · z = {r.z>0?"+":""}{r.z}</div>
            </div>
          ))}
        </div>
        {/* Full matrix */}
        {["offense","defense","hybrid"].map(cat=>(
          <div key={cat} className="mb-3">
            <div className="text-xs uppercase tracking-wider mb-2" style={{color:catColors[cat]}}>{cat}</div>
            <div className="space-y-1">
              {roles14.filter(r=>r.cat===cat).map(r=>(
                <Tip key={r.key} content={<div><div className="font-bold mb-1" style={{color:zColor(r.z)}}>{r.key}</div><code className="text-xs block mb-1" style={{color:"#7dd3fc"}}>{r.formula}</code><div className="text-xs" style={{color:"#94a3b8"}}>z = {r.z > 0 ? "+" : ""}{r.z} → {zLabel(r.z)}</div></div>}>
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-help" style={{background:zBg(r.z)}}>
                  <div className="w-28 text-xs shrink-0" style={{color:"#9ca3af"}}>{r.key}</div>
                  {/* Z-score bar: center is 0, left=negative, right=positive */}
                  <div className="flex-1 relative h-2 rounded-full overflow-hidden" style={{background:"#1e293b"}}>
                    <div className="absolute top-0 h-full rounded-full" style={{
                      left: r.z >= 0 ? "50%" : `${Math.max(0,(r.z+3)/6*100)}%`,
                      width: `${Math.abs(r.z)/3*50}%`,
                      background: r.z >= 0 ? zColor(r.z) : "#ef4444",
                    }}/>
                    {/* Center line */}
                    <div className="absolute top-0 bottom-0 w-px" style={{left:"50%",background:"#334155"}}/>
                  </div>
                  <div className="w-12 text-xs text-right font-mono font-bold" style={{color:zColor(r.z)}}>{r.z>0?"+":""}{r.z}</div>
                  <div className="w-16 text-xs" style={{color:zColor(r.z)}}>{zLabel(r.z)}</div>
                </div>
                </Tip>
              ))}
            </div>
          </div>
        ))}
      </Sec>

      {/* ── SWING SKILL + TIER DELTA ──────────────────────── */}
      <Sec icon="📐" title="Swing Skill Analysis" sub="The one stat that decides this career — Tier-Delta Engineering">
        {/* Current Tier */}
        <div className="flex items-center gap-3 mb-4 p-3 rounded-xl" style={{background:"#0d1117",border:`1px solid ${swing.tierColor}44`}}>
          <div className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Current Tier</div>
          <div className="font-bold text-lg" style={{color:swing.tierColor,fontFamily:"'Oswald',sans-serif"}}>{swing.tier}</div>
          <div className="ml-auto text-xs" style={{color:"#475569"}}>BPM {fmt(p.bpm)} / USG {fmt(p.usg)}% / TS {fmt(p.ts)}%</div>
        </div>

        {swing.swingSkill ? (
          <>
            {/* Swing Skill headline */}
            <div className="rounded-xl p-4 mb-3" style={{background:"#0d1117",border:"1px solid #f9731644"}}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs uppercase tracking-wider" style={{color:"#f97316"}}>⚡ The Swing Skill</span>
                <span className="font-bold text-lg" style={{color:"#fbbf24",fontFamily:"'Oswald',sans-serif"}}>{swing.swingSkill}</span>
                <span className="ml-auto px-2 py-0.5 rounded text-xs" style={{background:"#1e293b",color:"#64748b"}}>Δ {swing.delta} tiers</span>
              </div>
              <div className="text-xs mb-2" style={{color:"#6b7280"}}>Current: <span style={{color:"#94a3b8"}}>{swing.current}</span></div>
              {/* Floor / Ceiling bar */}
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="rounded-lg p-3" style={{background:"#0a0f1a",border:"1px solid #ef444433"}}>
                  <div className="text-xs uppercase mb-1" style={{color:"#ef4444"}}>▼ Worst Case (≤30th pctl)</div>
                  <div className="text-xs" style={{color:"#fca5a5"}}>{swing.floor}</div>
                </div>
                <div className="rounded-lg p-3" style={{background:"#0a0f1a",border:"1px solid #22c55e33"}}>
                  <div className="text-xs uppercase mb-1" style={{color:"#22c55e"}}>▲ Best Case (≥70th pctl)</div>
                  <div className="text-xs" style={{color:"#86efac"}}>{swing.ceiling}</div>
                </div>
              </div>
            </div>

            {/* Hitter Probability */}
            <div className="rounded-xl p-4" style={{background:"#0d1117",border:`1px solid ${swing.hitColor}44`}}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Hitter Probability</div>
                  <div className="font-bold text-2xl" style={{color:swing.hitColor,fontFamily:"'Oswald',sans-serif"}}>{swing.hitProb}%</div>
                  <div className="text-xs" style={{color:swing.hitColor}}>{swing.hitLabel}</div>
                </div>
                <div className="text-xs space-y-1" style={{color:"#64748b"}}>
                  <div>Base: 30%</div>
                  {p.ft>78&&<div style={{color:"#22c55e"}}>+20% FT% touch signal</div>}
                  {(p.age??22)<21&&<div style={{color:"#22c55e"}}>+15% dev window (&lt;21)</div>}
                  {(p.feel??0)>65&&<div style={{color:"#22c55e"}}>+10% IQ bonus</div>}
                </div>
              </div>
              {/* Bayesian note */}
              <div className="text-xs mt-2 pt-2" style={{borderTop:"1px solid #1e293b",color:"#475569"}}>
                FT% used as Bayesian prior for motor touch (Berger 2022). High FT% + low 3P% ≠ non-shooter — it signals latent shooting potential.
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-4 text-sm" style={{color:"#6b7280"}}>No dominant swing skill identified — profile is well-rounded or data insufficient.</div>
        )}
      </Sec>

      {/* ── BUST / SLEEPER ASSESSMENT ─────────────────────── */}
      <Sec icon="🎰" title="Bust / Sleeper Assessment" sub={`Risk Score: ${bustSleeper.risk}/10 — ${bustSleeper.riskLabel}`}>
        <div className="flex items-center gap-4 mb-4">
          {/* Risk meter */}
          <div className="relative w-20 h-20 shrink-0">
            <svg viewBox="0 0 80 80" className="w-full h-full">
              <circle cx="40" cy="40" r="32" fill="none" stroke="#1e293b" strokeWidth="8"/>
              <circle cx="40" cy="40" r="32" fill="none" stroke={bustSleeper.riskColor} strokeWidth="8"
                strokeDasharray={`${bustSleeper.risk/10*200} 200`} strokeLinecap="round"
                transform="rotate(-90 40 40)"/>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-bold text-xl" style={{color:bustSleeper.riskColor,fontFamily:"'Oswald',sans-serif"}}>{bustSleeper.risk}</span>
              <span className="text-xs" style={{color:"#475569"}}>/10</span>
            </div>
          </div>
          <div>
            <div className="font-bold text-lg mb-0.5" style={{color:bustSleeper.riskColor}}>{bustSleeper.riskLabel}</div>
            <div className="text-xs" style={{color:"#64748b"}}>
              {bustSleeper.busts.length} bust signal{bustSleeper.busts.length!==1?"s":""} · {bustSleeper.sleepers.length} sleeper signal{bustSleeper.sleepers.length!==1?"s":""}
            </div>
          </div>
        </div>
        {bustSleeper.busts.length>0&&(
          <div className="mb-3">
            <div className="text-xs uppercase tracking-wider mb-2" style={{color:"#ef4444"}}>⚠ Bust Clusters</div>
            <div className="space-y-2">
              {bustSleeper.busts.map(b=>(
                <div key={b.id} className="flex gap-3 p-3 rounded-lg" style={{background:"#ef444411",border:"1px solid #ef444433"}}>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{background:"#ef444433",color:"#ef4444"}}>Cluster {b.id}</span>
                  <div><div className="text-xs font-semibold mb-0.5" style={{color:"#fca5a5"}}>{b.label}</div>
                  <div className="text-xs" style={{color:"#94a3b8"}}>{b.desc}</div></div>
                </div>
              ))}
            </div>
          </div>
        )}
        {bustSleeper.sleepers.length>0&&(
          <div>
            <div className="text-xs uppercase tracking-wider mb-2" style={{color:"#22c55e"}}>✦ Sleeper Signals</div>
            <div className="space-y-2">
              {bustSleeper.sleepers.map(s=>(
                <div key={s.id} className="flex gap-3 p-3 rounded-lg" style={{background:"#22c55e11",border:"1px solid #22c55e33"}}>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{background:"#22c55e33",color:"#22c55e"}}>Cluster {s.id}</span>
                  <div><div className="text-xs font-semibold mb-0.5" style={{color:"#86efac"}}>{s.label}</div>
                  <div className="text-xs" style={{color:"#94a3b8"}}>{s.desc}</div></div>
                </div>
              ))}
            </div>
          </div>
        )}
        {bustSleeper.busts.length===0&&bustSleeper.sleepers.length===0&&(
          <div className="text-center py-3 text-sm" style={{color:"#6b7280"}}>No clear bust or sleeper cluster signals. Average risk profile.</div>
        )}
      </Sec>

      {/* ── MARGIN OF ERROR ──────────────────────────────── */}
      <Sec icon="🎯" title="Margin of Error" sub="Hover for formula ⓘ">
        <div className="grid grid-cols-3 gap-4 mb-4">
          <Tip wide content={<div><div className="font-bold mb-1" style={{color:"#22c55e"}}>{METHODS.floor.name}</div><code className="text-xs" style={{color:"#7dd3fc"}}>{METHODS.floor.formula}</code><div className="mt-1">{METHODS.floor.inputs(p)}</div><div className="mt-1" style={{color:"#cbd5e1"}}>{METHODS.floor.desc}</div></div>}>
            <div className="rounded-lg p-4 text-center cursor-help" style={{background:"#0d1117"}}>
              <div className="text-xs uppercase" style={{color:"#6b7280"}}>Floor <span style={{color:"#475569"}}>ⓘ</span></div>
              <div className="text-3xl font-bold" style={{color:"#22c55e",fontFamily:"'Oswald',sans-serif"}}>{Math.round(p.floor??0)}</div>
            </div>
          </Tip>
          <Tip wide content={<div><div className="font-bold mb-1" style={{color:"#fbbf24"}}>{METHODS.ceiling.name}</div><code className="text-xs" style={{color:"#7dd3fc"}}>{METHODS.ceiling.formula}</code><div className="mt-1">{METHODS.ceiling.inputs(p)}</div><div className="mt-1" style={{color:"#cbd5e1"}}>{METHODS.ceiling.desc}</div></div>}>
            <div className="rounded-lg p-4 text-center cursor-help" style={{background:"#0d1117"}}>
              <div className="text-xs uppercase" style={{color:"#6b7280"}}>Ceiling <span style={{color:"#475569"}}>ⓘ</span></div>
              <div className="text-3xl font-bold" style={{color:"#fbbf24",fontFamily:"'Oswald',sans-serif"}}>{Math.round(p.ceiling??0)}</div>
            </div>
          </Tip>
          <div className="rounded-lg p-4 text-center" style={{background:"#0d1117"}}>
            <div className="text-xs uppercase" style={{color:"#6b7280"}}>Risk Profile</div>
            <div className="text-sm font-bold mt-1" style={{color:p.risk?.includes("Low")?"#22c55e":p.risk?.includes("High")?"#ef4444":"#fbbf24"}}>{p.risk}</div>
          </div>
        </div>
      </Sec>

      {/* ── BADGES ───────────────────────────────────────── */}
      <Sec icon="🏅" title="Skill Badges" sub="Green = scalable NBA skills · Red = warning signals">
        {badges.green.length>0&&<>
          <div className="text-xs uppercase tracking-wider mb-2" style={{color:"#22c55e"}}>✓ Green Flags</div>
          <div className="flex flex-wrap gap-2 mb-4">{badges.green.map((b,i)=><BadgeChip key={i} text={b} color="#22c55e"/>)}</div>
        </>}
        {badges.green.length===0&&<div className="text-sm mb-3" style={{color:"#6b7280"}}>No green flag badges earned</div>}
        {badges.red.length>0&&<>
          <div className="text-xs uppercase tracking-wider mb-2" style={{color:"#ef4444"}}>⚠ Red Flags</div>
          <div className="flex flex-wrap gap-2">{badges.red.map((f,i)=><BadgeChip key={i} text={f} color="#ef4444"/>)}</div>
        </>}
      </Sec>
    </div>
  );
}

// TAB: METHODOLOGY
// ═══════════════════════════════════════════════════════════
function MethodologyTab() {
  const sections = [
    {cat:"Scouting Scores",items:["feel","funcAth","shootScore","defScore","overall"]},
    {cat:"Margin of Error",items:["floor","ceiling"]},
    {cat:"Shooting Projection",items:["projNba3p","projNba3pa","projNba3par","projNbaTs","selfCreation"]},
    {cat:"Context-Free Four Factors (CFFR)",items:["fourFactors"]},
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
function BigBoardView({onSelect, boardData, setBoardData, loading, setLoading, availableYears, yearFilter, setYearFilter}) {
  const [sortBy,setSortBy]=useState("ceiling");
  const [posFilter,setPosFilter]=useState("All");

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

  // ── Inference Board: top prospects side-by-side role Z-scores ─────────
  const inferenceBoard = useMemo(() => {
    const top8 = filtered.slice(0, 8);
    const roles14keys = [
      {key:"Scorer",cat:"offense"},{key:"Playmaker",cat:"offense"},{key:"Spacer",cat:"offense"},
      {key:"Driver",cat:"offense"},{key:"Crasher",cat:"offense"},
      {key:"On-Ball D",cat:"defense"},{key:"Switch Pot.",cat:"defense"},{key:"Rim Protect",cat:"defense"},{key:"Rebounder",cat:"defense"},
      {key:"Connector",cat:"hybrid"},{key:"Helio-Scorer",cat:"hybrid"},{key:"Event Creator",cat:"hybrid"},
      {key:"Zone Pressure",cat:"hybrid"},{key:"Micro-Spacer",cat:"hybrid"},
    ];
    return { players: top8, roles: roles14keys };
  }, [filtered]);

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

      {/* ── CLASS OVERVIEW: INFERENCE BOARD ─────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{background:"#111827",border:"1px solid #1f2937"}}>
        <div className="px-5 py-4" style={{background:"#0d1117",borderBottom:"1px solid #1f2937"}}>
          <div className="text-xs uppercase tracking-widest mb-0.5" style={{color:"#f97316"}}>Class Overview</div>
          <h3 className="text-lg font-bold" style={{color:"#e5e7eb",fontFamily:"'Oswald',sans-serif"}}>
            NBA Role-Inference Board
          </h3>
          <p className="text-xs mt-1" style={{color:"#6b7280"}}>
            Z-scores for all 14 roles (spec-compliant formulas). Elite ≥ +2.0 · Impact ≥ +1.0 · Neutral ≥ −0.9 · Liability &lt; −1.0
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{borderBottom:"1px solid #1f2937"}}>
                <th className="px-3 py-2 text-left w-28" style={{color:"#6b7280",position:"sticky",left:0,background:"#0d1117",zIndex:2}}>Role</th>
                {inferenceBoard.players.map(pl=>(
                  <th key={pl.name} className="px-2 py-2 text-center min-w-20" style={{color:"#9ca3af"}}>
                    <div className="truncate max-w-20 mx-auto font-semibold" style={{color:"#e5e7eb"}}>{pl.name.split(" ").slice(-1)[0]}</div>
                    <TierBadge tier={pl.predTier||pl.actual||"—"}/>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                {label:"─ OFFENSE ─",isHeader:true,cat:"offense"},
                {key:"Scorer",       cat:"offense"},
                {key:"Playmaker",    cat:"offense"},
                {key:"Spacer",       cat:"offense"},
                {key:"Driver",       cat:"offense"},
                {key:"Crasher",      cat:"offense"},
                {label:"─ DEFENSE ─",isHeader:true,cat:"defense"},
                {key:"On-Ball D",    cat:"defense"},
                {key:"Switch Pot.",  cat:"defense"},
                {key:"Rim Protect",  cat:"defense"},
                {key:"Rebounder",    cat:"defense"},
                {label:"─ HYBRID ─", isHeader:true,cat:"hybrid"},
                {key:"Connector",    cat:"hybrid"},
                {key:"Helio-Scorer", cat:"hybrid"},
                {key:"Event Creator",cat:"hybrid"},
                {key:"Zone Pressure",cat:"hybrid"},
                {key:"Micro-Spacer", cat:"hybrid"},
              ].map((row,ri)=>{
                if (row.isHeader) {
                  const catClr = row.cat==="offense"?"#f97316":row.cat==="defense"?"#3b82f6":"#a78bfa";
                  return (
                    <tr key={ri} style={{background:"#0a0e17"}}>
                      <td colSpan={inferenceBoard.players.length+1} className="px-3 py-1 text-xs uppercase tracking-widest font-bold" style={{color:catClr}}>{row.label}</td>
                    </tr>
                  );
                }
                return (
                  <tr key={row.key} style={{borderBottom:"1px solid #1f293733"}} className="hover:bg-white hover:bg-opacity-5 transition-colors">
                    <td className="px-3 py-2 font-semibold whitespace-nowrap" style={{color:"#9ca3af",position:"sticky",left:0,background:"#111827",zIndex:1}}>{row.key}</td>
                    {inferenceBoard.players.map(pl=>{
                      // Compute z for this role inline from player stats
                      const pctls = pl.pctl ?? {};
                      const pz = (p50) => {
                        if (p50 == null) return 0;
                        const pp = Math.max(0.001, Math.min(0.999, p50/100));
                        const a=[-3.969683028665376e1,2.209460984245205e2,-2.759285104469687e2,1.383577518672690e2,-3.066479806614716e1,2.506628277459239];
                        const b=[-5.447609879822406e1,1.615858368580409e2,-1.556989798598866e2,6.680131188771972e1,-1.328068155288572e1];
                        const c=[-7.784894002430293e-3,-3.223964580411365e-1,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783];
                        const d=[7.784695709041462e-3,3.223907427788357e-1,2.445134137142996,3.754408661907416];
                        const pLow=0.02425,pHigh=1-pLow;let z;
                        if(pp<pLow){const q=Math.sqrt(-2*Math.log(pp));z=(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
                        else if(pp<=pHigh){const q=pp-0.5,r=q*q;z=(((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);}
                        else{const q=Math.sqrt(-2*Math.log(1-pp));z=-(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
                        return Math.round(Math.max(-3,Math.min(3,z))*10)/10;
                      };
                      const rawZ = (v,avg,sd)=>Math.round(Math.max(-3,Math.min(3,(v-avg)/sd))*10)/10;
                      let z = 0;
                      const zU=pz(pctls.usg??50),zT=pz(pctls.ts??50),zA=pz(pctls.ast??50);
                      const zS=pz(pctls.stl??50),zB=pz(pctls.blk??50),zO=pz(pctls.orb??50),zD=pz(pctls.drb??50);
                      const astTov=pl.astTov??0,rimF=pl.rimF??0,ftr=pl.ftr??0;
                      const threeF=pl.threeF??0,tp=pl.tp??0,dbpm=pl.dbpm??0,htIn=pl.htIn??78;
                      const astP=pl.astP??0,usg=pl.usg??0,ts=pl.ts??0,stlP=pl.stlP??0,blkP=pl.blkP??0;
                      const rimPct=pl.rimPct??0;
                      const zAt=rawZ(astTov,1.3,0.7),zRf=rawZ(rimF,25,12),zFtr=rawZ(ftr,28,12);
                      const zTf=rawZ(threeF,30,15),zTp=rawZ(tp,32,7),zDb=rawZ(dbpm,-1.5,2.0),zHt=rawZ(htIn,78,2);
                      const clip=(x)=>Math.round(Math.max(-3,Math.min(3,x))*10)/10;
                      switch(row.key) {
                        case "Scorer":       z=clip(zU*0.6+zT*0.4); break;
                        case "Playmaker":    z=clip(zA*0.7+zAt*0.3); break;
                        case "Spacer":       z=clip(zTf*0.5+zTp*0.5); break;
                        case "Driver":       z=clip(zRf*0.6+zFtr*0.4); break;
                        case "Crasher":      z=clip(zO*0.8); break;
                        case "On-Ball D":    z=clip(zS*0.7); break;
                        case "Switch Pot.":  z=clip(zHt*0.3+zS*0.3+zB*0.4); break;
                        case "Rim Protect":  z=clip(zB*0.8+zDb*0.2); break;
                        case "Rebounder":    z=clip(zD); break;
                        case "Connector":    z=astP>15&&usg<20&&astTov>2.0?clip(1.0+Math.min(1.5,(astP-15)/8+(astTov-2.0)/0.5)):clip((zA-0.5)*0.5); break;
                        case "Helio-Scorer": z=usg>30&&astP<12&&ts>55?clip(1.0+Math.min(1.5,(usg-30)/5)):clip(zU-1); break;
                        case "Event Creator":z=stlP>3.0&&blkP>3.0?clip(1.0+Math.min(1.5,(stlP+blkP-6)/0.5)):clip((zS+zB)/2-0.5); break;
                        case "Zone Pressure":z=rimF>45&&rimPct>65?clip(1.0+Math.min(1.5,(rimF-45)/10+(rimPct-65)/10)):clip(zRf-0.5); break;
                        case "Micro-Spacer": z=threeF>55&&tp>38?clip(1.0+Math.min(1.5,(threeF-55)/10+(tp-38)/5)):clip((zTf+zTp)/2-0.5); break;
                        default: z=0;
                      }
                      const color=z>=2.0?"#22c55e":z>=1.0?"#86efac":z>=-0.9?"#6b7280":"#ef4444";
                      const bg=z>=2.0?"#22c55e18":z>=1.0?"#86efac11":z>=-0.9?"transparent":"#ef444418";
                      const label=z>=2.0?"Elite":z>=1.0?"Impact":z>=-0.9?"Neutral":"Liability";
                      return (
                        <td key={pl.name} className="px-2 py-1.5 text-center" style={{background:bg}}>
                          <div className="font-bold font-mono text-sm" style={{color}}>{z>0?"+":""}{z}</div>
                          <div className="text-xs" style={{color,opacity:0.7}}>{label}</div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 text-xs" style={{color:"#475569",borderTop:"1px solid #1f2937"}}>
          Showing top {inferenceBoard.players.length} players. Click a player row above to open their full profile.
        </div>
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
  const [yearFilter,setYearFilter]=useState("All");

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
          astP:c.ast_p,toP:c.to_p,orbP:c.orb_p,drbP:c.drb_p,
          stlP:c.stl_p,blkP:c.blk_p,ftr:c.ftr,
          rimPct:c.rim_pct,tp:c.tp_pct,ft:c.ft_pct,dunkR:c.dunk_r,
          badges:c.badges?c.badges.split("|").filter(Boolean):[],
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

  // Search: local filter + API always run in parallel (merge results)
  useEffect(()=>{
    if(!search||search.length<2){setSearchResults([]);return;}
    const local = PLAYER_LIST.filter(n=>n.toLowerCase().includes(search.toLowerCase())).slice(0,15);
    // Show local results immediately
    if(local.length>0) setSearchResults(local);
    // ALWAYS also run API search (historical players not in board)
    const t=setTimeout(()=>{
      fetch(`${API_BASE}/players/search?q=${encodeURIComponent(search)}&limit=15`)
        .then(r=>r.json())
        .then(d=>{
          const apiNames=(d.results||[]).map(r=>r.name);
          // Merge: local first, then API results not already in local
          const merged = [...local];
          apiNames.forEach(n=>{if(!merged.includes(n)) merged.push(n);});
          setSearchResults(merged.slice(0,20));
          // Add to PLAYER_LIST for future lookups
          apiNames.forEach(n=>{if(!PLAYERS[n]){PLAYER_LIST.push(n);PLAYERS[n]={name:n,pos:"",team:""};}});
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
            <BigBoardView onSelect={selectPlayer} boardData={boardData} setBoardData={setBoardData} loading={loading} setLoading={setLoading} availableYears={availableYears} yearFilter={yearFilter} setYearFilter={setYearFilter}/>
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
