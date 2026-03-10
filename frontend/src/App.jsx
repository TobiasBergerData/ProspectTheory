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
// BADGE DEFINITIONS (Expanded — 30+ badges)
// ═══════════════════════════════════════════════════════════
const BADGE_DEFS = {
  // GREEN — Elite NBA-scalable skills
  "Elite Shooting":         { cat:"green", rule:"FT%>82 & 3P%>38 & 3PA/40>5.0",       desc:"Top-tier shooting across both lines + volume. Most translatable skill in modern NBA. Berger (2023): FT% is the #1 predictor." },
  "Floor General":          { cat:"green", rule:"(G) AST/TO>2.2 & AST%>25",            desc:"Elite decision-making with vision. Creates for others without turnovers — the rarest guard skill." },
  "Two-Way Wing":           { cat:"green", rule:"(W) 3P%>35 & (STL%>2.2 OR DBPM>2.0)",desc:"Shooting + perimeter defense. Most coveted role player archetype in modern NBA. Immediate starter value." },
  "Modern Rim Anchor":      { cat:"green", rule:"(B) BLK%>4.0 & DBPM>2.5",            desc:"Elite rim protection with overall defensive impact. Anchors a top-10 defense by itself." },
  "Point Big":              { cat:"green", rule:"(B) AST%>18 & AST/TO>1.2",            desc:"Playmaking big — Jokić/Draymond archetype. Creates from the post/elbow with low turnovers. Extremely rare." },
  "Stocks Machine":         { cat:"green", rule:"(STL%+BLK%)>4.8",                     desc:"Defensive disruption at both perimeter and rim. Historically rare combination that warps opposing offense." },
  "Versatile Stopper":      { cat:"green", rule:"(W/B) Ht≥6'7\" & STL%>1.6 & BLK%>1.8",desc:"Length + perimeter + rim. Can guard 1-through-5 in switching schemes. Premium defensive versatility." },
  "Transition Terror":      { cat:"green", rule:"(G/W) STL%>2.5 & Dunk%>60th pctl",   desc:"Creates fast breaks via steals and finishes above the rim. Free points in transition." },
  "FT Grifter":             { cat:"green", rule:"FTr>45 & (Rim%>40th pctl OR USG%>24)",desc:"Elite at drawing fouls through contact. Free throws = free points. High FTr at volume is extremely valuable." },
  "Efficient High Usage":   { cat:"green", rule:"USG>28 & TO%<12 & TS%>58",            desc:"Handles elite volume without efficiency collapse. The 'carry' badge — this player IS the offense." },
  "High-Feel Athlete":      { cat:"green", rule:"Feel>75 & Func Ath>75",               desc:"Rarest badge — elite IQ + elite athleticism. Almost always translates to NBA." },

  // YELLOW — Potential / Swing skills
  "Latent Touch":           { cat:"yellow", rule:"FT%>80 & 3P%<32",                    desc:"Elite FT% signals neuromuscular shooting consistency that hasn't yet translated to 3P volume. Bayesian prior strongly favors breakout." },
  "Raw Project":            { cat:"yellow", rule:"Age<19.5 & IQ_Pillar<40",            desc:"Young + raw = massive development runway. IQ can be taught with reps. Physical tools are already there." },
  "Interior Engine":        { cat:"yellow", rule:"(W/B) Rim_Proxy>80th & AST%>15",     desc:"Rim pressure + playmaking from the paint. If shooting develops, this becomes a franchise cornerstone." },

  // RED — Warning signals
  "Spacing Killer":         { cat:"red",   rule:"(G/W) 3P%<30 & 3PA/40<3.5",           desc:"Guards/wings who don't threaten from three destroy NBA spacing. Defenders sag off, clogging paint for teammates." },
  "Efficiency Trap":        { cat:"red",   rule:"USG%>26 & TS%<52",                    desc:"High volume, low efficiency. Scoring a lot but hurting the team. Usage will drop in NBA → production collapses." },
  "Tunnel Vision":          { cat:"red",   rule:"(G/W) AST/TO<0.7 & USG%>22",         desc:"Ball-dominant without creating for others. NBA defenses will scheme against predictable scorers." },
  "Passive Scorer":         { cat:"red",   rule:"FTr<20",                              desc:"Avoids contact entirely. Jump-shot dependent offense is hard to sustain in NBA when contested." },
  "Foul Magnet":            { cat:"red",   rule:"Fouls/40>4.8",                        desc:"Foul trouble limits minutes. Signals poor mobility, discipline, or defensive IQ at the next level." },
  "Liability Big":          { cat:"red",   rule:"(B) DRB%<15 OR BLK%<1.5",            desc:"Bigs without rebounding or rim protection are a defensive sinkhole. Can't stay on the floor in playoffs." },
  "Defensive Target":       { cat:"red",   rule:"(G) Ht<6'1\" & DBPM<-0.5",           desc:"Small guards with negative defensive impact get hunted in playoffs. Size + poor defense = unplayable." },
  "Non-Spacing Guard":      { cat:"red",   rule:"(G) 3P%<30 & 3P Freq<20%",           desc:"Guards who don't shoot threes can't play off-ball in modern NBA. Limits lineup construction." },
  "All-Offense Big":        { cat:"red",   rule:"(B) BLK%<2.5 & DBPM<1.5",            desc:"Bigs without rim protection are a defensive liability at every level. Offense doesn't compensate." },
  "FT Concern":             { cat:"red",   rule:"FT%<65 & USG>25",                    desc:"Hack-a-Player target at high usage. Opposing coaches will exploit this in close games." },
};

// ── Position group for badge logic ────────────────────────
function getBadgePos(p) {
  const htIn = p.htIn ?? 78;
  const astP  = p.astP  ?? 0;
  const drbP  = p.drbP  ?? 0;
  if (htIn < 76 || (htIn < 78 && astP > 20)) return "G";
  if (htIn > 81 || (htIn > 80 && drbP > 15)) return "B";
  return "W";
}

