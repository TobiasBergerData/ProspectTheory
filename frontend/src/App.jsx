import { useState, useEffect, useMemo, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, Cell, ResponsiveContainer, AreaChart, Area, CartesianGrid } from "recharts";

// ═══════════════════════════════════════════════════════════
// CONSTANTS & HELPERS
// ═══════════════════════════════════════════════════════════
const TC = { Superstar:"#fbbf24","All-Star":"#f97316",Starter:"#3b82f6","Role Player":"#06b6d4",Replacement:"#8b5cf6",Negative:"#6b7280","Never Made NBA":"#374151","Out":"#374151" };
const valColor = (pctl) => { if(pctl==null)return"#6b7280";if(pctl>=90)return"#22c55e";if(pctl>=75)return"#86efac";if(pctl>=60)return"#a3e635";if(pctl>=40)return"#fbbf24";if(pctl>=25)return"#f97316";return"#ef4444"; };
const valBg = (pctl) => valColor(pctl)+"18";
const fmt = (v,d=1) => v!=null?Number(v).toFixed(d):"—";
const pct = (v) => v!=null?(v*100).toFixed(1)+"%":"—";

// Tier thresholds for comparison
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
        <div className={`fixed z-50 ${wide?"w-96":"w-72"} p-3 rounded-lg shadow-2xl text-xs leading-relaxed pointer-events-none`}
          style={{left:Math.min(pos.x-144,window.innerWidth-400),top:Math.max(pos.y-8,8),transform:"translateY(-100%)",
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
    name: "IQ & Feel",
    formula: "(pctl(AST%) × 0.6 + pctl(AST/TO) × 0.4) × League_Adj",
    desc: "Basketball IQ through decision-making proxies. High AST/TO + smart creation = high feel. International players receive a 1.25× league adjustment because assist rates are typically lower in FIBA systems.",
  },
  funcAth: {
    name: "Functional Athleticism",
    formula: "pctl(FTr) × 0.40 + pctl(Dunk%) × 0.30 + pctl(OREB%) × 0.30",
    desc: "How athletic gifts manifest in-game. Driving to the rim, dunking, offensive glass work. Not raw combine athleticism — functional NBA translation.",
  },
  shootScore: {
    name: "Shooting",
    formula: "pctl(FT%) × 0.40 + pctl(3PA/40) × 0.40 + pctl(3P%) × 0.20",
    desc: "FT% weighted highest because it's the single best predictor of NBA shooting translation (Berger, 2023). Volume (3PA/40) valued over raw percentage because willingness to shoot predicts NBA role.",
  },
  defScore: {
    name: "Defensive Impact",
    formula: "(pctl(STL%) × 0.35 + pctl(BLK%) × 0.35 + pctl(DBPM) × 0.30) × Intl_Adj",
    desc: "Position-weighted defensive value. International players get a 1.15× uplift as FIBA rules and pace suppress raw defensive stats. Stocks threshold bonus for dual-threat defenders.",
  },
  selfCreation: {
    name: "Self-Creation",
    formula: "pctl(Creation_Proxy) × 0.70 + pctl(USG%) × 0.30",
    desc: "Measures ability to create own shot. Creation_Proxy = (USG% × 0.7) + (AST% × 0.3). High self-creation = can generate offense without plays being run.",
  },
  overall: {
    name: "Overall Production Rating",
    formula: "Age-Adj BPM pctl × 0.30 + Feel × 0.15 + Func Ath × 0.15 + Shooting × 0.20 + Defense × 0.15 + Height Bonus + Wingspan Bonus",
    desc: "Master composite. Age-adjusted BPM penalizes older players: BPM − (age−20)×0.5. Height bonus: +1.5pts/inch above position average. Captures total prospect value.",
  },
  projNba3p: {
    name: "Projected NBA 3P% (Bayesian Beta-Binomial)",
    formula: "Posterior = (κ·μ₀ + 3PM) / (κ + 3PA)  where μ₀ = 0.20 + 0.18·FT% + 0.05·Mid%, κ=200",
    desc: "Bayesian conjugate update (Berger 2022). The prior μ₀ encodes FT%-based motor touch — neuromuscular consistency that predicts NBA shooting. κ=200 pseudo-attempts means low-volume shooters regress heavily toward their FT%-derived prior ('Blake Griffin Check': 12 college 3PA → 94% prior weight). High-volume shooters (300+ 3PA) let data dominate.",
  },
  projNba3pa: {
    name: "Projected NBA 3PA/game (Elastic)",
    formula: "proj_nba_fga × proj_3par / 100  where FGA scales by usage (8.5–15.0)",
    desc: "No longer fixed at 10.5 FGA. High-usage creators (high USG%, low %Assisted) scale up to 15.0 FGA/game; role players scale down to 8.5. This 'elasticity' captures that primary scorers take more shots in the NBA.",
  },
  projNba3par: {
    name: "Projected NBA 3P Attempt Rate",
    formula: "3P_freq × 0.80 + FT% touch bonus + 5 (NBA era)",
    desc: "What % of NBA shots will be threes. College 3P frequency as base, scaled 0.8× for maturity. FT% touch bonus reflects coaches green-lighting shooters. Blake Griffin adjustment for extremely low-volume shooters.",
  },
  touchPrior: {
    name: "Touch Prior (μ₀)",
    formula: "0.20 + 0.18 × FT% + 0.05 × Mid%",
    desc: "The Bayesian prior for NBA 3P%. Based on FT% (neuromuscular touch consistency) and midrange accuracy (shooting-range indicator). A player with 85% FT + 28% 3P has vastly more latent potential than one with 65% FT + 35% 3P. Replaces TS% as the primary touch indicator.",
  },
  fourFactors: {
    name: "Possession Impact & Carefree Playability (CFFR)",
    formula: "reliability × (0.40 × z_eFG + 0.25 × z_TOV + 0.20 × z_ORB + 0.15 × z_FTR)",
    desc: "Usage-role-adjusted Four Factors measuring possession efficiency. Players bucketed by usage (Primary ≥28%, Secondary ≥22%, Finisher ≥15%, LowUsage <15%). Each factor z-scored within role × season. NPV > +2.0 = 'Elite Floor Raiser', +0.5–2.0 = 'Winning Piece', −0.5–0.5 = 'Role Dependent', < −1.0 = 'High Maintenance'. This is NOT a talent rating — it's an efficiency index measuring how 'expensive' it is for a coach to keep this player on the floor.",
  },
  monteCarlo: {
    name: "Monte Carlo Projection (20k runs)",
    formula: "UPS = E[0.65 × prod_z + 0.35 × impact_z] × age_factor × pos_value",
    desc: "20,000 simulations from Normal(ASPM_adj, σ). Production (65%): BPM for NCAA / ASPM for Intl. Impact (35%): PORPAG for NCAA / eDiff for Intl. Both z-scored within source × position, then blended. Age factor: ≤20=bonus, >22=penalty. Tier thresholds on ASPM scale: Superstar >14, All-Star 10–14, Starter 7.5–10, Roleplayer 5–7.5, Replacement 3–5, Out <3.",
  },
  posClassification: {
    name: "Position Classification",
    formula: "Functional position from height + stats: Playmaker, Wing, Big, Jumbo Creator, Stretch Big",
    desc: "Assigns functional position based on measurables and statistical profile. 'Jumbo Creator' = big with elite creation (1.15× pos_value). 'Stretch Big' = shooting big (1.05× pos_value).",
  },
};

// ═══════════════════════════════════════════════════════════
// BADGE DEFINITIONS (Expanded — 40+ badges with International & Youth Engine)
// ═══════════════════════════════════════════════════════════
const BADGE_DEFS = {
  // ── GREEN — Elite NBA-scalable skills ──
  "Elite Shooting":         { cat:"green", rule:"3P%>40 & 3PA/40>6.0 & FT%>85",        desc:"Top-tier shooting across both lines + elite volume. Most translatable skill in modern NBA. Berger (2023): FT% is the #1 predictor." },
  "Floor General":          { cat:"green", rule:"(G) AST/TO>2.2 & AST%>25",            desc:"Elite decision-making with vision. Creates for others without turnovers — the rarest guard skill." },
  "Two-Way Wing":           { cat:"green", rule:"(W) 3P%>35 & (STL%>2.2 OR DBPM>2.0)",desc:"Shooting + perimeter defense. Most coveted role player archetype in modern NBA. Immediate starter value." },
  "Modern Rim Anchor":      { cat:"green", rule:"(B) BLK%>4.0 & DBPM>2.5",            desc:"Elite rim protection with overall defensive impact. Anchors a top-10 defense by itself." },
  "Point Big":              { cat:"green", rule:"(B) AST%>18 & AST/TO>1.2",            desc:"Playmaking big — Jokic/Draymond archetype. Creates from the post/elbow with low turnovers. Extremely rare." },
  "Stocks Machine":         { cat:"green", rule:"(STL%+BLK%)>4.8",                     desc:"Defensive disruption at both perimeter and rim. Historically rare combination that warps opposing offense." },
  "Versatile Stopper":      { cat:"green", rule:"(W/B) Ht>=6'7\" & STL%>1.6 & BLK%>1.8",desc:"Length + perimeter + rim. Can guard 1-through-5 in switching schemes. Premium defensive versatility." },
  "Transition Terror":      { cat:"green", rule:"(G/W) STL%>2.5 & Dunk%>60th pctl",   desc:"Creates fast breaks via steals and finishes above the rim. Free points in transition. Fallback: STL%>2.8 & 2P%>55 (for intl without dunk data)." },
  "FT Grifter":             { cat:"green", rule:"FTr>45 & (Rim%>40th pctl OR USG%>24)",desc:"Elite at drawing fouls through contact. Free throws = free points. High FTr at volume is extremely valuable." },
  "Efficient High Usage":   { cat:"green", rule:"USG>28 & TO%<12 & TS%>58",            desc:"Handles elite volume without efficiency collapse. The 'carry' badge — this player IS the offense." },
  "High-Feel Athlete":      { cat:"green", rule:"Feel>75 & Func Ath>75",               desc:"Rarest badge — elite IQ + elite athleticism. Almost always translates to NBA." },
  "Lurking Elite":          { cat:"green", rule:"USG%<20 & BPM>7.0 & TS%>62",          desc:"The Haliburton-Effect: Massively underutilized talent. Low usage masks star-level production. Efficiency explodes in a larger NBA role." },
  "Analytics Darling":      { cat:"green", rule:"BPM>8.0 & TS%>60 & USG%<22",          desc:"Maximum efficiency at moderate volume — the analytics dream. Statistical impact far exceeds perception." },
  "Efficiency Monster":     { cat:"green", rule:"eFG%>60 & AST/TO>2.0 & STL%>2.0",    desc:"Elite efficiency + elite decision-making + defensive activity. Multi-pillar excellence that guarantees NBA value." },
  "Defensive Stopper Floor":{ cat:"green", rule:"Ht>=6'8\" & STL%>2.5",                desc:"Elite steal rate at plus size. Guaranteed defensive value in any NBA lineup — switchable perimeter stopper." },
  "Glue-Guy Connector":     { cat:"green", rule:"AST/TO>2.5 & DBPM>2.0 & USG%<16",    desc:"High-end role player archetype. Connects offense without mistakes, contributes defensively. Every contender needs this." },

  // ── GREEN — International & Youth Dominance ──
  "International Prodigy":  { cat:"green", rule:"Age < Avg-1.5yr & EFF top 10 pctl",   desc:"1.5+ years younger than tournament peers while statistically dominating. Historically the strongest predictor of NBA stardom. Precociousness multiplier: 1.5x risk reduction.", icon:"globe" },
  "Pro-Ready Teen":         { cat:"green", rule:"Pro League & Age<19 & BPM>2.0",       desc:"Positive impact as a teenager in a professional men's league (ACB, EuroLeague, BBL). Physically and mentally NBA-ready before most prospects enter college.", icon:"globe" },

  // ── YELLOW — Potential / Swing skills ──
  "Latent Sniper":          { cat:"yellow", rule:"FT%>85 & 3P%<33",                    desc:"Elite FT% signals neuromuscular shooting consistency that hasn't yet translated to 3P range. Bayesian prior strongly favors breakout — mechanics are there, volume will follow." },
  "Latent Touch":           { cat:"yellow", rule:"FT%>80 & 3P%<32",                    desc:"Good FT% with weak 3P%. The gap suggests development potential — motor memory is trainable. Watch for improvement trajectory." },
  "Raw Project":            { cat:"yellow", rule:"Age<19.5 & IQ_Pillar<40",            desc:"Young + raw = massive development runway. IQ can be taught with reps. Physical tools are already there." },
  "Interior Engine":        { cat:"yellow", rule:"(W/B) Rim_Proxy>80th & AST%>15",     desc:"Rim pressure + playmaking from the paint. If shooting develops, this becomes a franchise cornerstone. Fallback: FTr>45 & AST%>15." },

  // ── RED — Warning signals (Bust Signals) ──
  "Spacing Killer":         { cat:"red",   rule:"(G/W) 3P%<30 & 3PA/40<3.5",           desc:"Guards/wings who don't threaten from three destroy NBA spacing. Defenders sag off, clogging paint for teammates." },
  "Efficiency Trap":        { cat:"red",   rule:"USG%>26 & TS%<52",                    desc:"High volume, low efficiency. Scoring a lot but hurting the team. Usage will drop in NBA — production collapses." },
  "Empty Calorie Scorer":   { cat:"red",   rule:"USG%>28 & TS%<52 & AST%<15",          desc:"Bust signal: Inefficient ball-dominant scorer who doesn't create for others. Volume without value — the most dangerous profile in the draft." },
  "One-Way Project":        { cat:"red",   rule:"OBPM>3.0 & DBPM<-1.5 & STL%<1.0",    desc:"Offensive hype, defensive liability. All-offense players get benched in playoff rotations when coaching tightens up." },
  "Soft Interior":          { cat:"red",   rule:"(B) FTr<22 & BLK%<2.0",               desc:"Center without physicality or rim protection. No paint presence, no foul drawing. Can't anchor a defense at any level." },
  "Non-Processing Guard":   { cat:"red",   rule:"(G) AST/TO<0.8 & TOV%>20",            desc:"Athleticism without processing speed. High turnover rate with poor assist ratios = decision-making doesn't project to NBA pace." },
  "Tunnel Vision":          { cat:"red",   rule:"(G/W) AST/TO<0.7 & USG%>22",         desc:"Ball-dominant without creating for others. NBA defenses will scheme against predictable scorers." },
  "Passive Scorer":         { cat:"red",   rule:"FTr<20",                              desc:"Avoids contact entirely. Jump-shot dependent offense is hard to sustain in NBA when contested." },
  "Foul Magnet":            { cat:"red",   rule:"Fouls/40>4.8",                        desc:"Foul trouble limits minutes. Signals poor mobility, discipline, or defensive IQ at the next level." },
  "Liability Big":          { cat:"red",   rule:"(B) DRB%<15 OR BLK%<1.5",            desc:"Bigs without rebounding or rim protection are a defensive sinkhole. Can't stay on the floor in playoffs." },
  "Defensive Target":       { cat:"red",   rule:"(G) Ht<6'2\" & DBPM<-1.0",           desc:"Small guards with negative defensive impact get hunted in playoffs. Physical weakness that coaching can't fix." },
  "Non-Spacing Guard":      { cat:"red",   rule:"(G) 3P%<30 & 3P Freq<20%",           desc:"Guards who don't shoot threes can't play off-ball in modern NBA. Limits lineup construction severely." },
  "All-Offense Big":        { cat:"red",   rule:"(B) BLK%<2.5 & DBPM<1.5",            desc:"Bigs without rim protection are a defensive liability at every level. Offense doesn't compensate." },
  "FT Concern":             { cat:"red",   rule:"FT%<65 & USG>25",                    desc:"Hack-a-Player target at high usage. Opposing coaches will exploit this in close games." },
};

// ── Position group for badge logic (consistent with resolvePosition) ──
function getBadgePos(p) {
  // If pos is already resolved to Playmaker/Wing/Big, use that
  const resolved = p.pos;
  if (resolved === "Playmaker") return "G";
  if (resolved === "Big") return "B";
  if (resolved === "Wing") return "W";

  // Fallback: height-based (for tmpP objects that don't have pos)
  const htIn = p.htIn ?? 78;
  const astP = p.astP ?? 0;
  const usg = p.usg ?? 0;
  // Ball-handler override (with height guard)
  if (htIn < 79 && astP > 25 && usg > 22) return "G";
  if (htIn < 79 && astP > 30) return "G";
  if (astP > 32) return "G"; // True point-big
  if (htIn <= 75) return "G";
  if (htIn >= 82) return "B";
  return "W";
}