// ── Client-side badge computation ─────────────────────────
function computeBadges(p) {
  const pos = getBadgePos(p);
  const isG = pos === "G", isW = pos === "W", isB = pos === "B";
  const ft=p.ft??0, tp=p.tp??0, threeF=p.threeF??0;
  const astP=p.astP??0, astTov=p.astTov??0;
  const stlP=p.stlP??0, blkP=p.blkP??0;
  const usg=p.usg??0, toP=p.toP??0, ts=p.ts??0;
  const ftr=p.ftr??0, rimF=p.rimF??0, rimPct=p.rimPct??0;
  const dbpm=p.dbpm??0, feel=p.feel??0, funcAth=p.funcAth??0;
  const htIn=p.htIn??78, drbP=p.drbP??0;
  const tpa40 = (threeF/100)*(p.min??30)*(p.pts??15)/((p.fg??45)/100)/40;

  const green=[], yellow=[], red=[];
  // GREEN
  if (ft>82 && tp>38 && threeF>25)                           green.push("Elite Shooting");
  if (isG && astTov>2.2 && astP>25)                          green.push("Floor General");
  if (isW && tp>35 && (stlP>2.2||dbpm>2.0))                 green.push("Two-Way Wing");
  if (isB && blkP>4.0 && dbpm>2.5)                           green.push("Modern Rim Anchor");
  if (isB && astP>18 && astTov>1.2)                          green.push("Point Big");
  if ((stlP+blkP)>4.8)                                      green.push("Stocks Machine");
  if ((isW||isB) && htIn>=79 && stlP>1.6 && blkP>1.8)      green.push("Versatile Stopper");
  if ((isG||isW) && stlP>2.5 && (p.dunkR??0)>8)             green.push("Transition Terror");
  if (ftr>45 && (rimF>25||usg>24))                           green.push("FT Grifter");
  if (usg>28 && toP<12 && ts>58)                             green.push("Efficient High Usage");
  if (feel>75 && funcAth>75)                                 green.push("High-Feel Athlete");
  // YELLOW
  if (ft>80 && tp<32)                                        yellow.push("Latent Touch");
  if ((p.age??22)<19.5 && feel<40)                           yellow.push("Raw Project");
  if ((isW||isB) && rimF>30 && astP>15)                      yellow.push("Interior Engine");
  // RED
  if ((isG||isW) && tp<30 && threeF<18)                      red.push("Spacing Killer");
  if (usg>26 && ts<52)                                       red.push("Efficiency Trap");
  if ((isG||isW) && astTov<0.7 && usg>22)                    red.push("Tunnel Vision");
  if (ftr<20 && usg>20)                                      red.push("Passive Scorer");
  if ((p.fouls40??0)>4.8)                                     red.push("Foul Magnet");
  if (isB && (drbP<15||blkP<1.5))                            red.push("Liability Big");
  if (isG && htIn<73 && dbpm<-0.5)                           red.push("Defensive Target");
  if (isG && tp<30 && threeF<20)                             red.push("Non-Spacing Guard");
  if (isB && blkP<2.5 && dbpm<1.5)                           red.push("All-Offense Big");
  if (ft<65 && usg>25)                                       red.push("FT Concern");

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
const API_BASE = "https://api.prospecttheory.io/api";

function mapProfile(d) {
  if(!d) return null;
  const pctl = d.pctl || {
    bpm: d.pctl_bpm, usg: d.pctl_usg, ts: d.pctl_ts, ast: d.pctl_ast,
    to: d.pctl_to, orb: d.pctl_orb, drb: d.pctl_drb, stl: d.pctl_stl,
    blk: d.pctl_blk, pts36: d.pctl_pts36, reb36: d.pctl_reb36, ast36: d.pctl_ast36,
  };
  const ff = d.cffr || d.ff || {
    efg: d.cffr_efg ?? d.ff_efg ?? 50, tov: d.cffr_tov ?? d.ff_tov ?? 50,
    orb: d.cffr_orb ?? d.ff_orb ?? 50, ftr: d.cffr_ftr ?? d.ff_ftr ?? 50,
    comp: d.cffr_comp ?? d.ff_comp ?? 50,
  };
  const badgeList = (d.badges && typeof d.badges === "string") ? d.badges.split("|").filter(Boolean) : (d.badges || []);
  const redList = (d.red_flags && typeof d.red_flags === "string") ? d.red_flags.split("|").filter(Boolean) : (d.red_flags || []);

  // Compute client badges as fallback
  const tmpP = {
    ft:d.ft_pct??d.ft, tp:d.tp_pct??d.tp, threeF:d.three_freq??d.threeF,
    astP:d.ast_p??d.astP, astTov:d.ast_to??d.astTov, stlP:d.stl_p??d.stlP,
    blkP:d.blk_p??d.blkP, usg:d.usg??d.usg_p, toP:d.to_p??d.toP,
    ts:d.ts_pct??d.ts, ftr:d.ftr??d.ft_rate, rimF:d.rim_freq??d.rimF,
    rimPct:d.rim_pct??d.rimPct, dbpm:d.dbpm, feel:d.feel??0,
    funcAth:d.func_ath??0, htIn:d.ht??d.height_in??d.college_height_inches,
    drbP:d.drb_p??d.drbP, dunkR:d.dunk_rate??d.dunkR, age:d.age, shootScore:d.shoot_score,
    fouls40:d.fouls_40??0, min:d.min??0, pts:d.pts??0, fg:d.fg_pct??0,
  };
  const computed = computeBadges(tmpP);
  const badges = badgeList.length > 0 ? badgeList : computed.green;
  const redFlags = redList.length > 0 ? redList : computed.red;

  return {
    name: d.name, pos: d.pos ?? d.position ?? d.functional_pos ?? "Wing",
    team: d.team ?? d.college_team ?? "", conf: d.conf ?? d.college_conf ?? "",
    confTier: d.conf_tier ?? d.confTier ?? "", cls: d.cls ?? d.class ?? "",
    yr: d.yr ?? d.season_year ?? d.draft_year ?? 2026,
    age: d.age ?? d.age_on_draft_day,
    htIn: d.ht ?? d.height_in ?? d.college_height_inches ?? 78,
    ht: d.ht_display ?? (d.ht ? `${Math.floor(d.ht/12)}'${d.ht%12}"` : "—"),
    wt: d.wt ?? d.weight, ws: d.ws ?? d.wingspan,
    recRank: d.recRank ?? d.rec_rank, recPctl: d.recPctl ?? d.rec_pctl,
    seasonsPlayed: d.seasons_played ?? d.seasonsPlayed ?? 1,
    gp: d.gp ?? d.games, min: d.min ?? d.minutes,
    mp: d.mp ?? d.total_min ?? d.sample_min,
    pts: d.pts, reb: d.reb, ast: d.ast, stl: d.stl, blk: d.blk,
    bpm: d.bpm, obpm: d.obpm, dbpm: d.dbpm, ortg: d.ortg,
    usg: d.usg ?? d.usg_p, ts: d.ts_pct ?? d.ts,
    fg: d.fg_pct ?? d.fg, efg: d.efg_pct ?? d.efg,
    astP: d.ast_p ?? d.astP, toP: d.to_p ?? d.toP,
    orbP: d.orb_p ?? d.orbP, drbP: d.drb_p ?? d.drbP,
    stlP: d.stl_p ?? d.stlP, blkP: d.blk_p ?? d.blkP,
    ft: d.ft_pct ?? d.ft, tp: d.tp_pct ?? d.tp,
    ftr: d.ftr ?? d.ft_rate, astTov: d.ast_to ?? d.astTov,
    rimF: d.rim_freq ?? d.rimF, rimPct: d.rim_pct ?? d.rimPct,
    midF: d.mid_freq ?? d.midF, midPct: d.mid_pct ?? d.midPct,
    threeF: d.three_freq ?? d.threeF, threePar: d.three_par ?? d.threePar,
    dunkR: d.dunk_rate ?? d.dunkR,
    selfCreation: d.self_creation ?? Math.round(((d.usg??20)/100)*(1-(d.ast_p??d.astP??20)/100)*200),
    pctl,
    ff: { efg: ff.efg??50, tov: ff.tov??50, orb: ff.orb??50, ftr: ff.ftr??50, comp: ff.comp??50 },
    cffr: d.cffr || { usageRole: d.cffr_role ?? d.usage_role, reliability: d.cffr_rel },
    // Shooting projections
    projNba3p:d.proj_3p, projNba3pa:d.proj_3pa, projNba3par:d.proj_3par, projNbaTs:d.proj_ts, projPrior:d.proj_prior,
    // Scouting scores
    feel:d.feel, funcAth:d.func_ath, shootScore:d.shoot_score, defScore:d.def_score, overall:d.overall,
    // Roles
    roles:{playmaker:d.role_playmaker,scorer:d.role_scorer,spacer:d.role_spacer,
      driver:d.role_driver,crasher:d.role_crasher,onball:d.role_onball,
      rimProt:d.role_rim_prot,rebounder:d.role_rebounder,switchPot:d.role_switch,
      connector:d.role_connector,helio:d.role_helio,event:d.role_event,
      zone:d.role_zone,microSpacer:d.role_micro_spacer},
    roleVersatility:d.role_versatility,
    archetype:d.archetype||"",
    // Tier feasibility
    feas:{repl:d.feas_repl,rot:d.feas_rot,start:d.feas_start,allstar:d.feas_allstar,
      cleared:d.feas_cleared||"",blocker:d.feas_blocker||""},
    // Projection — handle BOTH old (PIE) and new (ASPM) formats
    mu:d.pred_mu??d.mu??d.aspm_adj??d.aspm,
    sigma:d.pred_sigma??d.sigma??d.mc_sigma,
    pNba:d.pred_p_nba??d.pNba??d.pn,
    predTier:d.pred_tier??d.predicted_tier??d.tier,
    ups: d.ups ?? d.ups_raw,
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
    badges, redFlags,
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
  const inner = <span className="px-2 py-0.5 rounded-full text-xs font-semibold inline-block" style={{background:color+"22",color,border:`1px solid ${color}44`}}>{text}</span>;
  if (!def) return inner;
  return (
    <Tip content={<div><div className="font-bold mb-1" style={{color}}>{text}</div><div className="mb-1"><span style={{color:"#94a3b8"}}>Trigger:</span> {def.rule}</div><div style={{color:"#cbd5e1"}}>{def.desc}</div></div>}>
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
  const repl = tierData[p.pos]||tierData.Wing;
  const compData = [
    {s:"BPM",v:p.bpm,r:repl.bpm,pc:p.pctl?.bpm},{s:"USG",v:p.usg,r:repl.usg,pc:p.pctl?.usg},
    {s:"TS%",v:p.ts,r:repl.ts,pc:p.pctl?.ts},{s:"AST%",v:p.astP,r:repl.ast_p,pc:p.pctl?.ast},
    {s:"STL%",v:p.stlP,r:repl.stl_p,pc:p.pctl?.stl},{s:"BLK%",v:p.blkP,r:repl.blk_p,pc:p.pctl?.blk},
    {s:"ORB%",v:p.orbP,r:repl.orb_p,pc:p.pctl?.orb},{s:"DRB%",v:p.drbP,r:repl.drb_p,pc:p.pctl?.drb},
  ];
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
            <div className="font-semibold mt-0.5" style={{color:c,fontFamily:"'Oswald',sans-serif"}}>{v}</div>
          </div>
        ))}
      </div>
      <Sec icon="▦" title="Box Score" sub={`${p.gp??0} GP · ${fmt(p.min)} MIN/G`}>
        <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
          {[["PTS",p.pts,p.pctl?.pts36],["REB",p.reb,p.pctl?.reb36],["AST",p.ast,p.pctl?.ast36],
            ["STL",p.stl,p.pctl?.stl],["BLK",p.blk,p.pctl?.blk],["A/TO",p.astTov,null],["FTR",p.ftr,null]
          ].map(([l,v,pc])=><StatCell key={l} label={l} val={v} pctl={pc}/>)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" style={{color:"#6b7280"}}>
          <span>Efficiency:</span>
          {[["TS%",p.ts,p.pctl?.ts],["FG%",p.fg,null],["3P%",p.tp,null],["FT%",p.ft,null]].map(([l,v,pc])=>(
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
      <Sec icon="📊" title={`vs. NBA ${compTier} (${p.pos})`} sub="Green = clears the bar. Red = below threshold.">
        <div className="flex items-center gap-3 mb-4 pb-3" style={{borderBottom:"1px solid #1f2937"}}>
          <span className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Compare against:</span>
          <div className="flex gap-1">
            {["Replacement","Role Player","Starter","All-Star"].map(tier=>(
              <button key={tier} onClick={()=>setCompTier(tier)} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{background:compTier===tier?"#f97316":"#1f2937",color:compTier===tier?"#000":"#9ca3af"}}>
                {tier}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          {compData.map(({s,v,r})=>{
            const pctV=r>0?(v/r)*100:100; const above=v>=r; const c=above?"#22c55e":"#ef4444";
            return (
              <div key={s} className="flex items-center gap-3">
                <div className="w-12 text-xs font-semibold text-right" style={{color:"#9ca3af"}}>{s}</div>
                <div className="flex-1 h-6 rounded-full relative overflow-hidden" style={{background:"#1f2937"}}>
                  <div className="absolute top-0 bottom-0 w-0.5" style={{left:"50%",background:"#ffffff33",zIndex:2}}/>
                  <div className="h-full rounded-full" style={{width:`${Math.min(100,pctV*0.5)}%`,background:`linear-gradient(90deg,${c}88,${c})`}}/>
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
// TAB: SHOOTING (Overhauled)
// ═══════════════════════════════════════════════════════════
function ShootingTab({p}) {
  const zoneOpacity = (freq) => freq > 30 ? 1.0 : freq > 15 ? 0.8 : freq > 5 ? 0.6 : 0.35;
  // Shot mix data for bar chart
  const shotMix = [
    {zone:"Dunks",freq:p.dunkR||0,color:"#ef4444"},
    {zone:"@Rim",freq:(p.rimF||0)-(p.dunkR||0),color:"#f97316"},
    {zone:"Mid",freq:p.midF||0,color:"#fbbf24"},
    {zone:"3PT",freq:p.threeF||0,color:"#3b82f6"},
  ].filter(z=>z.freq>0);

  // Touch prior calculation
  const touchPrior = p.projPrior ?? ((0.20 + 0.18*(p.ft??75)/100 + 0.05*(p.midPct??40)/100)*100);

  return (
    <div className="space-y-5">
      <Sec icon="🏀" title="3.5 Level Scoring" sub="Shot distribution, accuracy, and volume across all scoring zones">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Court Visualization */}
          <div className="md:col-span-2 relative mx-auto" style={{maxWidth:420,aspectRatio:"1/0.85"}}>
            <svg viewBox="0 0 420 357" className="w-full h-full">
              <rect x="0" y="0" width="420" height="357" rx="8" fill="#0d1117"/>
              <line x1="10" y1="10" x2="410" y2="10" stroke="#1f2937" strokeWidth="2"/>
              <path d="M 47 10 L 47 85 A 170 170 0 0 0 373 85 L 373 10" fill="none" stroke="#3b82f688" strokeWidth="2"/>
              <rect x="130" y="10" width="160" height="190" fill="none" stroke="#1f2937" strokeWidth="1.5" rx="2"/>
              <circle cx="210" cy="200" r="60" fill="none" stroke="#1f293766" strokeWidth="1"/>
              <line x1="130" y1="200" x2="290" y2="200" stroke="#8b5cf644" strokeWidth="1.5" strokeDasharray="6,3"/>
              <circle cx="210" cy="42" r="18" fill="none" stroke="#ef444466" strokeWidth="2"/>
              <line x1="190" y1="22" x2="230" y2="22" stroke="#6b7280" strokeWidth="3"/>
              {/* Dunk zone (right of rim) */}
              <g opacity={zoneOpacity(p.dunkR||0)}>
                <text x="290" y="55" textAnchor="middle" fill="#ef4444" style={{fontSize:11,fontWeight:"bold"}}>DUNKS</text>
                <text x="290" y="75" textAnchor="middle" fill="#e5e7eb" style={{fontSize:16,fontWeight:"bold"}}>{fmt(p.dunkR)}%</text>
                <text x="290" y="88" textAnchor="middle" fill="#6b7280" style={{fontSize:10}}>of shots</text>
              </g>
              {/* @Rim zone (left of rim) */}
              <g opacity={zoneOpacity(p.rimF||0)}>
                <text x="130" y="55" textAnchor="middle" fill="#f97316" style={{fontSize:11,fontWeight:"bold"}}>@RIM</text>
                <text x="130" y="75" textAnchor="middle" fill="#e5e7eb" style={{fontSize:18,fontWeight:"bold"}}>{fmt(p.rimPct)}%</text>
                <text x="130" y="90" textAnchor="middle" fill="#6b7280" style={{fontSize:10}}>{p.rimF}% freq</text>
              </g>
              {/* FT zone */}
              <g>
                <text x="210" y="185" textAnchor="middle" fill="#8b5cf6" style={{fontSize:12,fontWeight:"bold"}}>FREE THROW</text>
                <text x="210" y="216" textAnchor="middle" fill="#e5e7eb" style={{fontSize:18,fontWeight:"bold"}}>{fmt(p.ft)}%</text>
                <text x="210" y="232" textAnchor="middle" fill="#6b7280" style={{fontSize:11}}>FTR: {fmt(p.ftr)}</text>
              </g>
              {/* Mid zone */}
              <g opacity={zoneOpacity(p.midF||0)}>
                <text x="85" y="145" textAnchor="middle" fill="#fbbf24" style={{fontSize:12,fontWeight:"bold"}}>MID</text>
                <text x="85" y="168" textAnchor="middle" fill="#e5e7eb" style={{fontSize:18,fontWeight:"bold"}}>{fmt(p.midPct)}%</text>
                <text x="85" y="183" textAnchor="middle" fill="#6b7280" style={{fontSize:10}}>{p.midF}% freq</text>
              </g>
              {/* 3PT zone */}
              <g opacity={zoneOpacity(p.threeF||0)}>
                <text x="210" y="295" textAnchor="middle" fill="#3b82f6" style={{fontSize:14,fontWeight:"bold"}}>3-POINT</text>
                <text x="210" y="322" textAnchor="middle" fill="#e5e7eb" style={{fontSize:22,fontWeight:"bold"}}>{fmt(p.tp)}%</text>
                <text x="210" y="340" textAnchor="middle" fill="#6b7280" style={{fontSize:11}}>{p.threeF}% freq</text>
              </g>
            </svg>
          </div>
          {/* Shot Mix bar chart */}
          <div>
            <div className="text-xs uppercase tracking-wider mb-3" style={{color:"#6b7280"}}>Shot Mix (Frequency)</div>
            {shotMix.map(z=>(
              <div key={z.zone} className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span style={{color:z.color}}>{z.zone}</span>
                  <span style={{color:"#9ca3af"}}>{fmt(z.freq,0)}%</span>
                </div>
                <div className="h-5 rounded-full overflow-hidden" style={{background:"#1f2937"}}>
                  <div className="h-full rounded-full" style={{width:`${z.freq}%`,background:`linear-gradient(90deg,${z.color}88,${z.color})`}}/>
                </div>
              </div>
            ))}
            <div className="mt-4 text-xs" style={{color:"#6b7280"}}>
              <Tip content={<div><div className="font-bold mb-1" style={{color:"#f97316"}}>{METHODS.selfCreation.name}</div><code className="text-xs" style={{color:"#7dd3fc"}}>{METHODS.selfCreation.formula}</code><div className="mt-1" style={{color:"#cbd5e1"}}>{METHODS.selfCreation.desc}</div></div>}>
                <span>Self-Creation: <span className="font-bold" style={{color:"#f97316"}}>{p.selfCreation} <span style={{color:"#475569"}}>ⓘ</span></span></span>
              </Tip>
            </div>
          </div>
        </div>
      </Sec>

      {/* NBA Shooting Projection */}
      <Sec icon="🔮" title="NBA Shooting Projection">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {[["projNba3p","Proj. 3P%",p.projNba3p,p.projNba3p>36?"#22c55e":p.projNba3p>32?"#fbbf24":"#ef4444"],
            ["projNba3pa","Proj. 3PA/G",p.projNba3pa,p.projNba3pa>5?"#3b82f6":"#6b7280"],
            ["projNba3par","Proj. 3PAr",p.projNba3par,p.projNba3par>30?"#3b82f6":"#6b7280"],
            ["touchPrior","Touch Prior",touchPrior,touchPrior>37?"#22c55e":touchPrior>34?"#fbbf24":"#ef4444"],
          ].map(([key,l,v,c])=>{
            const m = METHODS[key] || METHODS.touchPrior;
            return (
              <Tip key={key} wide content={
                <div><div className="font-bold mb-1" style={{color:"#f97316"}}>{m.name}</div>
                <div className="mb-1"><span style={{color:"#94a3b8"}}>Formula:</span><br/><code className="text-xs" style={{color:"#7dd3fc"}}>{m.formula}</code></div>
                <div style={{color:"#cbd5e1"}}>{m.desc}</div></div>
              }>
                <div className="rounded-lg p-4 text-center cursor-help" style={{background:"#0d1117"}}>
                  <div className="text-xs uppercase tracking-wider mb-1" style={{color:"#6b7280"}}>{l} <span style={{color:"#475569"}}>ⓘ</span></div>
                  <div className="text-3xl font-bold" style={{color:c,fontFamily:"'Oswald',sans-serif"}}>{fmt(v)}{key==="touchPrior"?"%":""}</div>
                </div>
              </Tip>
            );
          })}
        </div>
        {/* Prior transparency */}
        <div className="px-3 py-2 rounded-lg text-xs" style={{background:"#0d1117",border:"1px solid #1e293b"}}>
          <Tip wide content={<div><div className="font-bold mb-1" style={{color:"#f97316"}}>Bayesian Beta-Binomial (Berger 2022)</div><div style={{color:"#cbd5e1"}}>The prior encodes motor "touch" — neuromuscular consistency predicting NBA shooting. A player with 85% FT + 28% 3P has vastly more latent 3P potential than one with 65% FT + 35% 3P. κ=200 pseudo-attempts: more 3PA → less prior influence.</div></div>}>
            <span style={{color:"#6b7280"}}>Touch Prior breakdown: FT% (<span style={{color:"#8b5cf6"}}>{fmt(p.ft)}</span>) × 0.18 + Mid% (<span style={{color:"#fbbf24"}}>{fmt(p.midPct)}</span>) × 0.05 + 0.20 = <span className="font-bold" style={{color:touchPrior>37?"#22c55e":"#fbbf24"}}>{fmt(touchPrior)}%</span> <span style={{color:"#475569"}}>ⓘ</span></span>
          </Tip>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs" style={{color:"#6b7280"}}>
          <span>Self-Creation: <span style={{color:"#f97316"}}>{p.selfCreation}</span></span>
          <span>FG%: <span style={{color:"#e5e7eb"}}>{fmt(p.fg)}</span></span>
          <span>TS%: <span style={{color:"#e5e7eb"}}>{fmt(p.ts)}</span></span>
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
// TAB: SCOUTING (Pillars + Roles + Archetypes + Four Factors + Badges)
// ═══════════════════════════════════════════════════════════
function ScoutingTab({p}) {
  const badges = useMemo(() => computeBadges(p), [p]);

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

  // ── Four Factors / Possession Impact ──
  const npv = p.ff?.comp ?? 50;
  const npvLabel = npv > 70 ? "Elite Floor Raiser" : npv > 55 ? "Winning Piece" : npv > 40 ? "Role Dependent" : "High Maintenance";
  const npvColor = npv > 70 ? "#22c55e" : npv > 55 ? "#86efac" : npv > 40 ? "#fbbf24" : "#ef4444";

  return (
    <div className="space-y-5">
      {/* ── PILLARS (5 DNA scores) ─────────────────────── */}
      <Sec icon="🔬" title="The 5 Pillars" sub="Prospect DNA — position-adjusted percentile scores (0-100)">
        {p.source !== "ncaa" && <div className="mb-3 px-3 py-1.5 rounded-lg inline-block text-xs" style={{background:"#3b82f622",color:"#60a5fa",border:"1px solid #3b82f644"}}>League-Adjusted (×1.25 for international stats)</div>}
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

      {/* ── ROLE INFERENCE MATRIX ─────────────────────── */}
      <Sec icon="📊" title="Role Inference Matrix" sub="Z-scores: ≥+2.0 = Elite, ≥+1.0 = Impact, <-1.0 = Liability">
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

      {/* ── ARCHETYPE ─────────────────────────────────── */}
      <Sec icon="🏷" title="NBA Archetype" sub="Best-fit NBA player template based on pillar + role combination">
        <div className="rounded-xl p-5 text-center" style={{background:"#0d1117",border:"1px solid #f9731644"}}>
          <div className="text-xs uppercase tracking-wider mb-2" style={{color:"#6b7280"}}>Primary Archetype</div>
          <div className="text-2xl font-bold" style={{color:"#f97316",fontFamily:"'Oswald',sans-serif"}}>{archetype}</div>
          {p.roleVersatility!=null&&<div className="text-xs mt-2" style={{color:"#475569"}}>Role Versatility: {Math.round(p.roleVersatility)}/100</div>}
        </div>
      </Sec>

      {/* ── FOUR FACTORS / POSSESSION IMPACT ─────────── */}
      <Sec icon="↗" title="Possession Impact & Carefree Playability" sub="">
        <Tip wide content={
          <div>
            <div className="font-bold mb-1" style={{color:"#f97316"}}>{METHODS.fourFactors.name}</div>
            <div className="mb-1"><span style={{color:"#94a3b8"}}>Formula:</span><br/><code className="text-xs" style={{color:"#7dd3fc"}}>{METHODS.fourFactors.formula}</code></div>
            <div style={{color:"#cbd5e1"}}>{METHODS.fourFactors.desc}</div>
          </div>
        }>
          <div className="text-xs mb-4 cursor-help" style={{color:"#6b7280"}}>The NPV is not a talent rating — it's an efficiency index measuring how 'expensive' it is for a coach to keep this player on the floor. <span style={{color:"#475569"}}>ⓘ hover for formula</span></div>
        </Tip>
        <div className="flex items-center gap-4 mb-4 p-4 rounded-xl" style={{background:"#0d1117",border:`1px solid ${npvColor}33`}}>
          <div>
            <div className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Net Possession Value</div>
            <div className="text-3xl font-bold" style={{color:npvColor,fontFamily:"'Oswald',sans-serif"}}>{Math.round(npv)}</div>
          </div>
          <div className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{background:npvColor+"22",color:npvColor,border:`1px solid ${npvColor}44`}}>{npvLabel}</div>
          {p.cffr?.usageRole && <div className="ml-auto text-xs" style={{color:"#6b7280"}}>Usage Role: <span style={{color:"#f97316"}}>{p.cffr.usageRole}</span></div>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[["eFG%","Shot Quality",p.ff.efg,"#fbbf24","40% weight — shooting efficiency adjusted for 3-point value"],
            ["TO Control","Ball Security",p.ff.tov,"#3b82f6","25% weight — turnover rate (inverted: lower = better). Positive z-score = fewer turnovers than peers."],
            ["ORB%","Extra Possessions",p.ff.orb,"#06b6d4","20% weight — offensive rebounding creates second-chance points."],
            ["FT Rate","Foul Pressure",p.ff.ftr,"#8b5cf6","15% weight — drawing fouls generates free points and creates foul trouble."]
          ].map(([l,d,v,c,desc])=>(
            <Tip key={l} content={<div><div className="font-bold mb-1" style={{color:c}}>{l}</div><div style={{color:"#cbd5e1"}}>{desc}</div></div>}>
              <div key={l} className="cursor-help">
                <div className="text-sm font-semibold mb-1" style={{color:"#e5e7eb"}}>{l} <span style={{color:"#475569"}}>ⓘ</span></div>
                <div className="text-xs mb-2" style={{color:"#6b7280"}}>{d}</div>
                <HBar value={v} color={c} right={`${v}`}/>
              </div>
            </Tip>
          ))}
        </div>
      </Sec>

      {/* ── BADGES ─────────────────────────────────────── */}
      <Sec icon="🏅" title="Skill Badges" sub="Green = elite NBA skills · Yellow = swing/potential · Red = warning signals. Max 5 displayed, red priority.">
        {badges.green.length>0&&<>
          <div className="text-xs uppercase tracking-wider mb-2" style={{color:"#22c55e"}}>✓ Green Flags</div>
          <div className="flex flex-wrap gap-2 mb-4">{badges.green.map((b,i)=><BadgeChip key={i} text={b} color="#22c55e"/>)}</div>
        </>}
        {badges.yellow?.length>0&&<>
          <div className="text-xs uppercase tracking-wider mb-2" style={{color:"#fbbf24"}}>⚡ Swing Skills</div>
          <div className="flex flex-wrap gap-2 mb-4">{badges.yellow.map((b,i)=><BadgeChip key={i} text={b} color="#fbbf24"/>)}</div>
        </>}
        {badges.red.length>0&&<>
          <div className="text-xs uppercase tracking-wider mb-2" style={{color:"#ef4444"}}>⚠ Red Flags</div>
          <div className="flex flex-wrap gap-2">{badges.red.map((f,i)=><BadgeChip key={i} text={f} color="#ef4444"/>)}</div>
        </>}
        {badges.green.length===0&&badges.red.length===0&&<div className="text-sm" style={{color:"#6b7280"}}>No badges earned — average or data-insufficient profile.</div>}
      </Sec>

      {/* ── BUST / SLEEPER ASSESSMENT ─────────────────── */}
      <Sec icon="🎰" title="Bust / Sleeper Clusters" sub="Pattern-matched risk signals from historical data">
        {(() => {
          const busts=[], sleepers=[];
          const bpm=p.bpm??0,usg=p.usg??0,stlP=p.stlP??0,blkP=p.blkP??0,ft=p.ft??0,astTov=p.astTov??0,dunkR=p.dunkR??0,rimF=p.rimF??0,threeF=p.threeF??0,ftr=p.ftr??0,htIn=p.htIn??78;
          if (usg>25 && stlP<1.2 && blkP<1.0) busts.push({label:"Defensive Immobility",desc:"High usage but no defensive activity — can't guard in NBA."});
          if ((dunkR>8||rimF>30) && ft<65 && astTov<0.9) busts.push({label:"Athletic / No Skill",desc:"High athleticism but poor touch and decisions."});
          if (threeF>40 && ftr<20 && rimF<20) busts.push({label:"One-Dimensional Shooter",desc:"Only shoots threes without rim or FT pressure."});
          if (bpm>8 && usg<20) sleepers.push({label:"Elite Connector Potential",desc:"Massive BPM at low usage — efficiency explodes in right role."});
          if (ft>85 && (p.tp??34)<34) sleepers.push({label:"Shooting Breakout Risk",desc:"Elite FT% signals motor memory for 3P translation — current low 3P% is misleading."});
          if (stlP>3.0 && htIn>79) sleepers.push({label:"Defensive Stopper Floor",desc:"Elite steal rate at large size creates instant defensive value."});
          return (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs uppercase tracking-wider mb-2" style={{color:"#ef4444"}}>⚠ Bust Clusters ({busts.length})</div>
                {busts.length > 0 ? busts.map((b,i)=>(
                  <div key={i} className="p-3 rounded-lg mb-2" style={{background:"#ef444411",border:"1px solid #ef444433"}}>
                    <div className="text-xs font-semibold mb-0.5" style={{color:"#fca5a5"}}>{b.label}</div>
                    <div className="text-xs" style={{color:"#94a3b8"}}>{b.desc}</div>
                  </div>
                )) : <div className="text-xs" style={{color:"#6b7280"}}>No bust signals detected.</div>}
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider mb-2" style={{color:"#22c55e"}}>✦ Sleeper Signals ({sleepers.length})</div>
                {sleepers.length > 0 ? sleepers.map((s,i)=>(
                  <div key={i} className="p-3 rounded-lg mb-2" style={{background:"#22c55e11",border:"1px solid #22c55e33"}}>
                    <div className="text-xs font-semibold mb-0.5" style={{color:"#86efac"}}>{s.label}</div>
                    <div className="text-xs" style={{color:"#94a3b8"}}>{s.desc}</div>
                  </div>
                )) : <div className="text-xs" style={{color:"#6b7280"}}>No sleeper signals detected.</div>}
              </div>
            </div>
          );
        })()}
      </Sec>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: BODY (Anthropometric comps + proxy engine)
// ═══════════════════════════════════════════════════════════
function BodyTab({p}) {
  const [wsAdj,setWsAdj]=useState(0);
  const [wtAdj,setWtAdj]=useState(0);

  // Wingspan proxy
  const apeIndex = p.pos==="Playmaker"?1.04:p.pos==="Big"?1.06:1.05;
  const estimatedWs = p.ws || Math.round((p.htIn||78)*apeIndex*10)/10;
  const isEstimated = !p.ws;

  // BMI-based weight proxy
  const htM = (p.htIn||78)*0.0254;
  const posBmi = p.pos==="Playmaker"?23.5:p.pos==="Big"?26.5:24.8;
  const estimatedWt = p.wt || Math.round(posBmi*htM*htM*2.205);
  const isWtEstimated = !p.wt;

  const adjWs = estimatedWs + wsAdj;
  const adjWt = estimatedWt + wtAdj;
  const wsDelta = adjWs - (p.htIn||78);

  // Labels
  const wsLabel = wsDelta > 6 ? "Elite Length / Disruptor Frame" : wsDelta > 3 ? "Above Average Length" : wsDelta > 1 ? "Neutral Wingspan" : "Negative Wingspan / Tactical Limitations";
  const wtLabel = adjWt > estimatedWt + 15 ? "High Strength / Power Build" : adjWt < estimatedWt - 15 ? "Slight Frame / Needs Development" : "Average Frame";

  // Dynamic anthro comps
  const dynamicAnthro = useMemo(()=>{
    return (p.anthroComps||[]).map(c=>{
      const wtDiff=Math.abs((c.wt||0)-adjWt);
      const wsDiff=Math.abs((c.ws||0)-adjWs);
      const htDiff=Math.abs((c.ht||0)-(p.htIn||0));
      const rawDist=Math.sqrt(htDiff*htDiff*0.6 + wtDiff*0.2*wtDiff*0.2 + wsDiff*0.2*wsDiff*0.2*1.5*1.5);
      const sim=Math.max(0,Math.round((1-rawDist/25)*100));
      return {...c,sim,rawDist};
    }).sort((a,b)=>b.sim-a.sim).slice(0,10);
  },[p,wsAdj,wtAdj]);

  return (
    <div className="space-y-5">
      <Sec icon="📏" title="Physical Profile" sub={isEstimated?"Some measurements estimated from position averages (marked ≈)":""}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          {[
            ["Height",p.ht||`${Math.floor((p.htIn||78)/12)}'${(p.htIn||78)%12}"`,false],
            ["Weight",`${adjWt} lbs`,isWtEstimated],
            ["Wingspan",`${adjWs.toFixed(1)}"`,isEstimated],
            ["WS Delta",`${wsDelta>0?"+":""}${wsDelta.toFixed(1)}"`,false],
            ["Ape Index",((adjWs/(p.htIn||78))).toFixed(3),false],
          ].map(([l,v,est])=>(
            <div key={l} className="rounded-lg p-3 text-center" style={{background:"#0d1117"}}>
              <div className="text-xs uppercase" style={{color:"#6b7280"}}>{l}{est?" ≈":""}</div>
              <div className="font-bold text-lg" style={{color:"#e5e7eb",fontFamily:"'Oswald',sans-serif"}}>{v}</div>
            </div>
          ))}
        </div>
        {/* Labels */}
        <div className="flex gap-3 mb-4">
          <span className="px-3 py-1 rounded-lg text-xs" style={{background:wsDelta>3?"#22c55e22":wsDelta>1?"#1f2937":"#ef444422",color:wsDelta>3?"#22c55e":wsDelta>1?"#9ca3af":"#ef4444"}}>{wsLabel}</span>
          <span className="px-3 py-1 rounded-lg text-xs" style={{background:"#1f2937",color:"#9ca3af"}}>{wtLabel}</span>
        </div>
        {/* Scout adjustment sliders */}
        <div className="flex gap-6 p-3 rounded-lg" style={{background:"#0d1117"}}>
          <div className="flex-1">
            <div className="flex justify-between text-xs mb-1"><span style={{color:"#9ca3af"}}>Weight Adjust</span><span style={{color:"#f97316"}}>{wtAdj>0?"+":""}{wtAdj} lbs</span></div>
            <input type="range" min={-20} max={20} value={wtAdj} onChange={e=>setWtAdj(+e.target.value)} className="w-full" style={{accentColor:"#f97316"}}/>
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-xs mb-1"><span style={{color:"#9ca3af"}}>Wingspan Adjust</span><span style={{color:"#f97316"}}>{wsAdj>0?"+":""}{wsAdj}"</span></div>
            <input type="range" min={-4} max={4} step={0.25} value={wsAdj} onChange={e=>setWsAdj(+e.target.value)} className="w-full" style={{accentColor:"#f97316"}}/>
          </div>
        </div>
        {(wsAdj!==0||wtAdj!==0)&&<div className="mt-2 text-xs" style={{color:"#fbbf24"}}>⚡ User Projected Matches — showing comps based on adjusted measurements</div>}
      </Sec>
      <Sec icon="👥" title="Anthropometric Comps" sub="Physical similarity (Height 60% + Weight 20% + Wingspan 20%). Adjust sliders above to project.">
        {dynamicAnthro.length > 0 ? (
          <div className="space-y-2">
            {dynamicAnthro.map((c,i)=>(
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={{background:"#0d1117"}}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{background:"#1f2937",color:"#9ca3af"}}>{i+1}</div>
                <div className="flex-1"><div className="font-semibold text-sm" style={{color:"#e5e7eb"}}>{c.name}</div><div className="text-xs" style={{color:"#6b7280"}}>{c.ht}" · {c.wt} lbs · WS {c.ws}"</div></div>
                <div className="text-sm font-bold" style={{color:"#3b82f6"}}>{c.sim}%</div>
                {c.tier&&<TierBadge tier={c.tier}/>}
              </div>
            ))}
          </div>
        ) : <div className="text-center py-6" style={{color:"#6b7280"}}>No combine/anthropometric data available for comparison.</div>}
      </Sec>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: COMPS (Statistical only — anthro moved to Body)
// ═══════════════════════════════════════════════════════════
function CompsTab({p}) {
  const [nbaOnly,setNbaOnly]=useState(false);
  const fStat=nbaOnly?(p.statComps||[]).filter(c=>c.nba):(p.statComps||[]);

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <Tip content={<div style={{color:"#cbd5e1"}}>Comps use only pre-draft seasons (Freshman/Sophomore for NCAA, age ≤21 for international). You're comparing against what these players looked like BEFORE the NBA, not their prime stats.</div>}>
          <div className="text-xs cursor-help" style={{color:"#6b7280"}}>Age/stage-filtered: only pre-draft seasons used <span style={{color:"#475569"}}>ⓘ</span></div>
        </Tip>
        <button onClick={()=>setNbaOnly(!nbaOnly)} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{background:nbaOnly?"#f97316":"#1f2937",color:nbaOnly?"#000":"#9ca3af"}}>
          {nbaOnly?"★ NBA Stars Only":"All Prospects"}
        </button>
      </div>
      <Sec icon="📊" title="Statistical Comps" sub="Weighted Euclidean distance on era-adjusted percentiles. 'Reached Tier' shows what each comp achieved in the NBA.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead><tr>
            {["Name","Pos","Sim","BPM","USG","TS%","AST%","STL%","BLK%","3P%","FT%","Reached"].map(h=><th key={h} className="text-left px-2 py-1.5 text-xs uppercase" style={{color:"#6b7280",borderBottom:"1px solid #1f2937"}}>{h}</th>)}
          </tr></thead><tbody>
            <tr style={{background:"#f9731611"}}>
              <td className="px-2 py-2 font-bold" style={{color:"#f97316"}}>{p.nbaName||p.name||"Selected"}</td>
              <td className="px-2" style={{color:"#9ca3af"}}>{p.pos}</td><td className="px-2" style={{color:"#f97316"}}>—</td>
              <td className="px-2 font-semibold" style={{color:valColor(p.pctl?.bpm)}}>{fmt(p.bpm)}</td>
              <td className="px-2">{fmt(p.usg)}</td><td className="px-2">{fmt(p.ts)}</td>
              <td className="px-2">{fmt(p.astP)}</td><td className="px-2">{fmt(p.stlP)}</td>
              <td className="px-2">{fmt(p.blkP)}</td><td className="px-2">{fmt(p.tp)}</td>
              <td className="px-2">{fmt(p.ft)}</td>
              <td className="px-2">{p.actual?<TierBadge tier={p.actual}/>:"—"}</td>
            </tr>
            {fStat.map((c,i)=>(
              <tr key={i} className="hover:bg-white hover:bg-opacity-5" style={{borderBottom:"1px solid #1f293744"}}>
                <td className="px-2 py-2 font-semibold" style={{color:"#e5e7eb"}}>{c.name}</td>
                <td className="px-2" style={{color:"#6b7280"}}>{c.pos}</td>
                <td className="px-2 font-bold" style={{color:"#f97316"}}>{c.sim}%</td>
                <td className="px-2" style={{color:valColor(c.bpm>10?90:c.bpm>5?65:35)}}>{fmt(c.bpm)}</td>
                <td className="px-2">{fmt(c.usg)}</td><td className="px-2">{fmt(c.ts)}</td>
                <td className="px-2">{fmt(c.astP)}</td><td className="px-2">{fmt(c.stlP)}</td>
                <td className="px-2">{fmt(c.blkP)}</td><td className="px-2">{fmt(c.tp)}</td>
                <td className="px-2">{fmt(c.ft)}</td>
                <td className="px-2"><TierBadge tier={c.tier}/></td>
              </tr>
            ))}
          </tbody></table>
        </div>
        {fStat.length===0&&<div className="text-center py-6" style={{color:"#6b7280"}}>No statistical comps available.</div>}
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
      <Sec icon="🏅" title="Badge Definitions" sub="Green = elite NBA skills · Yellow = swing/potential · Red = warning signals">
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
// BIG BOARD (cleaned — no inference board, no 3D cube)
// ═══════════════════════════════════════════════════════════
function BigBoardView({onSelect, boardData, setBoardData, loading, setLoading, availableYears, yearFilter, setYearFilter}) {
  const [sortBy,setSortBy]=useState("ups");
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
    if(posFilter!=="All") list = list.filter(p=>p.pos===posFilter);
    list = list.filter(p=>p.confidence!=="very_low");
    const sortFn = {
      ups: (a,b)=>(b.ups||b.mu||0)-(a.ups||a.mu||0),
      mu: (a,b)=>(b.mu||0)-(a.mu||0),
      pNba: (a,b)=>(b.pNba||0)-(a.pNba||0),
      bpm: (a,b)=>(b.bpm||0)-(a.bpm||0),
    };
    list = [...list].sort(sortFn[sortBy]||sortFn.ups);
    return list.slice(0,60);
  },[allPlayers,sortBy,posFilter]);

  const posColors = {Playmaker:"#3b82f6",Wing:"#f97316",Big:"#8b5cf6","Jumbo Creator":"#fbbf24","Stretch Big":"#22c55e"};

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
            Probabilistic ranking · {filtered.length} prospects shown · Sort: {sortBy.toUpperCase()}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {availableYears.map(yr=>(
            <button key={yr} onClick={()=>handleYearChange(yr)} className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{background:yearFilter===String(yr)?"#f97316":"#1f2937",color:yearFilter===String(yr)?"#000":"#9ca3af"}}>
              {yr}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          {["All","Playmaker","Wing","Big"].map(pos=>(
            <button key={pos} onClick={()=>setPosFilter(pos)} className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{background:posFilter===pos?(posColors[pos]||"#f97316"):"#1f2937",color:posFilter===pos?"#000":"#9ca3af"}}>
              {pos}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {[["ups","UPS"],["mu","Peak"],["bpm","BPM"]].map(([k,l])=>(
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
                {["#","Player","Pos","Team","Age","UPS","Peak","⭐%","All★%","Start%","Role%","Repl%","Path"].map(h=>(
                  <th key={h} className="px-3 py-2.5 text-left text-xs uppercase tracking-wider font-semibold" style={{color:"#6b7280",borderBottom:"1px solid #1f2937"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p,i)=>{
                const tierPctColor = (v) => v>20?"#22c55e":v>10?"#86efac":v>5?"#fbbf24":v>1?"#6b7280":"#374151";
                return (
                  <tr key={p.name} className="cursor-pointer hover:bg-white hover:bg-opacity-5 transition-colors" onClick={()=>onSelect(p.name)}
                    style={{borderBottom:"1px solid #1f293744"}}>
                    <td className="px-3 py-2.5 font-bold text-xs" style={{color:"#475569"}}>{i+1}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold" style={{color:"#e5e7eb"}}>{p.name}</div>
                      <div className="flex gap-1 mt-0.5">{(p.badges||[]).slice(0,2).map((b,j)=><span key={j} className="text-xs px-1.5 py-0 rounded" style={{background:"#22c55e22",color:"#22c55e",fontSize:9}}>{b}</span>)}</div>
                    </td>
                    <td className="px-3 py-2.5"><span className="px-2 py-0.5 rounded text-xs font-semibold" style={{background:(posColors[p.pos]||"#6b7280")+"22",color:posColors[p.pos]||"#6b7280"}}>{p.pos}</span></td>
                    <td className="px-3 py-2.5 text-xs" style={{color:"#9ca3af"}}>{p.team||p.conf}</td>
                    <td className="px-3 py-2.5 text-xs" style={{color:"#9ca3af"}}>{p.age!=null?Number(p.age).toFixed(1):"—"}</td>
                    <td className="px-3 py-2.5 font-bold" style={{color:"#fbbf24",fontFamily:"'Oswald',sans-serif"}}>{p.ups!=null?fmt(p.ups,0):fmt(p.mu,3)}</td>
                    <td className="px-3 py-2.5 font-semibold" style={{color:"#f97316",fontFamily:"'Oswald',sans-serif"}}>{fmt(p.aspm||p.mu)}</td>
                    <td className="px-3 py-2.5 text-xs font-semibold" style={{color:tierPctColor(p.tiers?.Superstar)}}>{fmt(p.tiers?.Superstar,0)}%</td>
                    <td className="px-3 py-2.5 text-xs font-semibold" style={{color:tierPctColor(p.tiers?.["All-Star"])}}>{fmt(p.tiers?.["All-Star"],0)}%</td>
                    <td className="px-3 py-2.5 text-xs font-semibold" style={{color:tierPctColor(p.tiers?.Starter)}}>{fmt(p.tiers?.Starter,0)}%</td>
                    <td className="px-3 py-2.5 text-xs" style={{color:tierPctColor(p.tiers?.["Role Player"])}}>{fmt(p.tiers?.["Role Player"],0)}%</td>
                    <td className="px-3 py-2.5 text-xs" style={{color:"#6b7280"}}>{fmt(p.tiers?.Replacement,0)}%</td>
                    <td className="px-3 py-2.5 text-xs" style={{color:p.careerPath==="NBA"?"#22c55e":"#60a5fa"}}>{p.careerPath||"NBA"}</td>
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
// CLASS OVERVIEW (simplified — no 3D cube)
// ═══════════════════════════════════════════════════════════
function ClassOverviewTab({ players, yearFilter, onSelect }) {
  const allPlayers = players.filter(p => p?.confidence !== "very_low");
  const stats = useMemo(() => {
    if (!allPlayers.length) return null;
    const byPos = {};
    allPlayers.forEach(p => { byPos[p.pos] = (byPos[p.pos]||0)+1; });
    const avgBpm = allPlayers.reduce((s,p)=>s+(p.bpm??0),0)/allPlayers.length;
    const pNbaAbove50 = allPlayers.filter(p=>(p.pNba??0)>0.50).length;
    const tierCounts = {};
    allPlayers.forEach(p=>{const t=p.predTier||p.actual||"Unknown";tierCounts[t]=(tierCounts[t]||0)+1;});
    const topUps = [...allPlayers].filter(p=>p.ups!=null||p.mu!=null).sort((a,b)=>(b.ups||b.mu||0)-(a.ups||a.mu||0)).slice(0,5);
    const topBpm = [...allPlayers].filter(p=>p.bpm!=null).sort((a,b)=>b.bpm-a.bpm).slice(0,5);
    return { byPos, avgBpm, pNbaAbove50, tierCounts, topUps, topBpm, total:allPlayers.length };
  }, [allPlayers]);

  if (!stats) return <div className="text-center py-10" style={{color:"#6b7280"}}>No class data available.</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl p-6" style={{background:"linear-gradient(135deg,#0d1117 0%,#1a1040 100%)",border:"1px solid #1f2937"}}>
        <div className="text-xs uppercase tracking-widest mb-2" style={{color:"#f97316"}}>ProspectTheory · Draft Intelligence</div>
        <h2 className="text-4xl font-bold mb-1" style={{color:"#e5e7eb",fontFamily:"'Oswald',sans-serif"}}>
          {yearFilter && yearFilter !== "All" ? yearFilter : "All Years"} Draft Class
        </h2>
        <p className="text-sm" style={{color:"#6b7280"}}>{stats.total} eligible prospects · {stats.pNbaAbove50} with >50% NBA probability</p>
        <div className="grid grid-cols-3 gap-4 mt-5">
          {[["Total",stats.total,"#e5e7eb"],["Avg BPM",stats.avgBpm.toFixed(1),"#f97316"],[">50% NBA",stats.pNbaAbove50,"#fbbf24"]].map(([l,v,c])=>(
            <div key={l} className="text-center"><div className="text-2xl font-bold" style={{color:c,fontFamily:"'Oswald',sans-serif"}}>{v}</div><div className="text-xs" style={{color:"#6b7280"}}>{l}</div></div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[["🎯 Top UPS","Unified Prospect Score",stats.topUps,"ups","#fbbf24"],
          ["📊 Top BPM","Production Leaders",stats.topBpm,"bpm","#f97316"]
        ].map(([title,sub,list,field,color])=>(
          <Sec key={title} icon="" title={title}>
            <div className="text-xs mb-3" style={{color:"#64748b"}}>{sub}</div>
            <div className="space-y-2">
              {list.map((pl,i)=>(
                <div key={pl.name} className="flex items-center gap-3 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-white hover:bg-opacity-5" onClick={()=>onSelect&&onSelect(pl.name)}>
                  <span className="text-sm font-bold w-4" style={{color:"#475569"}}>{i+1}</span>
                  <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate" style={{color:"#e5e7eb"}}>{pl.name}</div><div className="text-xs" style={{color:"#64748b"}}>{pl.pos} · {pl.conf||pl.team}</div></div>
                  <div className="font-bold text-lg font-mono" style={{color,fontFamily:"'Oswald',sans-serif"}}>{field==="bpm"?fmt(pl.bpm):(pl.ups!=null?fmt(pl.ups,0):fmt(pl.mu,3))}</div>
                </div>
              ))}
            </div>
          </Sec>
        ))}
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

const TOP_VIEWS = [
  {id:"board",label:"Big Board",icon:"📋"},
  {id:"classoverview",label:"Class Overview",icon:"📊"},
];

export default function App() {
  const [sel,setSel]=useState(null);
  const [tab,setTab]=useState("overview");
  const [topView,setTopView]=useState("board");
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
  const pReady = p && p.pctl != null;

  return (
    <div className="min-h-screen" style={{background:"#080b12",fontFamily:"'Barlow',sans-serif",color:"#e5e7eb"}}>
      <header className="sticky top-0 z-50 px-4 md:px-8 py-3" style={{background:"rgba(8,11,18,0.92)",backdropFilter:"blur(12px)",borderBottom:"1px solid #1f293744"}}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={()=>{setSel(null);setTab("overview");setTopView("board");}}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm" style={{background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#000"}}>PT</div>
            <div><div className="font-bold text-sm tracking-wider" style={{fontFamily:"'Oswald',sans-serif",color:"#f97316"}}>PROSPECT THEORY</div><div className="text-xs" style={{color:"#6b7280"}}>NBA Draft Intelligence</div></div>
          </div>
          {!sel && (
            <div className="flex items-center gap-1 rounded-xl p-1" style={{background:"#111827",border:"1px solid #1f2937"}}>
              {TOP_VIEWS.map(v=>(
                <button key={v.id} onClick={()=>setTopView(v.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{background:topView===v.id?"#f97316":"transparent",color:topView===v.id?"#000":"#6b7280"}}>
                  <span>{v.icon}</span>{v.label}
                </button>
              ))}
            </div>
          )}
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
          ) : topView === "classoverview" ? (
            <ClassOverviewTab players={PLAYER_LIST.map(n=>PLAYERS[n]).filter(Boolean)} yearFilter={yearFilter} onSelect={selectPlayer}/>
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
                    {(p.badges||[]).slice(0,3).map((b,i)=><BadgeChip key={i} text={b}/>)}
                    {(p.redFlags||[]).slice(0,2).map((f,i)=><BadgeChip key={`rf${i}`} text={f} color="#ef4444"/>)}
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