// ── Client-side badge computation (with International Adjuster + Fallbacks) ──
function computeBadges(p) {
  const pos = getBadgePos(p);
  const isG = pos === "G", isW = pos === "W", isB = pos === "B";
  const isIntl = (p.source && p.source !== "ncaa") || (p.league && p.league !== "NCAA");

  // ── International Adjuster: scale up stats for badge checks ──
  const intlMult = isIntl ? 1.25 : 1.0;
  const badgeStocksMult = isIntl ? 1.15 : 1.0; // extra multiplier for STL%/BLK% in badge checks

  const ft = p.ft ?? 0, tp = p.tp ?? 0, threeF = p.threeF ?? 0;
  const astP = (p.astP ?? 0) * intlMult;
  const astTov = p.astTov ?? 0;
  const stlP = (p.stlP ?? 0) * intlMult * badgeStocksMult;
  const blkP = (p.blkP ?? 0) * intlMult * badgeStocksMult;
  const usg = (p.usg ?? 0) * intlMult;
  const toP = p.toP ?? 0, ts = p.ts ?? 0;
  const ftr = p.ftr ?? 0, rimF = p.rimF ?? 0, rimPct = p.rimPct ?? 0;
  const dbpm = (p.dbpm ?? 0) * intlMult;
  const obpm = (p.obpm ?? 0) * intlMult;
  const bpm = (p.bpm ?? 0) * intlMult;
  const feel = p.feel ?? 0, funcAth = p.funcAth ?? 0;
  const htIn = p.htIn ?? 78, drbP = (p.drbP ?? 0) * intlMult;
  const efg = p.efg ?? (ts > 0 ? ts - 3 : 0); // rough eFG proxy
  const tovP = toP;
  const twoPct = p.twoPct ?? (p.fg ?? 45); // 2P% fallback
  const age = p.age ?? 22;

  // ── Proxies ──
  const creationProxy = (usg * 0.7) + (astP * 0.3);
  const rimProxy = (ftr * 0.8) + (twoPct * 0.2);
  const dunkR = p.dunkR ?? 0;
  const tpa40 = (threeF / 100) * ((p.min ?? 30) * (p.pts ?? 15) / ((p.fg ?? 45) / 100)) / 40;

  const green = [], yellow = [], red = [];

  // ═══ GREEN BADGES ═══
  // Elite Shooting (tighter thresholds)
  if (tp > 40 && threeF > 30 && ft > 85)                            green.push("Elite Shooting");
  else if (ft > 82 && tp > 38 && threeF > 25)                       green.push("Elite Shooting"); // legacy threshold as fallback
  // Floor General
  if (isG && astTov > 2.2 && astP > 25)                             green.push("Floor General");
  // Two-Way Wing
  if (isW && tp > 35 && (stlP > 2.2 || dbpm > 2.0))                green.push("Two-Way Wing");
  // Modern Rim Anchor
  if (isB && blkP > 4.0 && dbpm > 2.5)                              green.push("Modern Rim Anchor");
  // Point Big
  if (isB && astP > 18 && astTov > 1.2)                             green.push("Point Big");
  // Stocks Machine
  if ((stlP + blkP) > 4.8)                                          green.push("Stocks Machine");
  // Versatile Stopper (with intl fallback: heavier DBPM weighting)
  if ((isW || isB) && htIn >= 79 && stlP > 1.6 && blkP > 1.8)      green.push("Versatile Stopper");
  else if (isIntl && (isW || isB) && htIn >= 79 && dbpm > 3.0)      green.push("Versatile Stopper");
  // Transition Terror (with fallback for no dunk data)
  if ((isG || isW) && stlP > 2.5 && dunkR > 8)                      green.push("Transition Terror");
  else if ((isG || isW) && stlP > 2.8 && twoPct > 55)               green.push("Transition Terror");
  // FT Grifter
  if (ftr > 45 && (rimF > 25 || usg > 24))                          green.push("FT Grifter");
  // Efficient High Usage
  if (usg > 28 && toP < 12 && ts > 58)                              green.push("Efficient High Usage");
  // High-Feel Athlete
  if (feel > 75 && funcAth > 75)                                     green.push("High-Feel Athlete");
  // Lurking Elite (Haliburton-Effekt)
  if (usg < 20 && bpm > 7.0 && ts > 62)                             green.push("Lurking Elite");
  // Analytics Darling
  if (bpm > 8.0 && ts > 60 && usg < 22)                             green.push("Analytics Darling");
  // Efficiency Monster
  if (efg > 60 && astTov > 2.0 && stlP > 2.0)                      green.push("Efficiency Monster");
  // Defensive Stopper Floor
  if (htIn >= 80 && stlP > 2.5)                                     green.push("Defensive Stopper Floor");
  // Glue-Guy Connector
  if (astTov > 2.5 && dbpm > 2.0 && usg < 16)                      green.push("Glue-Guy Connector");
  // International Prodigy (age gap badges — simplified check)
  if (isIntl && age < 18.5 && bpm > 4.0)                            green.push("International Prodigy");
  // Pro-Ready Teen
  if (isIntl && age < 19 && bpm > 2.0)                              green.push("Pro-Ready Teen");

  // ═══ YELLOW BADGES ═══
  // Latent Sniper (stricter)
  if (ft > 85 && tp < 33)                                           yellow.push("Latent Sniper");
  // Latent Touch (broader)
  else if (ft > 80 && tp < 32)                                      yellow.push("Latent Touch");
  // Raw Project
  if (age < 19.5 && feel < 40)                                      yellow.push("Raw Project");
  // Interior Engine (with FTr fallback for no rim tracking)
  if ((isW || isB) && rimF > 30 && astP > 15)                       yellow.push("Interior Engine");
  else if ((isW || isB) && ftr > 45 && astP > 15)                   yellow.push("Interior Engine");

  // ═══ RED BADGES ═══
  // Spacing Killer
  if ((isG || isW) && tp < 30 && threeF < 18)                       red.push("Spacing Killer");
  // Efficiency Trap
  if (usg > 26 && ts < 52)                                          red.push("Efficiency Trap");
  // Empty Calorie Scorer (stricter bust signal)
  if (usg > 28 && ts < 52 && astP < 15)                             red.push("Empty Calorie Scorer");
  // One-Way Project
  if (obpm > 3.0 && dbpm < -1.5 && stlP < 1.0)                     red.push("One-Way Project");
  // Soft Interior
  if (isB && ftr < 22 && blkP < 2.0)                                red.push("Soft Interior");
  // Non-Processing Guard
  if (isG && astTov < 0.8 && tovP > 20)                             red.push("Non-Processing Guard");
  // Tunnel Vision
  if ((isG || isW) && astTov < 0.7 && usg > 22)                     red.push("Tunnel Vision");
  // Passive Scorer
  if (ftr < 20 && usg > 20)                                         red.push("Passive Scorer");
  // Foul Magnet
  if ((p.fouls40 ?? 0) > 4.8)                                       red.push("Foul Magnet");
  // Liability Big
  if (isB && (drbP < 15 || blkP < 1.5))                             red.push("Liability Big");
  // Defensive Target (adjusted)
  if (isG && htIn < 74 && dbpm < -1.0)                              red.push("Defensive Target");
  // Non-Spacing Guard
  if (isG && tp < 30 && threeF < 20)                                red.push("Non-Spacing Guard");
  // All-Offense Big
  if (isB && blkP < 2.5 && dbpm < 1.5)                              red.push("All-Offense Big");
  // FT Concern
  if (ft < 65 && usg > 25)                                          red.push("FT Concern");

  return { green, yellow, red };
}

// ═══════════════════════════════════════════════════════════
// Z-SCORE HELPERS
// ═══════════════════════════════════════════════════════════
function pctl2z(p50) {
  if (p50 == null) return 0;
  const pp = Math.max(0.001, Math.min(0.999, p50 / 100));
  const a=[-3.969683028665376e1,2.209460984245205e2,-2.759285104469687e2,1.383577518672690e2,-3.066479806614716e1,2.506628277459239];
  const b=[-5.447609879822406e1,1.615858368580409e2,-1.556989798598866e2,6.680131188771972e1,-1.328068155288572e1];
  const c=[-7.784894002430293e-3,-3.223964580411365e-1,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783];
  const d=[7.784695709041462e-3,3.223907427788357e-1,2.445134137142996,3.754408661907416];
  const pLow=0.02425,pHigh=1-pLow; let z;
  if(pp<pLow){const q=Math.sqrt(-2*Math.log(pp));z=(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
  else if(pp<=pHigh){const q=pp-0.5,r=q*q;z=(((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);}
  else{const q=Math.sqrt(-2*Math.log(1-pp));z=-(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
  return Math.round(Math.max(-3,Math.min(3,z))*10)/10;
}
const roleToZ = pctl2z;
const zLabel = (z) => z>=2.0?"Elite":z>=1.0?"Impact":z>=0?"Neutral":z>=-1.0?"Below Avg":"Liability";
const zColor = (z) => z>=2.0?"#22c55e":z>=1.0?"#86efac":z>=0?"#6b7280":z>=-1.0?"#f97316":"#ef4444";
const zBg = (z) => z>=2.0?"#22c55e18":z>=1.0?"#86efac11":z>=0?"#1e293b":z>=-1.0?"#f9731611":"#ef444418";

// ═══════════════════════════════════════════════════════════
// API BASE & DATA MAPPING
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// POSITION RESOLUTION (BartTorvik functional_pos + International letters)
// ═══════════════════════════════════════════════════════════
function resolvePosition(d) {
  // ── Stat-based overrides FIRST (fixes Curry, Harden, Boozer, Markkanen) ──
  const ht = d.ht ?? d.height_in ?? d.college_height_inches;
  const astP = d.ast_p ?? d.astP ?? 0;
  const usg = d.usg ?? d.usg_p ?? 0;
  const tpFreq = d.three_f ?? d.three_freq ?? d.threeF ?? d.tp_per ?? 0;
  const tp = d.tp_pct ?? d.tp ?? 0;

  // Ball-handler override: high AST% = Playmaker, WITH height guard
  // Guards (< 79"): AST% > 25 + USG% > 22 (Curry, Harden, Smart)
  // Taller: need AST% > 32 (true point-forwards only)
  if (ht != null && ht < 79 && astP > 25 && usg > 22) return "Playmaker";
  if (ht != null && ht < 79 && astP > 30) return "Playmaker";
  if (astP > 32) return "Playmaker"; // Any height — true point-big

  // Stretch/shooting forward override: 6'7"-6'10" with shooting = Wing, not Big
  if (ht != null && ht >= 79 && ht <= 82 && (tp > 30 || tpFreq > 25)) return "Wing";

  // Priority 2: BartTorvik functional_pos
  const funcPos = (d.functional_pos ?? d.func_pos ?? "").toLowerCase().trim();
  if (funcPos) {
    if (/^(pg|point|combo.?g|cg)/.test(funcPos)) return "Playmaker";
    if (/^(c|center|pure.?c)$/.test(funcPos)) return "Big";
    if (/^(sg|wg|sf|wf|pf|f|wing|forward|guard|stretch|small|power|swingman)/.test(funcPos)) return "Wing";
  }

  // Priority 3: International letter positions
  const rawPos = (d.raw_pos ?? d.intl_pos ?? "").toUpperCase().trim();
  if (rawPos) {
    if (rawPos === "PG" || rawPos === "POINT GUARD") return "Playmaker";
    if (rawPos === "C" || rawPos === "CENTER") return "Big";
    if (/^(SG|G|SF|PF|F|G\/F|F\/G|SF\/PF|PF\/SF|SG\/SF|F\/C|GUARD|FORWARD|SHOOTING|SMALL|POWER)/.test(rawPos)) return "Wing";
  }

  // Priority 4: Trust pipeline pos IF it's one of our three
  const existing = d.pos ?? d.position;
  if (existing === "Playmaker" || existing === "Wing" || existing === "Big") return existing;

  // Priority 5: Height fallback
  if (ht != null) {
    if (ht <= 75) return "Playmaker";
    if (ht >= 82) return "Big";
  }

  return "Wing";
}

const API_BASE = "https://api.prospecttheory.io/api";

function mapProfile(d) {
  if(!d) return null;
  // Normalize percentiles: pipeline sends 0-1, UI expects 0-100
  const normPctl = (v) => {
    if (v == null) return null;
    const n = Number(v);
    if (isNaN(n)) return null;
    // If 0-1 scale (e.g. 0.95 = 95th percentile), multiply by 100
    if (n > 0 && n <= 1.0) return Math.round(n * 100);
    // Already 0-100 scale
    return Math.round(n);
  };
  const pctl = d.pctl ? {
    bpm: normPctl(d.pctl.bpm), usg: normPctl(d.pctl.usg), ts: normPctl(d.pctl.ts),
    ast: normPctl(d.pctl.ast), to: normPctl(d.pctl.to), orb: normPctl(d.pctl.orb),
    drb: normPctl(d.pctl.drb), stl: normPctl(d.pctl.stl), blk: normPctl(d.pctl.blk),
    pts36: normPctl(d.pctl.pts36), reb36: normPctl(d.pctl.reb36), ast36: normPctl(d.pctl.ast36),
    ftr: normPctl(d.pctl.ftr), efg: normPctl(d.pctl.efg),
  } : {
    bpm: normPctl(d.pctl_bpm), usg: normPctl(d.pctl_usg), ts: normPctl(d.pctl_ts),
    ast: normPctl(d.pctl_ast), to: normPctl(d.pctl_to), orb: normPctl(d.pctl_orb),
    drb: normPctl(d.pctl_drb), stl: normPctl(d.pctl_stl), blk: normPctl(d.pctl_blk),
    pts36: normPctl(d.pctl_pts36), reb36: normPctl(d.pctl_reb36), ast36: normPctl(d.pctl_ast36),
    ftr: normPctl(d.pctl_ftr), efg: normPctl(d.pctl_efg),
  };

  // Four factors — API sends flat fields (ff_efg, ff_tov etc), NOT nested objects
  // CRITICAL: d.cffr is a NUMBER (64.6), NOT an object! Don't use d.cffr || d.ff
  const ff = {
    efg: d.ff_efg ?? d.cffr_efg ?? pctl.efg ?? pctl.ts ?? 50,
    tov: d.ff_tov ?? d.cffr_tov ?? (pctl.to != null ? 100 - pctl.to : 50),
    orb: d.ff_orb ?? d.cffr_orb ?? pctl.orb ?? 50,
    ftr: d.ff_ftr ?? d.cffr_ftr ?? pctl.ftr ?? 50,
    comp: d.ff_comp ?? (typeof d.cffr === 'number' ? d.cffr : null),
  };
  if (ff.comp == null) {
    ff.comp = Math.round(ff.efg * 0.40 + ff.tov * 0.25 + ff.orb * 0.20 + ff.ftr * 0.15);
  }

  const badgeList = (d.badges && typeof d.badges === "string") ? d.badges.split("|").filter(Boolean) : (d.badges || []);
  const redList = (d.red_flags && typeof d.red_flags === "string") ? d.red_flags.split("|").filter(Boolean) : (d.red_flags || []);

  // Always compute client badges (for consistency board↔profile)
  const resolvedPos = resolvePosition(d);
  const tmpP = {
    pos: resolvedPos,
    ft:d.ft_pct??d.ft, tp:d.tp_pct??d.tp, threeF:d.three_f??d.three_freq??d.threeF,
    astP:d.ast_p??d.astP, astTov:d.ast_to??d.astTov??d.ast_tov, stlP:d.stl_p??d.stlP,
    blkP:d.blk_p??d.blkP, usg:d.usg??d.usg_p, toP:d.to_p??d.toP,
    ts:d.ts_pct??d.ts, ftr:d.ftr??d.ft_rate, rimF:d.rim_f??d.rim_freq??d.rimF,
    rimPct:d.rim_pct??d.rimPct, dbpm:d.dbpm, obpm:d.obpm, bpm:d.bpm,
    feel:d.feel??0, funcAth:d.func_ath??0,
    htIn:d.ht??d.height_in??d.college_height_inches,
    drbP:d.drb_p??d.drbP, dunkR:d.dunk_r??d.dunk_rate??d.dunkR, age:d.age,
    shootScore:d.shoot_score, efg:d.efg_pct??d.efg,
    twoPct:d.two_p_pct??d.fg_pct??d.fg,
    fouls40:d.fouls_40??0, min:d.min??0, pts:d.pts??0, fg:d.fg_pct??0,
    source:d.source, league:d.league,
  };
  const computed = computeBadges(tmpP);

  // Merge: server badges + client badges (dedup), server takes priority for ordering
  const serverGreen = badgeList.filter(b => BADGE_DEFS[b]?.cat === "green" || (!BADGE_DEFS[b]));
  const serverRed = redList.filter(b => BADGE_DEFS[b]?.cat === "red" || (!BADGE_DEFS[b]));
  const allGreen = [...new Set([...serverGreen, ...computed.green])];
  const allYellow = computed.yellow; // server doesn't send yellow
  const allRed = [...new Set([...serverRed, ...computed.red])];

  return {
    name: d.name, pos: resolvedPos,
    team: d.team ?? d.college_team ?? "", conf: d.conf ?? d.college_conf ?? "",
    confTier: d.conf_tier ?? d.confTier ?? "", cls: d.cls ?? d.class ?? "",
    yr: d.yr ?? d.season_year ?? d.draft_year ?? 2026,
    age: d.age ?? d.age_on_draft_day,
    htIn: d.ht ?? d.height_in ?? d.college_height_inches ?? 78,
    ht: d.ht_display ?? (d.ht ? `${Math.floor(d.ht/12)}'${d.ht%12}"` : "—"),
    wt: d.wt ?? d.weight, ws: d.ws ?? d.wingspan,
    recRank: d.recRank ?? d.rec_rank, recPctl: d.recPctl ?? d.rec_pctl,
    seasonsPlayed: d.seasons_played ?? d.seasonsPlayed ?? 1,
    gp: d.gp ?? d.games ?? d.g, min: d.min ?? d.minutes ?? d.mpg,
    mp: d.mp ?? d.total_min ?? d.sample_min,
    // Box score — extended fallback chains for old/intl profiles
    pts: d.pts ?? d.college_pts ?? d.ppg,
    reb: d.reb ?? d.college_treb ?? d.trb ?? d.treb ?? d.rpg,
    ast: d.ast ?? d.college_ast ?? d.apg,
    stl: d.stl ?? d.college_stl ?? d.spg,
    blk: d.blk ?? d.college_blk ?? d.bpg,
    astTov: d.ast_to ?? d.astTov ?? d.ast_tov ?? d.college_ast_tov ?? d["ast/tov"] ?? null,
    bpm: d.bpm, obpm: d.obpm, dbpm: d.dbpm, ortg: d.ortg,
    usg: d.usg ?? d.usg_p,
    // Normalize percentages that might come as 0-1 from old profiles
    ts: (() => { const v = d.ts_pct ?? d.ts; if (v==null) return null; const n=Number(v); return n>0&&n<1?Math.round(n*1000)/10:Math.round(n*10)/10; })(),
    fg: (() => { const v = d.fg_pct ?? d.fg; if (v==null) return null; const n=Number(v); return n>0&&n<1?Math.round(n*1000)/10:Math.round(n*10)/10; })(),
    efg: (() => { const v = d.efg_pct ?? d.efg; if (v==null) return null; const n=Number(v); return n>0&&n<1?Math.round(n*1000)/10:Math.round(n*10)/10; })(),
    astP: (() => { const v = d.ast_p ?? d.astP; if (v==null) return null; const n=Number(v); return n>0&&n<1?Math.round(n*1000)/10:Math.round(n*10)/10; })(),
    toP: (() => { const v = d.to_p ?? d.toP; if (v==null) return null; const n=Number(v); return n>0&&n<1?Math.round(n*1000)/10:Math.round(n*10)/10; })(),
    orbP: (() => { const v = d.orb_p ?? d.orbP; if (v==null) return null; const n=Number(v); return n>0&&n<1?Math.round(n*1000)/10:Math.round(n*10)/10; })(),
    drbP: (() => { const v = d.drb_p ?? d.drbP; if (v==null) return null; const n=Number(v); return n>0&&n<1?Math.round(n*1000)/10:Math.round(n*10)/10; })(),
    stlP: (() => { const v = d.stl_p ?? d.stlP; if (v==null) return null; const n=Number(v); return n>0&&n<1?Math.round(n*1000)/10:Math.round(n*10)/10; })(),
    blkP: (() => { const v = d.blk_p ?? d.blkP; if (v==null) return null; const n=Number(v); return n>0&&n<1?Math.round(n*1000)/10:Math.round(n*10)/10; })(),
    ft: (() => { const v = d.ft_pct ?? d.ft; if (v==null) return null; const n=Number(v); return n>0&&n<1?Math.round(n*1000)/10:Math.round(n*10)/10; })(),
    tp: (() => { const v = d.tp_pct ?? d.tp; if (v==null) return null; const n=Number(v); return n>0&&n<1?Math.round(n*1000)/10:Math.round(n*10)/10; })(),
    ftr: (() => { const v = d.ftr ?? d.ft_rate; if (v == null) return null; const n = Number(v); return n > 0 && n < 1 ? Math.round(n * 1000) / 10 : Math.round(n * 10) / 10; })(),
    rimF: d.rim_f ?? d.rim_freq ?? d.rimF ?? d.rim_fga_pct, rimPct: d.rim_pct ?? d.rimPct ?? d.rim_fg_pct,
    midF: d.mid_f ?? d.mid_freq ?? d.midF ?? d.mid_fga_pct, midPct: d.mid_pct ?? d.midPct ?? d.mid_fg_pct,
    threeF: d.three_f ?? d.three_freq ?? d.threeF ?? d.three_fga_pct, threePar: d.three_par ?? d.threePar,
    dunkR: d.dunk_r ?? d.dunk_rate ?? d.dunkR,
    dunkPct: d.dunk_pct ?? d.dunkPct,
    fta: d.fta, ftm: d.ftm, fga: d.fga,
    selfCreation: d.self_creation ?? Math.round(((d.usg??20)/100)*(1-(d.ast_p??d.astP??20)/100)*200),
    pctl,
    ff: { efg: ff.efg??50, tov: ff.tov??50, orb: ff.orb??50, ftr: ff.ftr??50, comp: ff.comp??50 },
    cffr: { usageRole: d.cffr_usage_role ?? d.cffr_role ?? d.usage_role, reliability: d.cffr_reliability ?? d.cffr_rel, raw: typeof d.cffr === 'number' ? d.cffr : null },
    projNba3p:d.proj_3p, projNba3pa:d.proj_3pa, projNba3par:d.proj_3par, projNbaTs:d.proj_ts, projPrior:d.proj_prior,
    feel:d.feel, funcAth:d.func_ath, shootScore:d.shoot_score, defScore:d.def_score, overall:d.overall,
    roles:{playmaker:d.role_playmaker,scorer:d.role_scorer,spacer:d.role_spacer,
      driver:d.role_driver,crasher:d.role_crasher,onball:d.role_onball,
      rimProt:d.role_rim_prot,rebounder:d.role_rebounder,switchPot:d.role_switch,
      connector:d.role_connector,helio:d.role_helio,event:d.role_event,
      zone:d.role_zone,microSpacer:d.role_micro_spacer},
    roleVersatility:d.role_versatility,
    archetype:d.archetype||"",
    feas:{repl:d.feas_repl,rot:d.feas_rot,start:d.feas_start,allstar:d.feas_allstar,
      cleared:d.feas_cleared||"",blocker:d.feas_blocker||""},
    mu:d.pred_mu??d.mu??d.projected_pie??d.pred_mu_pie??d.aspm_adj??d.aspm,
    sigma:d.pred_sigma??d.sigma??d.mc_sigma??d.volatility,
    pNba:d.pred_p_nba??d.pNba??d.pn,
    predTier:d.pred_tier??d.predicted_tier??d.tier,
    ups: d.ups ?? d.ups_raw,
    war: d.war ?? d.projected_war ?? d.war_score ?? null,
    humble: d.humble ?? d.f_humble ?? d.hmb ?? null,
    aspm: d.aspm ?? d.aspm_adj,
    production: d.production ?? d.prod,
    impact: d.impact,
    careerPath: d.career_path ?? d.path ?? "NBA",
    tiers:{
      Superstar:((d.prob_super??d.prob_superstar??d.probs?.superstar??0)*100),
      "All-Star":((d.prob_allstar??d.probs?.allstar??0)*100),
      Starter:((d.prob_starter??d.probs?.starter??0)*100),
      "Role Player":((d.prob_role??d.prob_roleplayer??d.probs?.roleplayer??0)*100),
      Replacement:((d.prob_repl??d.prob_replacement??d.probs?.replacement??0)*100),
      "Out":((d.prob_neg??d.prob_negative??d.prob_never??d.probs?.out??0)*100),
    },
    ceiling: d.ceiling, floor: d.floor, volatility: d.volatility ?? d.mc_sigma,
    badges: allGreen, redFlags: allRed, yellowBadges: allYellow,
    btUrl:d.bt_url, btTeamUrl:d.bt_team_url,
    actual:d.tier, peakPie:d.peak_pie??d.nba_peak_actual, nbaName:d.nba_name||"",
    madeNba:d.made_nba, draftYear:d.draft_year, draftPick:d.draft_pick,
    confidence:d.confidence||"full", sampleMin:d.sample_min, sampleGp:d.sample_gp,
    source: d.source ?? "ncaa",
    statComps:[], anthroComps:[], seasonLines:[],
    comb: d.combine || null,
    posPlaymaker:d.pos_playmaker, posWing:d.pos_wing, posBig:d.pos_big,
  };
}

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
  const isIntlBadge = def?.icon === "globe";
  const inner = <span className="px-2 py-0.5 rounded-full text-xs font-semibold inline-block" style={{background:color+"22",color,border:`1px solid ${color}44`}}>{isIntlBadge?"🌐 ":""}{text}</span>;
  if (!def) return inner;
  return (
    <Tip content={<div><div className="font-bold mb-1" style={{color}}>{isIntlBadge?"🌐 ":""}{text}</div><div className="mb-1"><span style={{color:"#94a3b8"}}>Trigger:</span> {def.rule}</div><div style={{color:"#cbd5e1"}}>{def.desc}</div></div>}>
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
  const posRef = tierData[p.pos]||tierData.Wing;
  const metrics = [
    {cat:"Shot Making", id:"ts",  label:"TS%",  val:p.ts,   p50:posRef.ts,    core:p.pos==="Wing",     invert:false, desc:"True shooting efficiency"},
    {cat:"Shot Making", id:"tp",  label:"3P%",  val:p.tp,   p50:p.pos==="Big"?30:p.pos==="Playmaker"?35:34, core:p.pos==="Wing", invert:false, desc:"Three-point accuracy"},
    {cat:"Creation",    id:"ast", label:"AST%", val:p.astP, p50:posRef.ast_p, core:p.pos==="Playmaker", invert:false, desc:"Assist rate"},
    {cat:"Creation",    id:"usg", label:"USG%", val:p.usg,  p50:posRef.usg,   core:false,              invert:false, desc:"Usage rate"},
    {cat:"Possession",  id:"tov", label:"TO%",  val:p.toP,  p50:posRef.to_p,  core:false,              invert:true,  desc:"Turnover rate (lower = better)"},
    {cat:"Possession",  id:"orb", label:"ORB%", val:p.orbP, p50:posRef.orb_p, core:p.pos==="Big",      invert:false, desc:"Offensive rebound rate"},
    {cat:"Possession",  id:"ftr", label:"FTr",  val:p.ftr,  p50:p.pos==="Big"?42:p.pos==="Playmaker"?36:30, core:false, invert:false, desc:"Free throw rate"},
    {cat:"Defense",     id:"stl", label:"STL%", val:p.stlP, p50:posRef.stl_p, core:false,              invert:false, desc:"Steal rate"},
    {cat:"Defense",     id:"blk", label:"BLK%", val:p.blkP, p50:posRef.blk_p, core:p.pos==="Big",      invert:false, desc:"Block rate"},
    {cat:"Defense",     id:"drb", label:"DRB%", val:p.drbP, p50:posRef.drb_p, core:false,              invert:false, desc:"Defensive rebound rate"},
  ];
  const hasEliteCore = metrics.filter(m=>m.core).some(m => {
    if (m.val==null) return false;
    return m.invert ? m.val < m.p50*0.75 : m.val > m.p50*1.30;
  });
  const assessed = metrics.map(m => {
    const p25 = m.invert ? m.p50*1.25 : m.p50*0.75;
    const p75 = m.invert ? m.p50*0.75 : m.p50*1.30;
    if (m.val==null) return {...m,p25,p75,status:"unknown",sc:"#4b5563",pctP50:null};
    const inRange = m.invert ? m.val<=m.p50 : m.val>=m.p50;
    const belowFloor = m.invert ? m.val>p25 : m.val<p25;
    let status,sc;
    if (inRange) {status="In-Range";sc="#22c55e";}
    else if (belowFloor&&!m.core&&hasEliteCore) {status="Compensated";sc="#fbbf24";}
    else if (belowFloor) {status="Critical Gap";sc="#ef4444";}
    else {status="Below Median";sc="#f97316";}
    const range = Math.abs(p75-p25)||1;
    const dist = m.invert ? (p25-Math.max(p75,Math.min(p25,m.val)))/range : (Math.max(p25,Math.min(p75,m.val))-p25)/range;
    return {...m,p25,p75,status,sc,pctP50:Math.round(Math.max(0,Math.min(100,dist*100)))};
  });
  const valid = assessed.filter(m=>m.pctP50!=null);
  const feasScore = valid.length>0 ? Math.round(valid.reduce((s,m)=>s+m.pctP50*(m.core?1.5:1),0)/valid.reduce((s,m)=>s+(m.core?1.5:1),0)) : null;
  const feasColor = feasScore>=70?"#22c55e":feasScore>=45?"#fbbf24":"#ef4444";
  const nG=assessed.filter(m=>m.status==="In-Range").length;
  const nY=assessed.filter(m=>m.status==="Compensated").length;
  const nR=assessed.filter(m=>m.status==="Critical Gap").length;
  const cats=["Shot Making","Creation","Possession","Defense"];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[["Conference",p.conf,p.confTier==="Power"?"#10b981":"#f97316"],["Class",p.cls,"#e5e7eb"],
          ["Age",p.age!=null?Number(p.age).toFixed(1):"—","#e5e7eb"],
          ["Recruit",p.recRank?`#${p.recRank}`:"Unranked","#e5e7eb"],
          ["Source",p.source?.toUpperCase()||"NCAA",p.source==="ncaa"?"#3b82f6":"#f97316"],
          ["Conf Tier",p.confTier||"—",p.confTier==="Power"?"#10b981":"#f97316"]
        ].map(([l,v,c])=>(
          <div key={l} className="rounded-lg p-3" style={{background:"#111827"}}>
            <div className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>{l}</div>
            <div className="font-semibold mt-0.5" style={{color:c,fontFamily:"'Oswald',sans-serif"}}>{v||"—"}</div>
          </div>
        ))}
      </div>
      <Sec icon="▦" title="Box Score" sub={`${p.gp??0} GP · ${fmt(p.min)} MIN/G`}>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
          {[["PTS",p.pts,p.pctl?.pts36],["REB",p.reb,p.pctl?.reb36],["AST",p.ast,p.pctl?.ast36],
            ["STL",p.stl,p.pctl?.stl],["BLK",p.blk,p.pctl?.blk],["A/TO",p.astTov,null],["FTR",p.ftr,null],["TO%",p.toP,p.pctl?.to]
          ].map(([l,v,pc])=><StatCell key={l} label={l} val={v} pctl={pc}/>)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" style={{color:"#6b7280"}}>
          <span>Efficiency:</span>
          {[["TS%",p.ts,p.pctl?.ts],["FG%",p.fg,null],["3P%",p.tp,null],["FT%",p.ft,null],["eFG%",p.efg,null]].map(([l,v,pc])=>(
            <span key={l} className="px-2 py-0.5 rounded" style={{background:valBg(pc),color:pc?valColor(pc):"#e5e7eb"}}>{l} {fmt(v)}</span>
          ))}
        </div>
      </Sec>
      <Sec icon="⚡" title="Advanced">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {[["BPM",p.bpm,p.pctl?.bpm],["OBPM",p.obpm,null],["DBPM",p.dbpm,null],["ORtg",p.ortg,null],
            ["USG%",p.usg,p.pctl?.usg],["TS%",p.ts,p.pctl?.ts],["AST%",p.astP,p.pctl?.ast],["TO%",p.toP,p.pctl?.to],
            ["ORB%",p.orbP,p.pctl?.orb],["DRB%",p.drbP,p.pctl?.drb],["STL%",p.stlP,p.pctl?.stl],["BLK%",p.blkP,p.pctl?.blk]
          ].map(([l,v,pc])=><StatCell key={l} label={l} val={v} pctl={pc}/>)}
        </div>
      </Sec>

      {/* ═══ TIER FEASIBILITY — Each metric on its own row ═══ */}
      <Sec icon="📊" title={`vs. NBA ${compTier} (${p.pos})`} sub="">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Compare:</span>
          <div className="flex gap-1">
            {["Replacement","Role Player","Starter","All-Star"].map(tier=>(
              <button key={tier} onClick={()=>setCompTier(tier)} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{background:compTier===tier?TC[tier]||"#f97316":"#1f2937",color:compTier===tier?"#000":"#9ca3af"}}>{tier}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4 mb-5 p-4 rounded-xl" style={{background:"#0d111799",border:`1px solid ${feasColor}33`}}>
          <div className="text-center px-4">
            <div className="text-xs uppercase tracking-wider mb-1" style={{color:"#6b7280"}}>Feasibility</div>
            <div className="text-4xl font-bold" style={{color:feasColor,fontFamily:"'Oswald',sans-serif"}}>{feasScore??'—'}</div>
          </div>
          <div className="flex-1">
            <div className="flex gap-4 text-sm mb-1" style={{color:"#e5e7eb"}}>
              <span><span style={{color:"#22c55e"}}>●</span> {nG} In-Range</span>
              <span><span style={{color:"#fbbf24"}}>●</span> {nY} Compensated</span>
              <span><span style={{color:"#ef4444"}}>●</span> {nR} Critical</span>
            </div>
            <div className="text-xs" style={{color:"#4b5563"}}>
              Shadow = p25–p75 corridor. | = median. ★ = core for {p.pos}.
              {hasEliteCore&&<span style={{color:"#fbbf24"}}> Elite core detected.</span>}
            </div>
          </div>
        </div>
        <div className="space-y-6">
          {cats.map(cat=>{
            const cm=assessed.filter(m=>m.cat===cat);
            if(!cm.length) return null;
            return (
              <div key={cat}>
                <div className="text-xs uppercase tracking-widest font-bold mb-3" style={{color:"#9ca3af"}}>{cat}</div>
                <div className="space-y-4">
                  {cm.map(m=>{
                    const minP = Math.min(m.p25, m.p75);
                    const maxP = Math.max(m.p25, m.p75);
                    const valOrP75 = Math.max(maxP, m.val || 0);
                    // Scale so shadow band is always 30-60% of bar width
                    const maxB = Math.max(valOrP75 * 1.15, maxP + (maxP - minP) * 0.8);
                    const toX = v => Math.max(0, Math.min(100, (v / maxB) * 100));
                    return (
                      <div key={m.id}>
                        <Tip wide content={
                          <div>
                            <div className="font-bold mb-1" style={{color:m.sc}}>{m.label}: {m.status}{m.core?" (Core ★)":""}</div>
                            <div style={{color:"#94a3b8"}}>{m.desc}</div>
                            <div className="mt-1 text-xs" style={{color:"#cbd5e1"}}>Floor (p25): {fmt(m.p25)} · Median (p50): {fmt(m.p50)} · Elite (p75): {fmt(m.p75)}</div>
                            {m.status==="Compensated"&&<div className="mt-1" style={{color:"#fbbf24"}}>Below floor but compensated by elite ★ core skill.</div>}
                          </div>
                        }>
                          <div className="cursor-help block">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                {m.core&&<span className="text-base" style={{color:TC[compTier]||"#f97316"}}>★</span>}
                                <span className="text-base font-semibold" style={{color:"#e5e7eb"}}>{m.label}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-2xl font-bold" style={{color:m.sc,fontFamily:"'Oswald',sans-serif"}}>{m.val!=null?fmt(m.val):"—"}</span>
                                <span className="text-sm" style={{color:"#4b5563"}}>/ {fmt(m.p50)}</span>
                                <div className="w-3.5 h-3.5 rounded-full" style={{background:m.sc}}/>
                              </div>
                            </div>
                            <div className="relative h-10 rounded-lg overflow-hidden" style={{background:"#0d1117",border:"1px solid #1f2937"}}>
                              <div className="absolute top-0 bottom-0" style={{
                                left:`${toX(Math.min(m.p25,m.p75))}%`,
                                width:`${Math.abs(toX(m.p75)-toX(m.p25))}%`,
                                background:`linear-gradient(90deg,${m.sc}08,${m.sc}18,${m.sc}08)`,
                                borderLeft:`1px dashed ${m.sc}44`,borderRight:`1px dashed ${m.sc}44`,
                              }}/>
                              <div className="absolute top-0 bottom-0 w-0.5" style={{left:`${toX(m.p50)}%`,background:"#ffffff55"}}/>
                              {m.val!=null&&<div className="absolute top-1 bottom-1 rounded-r" style={{left:0,width:`${toX(m.val)}%`,background:`linear-gradient(90deg,${m.sc}15,${m.sc}66)`}}/>}
                              {m.val!=null&&<div className="absolute top-0 bottom-0 w-1.5 rounded" style={{left:`${Math.max(0,toX(m.val)-0.5)}%`,background:m.sc}}/>}
                            </div>
                          </div>
                        </Tip>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 p-2 rounded text-xs" style={{color:"#3b4252"}}>
          Green ≥ median. Yellow = below floor, compensated by ★ elite core. Red = critical gap. Feasibility = weighted proximity to p50.
        </div>
      </Sec>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: SHOOTING (v4 — FT in diet, dunks stacked in rim, pos×tier FGA)
// ═══════════════════════════════════════════════════════════
function ShootingTab({p}) {
  const isIntl = p.source && p.source !== "ncaa";
  const norm = (v) => {
    if (v == null || v === "" || v === "—") return null;
    const n = Number(v);
    if (isNaN(n)) return null;
    // Values 0-1 that are clearly ratios → convert to percentage
    if (n > 0 && n < 1 && n !== 0) return Math.round(n * 1000) / 10;
    return Math.round(n * 10) / 10;
  };
  // For shooting percentages: ensure 0-100 range (fixes old players with mixed formats)
  const normPct = (v) => {
    const n = norm(v);
    if (n == null) return null;
    if (n > 100) return Math.round(n / 10) / 10; // e.g. 698 → 69.8 (was stored as 0-1000)
    return n;
  };
  const rimPct = normPct(p.rimPct), midPct = normPct(p.midPct), tp = normPct(p.tp), ft = normPct(p.ft);
  const efg = normPct(p.efg), ftr = norm(p.ftr), ts = normPct(p.ts);
  const rimF = norm(p.rimF), midF = norm(p.midF), threeF = norm(p.threeF), dunkR = norm(p.dunkR);
  const dunkPct = normPct(p.dunkPct);
  const hasRim = rimF != null && rimF > 0, hasMid = midF != null && midF > 0;
  const hasDunk = dunkR != null && dunkR > 0, hasTracking = hasRim || hasMid;

  // ── Absolute attempts: estimate FGA from GP + PTS + TS%, then zone attempts ──
  const gp = p.gp ?? 0;
  const rawFga = p.fga ?? null;  // season total from pipeline
  const estFgaPG = (p.pts && ts) ? p.pts / (2 * ts / 100) : null;
  // If rawFga > 50, it's season total. If < 50, might be per-game.
  const totalFga = rawFga ? (rawFga > 50 ? Math.round(rawFga) : Math.round(rawFga * gp)) : (estFgaPG && gp ? Math.round(estFgaPG * gp) : null);
  // FTA: from pipeline or estimate via FTR
  // FTA: p.fta is season total (e.g. 130), NOT per-game. Don't multiply by GP.
  // Heuristic: if fta > 20 it's season total, if < 20 it might be per-game
  const totalFta = p.fta ? (p.fta > 20 ? Math.round(p.fta) : Math.round(p.fta * gp)) : (ftr != null && totalFga ? Math.round(ftr / 100 * totalFga) : null);
  const totalShots = (totalFga || 0) + (totalFta || 0);

  const zoneAtt = (freq) => (freq != null && totalFga) ? Math.round(totalFga * freq / 100) : null;
  const zoneMade = (freq, pct) => (freq != null && pct != null && totalFga) ? Math.round(totalFga * freq / 100 * pct / 100) : null;

  // ── Shot Diet: % of TOTAL SHOTS (FGA + FTA) per zone ──
  // Rim includes dunks. Dunks shown as stacked portion within rim bar.
  const rimAtt = zoneAtt(rimF);           // rim includes dunks
  const dunkAtt = zoneAtt(dunkR);
  const midAtt = zoneAtt(midF);
  const threeAtt = zoneAtt(threeF);

  const rimPctOfTotal = totalShots > 0 && rimAtt != null ? Math.round(rimAtt / totalShots * 1000) / 10 : null;
  const dunkPctOfRim = rimAtt > 0 && dunkAtt != null ? Math.round(dunkAtt / rimAtt * 1000) / 10 : null;
  const dunkPctOfTotal = totalShots > 0 && dunkAtt != null ? Math.round(dunkAtt / totalShots * 1000) / 10 : null;
  const midPctOfTotal = totalShots > 0 && midAtt != null ? Math.round(midAtt / totalShots * 1000) / 10 : null;
  const threePctOfTotal = totalShots > 0 && threeAtt != null ? Math.round(threeAtt / totalShots * 1000) / 10 : null;
  const ftPctOfTotal = totalShots > 0 && totalFta != null ? Math.round(totalFta / totalShots * 1000) / 10 : null;

  // ── Unassisted proxy ──
  const usg = p.usg ?? 20, astP = p.astP ?? 15;
  const selfCreatedPct = Math.min(90, Math.max(10, Math.round(usg * 2.0 - astP * 0.5)));

  // ── Touch prior ──
  const midForPrior = midPct ?? (ft ? ft * 0.55 : 40);
  const touchPrior = p.projPrior ?? ((0.20 + 0.18 * (ft ?? 75) / 100 + 0.05 * (midForPrior) / 100) * 100);

  // ── NBA 3P% projection (Bayesian) ──
  const projNba3p = p.projNba3p ?? (() => {
    if (ft == null) return null;
    const mu0 = 0.20 + 0.18 * (ft / 100) + 0.05 * (midForPrior / 100);
    const kappa = 200;
    const est3PA = threeAtt || (threeF != null && estFgaPG ? Math.round(estFgaPG * gp * threeF / 100) : 50);
    const est3PM = tp != null ? Math.round(est3PA * tp / 100) : Math.round(est3PA * mu0);
    return Math.round(((kappa * mu0 + est3PM) / (kappa + est3PA)) * 1000) / 10;
  })();

  // ── Role×Position NBA FGA projection ──
  const tierPosFga = {
    "Superstar":{Playmaker:19.5,Wing:18.5,Big:15.0}, "All-Star":{Playmaker:16.5,Wing:15.5,Big:13.0},
    "Starter":{Playmaker:13.5,Wing:13.0,Big:11.0}, "Role Player":{Playmaker:11.0,Wing:10.5,Big:9.0},
    "Replacement":{Playmaker:9.0,Wing:8.5,Big:7.5},
  };
  const bestTier = p.predTier || "Starter";
  const projFGA = (tierPosFga[bestTier]||tierPosFga["Starter"])[p.pos] || 13;
  const proj3PAr = threeF != null ? Math.min(55, Math.round(threeF * 0.85 + (ft > 80 ? 3 : 0) + 5)) : (p.projNba3par ?? null);
  const projNba3pa = proj3PAr != null ? Math.round(projFGA * proj3PAr / 100 * 10) / 10 : null;

  const sc = (pct, type) => {
    if (pct == null) return "#6b7280";
    if (type==="3pt") return pct>38?"#22c55e":pct>34?"#86efac":pct>30?"#fbbf24":"#ef4444";
    if (type==="ft") return pct>80?"#22c55e":pct>72?"#86efac":pct>65?"#fbbf24":"#ef4444";
    if (type==="mid") return pct>45?"#22c55e":pct>40?"#86efac":pct>35?"#fbbf24":"#ef4444";
    if (type==="rim") return pct>65?"#22c55e":pct>58?"#86efac":pct>50?"#fbbf24":"#ef4444";
    return "#e5e7eb";
  };

  return (
    <div className="space-y-5">
      {isIntl && !hasTracking && (
        <div className="p-3 rounded-lg text-sm" style={{background:"#1e3a5f33",border:"1px solid #3b82f644",color:"#93c5fd"}}>
          International prospect — shot-type tracking not available. NBA projections use Bayesian priors.
        </div>
      )}

      <Sec icon="🏀" title="3.5 Level Scoring" sub="Accuracy, volume (made-att), and shot diet per zone">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* ── COURT ── */}
          <div className="lg:col-span-3 mx-auto w-full" style={{maxWidth:580}}>
            <svg viewBox="0 0 580 460" className="w-full" style={{minHeight:360}}>
              <rect x="0" y="0" width="580" height="460" rx="12" fill="#0d1117"/>
              <line x1="15" y1="15" x2="565" y2="15" stroke="#1f2937" strokeWidth="2.5"/>
              <path d="M 62 15 L 62 110 A 235 235 0 0 0 518 110 L 518 15" fill="none" stroke="#3b82f644" strokeWidth="2.5"/>
              <rect x="175" y="15" width="230" height="250" fill="none" stroke="#1f2937" strokeWidth="2" rx="3"/>
              <circle cx="290" cy="265" r="78" fill="none" stroke="#1f293744" strokeWidth="1.5"/>
              <line x1="175" y1="265" x2="405" y2="265" stroke="#8b5cf644" strokeWidth="2" strokeDasharray="8,4"/>
              <circle cx="290" cy="50" r="22" fill="none" stroke="#ef444466" strokeWidth="2.5"/>
              <line x1="266" y1="25" x2="314" y2="25" stroke="#6b7280" strokeWidth="4"/>

              {/* @RIM (includes dunks) */}
              <g opacity={hasRim?1:0.3}>
                <text x="155" y="42" textAnchor="middle" fill="#f97316" style={{fontSize:12,fontWeight:"bold"}}>@RIM</text>
                <text x="155" y="68" textAnchor="middle" fill={sc(rimPct,"rim")} style={{fontSize:22,fontWeight:"bold"}}>{rimPct!=null?`${fmt(rimPct)}%`:"N/A"}</text>
                {rimAtt!=null&&<text x="155" y="86" textAnchor="middle" fill="#9ca3af" style={{fontSize:11}}>{zoneMade(rimF,rimPct)||"?"}-{rimAtt} FGA</text>}
                {!hasRim&&<text x="155" y="86" textAnchor="middle" fill="#4b5563" style={{fontSize:10}}>no tracking</text>}
              </g>

              {/* DUNKS (subset of rim) */}
              <g opacity={hasDunk?1:0.3}>
                <text x="415" y="42" textAnchor="middle" fill="#ef4444" style={{fontSize:12,fontWeight:"bold"}}>DUNKS</text>
                <text x="415" y="68" textAnchor="middle" fill={dunkPct!=null?sc(dunkPct,"rim"):"#e5e7eb"} style={{fontSize:20,fontWeight:"bold"}}>{dunkPct!=null?`${fmt(dunkPct)}%`:(hasDunk?`${fmt(dunkR)}% freq`:"N/A")}</text>
                {dunkAtt!=null&&<text x="415" y="86" textAnchor="middle" fill="#9ca3af" style={{fontSize:11}}>{dunkAtt} att.</text>}
              </g>

              {/* MID */}
              <g opacity={hasMid?1:0.3}>
                <text x="95" y="172" textAnchor="middle" fill="#fbbf24" style={{fontSize:12,fontWeight:"bold"}}>MID</text>
                <text x="95" y="198" textAnchor="middle" fill={sc(midPct,"mid")} style={{fontSize:22,fontWeight:"bold"}}>{midPct!=null?`${fmt(midPct)}%`:"N/A"}</text>
                {midAtt!=null&&<text x="95" y="216" textAnchor="middle" fill="#9ca3af" style={{fontSize:11}}>{zoneMade(midF,midPct)||"?"}-{midAtt} FGA</text>}
                {!hasMid&&<text x="95" y="216" textAnchor="middle" fill="#4b5563" style={{fontSize:10}}>no tracking</text>}
              </g>

              {/* FREE THROW */}
              <g>
                <text x="290" y="228" textAnchor="middle" fill="#8b5cf6" style={{fontSize:13,fontWeight:"bold"}}>FREE THROW</text>
                <text x="290" y="256" textAnchor="middle" fill={sc(ft,"ft")} style={{fontSize:24,fontWeight:"bold"}}>{ft!=null?`${fmt(ft)}%`:"—"}</text>
                {totalFta!=null&&<text x="290" y="274" textAnchor="middle" fill="#9ca3af" style={{fontSize:11}}>{totalFta} FTA</text>}
                {totalFta==null&&<text x="290" y="274" textAnchor="middle" fill="#6b7280" style={{fontSize:11}}>FTR: {ftr!=null?fmt(ftr):"—"}</text>}
              </g>

              {/* 3-POINT */}
              <g opacity={tp!=null?1:0.3}>
                <text x="290" y="355" textAnchor="middle" fill="#3b82f6" style={{fontSize:16,fontWeight:"bold"}}>3-POINT</text>
                <text x="290" y="387" textAnchor="middle" fill={sc(tp,"3pt")} style={{fontSize:30,fontWeight:"bold"}}>{tp!=null?`${fmt(tp)}%`:"—"}</text>
                {threeAtt!=null&&<text x="290" y="407" textAnchor="middle" fill="#9ca3af" style={{fontSize:12}}>{zoneMade(threeF,tp)||"?"}-{threeAtt} 3PA</text>}
              </g>
            </svg>
          </div>

          {/* ── SHOT DIET: % of total shots (FGA+FTA), dunks stacked in rim ── */}
          <div className="lg:col-span-2">
            <div className="text-xs uppercase tracking-wider mb-2 font-semibold" style={{color:"#6b7280"}}>Shot Diet (% of all shots · FGA+FTA)</div>
            {totalShots > 0 ? (
              <div className="space-y-3">
                {/* Rim bar with dunks stacked inside */}
                {rimPctOfTotal != null && (
                  <div>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-sm font-semibold" style={{color:"#f97316"}}>@Rim <span style={{color:"#ef4444",fontSize:11}}>(incl. {dunkPctOfTotal!=null?`${fmt(dunkPctOfTotal,0)}%`:""} dunks)</span></span>
                      <span className="text-sm font-bold" style={{color:"#e5e7eb"}}>{fmt(rimPctOfTotal,1)}%</span>
                    </div>
                    <div className="h-8 rounded-lg overflow-hidden relative" style={{background:"#1f2937"}}>
                      {/* Non-dunk rim portion */}
                      <div className="absolute top-0 bottom-0 rounded-l-lg" style={{left:0,width:`${rimPctOfTotal}%`,background:"linear-gradient(90deg,#f9731655,#f97316aa)"}}/>
                      {/* Dunk portion (stacked inside, darker) */}
                      {dunkPctOfTotal!=null&&<div className="absolute top-0 bottom-0 rounded-l-lg" style={{left:0,width:`${dunkPctOfTotal}%`,background:"linear-gradient(90deg,#ef4444aa,#ef4444dd)"}}/>}
                      {/* Labels */}
                      <div className="absolute inset-0 flex items-center pl-2 text-xs font-bold text-white">
                        {dunkPctOfTotal!=null&&dunkPctOfTotal>4&&<span className="mr-1" style={{color:"#fecaca"}}>{fmt(dunkPctOfTotal,0)}🏀</span>}
                        {rimPctOfTotal>15&&<span>{fmt(rimPctOfTotal,0)}%</span>}
                      </div>
                    </div>
                  </div>
                )}
                {/* Mid */}
                {midPctOfTotal != null && midPctOfTotal > 0 && (
                  <div>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-sm font-semibold" style={{color:"#fbbf24"}}>Mid-Range</span>
                      <span className="text-sm font-bold" style={{color:"#e5e7eb"}}>{fmt(midPctOfTotal,1)}%</span>
                    </div>
                    <div className="h-8 rounded-lg overflow-hidden" style={{background:"#1f2937"}}>
                      <div className="h-full rounded-lg flex items-center pl-2" style={{width:`${Math.max(4,midPctOfTotal)}%`,background:"linear-gradient(90deg,#fbbf2455,#fbbf24aa)"}}>
                        {midPctOfTotal>10&&<span className="text-xs font-bold text-white">{fmt(midPctOfTotal,0)}%</span>}
                      </div>
                    </div>
                  </div>
                )}
                {/* 3PT */}
                {threePctOfTotal != null && threePctOfTotal > 0 && (
                  <div>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-sm font-semibold" style={{color:"#3b82f6"}}>3-Point</span>
                      <span className="text-sm font-bold" style={{color:"#e5e7eb"}}>{fmt(threePctOfTotal,1)}%</span>
                    </div>
                    <div className="h-8 rounded-lg overflow-hidden" style={{background:"#1f2937"}}>
                      <div className="h-full rounded-lg flex items-center pl-2" style={{width:`${Math.max(4,threePctOfTotal)}%`,background:"linear-gradient(90deg,#3b82f655,#3b82f6aa)"}}>
                        {threePctOfTotal>10&&<span className="text-xs font-bold text-white">{fmt(threePctOfTotal,0)}%</span>}
                      </div>
                    </div>
                  </div>
                )}
                {/* FT */}
                {ftPctOfTotal != null && ftPctOfTotal > 0 && (
                  <div>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-sm font-semibold" style={{color:"#8b5cf6"}}>Free Throws</span>
                      <span className="text-sm font-bold" style={{color:"#e5e7eb"}}>{fmt(ftPctOfTotal,1)}%</span>
                    </div>
                    <div className="h-8 rounded-lg overflow-hidden" style={{background:"#1f2937"}}>
                      <div className="h-full rounded-lg flex items-center pl-2" style={{width:`${Math.max(4,ftPctOfTotal)}%`,background:"linear-gradient(90deg,#8b5cf655,#8b5cf6aa)"}}>
                        {ftPctOfTotal>10&&<span className="text-xs font-bold text-white">{fmt(ftPctOfTotal,0)}%</span>}
                      </div>
                    </div>
                  </div>
                )}
                <div className="text-xs mt-1" style={{color:"#4b5563"}}>{totalShots} total shots ({totalFga||"?"} FGA + {totalFta||"?"} FTA)</div>
              </div>
            ) : (
              <div className="py-6 text-center rounded-lg" style={{background:"#0d1117",color:"#6b7280"}}>
                <div className="text-sm mb-1">No shot distribution data</div>
                <div className="text-xs">Shot-type frequencies unavailable.</div>
              </div>
            )}
          </div>
        </div>
        {/* ── Summary: TS% + Unassisted ── */}
        <div className="mt-3 flex items-center gap-6 text-sm" style={{color:"#9ca3af"}}>
          <Tip content={<div>True Shooting % — PTS / (2 × FGA + 0.44 × FTA). Single efficiency number.</div>}>
            <span className="cursor-help">TS%: <strong style={{color:sc(ts,"ft")}}>{ts!=null?fmt(ts):"—"}</strong></span>
          </Tip>
          <Tip content={<div>Estimated % of FGA self-created (no assist). Proxy: USG×2.0 − AST%×0.5.</div>}>
            <span className="cursor-help">Unassisted FGA: <strong style={{color:"#f97316"}}>~{selfCreatedPct}%</strong> <span style={{color:"#4b5563"}}>(est.) ⓘ</span></span>
          </Tip>
        </div>
      </Sec>

      {/* ═══ NBA SHOOTING PROJECTION ═══ */}
      <Sec icon="🔮" title="NBA Shooting Projection" sub={isIntl?"Bayesian priors (FT%-based touch)":"Bayesian Beta-Binomial model (Berger 2022)"}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {[
            ["projNba3p","Proj. 3P%", projNba3p, projNba3p!=null?(projNba3p>36?"#22c55e":projNba3p>32?"#fbbf24":"#ef4444"):"#6b7280"],
            ["projNba3pa","Proj. 3PA/G", projNba3pa, projNba3pa!=null?(projNba3pa>5?"#3b82f6":"#6b7280"):"#6b7280"],
            ["projNba3par","Proj. 3PAr", proj3PAr, proj3PAr!=null?(proj3PAr>30?"#3b82f6":"#6b7280"):"#6b7280"],
            ["touchPrior","Touch Prior", touchPrior, touchPrior>37?"#22c55e":touchPrior>34?"#fbbf24":"#ef4444"],
          ].map(([key,l,v,c])=>{
            const m=METHODS[key]||METHODS.touchPrior;
            return (
              <Tip key={key} wide content={
                <div><div className="font-bold mb-1" style={{color:"#f97316"}}>{m?.name||l}</div>
                {m?.formula&&<div className="mb-1"><span style={{color:"#94a3b8"}}>Formula:</span><br/><code className="text-xs" style={{color:"#7dd3fc"}}>{m.formula}</code></div>}
                {m?.desc&&<div style={{color:"#cbd5e1"}}>{m.desc}</div>}
                {key==="projNba3pa"&&<div className="mt-1" style={{color:"#94a3b8"}}>Volume: {bestTier} {p.pos} → {projFGA.toFixed(1)} FGA/game median.</div>}
                </div>
              }>
                <div className="rounded-lg p-4 text-center cursor-help" style={{background:"#0d1117"}}>
                  <div className="text-xs uppercase tracking-wider mb-1" style={{color:"#6b7280"}}>{l} <span style={{color:"#475569"}}>ⓘ</span></div>
                  <div className="text-3xl font-bold" style={{color:c,fontFamily:"'Oswald',sans-serif"}}>{v!=null?fmt(v):"—"}{key==="touchPrior"?"%":""}</div>
                  {v==null&&<div className="text-xs mt-1" style={{color:"#475569"}}>insufficient data</div>}
                </div>
              </Tip>
            );
          })}
        </div>
        <div className="px-3 py-2 rounded-lg text-xs" style={{background:"#0d1117",border:"1px solid #1e293b"}}>
          <Tip wide content={<div><div className="font-bold mb-1" style={{color:"#f97316"}}>Bayesian Beta-Binomial (Berger 2022)</div><div style={{color:"#cbd5e1"}}>Prior: FT%-based touch (μ₀). kappa=200 pseudo-attempts. Volume: {bestTier} {p.pos} → {projFGA.toFixed(1)} FGA/game.</div></div>}>
            <span style={{color:"#6b7280"}}>Touch Prior: FT% (<span style={{color:"#8b5cf6"}}>{ft!=null?fmt(ft):"—"}</span>) × 0.18 + Mid% (<span style={{color:"#fbbf24"}}>{midPct!=null?fmt(midPct):`~${fmt(midForPrior)} est`}</span>) × 0.05 + 0.20 = <span className="font-bold" style={{color:touchPrior>37?"#22c55e":"#fbbf24"}}>{fmt(touchPrior)}%</span> <span style={{color:"#475569"}}>ⓘ</span></span>
          </Tip>
        </div>
      </Sec>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: PROJECTION (Monte Carlo — Priority 1)
// ═══════════════════════════════════════════════════════════
function ProjectionTab({p}) {
  const tierOrder=["Superstar","All-Star","Starter","Role Player","Replacement","Out"];
  const tierData=tierOrder.map(t=>({name:t.replace("Role Player","Role\nPlayer"),pct:p.tiers[t]||0,fill:TC[t]||"#374151"}));

  // ASPM-based display (new pipeline) or PIE-based (old pipeline)
  const isNewPipeline = p.aspm != null;
  const peakVal = isNewPipeline ? p.aspm : p.mu;
  const peakLabel = isNewPipeline ? "Adj. ASPM" : "Peak PIE";
  const peakScale = isNewPipeline ? 1 : 1; // PIE is 0-1 scale displayed as-is

  // Career path
  const isNbaPath = (p.careerPath||"NBA") === "NBA";

  // Boom-or-bust detection
  const vol = p.volatility ?? p.sigma ?? 3.5;
  const isBoomBust = vol > 4.5 || ((p.tiers.Superstar||0)>15 && (p.tiers["Out"]||0)>15);

  // Build Monte Carlo density curve (simulated from normal distribution)
  const densityCurve = useMemo(() => {
    if (peakVal == null || vol == null) return [];
    const mu = peakVal;
    const sig = vol;
    const points = [];
    for (let x = mu - 3.5*sig; x <= mu + 3.5*sig; x += sig*0.15) {
      const z = (x - mu) / sig;
      const density = Math.exp(-0.5*z*z) / (sig * Math.sqrt(2*Math.PI));
      // Determine tier for coloring
      let tier = "Out";
      if (x >= 14) tier = "Superstar";
      else if (x >= 10) tier = "All-Star";
      else if (x >= 7.5) tier = "Starter";
      else if (x >= 5) tier = "Role Player";
      else if (x >= 3) tier = "Replacement";
      points.push({ x: Math.round(x*10)/10, density: Math.round(density*1000)/10, tier });
    }
    return points;
  }, [peakVal, vol]);

  return (
    <div className="space-y-5">
      {/* Header cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          [peakLabel, peakVal!=null?fmt(peakVal):"—", "#f97316", `Model's best estimate of 3-year NBA peak${isNewPipeline?" (ASPM scale: Superstar >14, All-Star 10-14, Starter 7.5-10, Role 5-7.5)":""}.`],
          ["UPS", p.ups!=null?fmt(p.ups,0):"—", "#fbbf24", "Unified Prospect Score (0-100). Integral of probability density across all Monte Carlo runs — captures both ceiling AND floor."],
          ["Uncertainty (σ)", vol!=null?`± ${fmt(vol)}`:"—", "#6b7280", `How uncertain the model is. σ = ${fmt(vol)}. NCAA base = 3.5, Intl = 4.0, + age & league volatility. 68% of outcomes fall within ±1σ.`],
          ["Career Path", isNbaPath?"NBA":"International", isNbaPath?"#22c55e":"#60a5fa", "If P(≥Roleplayer) > 25% → NBA path, else International path with EuroLeague/domestic tier mapping."],
        ].map(([l,v,c,desc])=>(
          <Tip key={l} wide content={<div><div className="font-bold mb-1" style={{color:"#f97316"}}>{l}</div><div style={{color:"#cbd5e1"}}>{desc}</div></div>}>
            <div className="rounded-xl p-5 text-center cursor-help" style={{background:"#111827"}}>
              <div className="text-xs uppercase tracking-wider mb-1" style={{color:"#6b7280"}}>{l} <span style={{color:"#475569"}}>ⓘ</span></div>
              <div className="text-3xl font-bold" style={{color:c,fontFamily:"'Oswald',sans-serif"}}>{v}</div>
            </div>
          </Tip>
        ))}
      </div>

      {/* Boom-or-Bust indicator */}
      {isBoomBust && (
        <div className="p-3 rounded-lg text-sm flex items-center gap-3" style={{background:"#7f1d1d33",border:"1px solid #ef444444",color:"#fca5a5"}}>
          <span className="text-2xl">±</span>
          <div>
            <span className="font-bold">High Volatility — Boom-or-Bust Profile</span>
            <div className="text-xs mt-0.5" style={{color:"#f87171"}}>Statistical profiles range from {p.predTier||"Starter"} to Out-of-League. Projection confidence is low due to σ={fmt(vol)}.</div>
          </div>
        </div>
      )}

      {/* Monte Carlo density curve */}
      {densityCurve.length > 0 && (
        <Sec icon="📈" title="Monte Carlo Distribution (20k runs)" sub={`Normal(μ=${fmt(peakVal)}, σ=${fmt(vol)}) — colored by tier thresholds`}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={densityCurve} margin={{top:5,right:20,bottom:5,left:5}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937"/>
              <XAxis dataKey="x" tick={{fill:"#6b7280",fontSize:10}} axisLine={{stroke:"#1f2937"}} label={{value:isNewPipeline?"ASPM":"PIE",position:"insideBottom",fill:"#475569",fontSize:10}}/>
              <YAxis tick={{fill:"#6b7280",fontSize:10}} axisLine={false} tickLine={false}/>
              <RTooltip contentStyle={{background:"#1f2937",border:"1px solid #374151",borderRadius:8,color:"#e5e7eb",fontSize:12}} formatter={(v,n,props)=>[`Density: ${v}`, `Tier: ${props.payload.tier}`]}/>
              <Area type="monotone" dataKey="density" stroke="#f97316" fill="#f9731644" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-3 mt-2 text-xs">
            {[["Out","<3"],["Repl","3-5"],["Role","5-7.5"],["Start","7.5-10"],["All★","10-14"],["⭐","14+"]].map(([l,r])=>(
              <span key={l} style={{color:TC[l==="⭐"?"Superstar":l==="All★"?"All-Star":l==="Start"?"Starter":l==="Role"?"Role Player":l==="Repl"?"Replacement":"Out"]||"#6b7280"}}>{l} ({r})</span>
            ))}
          </div>
        </Sec>
      )}

      {/* Tier probability bar chart */}
      <Sec icon="◆" title="Tier Probabilities" sub="Monte Carlo (20k samples) — probability of reaching each career tier">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={tierData} margin={{top:5,right:5,bottom:5,left:5}}>
            <XAxis dataKey="name" tick={{fill:"#9ca3af",fontSize:11}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:"#6b7280",fontSize:11}} axisLine={false} tickLine={false} domain={[0,Math.max(50,...tierData.map(t=>t.pct+5))]} tickFormatter={v=>`${v}%`}/>
            <RTooltip contentStyle={{background:"#1f2937",border:"1px solid #374151",borderRadius:8,color:"#e5e7eb"}} formatter={v=>[`${v.toFixed(1)}%`,"Probability"]}/>
            <Bar dataKey="pct" radius={[6,6,0,0]}>{tierData.map((e,i)=><Cell key={i} fill={e.fill}/>)}</Bar>
          </BarChart>
        </ResponsiveContainer>
        {p.actual&&<div className="mt-3 flex items-center gap-3 p-3 rounded-lg" style={{background:"#0c1222",border:"1px solid #1e3a5f"}}>
          <span className="text-xs" style={{color:"#6b7280"}}>Actual:</span><TierBadge tier={p.actual}/><span className="text-sm" style={{color:"#9ca3af"}}>Peak: {p.peakPie!=null?fmt(p.peakPie):fmt(p.peakPie,3)}</span>
        </div>}
      </Sec>

      {/* 3-Year Peak Matrix */}
      <Sec icon="🎯" title="3-Year Peak Matrix" sub="Projected peak with confidence intervals (±1σ)">
        <div className="grid grid-cols-3 gap-4">
          {[
            ["Production", p.production, "#f97316", "BPM (NCAA) or ASPM (Intl) — raw statistical output"],
            ["Impact", p.impact, "#3b82f6", "PORPAG (NCAA) or eDiff (Intl) — plus/minus derived contribution"],
            ["Blend (65/35)", peakVal, "#fbbf24", "Weighted blend: 65% Production + 35% Impact → z-scored and age-adjusted"],
          ].map(([l,v,c,desc])=>(
            <Tip key={l} content={<div><div className="font-bold mb-1" style={{color:c}}>{l}</div><div style={{color:"#cbd5e1"}}>{desc}</div></div>}>
              <div className="rounded-lg p-4 text-center cursor-help" style={{background:"#0d1117"}}>
                <div className="text-xs uppercase mb-2" style={{color:"#6b7280"}}>{l} <span style={{color:"#475569"}}>ⓘ</span></div>
                <div className="text-2xl font-bold" style={{color:c,fontFamily:"'Oswald',sans-serif"}}>{v!=null?fmt(v):"—"}</div>
                {v!=null && vol!=null && <div className="text-xs mt-1" style={{color:"#475569"}}>
                  [{fmt(v-vol)} – {fmt(Number(v)+Number(vol))}]
                </div>}
              </div>
            </Tip>
          ))}
        </div>
      </Sec>

      {/* Season-by-Season */}
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
// TAB: SCOUTING (Pillars + Roles + Archetypes + Possession Impact + Full Badges)
// ═══════════════════════════════════════════════════════════
function ScoutingTab({p}) {
  // Use merged badges from mapProfile (server + client-computed, deduped)
  const badges = { green: p.badges || [], yellow: p.yellowBadges || [], red: p.redFlags || [] };
  const allBadges = [...badges.green, ...badges.yellow, ...badges.red];

  // ── Pillar Scores ──
  const pillars = [
    {key:"feel",name:"IQ & Feel",value:p.feel??0,color:"#fbbf24",icon:"🧠"},
    {key:"shootScore",name:"Shooting",value:p.shootScore??0,color:"#22c55e",icon:"🎯"},
    {key:"defScore",name:"Defense",value:p.defScore??0,color:"#3b82f6",icon:"🛡"},
    {key:"funcAth",name:"Athleticism",value:p.funcAth??0,color:"#f97316",icon:"⚡"},
    {key:"selfCreation",name:"Self-Creation",value:p.selfCreation??0,color:"#06b6d4",icon:"✦",max:200},
  ];

  // ── Role Z-scores ──
  const rr = p.roles || {};
  const roleGroups = [
    {label:"Offensive",color:"#f97316",roles:[
      {key:"scorer",name:"Scorer",z:roleToZ(rr.scorer)},
      {key:"playmaker",name:"Playmaker",z:roleToZ(rr.playmaker)},
      {key:"spacer",name:"Spacer",z:roleToZ(rr.spacer)},
      {key:"driver",name:"Driver",z:roleToZ(rr.driver)},
      {key:"crasher",name:"Crasher",z:roleToZ(rr.crasher)},
    ]},
    {label:"Defensive",color:"#3b82f6",roles:[
      {key:"onball",name:"On-Ball D",z:roleToZ(rr.onball)},
      {key:"switchPot",name:"Switch Pot.",z:roleToZ(rr.switchPot)},
      {key:"rimProt",name:"Rim Protect",z:roleToZ(rr.rimProt)},
      {key:"rebounder",name:"Rebounder",z:roleToZ(rr.rebounder)},
    ]},
    {label:"Hybrid",color:"#8b5cf6",roles:[
      {key:"connector",name:"Connector",z:roleToZ(rr.connector)},
      {key:"helio",name:"Helio-Scorer",z:roleToZ(rr.helio)},
      {key:"event",name:"Event Creator",z:roleToZ(rr.event)},
      {key:"zone",name:"Zone Pressure",z:roleToZ(rr.zone)},
      {key:"microSpacer",name:"Micro-Spacer",z:roleToZ(rr.microSpacer)},
    ]},
  ];

  // ── Archetype ──
  const archetype = p.archetype || "Unknown";
  const ARCHETYPE_MAP = {
    "Helio-Centric Engine":  {desc:"Ball-dominant offensive engine. The offense runs through this player.",color:"#fbbf24"},
    "Primary Initiator":     {desc:"Lead playmaker who creates for others. Half-court orchestrator.",color:"#f97316"},
    "Scoring Combo Guard":   {desc:"Versatile scoring guard. Can play on/off-ball with shooting.",color:"#22c55e"},
    "3&D Wing":              {desc:"Shoot and defend. The most valuable role player archetype in the NBA.",color:"#3b82f6"},
    "Versatile Forward":     {desc:"Multi-positional forward. Defends, shoots, and connects plays.",color:"#8b5cf6"},
    "Point Forward":         {desc:"Oversized playmaker. Creates mismatches with size + passing.",color:"#06b6d4"},
    "Stretch Big":           {desc:"Shooting big who spaces the floor. Gravity from the 5 position.",color:"#10b981"},
    "Rim-Running Big":       {desc:"Vertical threat. Finishes lobs, protects the rim, boards.",color:"#ef4444"},
    "Two-Way Anchor":        {desc:"Defensive anchor with offensive polish. Anchors playoff rotations.",color:"#60a5fa"},
    "Micro-Ball 5":          {desc:"Undersized center who defends with IQ. Switching specialist.",color:"#a78bfa"},
    "Shot Creator":          {desc:"Can generate own shot off the dribble. Self-creation specialist.",color:"#fb923c"},
    "Athletic Slasher":      {desc:"Attacks the rim with explosiveness. Transition weapon.",color:"#f43f5e"},
  };
  const allArchetypes = Object.entries(ARCHETYPE_MAP);

  // ── Four Factors / Possession Impact & Carefree Playability ──
  // Convert percentiles to Z-scores for bidirectional display
  const ffEfg = p.ff?.efg ?? 50;
  const ffTov = p.ff?.tov ?? 50;
  const ffOrb = p.ff?.orb ?? 50;
  const ffFtr = p.ff?.ftr ?? 50;
  const npv = p.ff?.comp ?? 50;

  // Convert percentile (0-100) to Z-score (-3 to +3) for bar display
  const pToZ = (pctl) => {
    if (pctl == null) return 0;
    return Math.max(-3, Math.min(3, (pctl - 50) / 16.67));
  };

  const ffFactors = [
    {key:"efg",label:"Shot Quality (eFG%)",z:pToZ(ffEfg),pctl:ffEfg,weight:"40%",color:"#fbbf24",
     desc:"Shooting efficiency adjusted for 3-point value. Positive = better than role-peers. Negative = below-average efficiency."},
    {key:"tov",label:"Ball Security (TO%)",z:pToZ(ffTov),pctl:ffTov,weight:"25%",color:"#3b82f6",
     desc:"Turnover control inverted: positive = fewer turnovers than peers. This factor rewards careful ball-handlers."},
    {key:"orb",label:"Extra Possessions (ORB%)",z:pToZ(ffOrb),pctl:ffOrb,weight:"20%",color:"#06b6d4",
     desc:"Offensive rebounding creates second-chance points. Positive = elite glass work for their role."},
    {key:"ftr",label:"Foul Pressure (FTr)",z:pToZ(ffFtr),pctl:ffFtr,weight:"15%",color:"#8b5cf6",
     desc:"Drawing fouls generates free points and creates foul trouble. Positive = aggressive rim attacker."},
  ];

  const npvZ = pToZ(npv);
  const npvLabel = npvZ >= 1.2 ? "Elite Floor Raiser" : npvZ >= 0.3 ? "Winning Piece" : npvZ >= -0.3 ? "Role Dependent" : "High Maintenance";
  const npvColor = npvZ >= 1.2 ? "#22c55e" : npvZ >= 0.3 ? "#86efac" : npvZ >= -0.3 ? "#fbbf24" : "#ef4444";
  const npvDesc = npvZ >= 1.2
    ? "Makes every team immediately more stable and efficient. Every possession is protected and optimized."
    : npvZ >= 0.3
    ? "Highly efficient contributor who avoids costly mistakes. A reliable building block for any roster."
    : npvZ >= -0.3
    ? "Gets the job done within structure, but needs a system around him. Neither helps nor hurts possession math."
    : "Consumes more possessions than he generates value. High talent may compensate, but it's expensive for coaches.";

  return (
    <div className="space-y-5">
      {/* ── BADGES (ALL — no limit on scouting page) ────── */}
      <Sec icon="🏅" title="Skill Badges" sub="Computed from stats with international adjustments. Hover each badge for trigger rules and scouting context.">
        {p.source !== "ncaa" && <div className="mb-3 px-3 py-1.5 rounded-lg inline-block text-xs" style={{background:"#3b82f622",color:"#60a5fa",border:"1px solid #3b82f644"}}>International Adjuster Active: Stats scaled x1.25, STL%/BLK% x1.15 for badge evaluation</div>}
        {badges.green.length > 0 && <>
          <div className="text-xs uppercase tracking-wider mb-2" style={{color:"#22c55e"}}>✓ Green Flags ({badges.green.length})</div>
          <div className="flex flex-wrap gap-2 mb-4">{badges.green.map((b,i)=><BadgeChip key={`g${i}`} text={b} color="#22c55e"/>)}</div>
        </>}
        {badges.yellow.length > 0 && <>
          <div className="text-xs uppercase tracking-wider mb-2" style={{color:"#fbbf24"}}>⚡ Swing Skills ({badges.yellow.length})</div>
          <div className="flex flex-wrap gap-2 mb-4">{badges.yellow.map((b,i)=><BadgeChip key={`y${i}`} text={b} color="#fbbf24"/>)}</div>
        </>}
        {badges.red.length > 0 && <>
          <div className="text-xs uppercase tracking-wider mb-2" style={{color:"#ef4444"}}>⚠ Red Flags ({badges.red.length})</div>
          <div className="flex flex-wrap gap-2 mb-4">{badges.red.map((f,i)=><BadgeChip key={`r${i}`} text={f} color="#ef4444"/>)}</div>
        </>}
        {allBadges.length === 0 && <div className="text-sm" style={{color:"#6b7280"}}>No badges earned — average or data-insufficient profile.</div>}
      </Sec>

      {/* ── PILLARS (5 DNA scores) ─────────────────────── */}
      <Sec icon="🔬" title="The 5 Pillars" sub="Prospect DNA — position-adjusted percentile scores (0-100)">
        {p.source !== "ncaa" && <div className="mb-3 px-3 py-1.5 rounded-lg inline-block text-xs" style={{background:"#3b82f622",color:"#60a5fa",border:"1px solid #3b82f644"}}>League-Adjusted (x1.25 for international stats)</div>}
        <div className="grid grid-cols-5 gap-3">
          {pillars.map(pl=>(
            <Tip key={pl.key} wide content={
              <div><div className="font-bold mb-1" style={{color:pl.color}}>{METHODS[pl.key]?.name||pl.name}</div>
              <div className="mb-1"><span style={{color:"#94a3b8"}}>Formula:</span><br/><code className="text-xs" style={{color:"#7dd3fc"}}>{METHODS[pl.key]?.formula||""}</code></div>
              <div style={{color:"#cbd5e1"}}>{METHODS[pl.key]?.desc||""}</div></div>
            }>
              <div className="rounded-xl p-4 text-center cursor-help" style={{background:"#0d1117",border:`1px solid ${pl.color}33`}}>
                <div className="text-lg mb-1">{pl.icon}</div>
                <div className="text-xs uppercase tracking-wider mb-2" style={{color:"#6b7280"}}>{pl.name} <span style={{color:"#475569"}}>ⓘ</span></div>
                <div className="text-3xl font-bold" style={{color:pl.color,fontFamily:"'Oswald',sans-serif"}}>{Math.round(pl.value)}</div>
                <div className="mt-2 h-2 rounded-full overflow-hidden" style={{background:"#1f2937"}}>
                  <div className="h-full rounded-full" style={{width:`${Math.min(100,(pl.value/(pl.max||100))*100)}%`,background:`linear-gradient(90deg,${pl.color}88,${pl.color})`}}/>
                </div>
              </div>
            </Tip>
          ))}
        </div>
      </Sec>

      {/* ── POSSESSION IMPACT & CAREFREE PLAYABILITY ────── */}
      <Sec icon="↗" title="Possession Impact & Carefree Playability" sub="">
        <Tip wide content={
          <div>
            <div className="font-bold mb-1" style={{color:"#f97316"}}>{METHODS.fourFactors.name}</div>
            <div className="mb-1"><span style={{color:"#94a3b8"}}>Formula:</span><br/><code className="text-xs" style={{color:"#7dd3fc"}}>{METHODS.fourFactors.formula}</code></div>
            <div style={{color:"#cbd5e1"}}>{METHODS.fourFactors.desc}</div>
          </div>
        }>
          <div className="text-xs mb-4 cursor-help" style={{color:"#6b7280"}}>
            The NPV is not a talent rating — it's an efficiency index measuring how 'expensive' it is for a coach to keep this player on the floor. <span style={{color:"#475569"}}>ⓘ hover for formula</span>
          </div>
        </Tip>

        {/* Central NPV card */}
        <div className="flex items-center gap-4 mb-5 p-5 rounded-xl" style={{background:"#0d1117",border:`1px solid ${npvColor}33`}}>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider mb-1" style={{color:"#6b7280"}}>Net Possession Value</div>
            <div className="text-4xl font-bold" style={{color:npvColor,fontFamily:"'Oswald',sans-serif"}}>{Math.round(npv)}</div>
          </div>
          <div className="text-right">
            <div className="px-4 py-2 rounded-lg text-sm font-bold mb-1" style={{background:npvColor+"22",color:npvColor,border:`1px solid ${npvColor}44`}}>{npvLabel}</div>
            <div className="text-xs max-w-xs" style={{color:"#6b7280"}}>{npvDesc}</div>
          </div>
          {p.cffr?.usageRole && <div className="ml-auto text-xs text-right" style={{color:"#6b7280"}}>Usage Role:<br/><span className="font-semibold" style={{color:"#f97316"}}>{p.cffr.usageRole}</span></div>}
        </div>

        {/* Bidirectional Z-Score Bars ("Why" bars) */}
        <div className="text-xs uppercase tracking-wider mb-3 font-semibold" style={{color:"#6b7280"}}>Factor Breakdown</div>
        <div className="space-y-3">
          {ffFactors.map(f => {
            const barPct = Math.abs(f.z) / 3 * 50; // 50% = max extent from center
            const isPositive = f.z >= 0;
            return (
              <Tip key={f.key} content={<div><div className="font-bold mb-1" style={{color:f.color}}>{f.label}</div><div className="mb-1 text-xs" style={{color:"#94a3b8"}}>Weight: {f.weight}</div><div style={{color:"#cbd5e1"}}>{f.desc}</div></div>}>
                <div className="cursor-help">
                  <div className="flex justify-between items-center mb-1">
                    <div className="text-xs font-semibold" style={{color:f.color}}>{f.label} <span style={{color:"#475569"}}>ⓘ</span></div>
                    <div className="text-xs" style={{color:"#6b7280"}}>Wt: {f.weight}</div>
                  </div>
                  <div className="relative h-6 rounded-full overflow-hidden" style={{background:"#1f2937"}}>
                    {/* Center line */}
                    <div className="absolute top-0 bottom-0 w-px z-10" style={{left:"50%",background:"#ffffff44"}}/>
                    {/* Bar extending from center */}
                    {isPositive ? (
                      <div className="absolute top-0 bottom-0 rounded-r-full" style={{
                        left:"50%",width:`${barPct}%`,
                        background:`linear-gradient(90deg,${f.color}66,${f.color})`
                      }}/>
                    ) : (
                      <div className="absolute top-0 bottom-0 rounded-l-full" style={{
                        right:"50%",width:`${barPct}%`,
                        background:`linear-gradient(270deg,${f.color}66,${f.color})`
                      }}/>
                    )}
                    {/* Labels on bar */}
                    <div className="absolute inset-0 flex items-center justify-between px-3 text-xs font-semibold" style={{color:"#9ca3af"}}>
                      <span style={{fontSize:9}}>- Drain</span>
                      <span style={{fontSize:9}}>+ Impact</span>
                    </div>
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <div className="text-xs" style={{color:f.z >= 0 ? f.color : "#ef4444"}}>{f.z > 0 ? "+" : ""}{f.z.toFixed(1)}σ</div>
                    <div className="text-xs" style={{color:"#475569"}}>Pctl: {Math.round(f.pctl)}</div>
                  </div>
                </div>
              </Tip>
            );
          })}
        </div>
      </Sec>

      {/* ── ROLE INFERENCE MATRIX ─────────────────────── */}
      <Sec icon="📊" title="Role Inference Matrix" sub="Z-scores: >=+2.0 = Elite, >=+1.0 = Impact, <-1.0 = Liability">
        {roleGroups.map(grp=>(
          <div key={grp.label} className="mb-4">
            <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{color:grp.color}}>{grp.label}</div>
            <div className="grid grid-cols-5 gap-2">
              {grp.roles.map(r=>(
                <div key={r.key} className="rounded-lg p-3 text-center" style={{background:zBg(r.z),border:`1px solid ${zColor(r.z)}22`}}>
                  <div className="text-xs mb-1 truncate" style={{color:"#9ca3af"}}>{r.name}</div>
                  <div className="font-bold font-mono text-lg" style={{color:zColor(r.z),fontFamily:"'Oswald',sans-serif"}}>{r.z>0?"+":""}{r.z}</div>
                  <div className="text-xs" style={{color:zColor(r.z),opacity:0.7}}>{zLabel(r.z)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Sec>

      {/* ── ARCHETYPE (all 12 shown, primary highlighted) ─ */}
      <Sec icon="🏷" title="NBA Archetype Fit" sub="All 12 archetypes — primary match highlighted. Based on pillar + role combination.">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {allArchetypes.map(([name, info]) => {
            const isPrimary = archetype === name;
            return (
              <Tip key={name} content={<div><div className="font-bold mb-1" style={{color:info.color}}>{name}</div><div style={{color:"#cbd5e1"}}>{info.desc}</div></div>}>
                <div className={`rounded-lg p-3 cursor-help transition-all ${isPrimary ? "ring-2" : ""}`}
                  style={{
                    background: isPrimary ? info.color + "18" : "#0d1117",
                    border: `1px solid ${isPrimary ? info.color : "#1f2937"}`,
                    ringColor: isPrimary ? info.color : "transparent",
                    opacity: isPrimary ? 1 : 0.55,
                  }}>
                  <div className="flex items-center gap-2">
                    {isPrimary && <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{background:info.color+"33",color:info.color}}>PRIMARY</span>}
                    <div className="text-xs font-semibold truncate" style={{color: isPrimary ? info.color : "#9ca3af"}}>{name} <span style={{color:"#475569"}}>ⓘ</span></div>
                  </div>
                </div>
              </Tip>
            );
          })}
        </div>
        {p.roleVersatility != null && (
          <div className="mt-3 text-xs" style={{color:"#475569"}}>Role Versatility: <span className="font-semibold" style={{color:"#f97316"}}>{Math.round(p.roleVersatility)}/100</span></div>
        )}
      </Sec>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: BODY (Physical Profile + Anthro Comps + Interactive Sliders)
// ═══════════════════════════════════════════════════════════
function BodyTab({p}) {
  const [wsAdj,setWsAdj]=useState(0);
  const [wtAdj,setWtAdj]=useState(0);

  // ── Wingspan proxy (Ape Index by position) ──
  const apeIndex = p.pos==="Playmaker" ? 1.04 : p.pos==="Big" ? 1.06 : 1.05;
  const estimatedWs = p.ws || Math.round((p.htIn||78) * apeIndex * 10) / 10;
  const isWsEstimated = !p.ws;

  // ── BMI-based weight proxy ──
  const htM = (p.htIn||78) * 0.0254;
  const posBmi = p.pos==="Playmaker" ? 23.5 : p.pos==="Big" ? 26.5 : 24.8;
  const estimatedWt = p.wt || Math.round(posBmi * htM * htM * 2.205);
  const isWtEstimated = !p.wt;

  const adjWs = estimatedWs + wsAdj;
  const adjWt = estimatedWt + wtAdj;
  const wsDelta = adjWs - (p.htIn||78);
  const apeRatio = adjWs / (p.htIn||78);

  // ── Dynamic labels ──
  const wsLabel = wsDelta > 6 ? "Elite Length / Disruptor Frame"
    : wsDelta > 3 ? "Above Average Length"
    : wsDelta > 1 ? "Neutral Wingspan"
    : "Negative Wingspan / Tactical Limitations";
  const wsLabelColor = wsDelta > 6 ? "#22c55e" : wsDelta > 3 ? "#86efac" : wsDelta > 1 ? "#6b7280" : "#ef4444";

  // Weight label relative to position median (not slider-adjusted base)
  const posMedianWt = p.pos==="Playmaker" ? 190 : p.pos==="Big" ? 240 : 215;
  const wtDeviation = adjWt - posMedianWt;
  const wtLabel = wtDeviation > 15 ? "High Strength / Power Build"
    : wtDeviation < -15 ? "Slight Frame / Needs Development"
    : "Average Frame";
  const wtLabelColor = wtDeviation > 15 ? "#22c55e" : wtDeviation < -15 ? "#ef4444" : "#6b7280";

  // ── Combine data (if available) ──
  const hasCombine = p.comb != null;

  // ── Dynamic anthro comps (recomputed on slider change) ──
  const dynamicAnthro = useMemo(() => {
    return (p.anthroComps || []).map(c => {
      const cHt = c.ht || (p.htIn || 78);
      const cWt = c.wt || adjWt;
      const cWs = c.ws || adjWs;

      // Weighted Euclidean distance: Height 60%, Weight 20%, Wingspan 20%
      const htDiff = (cHt - (p.htIn || 78));
      const wtDiff = (cWt - adjWt) * 0.5;  // scale weight to comparable units
      const wsDiff = (cWs - adjWs) * 1.5;  // wingspan differences matter more

      const dist = Math.sqrt(
        htDiff * htDiff * 0.6 +
        wtDiff * wtDiff * 0.2 +
        wsDiff * wsDiff * 0.2
      );

      // Similarity as 100% - distance%, capped at 0-100
      const sim = Math.max(0, Math.min(100, Math.round(100 - dist * 4)));

      // Physical deviation check (>10% different in any dimension)
      const physWarn = Math.abs(htDiff) > (p.htIn||78) * 0.03 || // ~2.5" for a 78" player
                       Math.abs(cWt - adjWt) > adjWt * 0.1 ||
                       Math.abs(cWs - adjWs) > adjWs * 0.05;

      return { ...c, sim, dist, physWarn };
    }).sort((a, b) => b.sim - a.sim).slice(0, 10);
  }, [p, wsAdj, wtAdj]);

  // Height display
  const htDisplay = p.ht || (p.htIn ? `${Math.floor(p.htIn/12)}'${p.htIn%12}"` : "—");

  return (
    <div className="space-y-5">
      {/* ── PHYSICAL PROFILE ── */}
      <Sec icon="📏" title="Physical Profile" sub={isWsEstimated || isWtEstimated ? "Some measurements estimated from position averages (marked ≈)" : ""}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          {[
            ["Height", htDisplay, false, null],
            ["Weight", `${adjWt} lbs`, isWtEstimated, wtLabelColor],
            ["Wingspan", `${adjWs.toFixed(1)}"`, isWsEstimated, wsLabelColor],
            ["WS Delta", `${wsDelta > 0 ? "+" : ""}${wsDelta.toFixed(1)}"`, false, wsLabelColor],
            ["Ape Index", apeRatio.toFixed(3), false, apeRatio > 1.06 ? "#22c55e" : apeRatio < 1.02 ? "#ef4444" : "#6b7280"],
          ].map(([l, v, est, accent]) => (
            <div key={l} className="rounded-lg p-3 text-center" style={{background:"#0d1117", border: accent ? `1px solid ${accent}22` : "1px solid #1f2937"}}>
              <div className="text-xs uppercase" style={{color:"#6b7280"}}>{l}{est ? " ≈" : ""}</div>
              <div className="font-bold text-lg" style={{color: accent || "#e5e7eb", fontFamily:"'Oswald',sans-serif"}}>{v}</div>
            </div>
          ))}
        </div>

        {/* Frame labels */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Tip content={<div><div className="font-bold mb-1" style={{color:wsLabelColor}}>Wingspan Assessment</div><div style={{color:"#cbd5e1"}}>Wingspan delta = Wingspan - Height. NBA average is +3" to +4". Elite length (6+") creates defensive disruption. Negative wingspan limits defensive versatility.</div></div>}>
            <span className="px-3 py-1 rounded-lg text-xs cursor-help" style={{background:wsLabelColor+"22",color:wsLabelColor,border:`1px solid ${wsLabelColor}44`}}>{wsLabel}</span>
          </Tip>
          <Tip content={<div><div className="font-bold mb-1" style={{color:wtLabelColor}}>Frame Assessment</div><div style={{color:"#cbd5e1"}}>Weight relative to position median ({p.pos}: ~{posMedianWt} lbs). Heavy frames absorb contact; light frames need development to handle NBA physicality.</div></div>}>
            <span className="px-3 py-1 rounded-lg text-xs cursor-help" style={{background:wtLabelColor+"22",color:wtLabelColor,border:`1px solid ${wtLabelColor}44`}}>{wtLabel}</span>
          </Tip>
        </div>

        {/* ── Combine data (if available) ── */}
        {hasCombine && (
          <div className="mb-4 p-3 rounded-lg" style={{background:"#0d1117",border:"1px solid #1f2937"}}>
            <div className="text-xs uppercase tracking-wider mb-2 font-semibold" style={{color:"#f97316"}}>NBA Combine Measurements</div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center">
              {[
                ["No-Shoes Ht", p.comb.height_ns],
                ["Shoes Ht", p.comb.height_ws],
                ["Weight", p.comb.weight ? `${p.comb.weight} lbs` : null],
                ["Wingspan", p.comb.wingspan ? `${p.comb.wingspan}"` : null],
                ["Reach", p.comb.reach ? `${p.comb.reach}"` : null],
                ["Body Fat", p.comb.body_fat ? `${p.comb.body_fat}%` : null],
              ].map(([l,v]) => v != null && (
                <div key={l} className="rounded p-2" style={{background:"#111827"}}>
                  <div className="text-xs" style={{color:"#6b7280"}}>{l}</div>
                  <div className="text-sm font-semibold" style={{color:"#e5e7eb"}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Scout adjustment sliders ── */}
        <div className="flex gap-6 p-4 rounded-lg" style={{background:"#0d1117"}}>
          <div className="flex-1">
            <div className="flex justify-between text-xs mb-1">
              <span style={{color:"#9ca3af"}}>Weight Adjust</span>
              <span style={{color:"#f97316"}}>{wtAdj > 0 ? "+" : ""}{wtAdj} lbs</span>
            </div>
            <input type="range" min={-20} max={20} value={wtAdj} onChange={e=>setWtAdj(+e.target.value)} className="w-full" style={{accentColor:"#f97316"}}/>
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-xs mb-1">
              <span style={{color:"#9ca3af"}}>Wingspan Adjust</span>
              <span style={{color:"#f97316"}}>{wsAdj > 0 ? "+" : ""}{wsAdj}"</span>
            </div>
            <input type="range" min={-4} max={4} step={0.25} value={wsAdj} onChange={e=>setWsAdj(+e.target.value)} className="w-full" style={{accentColor:"#f97316"}}/>
          </div>
        </div>
        {(wsAdj !== 0 || wtAdj !== 0) && (
          <div className="mt-2 text-xs" style={{color:"#fbbf24"}}>
            User Projected Matches — showing comps based on adjusted measurements
          </div>
        )}
      </Sec>

      {/* ── ANTHROPOMETRIC COMPS ── */}
      <Sec icon="👥" title="Anthropometric Comps" sub="Physical similarity (Height 60% + Weight 20% + Wingspan 20%). Adjust sliders above to refine.">
        {dynamicAnthro.length > 0 ? (
          <div className="space-y-2">
            {dynamicAnthro.map((c, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={{background:"#0d1117"}}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{background: i < 3 ? "#f9731622" : "#1f2937", color: i < 3 ? "#f97316" : "#9ca3af"}}>{i+1}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm" style={{color:"#e5e7eb"}}>{c.name}</span>
                    {c.physWarn && (
                      <Tip content={<div style={{color:"#fbbf24"}}>Physical mismatch: Size differs &gt;10% from this prospect. Interpret with caution.</div>}>
                        <span className="text-xs cursor-help" style={{color:"#fbbf24"}}>⚠</span>
                      </Tip>
                    )}
                  </div>
                  <div className="text-xs" style={{color:"#6b7280"}}>
                    {c.ht ? `${Math.floor(c.ht/12)}'${c.ht%12}"` : "—"} · {c.wt ? `${c.wt} lbs` : "—"} · WS {c.ws ? `${c.ws}"` : "—"}
                  </div>
                </div>
                {/* Similarity bar */}
                <div className="w-24 shrink-0">
                  <div className="h-3 rounded-full overflow-hidden" style={{background:"#1f2937"}}>
                    <div className="h-full rounded-full" style={{width:`${c.sim}%`, background: c.sim > 80 ? "#22c55e" : c.sim > 60 ? "#3b82f6" : c.sim > 40 ? "#fbbf24" : "#ef4444"}}/>
                  </div>
                </div>
                <div className="w-12 text-sm font-bold text-right shrink-0" style={{color: c.sim > 80 ? "#22c55e" : c.sim > 60 ? "#3b82f6" : c.sim > 40 ? "#fbbf24" : "#ef4444"}}>{c.sim}%</div>
                {c.tier && <TierBadge tier={c.tier}/>}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 rounded-lg" style={{background:"#0d1117",color:"#6b7280"}}>
            <div className="text-lg mb-1">No anthropometric data</div>
            <div className="text-xs">Combine/measurement data not available for this prospect. Physical comparison requires height, weight, or wingspan data.</div>
          </div>
        )}
      </Sec>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: COMPS (Statistical Prospect-to-Prospect — anthro in Body tab)
// ═══════════════════════════════════════════════════════════
function CompsTab({p}) {
  const [nbaOnly, setNbaOnly] = useState(false);
  const allComps = p.statComps || [];
  const fStat = nbaOnly ? allComps.filter(c => c.nba) : allComps;

  // Similarity values are pre-normalized in selectPlayer (0-100%)
  const normSim = (raw) => {
    if (raw == null) return null;
    const n = Number(raw);
    if (isNaN(n)) return null;
    return Math.max(0, Math.min(100, Math.round(n)));
  };

  // Physical check: flag comps where height differs >3 inches
  const physCheck = (comp) => {
    const compHt = comp.ht || comp.htIn;
    const playerHt = p.htIn || 78;
    if (!compHt) return false;
    return Math.abs(compHt - playerHt) > 3;
  };

  const simColor = (s) => s > 85 ? "#22c55e" : s > 70 ? "#86efac" : s > 55 ? "#3b82f6" : s > 40 ? "#fbbf24" : "#ef4444";

  return (
    <div className="space-y-5">
      {/* Header + controls */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <Tip content={<div style={{color:"#cbd5e1"}}>Comps use only pre-draft seasons (Freshman/Sophomore for NCAA, age 21 or younger for international). You're comparing against what these players looked like BEFORE the NBA, not their prime stats. Statistics are era-adjusted and league-translated for cross-league comparison.</div>}>
          <div className="text-xs cursor-help" style={{color:"#6b7280"}}>Age/stage-filtered: only pre-draft seasons used. League-adjusted stats. <span style={{color:"#475569"}}>ⓘ</span></div>
        </Tip>
        <button onClick={() => setNbaOnly(!nbaOnly)} className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{background: nbaOnly ? "#f97316" : "#1f2937", color: nbaOnly ? "#000" : "#9ca3af"}}>
          {nbaOnly ? "★ NBA Stars Only" : "All Prospects"}
        </button>
      </div>

      {/* ── STATISTICAL COMPS TABLE ── */}
      <Sec icon="📊" title="Statistical Comps" sub="Weighted Euclidean distance on era-adjusted percentiles (USG%, AST%, STL%, eFG% weighted highest). 'Reached Tier' shows actual NBA outcome.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {["#","Name","Pos","Match","BPM","USG","TS%","AST%","STL%","BLK%","3P%","FT%","Reached"].map(h => (
                  <th key={h} className="text-left px-2 py-1.5 text-xs uppercase" style={{color:"#6b7280",borderBottom:"1px solid #1f2937"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Current player row */}
              <tr style={{background:"#f9731611"}}>
                <td className="px-2 py-2 text-xs" style={{color:"#475569"}}>—</td>
                <td className="px-2 py-2 font-bold" style={{color:"#f97316"}}>{p.nbaName || p.name || "Selected"}</td>
                <td className="px-2" style={{color:"#9ca3af"}}>{p.pos}</td>
                <td className="px-2" style={{color:"#f97316"}}>—</td>
                <td className="px-2 font-semibold" style={{color:valColor(p.pctl?.bpm)}}>{fmt(p.bpm)}</td>
                <td className="px-2">{fmt(p.usg)}</td>
                <td className="px-2">{fmt(p.ts)}</td>
                <td className="px-2">{fmt(p.astP)}</td>
                <td className="px-2">{fmt(p.stlP)}</td>
                <td className="px-2">{fmt(p.blkP)}</td>
                <td className="px-2">{fmt(p.tp)}</td>
                <td className="px-2">{fmt(p.ft)}</td>
                <td className="px-2">{p.actual ? <TierBadge tier={p.actual}/> : "—"}</td>
              </tr>

              {/* Comp rows */}
              {fStat.map((c, i) => {
                const sim = normSim(c.sim);
                const hasPhysWarn = physCheck(c);
                return (
                  <tr key={i} className="hover:bg-white hover:bg-opacity-5" style={{borderBottom:"1px solid #1f293744"}}>
                    <td className="px-2 py-2 text-xs" style={{color:"#475569"}}>{i+1}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <span className="font-semibold" style={{color:"#e5e7eb"}}>{c.name}</span>
                        {hasPhysWarn && (
                          <Tip content={<div style={{color:"#fbbf24"}}>Physical mismatch: Height differs more than 3" from this prospect. Statistical similarity may not translate due to different size profiles.</div>}>
                            <span className="cursor-help text-xs" style={{color:"#fbbf24"}}>⚠</span>
                          </Tip>
                        )}
                      </div>
                    </td>
                    <td className="px-2" style={{color:"#6b7280"}}>{c.pos}</td>
                    <td className="px-2">
                      <div className="flex items-center gap-1">
                        <div className="w-12 h-2 rounded-full overflow-hidden" style={{background:"#1f2937"}}>
                          <div className="h-full rounded-full" style={{width:`${sim||0}%`, background:simColor(sim||0)}}/>
                        </div>
                        <span className="font-bold text-xs" style={{color:simColor(sim||0)}}>{sim != null ? `${sim}%` : "—"}</span>
                      </div>
                    </td>
                    <td className="px-2" style={{color:valColor(c.bpm>10?90:c.bpm>5?65:35)}}>{fmt(c.bpm)}</td>
                    <td className="px-2">{fmt(c.usg)}</td>
                    <td className="px-2">{fmt(c.ts)}</td>
                    <td className="px-2">{fmt(c.astP)}</td>
                    <td className="px-2">{fmt(c.stlP)}</td>
                    <td className="px-2">{fmt(c.blkP)}</td>
                    <td className="px-2">{fmt(c.tp)}</td>
                    <td className="px-2">{fmt(c.ft)}</td>
                    <td className="px-2"><TierBadge tier={c.tier}/></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {fStat.length === 0 && (
          <div className="text-center py-8 rounded-lg" style={{background:"#0d1117",color:"#6b7280"}}>
            <div className="text-sm mb-1">{nbaOnly ? "No NBA star comps available" : "No statistical comps available"}</div>
            <div className="text-xs">{nbaOnly ? "Try switching to 'All Prospects' for a broader comparison pool." : "Comparison data not generated for this prospect."}</div>
          </div>
        )}

        {/* Legend */}
        {fStat.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3 text-xs" style={{color:"#475569"}}>
            <span>Match: statistical similarity (100% = identical profile)</span>
            <span>⚠ = physical mismatch (&gt;3" height diff)</span>
            <span>Stats from pre-draft season only</span>
          </div>
        )}
      </Sec>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: METHODOLOGY
// ═══════════════════════════════════════════════════════════
function MethodologyTab() {
  const sections = [
    {cat:"Monte Carlo Projection Model",items:["monteCarlo","posClassification"],desc:"The core projection engine. 20,000 simulations per player using a Gaussian model calibrated on 19,978 historical prospects across 19 draft classes (2008–2026). Validated at r=0.248 vs. actual NBA xRAPM (N=1,805)."},
    {cat:"The 5 Pillars (DNA Scores)",items:["feel","shootScore","defScore","funcAth","selfCreation","overall"],desc:"Position-adjusted percentile scores (0–100) capturing the fundamental dimensions of prospect evaluation. Each pillar uses era-adjusted percentiles computed against ~34k college players since 2008."},
    {cat:"Shooting Projection",items:["projNba3p","projNba3pa","projNba3par","touchPrior"],desc:"Bayesian Beta-Binomial model for NBA shooting translation (Berger, 2022). Uses individualized priors based on FT% motor touch + shooting volume to project 3P accuracy and volume."},
    {cat:"Possession Impact (Four Factors)",items:["fourFactors"],desc:"Context-Free Four Factor Rating measuring possession efficiency. Usage-role adjusted so a primary scorer with 52% eFG rates correctly against peers, not low-usage finishers."},
  ];
  return (
    <div className="space-y-6">
      <Sec icon="📖" title="Methodology" sub="Complete documentation of all computed metrics, formulas, and their inputs.">
        <div className="text-sm mb-2" style={{color:"#9ca3af"}}>
          All scores are computed as position-aware era-adjusted percentiles (0-100) unless otherwise noted. Data sources: BartTorvik (NCAA), RealGM (International), NBA API (outcomes), Draft Combine (anthropometrics).
        </div>
        <div className="text-sm" style={{color:"#9ca3af"}}>
          Model validation: r(UPS, xRAPM_actual) = 0.248 (N=1,805) · r(UPS, NBA_3yr_peak) = 0.241 (N=1,191). 19,978 total players across 15 leagues with empirical weights from 2,655 bridge players.
        </div>
      </Sec>
      {sections.map(({cat,items,desc})=>(
        <Sec key={cat} icon="▸" title={cat}>
          {desc&&<div className="text-sm mb-4" style={{color:"#94a3b8"}}>{desc}</div>}
          <div className="space-y-4">
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
      <Sec icon="🏅" title="Badge Definitions" sub="Green = elite NBA skills · Yellow = swing/potential · Red = warning signals. International players receive stat adjustments (x1.25 base, x1.15 STL%/BLK%).">
        <div className="space-y-3">
          {Object.entries(BADGE_DEFS).map(([name,def])=>{
            const c = def.cat==="green"?"#22c55e":def.cat==="yellow"?"#fbbf24":"#ef4444";
            return (
              <div key={name} className="flex gap-3 items-start p-3 rounded-lg" style={{background:"#0d1117"}}>
                <BadgeChip text={name} color={c}/>
                <div className="flex-1">
                  <div className="text-xs mb-1" style={{color:"#94a3b8"}}>Trigger: {def.rule}</div>
                  <div className="text-sm" style={{color:"#cbd5e1"}}>{def.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Sec>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// BIG BOARD (No class overview — single view)
// ═══════════════════════════════════════════════════════════
function BigBoardView({onSelect, boardData, setBoardData, loading, setLoading, availableYears, yearFilter, setYearFilter}) {
  const [sortBy,setSortBy]=useState("war");
  const [posFilter,setPosFilter]=useState("All");

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

  const handleYearChange = (newYear) => {
    setYearFilter(newYear);
    fetchBoard(newYear);
  };

  const allPlayers = useMemo(()=>{
    return PLAYER_LIST.map(n=>({name:n,...PLAYERS[n]}));
  },[boardData]);

  const filtered = useMemo(()=>{
    let list = allPlayers;
    // Position + International filter
    if (posFilter === "International") {
      list = list.filter(p => p.source && p.source !== "ncaa");
    } else if (posFilter !== "All") {
      list = list.filter(p => p.pos === posFilter);
    }
    list = list.filter(p => p.confidence !== "very_low");

    // Sort functions — including tier columns
    const sortFn = {
      war: (a,b) => (b.war ?? -999) - (a.war ?? -999),
      age: (a,b) => (a.age ?? 99) - (b.age ?? 99), // youngest first
      bpm: (a,b) => (b.bpm ?? -999) - (a.bpm ?? -999),
      super: (a,b) => (b.tiers?.Superstar ?? 0) - (a.tiers?.Superstar ?? 0),
      allstar: (a,b) => (b.tiers?.["All-Star"] ?? 0) - (a.tiers?.["All-Star"] ?? 0),
      starter: (a,b) => (b.tiers?.Starter ?? 0) - (a.tiers?.Starter ?? 0),
      role: (a,b) => (b.tiers?.["Role Player"] ?? 0) - (a.tiers?.["Role Player"] ?? 0),
      repl: (a,b) => (b.tiers?.Replacement ?? 0) - (a.tiers?.Replacement ?? 0),
    };
    list = [...list].sort(sortFn[sortBy] || sortFn.war);
    return list.slice(0, 60);
  }, [allPlayers, sortBy, posFilter]);

  const posColors = {Playmaker:"#3b82f6", Wing:"#f97316", Big:"#8b5cf6"};

  // Sort label for header
  const sortLabels = {war:"WAR", age:"Age (youngest)", bpm:"BPM", super:"Star %", allstar:"All-Star %", starter:"Starter %", role:"Role %", repl:"Repl %"};

  // Clickable column header
  const SortTh = ({sortKey, children, align="left"}) => (
    <th className={`px-3 py-2.5 text-${align} text-xs uppercase tracking-wider font-semibold cursor-pointer select-none transition-colors`}
      style={{color: sortBy === sortKey ? "#f97316" : "#6b7280", borderBottom:"1px solid #1f2937"}}
      onClick={() => setSortBy(sortKey)}>
      {children}{sortBy === sortKey ? " ▼" : ""}
    </th>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl p-6 relative overflow-hidden" style={{background:"linear-gradient(135deg,#0d1117 0%,#1a1040 100%)",border:"1px solid #1f2937"}}>
        <div className="absolute top-0 right-0 w-64 h-64 opacity-5 blur-3xl rounded-full" style={{background:"radial-gradient(circle,#f97316,transparent)"}}/>
        <div className="relative">
          <div className="text-xs uppercase tracking-widest mb-2" style={{color:"#f97316"}}>ProspectTheory · Draft Intelligence</div>
          <h2 className="text-3xl font-bold" style={{color:"#e5e7eb",fontFamily:"'Oswald',sans-serif"}}>
            {yearFilter && yearFilter !== "All" ? yearFilter : "All Years"} Big Board
          </h2>
          <p className="text-sm mt-1" style={{color:"#6b7280"}}>
            Probabilistic ranking · {filtered.length} prospects · Sort: {sortLabels[sortBy] || "WAR"}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Year selector */}
        <div className="flex gap-1">
          {availableYears.map(yr=>(
            <button key={yr} onClick={()=>handleYearChange(yr)} className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{background:yearFilter===String(yr)?"#f97316":"#1f2937",color:yearFilter===String(yr)?"#000":"#9ca3af"}}>
              {yr}
            </button>
          ))}
        </div>
        {/* Position filter (with International) */}
        <div className="flex gap-1 ml-auto">
          {[
            ["All", null],
            ["Playmaker", "#3b82f6"],
            ["Wing", "#f97316"],
            ["Big", "#8b5cf6"],
            ["International", "#10b981"],
          ].map(([pos, color]) => (
            <button key={pos} onClick={()=>setPosFilter(pos)} className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{background:posFilter===pos?(color||"#f97316"):"#1f2937",color:posFilter===pos?"#000":"#9ca3af"}}>
              {pos}
            </button>
          ))}
        </div>
        {/* Sort buttons */}
        <div className="flex gap-1">
          {[["war","WAR"],["age","Age"],["bpm","BPM"]].map(([k,l])=>(
            <button key={k} onClick={()=>setSortBy(k)} className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{background:sortBy===k?"#f97316":"#1f2937",color:sortBy===k?"#000":"#9ca3af"}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Board table */}
      <div className="rounded-xl overflow-hidden" style={{background:"#111827",border:"1px solid #1f2937"}}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{background:"#0a0e17"}}>
                <th className="px-3 py-2.5 text-left text-xs uppercase tracking-wider font-semibold" style={{color:"#6b7280",borderBottom:"1px solid #1f2937"}}>#</th>
                <th className="px-3 py-2.5 text-left text-xs uppercase tracking-wider font-semibold" style={{color:"#6b7280",borderBottom:"1px solid #1f2937"}}>Player</th>
                <th className="px-3 py-2.5 text-left text-xs uppercase tracking-wider font-semibold" style={{color:"#6b7280",borderBottom:"1px solid #1f2937"}}>Pos</th>
                <th className="px-3 py-2.5 text-left text-xs uppercase tracking-wider font-semibold" style={{color:"#6b7280",borderBottom:"1px solid #1f2937"}}>Team</th>
                <SortTh sortKey="age">Age</SortTh>
                <SortTh sortKey="war">WAR</SortTh>
                <SortTh sortKey="bpm">BPM</SortTh>
                <SortTh sortKey="super">⭐%</SortTh>
                <SortTh sortKey="allstar">All★%</SortTh>
                <SortTh sortKey="starter">Start%</SortTh>
                <SortTh sortKey="role">Role%</SortTh>
                <SortTh sortKey="repl">Repl%</SortTh>
                <th className="px-3 py-2.5 text-left text-xs uppercase tracking-wider font-semibold" style={{color:"#6b7280",borderBottom:"1px solid #1f2937"}}>Tier</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const tierPctColor = (v) => v > 20 ? "#22c55e" : v > 10 ? "#86efac" : v > 5 ? "#fbbf24" : v > 1 ? "#6b7280" : "#374151";
                const isIntl = p.source && p.source !== "ncaa";
                return (
                  <tr key={p.name} className="cursor-pointer hover:bg-white hover:bg-opacity-5 transition-colors" onClick={()=>onSelect(p.name)}
                    style={{borderBottom:"1px solid #1f293744"}}>
                    <td className="px-3 py-2.5 font-bold text-xs" style={{color:"#475569"}}>{i+1}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <span className="font-semibold" style={{color:"#e5e7eb"}}>{p.name}</span>
                        {isIntl && <span className="text-xs" style={{color:"#10b981"}}>🌐</span>}
                      </div>
                      <div className="flex gap-1 mt-0.5">
                        {(p.badges||[]).slice(0,2).map((b,j)=><span key={j} className="text-xs px-1.5 py-0 rounded" style={{background:"#22c55e22",color:"#22c55e",fontSize:9}}>{b}</span>)}
                        {(p.redFlags||[]).slice(0,1).map((f,j)=><span key={`r${j}`} className="text-xs px-1.5 py-0 rounded" style={{background:"#ef444422",color:"#ef4444",fontSize:9}}>{f}</span>)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5"><span className="px-2 py-0.5 rounded text-xs font-semibold" style={{background:(posColors[p.pos]||"#6b7280")+"22",color:posColors[p.pos]||"#6b7280"}}>{p.pos}</span></td>
                    <td className="px-3 py-2.5 text-xs" style={{color:"#9ca3af"}}>{p.team||p.conf}</td>
                    <td className="px-3 py-2.5 text-xs" style={{color: p.age != null && p.age < 20 ? "#86efac" : "#9ca3af"}}>{p.age != null ? Number(p.age).toFixed(1) : "—"}</td>
                    <td className="px-3 py-2.5 font-bold" style={{color: p.war != null ? "#fbbf24" : "#374151", fontFamily:"'Oswald',sans-serif"}}>{p.war != null ? fmt(p.war, 1) : "—"}</td>
                    <td className="px-3 py-2.5 text-xs font-semibold" style={{color: p.bpm != null ? (p.bpm > 8 ? "#22c55e" : p.bpm > 4 ? "#86efac" : "#9ca3af") : "#374151"}}>{p.bpm != null ? fmt(p.bpm, 1) : "—"}</td>
                    <td className="px-3 py-2.5 text-xs font-semibold" style={{color:tierPctColor(p.tiers?.Superstar)}}>{fmt(p.tiers?.Superstar,0)}%</td>
                    <td className="px-3 py-2.5 text-xs font-semibold" style={{color:tierPctColor(p.tiers?.["All-Star"])}}>{fmt(p.tiers?.["All-Star"],0)}%</td>
                    <td className="px-3 py-2.5 text-xs font-semibold" style={{color:tierPctColor(p.tiers?.Starter)}}>{fmt(p.tiers?.Starter,0)}%</td>
                    <td className="px-3 py-2.5 text-xs" style={{color:tierPctColor(p.tiers?.["Role Player"])}}>{fmt(p.tiers?.["Role Player"],0)}%</td>
                    <td className="px-3 py-2.5 text-xs" style={{color:"#6b7280"}}>{fmt(p.tiers?.Replacement,0)}%</td>
                    <td className="px-3 py-2.5 text-xs font-semibold" style={{color:TC[p.predTier]||"#6b7280"}}>{p.predTier||"—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
const TABS = [
  {id:"overview",label:"Overview",icon:"▦"},
  {id:"shooting",label:"Shooting",icon:"🏀"},
  {id:"projection",label:"Projection",icon:"◆"},
  {id:"scouting",label:"Scouting",icon:"⭐"},
  {id:"body",label:"Body",icon:"📏"},
  {id:"comps",label:"Comps",icon:"⇄"},
  {id:"methodology",label:"Method",icon:"📖"},
];

export default function App() {
  const [sel,setSel]=useState(null);
  const [tab,setTab]=useState("overview");
  const [search,setSearch]=useState("");
  const [showS,setShowS]=useState(false);
  const [compTier,setCompTier]=useState("Replacement");

  const [boardData,setBoardData]=useState([]);
  const [profileCache,setProfileCache]=useState({});
  const [loading,setLoading]=useState(true);
  const [profileLoading,setProfileLoading]=useState(false);
  const [searchResults,setSearchResults]=useState([]);

  useEffect(()=>{const l=document.createElement("link");l.href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Barlow:wght@400;500;600;700&display=swap";l.rel="stylesheet";document.head.appendChild(l);},[]);

  const [availableYears,setAvailableYears]=useState(["All"]);
  const [yearFilter,setYearFilter]=useState("All");

  useEffect(()=>{
    setLoading(true);
    fetch(`${API_BASE}/years`)
      .then(r=>r.json())
      .then(yearData=>{
        const yrs = yearData.years || [];
        setAvailableYears(["All", ...yrs]);
        const latestYear = yearData.latest || 2026;
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
      .catch(e=>{console.error("Board fetch failed:",e);setLoading(false);});
  },[]);

  const selectPlayer = async (name) => {
    setSel(name);setSearch("");setShowS(false);setTab("overview");
    if(profileCache[name]) return;
    setProfileLoading(true);
    try {
      const [profRes,statsRes,anthroRes] = await Promise.all([
        fetch(`${API_BASE}/player/${encodeURIComponent(name)}`).then(r=>r.ok?r.json():null),
        fetch(`${API_BASE}/comps/stats/${encodeURIComponent(name)}`).then(r=>r.ok?r.json():null).catch(()=>null),
        fetch(`${API_BASE}/comps/anthro/${encodeURIComponent(name)}`).then(r=>r.ok?r.json():null).catch(()=>null),
      ]);
      if(profRes?.profile){
        const mapped = mapProfile(profRes.profile);
        if(statsRes?.comps) mapped.statComps = statsRes.comps.map(c=>{
          // API similarity: could be 0-1 (similarity), 0-100 (%), or distance (lower=closer)
          let sim = null;
          if (c.similarity != null) {
            const raw = Number(c.similarity);
            if (raw > 100) sim = Math.max(0, Math.round(100 - raw / 5)); // large distance → invert
            else if (raw > 1 && raw <= 100) sim = Math.round(raw); // already percentage
            else if (raw >= 0 && raw <= 1) sim = Math.round(raw * 100); // 0-1 ratio
            else sim = Math.max(0, Math.round(100 - Math.abs(raw) * 2)); // negative or other
          }
          return {
            name:c.name, pos:c.position||c.pos, sim,
            tier:c.tier||"", nba:!!c.made_nba, bpm:c.bpm, usg:c.usg, ts:c.ts,
            astP:c.ast_p, toP:c.to_p, orbP:c.orb_p, drbP:c.drb_p,
            stlP:c.stl_p, blkP:c.blk_p, ftr:c.ftr,
            rimPct:c.rim_pct, tp:c.tp_pct, ft:c.ft_pct, dunkR:c.dunk_r,
            ht:c.height||c.ht,
            badges:c.badges?c.badges.split("|").filter(Boolean):[],
          };
        });
        if(anthroRes?.comps) mapped.anthroComps = anthroRes.comps.map(c=>({
          name:c.name,dist:c.distance,sim:Math.round(c.similarity||0),
          ht:c.height||c.ht,wt:c.weight||c.wt,ws:c.wingspan||c.ws,
          nba:!!c.made_nba,tier:c.tier||"",
        }));
        PLAYERS[name]=mapped;
        setProfileCache(prev=>({...prev,[name]:mapped}));
      }
    } catch(e){ console.error("Profile fetch failed:",e); }
    setProfileLoading(false);
  };

  useEffect(()=>{
    if(!search||search.length<2){setSearchResults([]);return;}
    const local = PLAYER_LIST.filter(n=>n.toLowerCase().includes(search.toLowerCase())).slice(0,15);
    if(local.length>0) setSearchResults(local);
    const t=setTimeout(()=>{
      fetch(`${API_BASE}/players/search?q=${encodeURIComponent(search)}&limit=15`)
        .then(r=>r.json())
        .then(d=>{
          const apiNames=(d.results||[]).map(r=>r.name);
          const merged = [...local];
          apiNames.forEach(n=>{if(!merged.includes(n)) merged.push(n);});
          setSearchResults(merged.slice(0,20));
          apiNames.forEach(n=>{if(!PLAYERS[n]){PLAYER_LIST.push(n);PLAYERS[n]={name:n,pos:"",team:""};}});
        })
        .catch(()=>{});
    },300);
    return ()=>clearTimeout(t);
  },[search]);

  const p = sel ? (profileCache[sel] || PLAYERS[sel] || null) : null;
  const pReady = p && p.pctl != null && (p.pts != null || p.usg != null || p.feel != null);

  return (
    <div className="min-h-screen" style={{background:"#080b12",fontFamily:"'Barlow',sans-serif",color:"#e5e7eb"}}>
      <header className="sticky top-0 z-50 px-4 md:px-8 py-3" style={{background:"rgba(8,11,18,0.92)",backdropFilter:"blur(12px)",borderBottom:"1px solid #1f293744"}}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={()=>{setSel(null);setTab("overview");}}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm" style={{background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#000"}}>PT</div>
            <div><div className="font-bold text-sm tracking-wider" style={{fontFamily:"'Oswald',sans-serif",color:"#f97316"}}>PROSPECT THEORY</div><div className="text-xs" style={{color:"#6b7280"}}>NBA Draft Intelligence</div></div>
          </div>
          {/* No toggle needed — Big Board only */}
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
          loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin mb-4" style={{borderColor:"#f97316",borderTopColor:"transparent"}}/>
              <p className="text-sm" style={{color:"#6b7280"}}>Loading prospects...</p>
            </div>
          ) : (
            <BigBoardView onSelect={selectPlayer} boardData={boardData} setBoardData={setBoardData} loading={loading} setLoading={setLoading} availableYears={availableYears} yearFilter={yearFilter} setYearFilter={setYearFilter}/>
          )
        ) : profileLoading && !pReady ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin mb-4" style={{borderColor:"#f97316",borderTopColor:"transparent"}}/>
            <p className="text-sm" style={{color:"#6b7280"}}>Loading profile...</p>
          </div>
        ) : !pReady ? (
          <div className="text-center py-20">
            <p style={{color:"#6b7280"}}>Player not found</p>
            <button onClick={()=>setSel(null)} className="mt-4 px-4 py-2 rounded-lg text-sm" style={{background:"#f97316",color:"#000"}}>Back to Board</button>
          </div>
        ) : (
          <>
            <button onClick={()=>setSel(null)} className="mb-4 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:bg-white hover:bg-opacity-5"
              style={{color:"#9ca3af",border:"1px solid #374151"}}>
              <span>←</span> Back to Big Board
            </button>
            {tab!=="methodology" && <>
              <div className="mb-5 rounded-2xl p-5 relative overflow-hidden" style={{background:"linear-gradient(135deg,#111827 0%,#0f172a 50%,#1e1b4b 100%)",border:"1px solid #1f2937"}}>
                <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-5" style={{background:"radial-gradient(circle,#f97316,transparent)",transform:"translate(30%,-30%)"}}/>
                <div className="flex flex-col md:flex-row md:items-center gap-3 relative z-10">
                  <div className="flex-1">
                    <div className="text-xs uppercase tracking-widest mb-1" style={{color:"#6b7280"}}>{p.yr} Draft Class{p.source!=="ncaa"?` · ${p.source?.toUpperCase()}`:""}</div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight" style={{fontFamily:"'Oswald',sans-serif"}}>{sel}</h1>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-sm" style={{color:"#9ca3af"}}>
                      <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{background:"#f9731622",color:"#f97316"}}>{p.pos}</span>
                      {p.archetype&&<span className="px-2 py-0.5 rounded text-xs font-semibold" style={{background:"#3b82f622",color:"#60a5fa"}}>{p.archetype}</span>}
                      <span>{p.team}</span><span>·</span><span>{p.ht}</span><span>·</span><span>Age {p.age!=null?Number(p.age).toFixed(1):"—"}</span>
                      {p.btUrl&&<><span>·</span><a href={p.btUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{color:"#60a5fa"}}>BartTorvik ↗</a></>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(() => {
                      // Max 5 badges in header, red priority
                      const reds = (p.redFlags||[]).slice(0,3);
                      const greens = (p.badges||[]).slice(0, 5 - reds.length);
                      return [...reds.map((f,i)=><BadgeChip key={`rf${i}`} text={f} color="#ef4444"/>),
                              ...greens.map((b,i)=><BadgeChip key={i} text={b}/>)];
                    })()}
                  </div>
                </div>
              </div>
            </>}
            {p.confidence==="very_low"&&(
              <div className="mb-4 p-3 rounded-lg text-sm" style={{background:"#7f1d1d",border:"1px solid #991b1b",color:"#fca5a5"}}>
                ⚠️ <strong>Insufficient Data</strong> — This player has only {Math.round(p.sampleMin||0)} minutes. Scores may be unreliable.
              </div>
            )}
            {p.confidence==="limited"&&(
              <div className="mb-4 p-3 rounded-lg text-sm" style={{background:"#78350f",border:"1px solid #92400e",color:"#fcd34d"}}>
                ⚡ <strong>Limited Sample</strong> — Based on {Math.round(p.sampleMin||0)} minutes. Interpret with caution.
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
            {tab==="projection"&&<ProjectionTab p={p}/>}
            {tab==="scouting"&&<ScoutingTab p={p}/>}
            {tab==="body"&&<BodyTab p={p}/>}
            {tab==="comps"&&<CompsTab p={p}/>}
            {tab==="methodology"&&<MethodologyTab/>}
          </>
        )}
      </main>
      <footer className="mt-12 py-6 text-center text-xs" style={{color:"#374151",borderTop:"1px solid #111827"}}>
        <span style={{color:"#6b7280"}}>ProspectTheory</span> · NBA Draft Intelligence · Data: BartTorvik, RealGM, NBA API, Draft Combine · Model: r=0.248 (N=1,805)
      </footer>
    </div>
  );
}
