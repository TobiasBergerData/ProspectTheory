import { useState, useEffect, useMemo, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, Cell, ResponsiveContainer, AreaChart, Area, CartesianGrid } from "recharts";

// ═══════════════════════════════════════════════════════════
// CONSTANTS & HELPERS
// ═══════════════════════════════════════════════════════════
const TC = { Superstar:"#fbbf24","All-Star":"#f97316",Starter:"#3b82f6","Role Player":"#06b6d4",Replacement:"#8b5cf6",Negative:"#6b7280","Never Made NBA":"#374151","Out":"#374151" };
// Archetype colors — used in header pills and anywhere ARCH_MAP isn't in scope
const ARCH_COLORS = {
  "Scoring Playmaker":"#fbbf24","Floor General":"#f97316","Spacing Guard":"#22c55e","Defensive Guard":"#3b82f6",
  "Non-Specialized Playmaker":"#8b5cf6","Scoring Wing":"#ef4444","3-and-D Wing":"#3b82f6","Defensive Wing":"#06b6d4",
  "Slashing Wing":"#f43f5e","Non-Specialized Wing":"#a78bfa","Point Forward":"#10b981","Stretch Big":"#22c55e",
  "Stretch Rim Protector":"#10b981","Rim Protector":"#3b82f6","Passing Hub":"#fbbf24","Short Roll Playmaker":"#f59e0b",
  "Glass Cleaner":"#f97316","Scoring Big":"#ef4444","Non-Specialized Big":"#60a5fa","Initiator Wing":"#fb923c",
};
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
function Tip({children, content, wide=false, block=false}) {
  const [show,setShow] = useState(false);
  const [pos,setPos] = useState({x:0,y:0});
  const ref = useRef(null);
  const handleEnter = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({x:rect.left+rect.width/2, y:rect.top});
    setShow(true);
  };
  return (
    <span className={`relative ${block?'block w-full':'inline-block'} cursor-help`} onMouseEnter={handleEnter} onMouseLeave={()=>setShow(false)} ref={ref}>
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
    name: "Box Creation",
    formula: "pctl(USG% × TS%) within position group",
    desc: "Efficient volume scoring: how much offense does a player create at what efficiency? High USG × high TS = elite shot-creator. Works for both NCAA and international players. Position-percentiled (0-100).",
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
    name: "ppWA Projection Model (v2)",
    formula: "ppWA = P(Elite) × E[WA | Elite] + (1 − P(Elite)) × WA_reg",
    desc: "Two-component mixture model. WA_reg: position-stratified ElasticNet regression (L1+L2 regularization) trained on 1,784 prospects (2010–2016) with known NBA outcomes. Elite Detector: calibrated Logistic Regression predicting P(WA ≥ 10.0 = All-Star+). ppWA blends both signals — if P(Elite) is high, the player is pushed toward the expected WA of elite players (22.2 WA). Temporal CV: train 2010–2016, validate 2017–2019 (no future leakage). Validated: Spearman ρ = 0.46 (vs craftednba.com benchmark 0.373), MAR = 12.0 per class. WA tiers: Superstar ≥25, All-Star ≥10, Starter ≥4, Role Player ≥1, Replacement ≥0.",
  },
  projectionDrivers: {
    name: "Projection Drivers (SHAP Decomposition)",
    formula: "contribution_i = Σ(split gains involving feature i across all trees)",
    desc: "Per-player feature contributions computed via LightGBM's native SHAP tree decomposition (pred_contrib). For each prospect, the model's WAR prediction is broken down into the additive contribution of each of the 28 input features. The top 5 positive contributors (boosters) and top 5 negative contributors (limiters) are displayed. Strength (+++/++/+) reflects relative magnitude within the player's own top-5 drivers. Ensemble: PIE model contributions (30%) blended with xRAPM model contributions (70%) on the Wins Added scale.",
  },
  posClassification: {
    name: "Position Classification",
    formula: "pos = f(height, AST%, USG%, BLK%, 3P%) → Playmaker / Wing / Big",
    desc: "Three functional positions. Playmaker: PG-like creators (height <6'3\" or AST%>25+USG%>22). Big: true centers (height ≥6'10\"). Wing: everyone else. Stretch override: Bigs with 3P%>30+3PAr>15 → Wing. Stat override: high AST% creators regardless of height → Playmaker.",
  },
};

// ═══════════════════════════════════════════════════════════
// BADGE DEFINITIONS (Expanded — 40+ badges with International & Youth Engine)
// ═══════════════════════════════════════════════════════════
const BADGE_DEFS = {
  // ── GREEN — Elite NBA-scalable skills ──
  "Elite Shooting":         { cat:"green", rule:"3P%>40 & 3P_Freq>30% & FT%>85",       desc:"Top-tier shooting across both lines + elite volume. Most translatable skill in modern NBA. Berger (2023): FT% is the #1 predictor." },
  "Floor General":          { cat:"green", rule:"(G/W) AST/TO>2.2 & AST%>25",          desc:"Elite decision-making with vision. Creates for others without turnovers — the rarest guard/wing skill." },
  "Two-Way Wing":           { cat:"green", rule:"(W) 3P%>35 & (STL%>2.2 OR DBPM>2.0)",desc:"Shooting + perimeter defense. Most coveted role player archetype in modern NBA. Immediate starter value." },
  "Modern Rim Anchor":      { cat:"green", rule:"(B) BLK%>4.0 & DBPM>2.5",            desc:"Elite rim protection with overall defensive impact. Anchors a top-10 defense by itself." },
  "Passing Hub":              { cat:"green", rule:"(B) AST%>18 & AST/TO>1.2",            desc:"Playmaking big — Jokic/Draymond archetype. Creates from the post/elbow with low turnovers. Extremely rare." },
  "Stocks Machine":         { cat:"green", rule:"(STL%+BLK%)>4.8",                     desc:"Defensive disruption at both perimeter and rim. Historically rare combination that warps opposing offense." },
  "Magnetic Hands":         { cat:"green", rule:"ORB%>12 & DRB%>25",                   desc:"Elite rebounder on both ends of the floor. Offensive rebounds create second chances, defensive boards start transition. This player dominates the glass." },
  "Versatile Stopper":      { cat:"green", rule:"(W/B) Ht>=6'7\" & STL%>1.6 & BLK%>1.8",desc:"Length + perimeter + rim. Can guard 1-through-5 in switching schemes. Premium defensive versatility." },
  "Transition Terror":      { cat:"green", rule:"(G/W) STL%>2.5 & Dunk%>60th pctl",   desc:"Creates fast breaks via steals and finishes above the rim. Free points in transition. Fallback: STL%>2.8 & 2P%>55 (for intl without dunk data)." },
  "FT Grifter":             { cat:"green", rule:"FTr>45 & (Rim%>40th pctl OR USG%>24)",desc:"Elite at drawing fouls through contact. Free throws = free points. High FTr at volume is extremely valuable." },
  "Efficient High Usage":   { cat:"green", rule:"USG>28 & TO%<12 & TS%>58",            desc:"Handles elite volume without efficiency collapse. The 'carry' badge — this player IS the offense." },
  "High Feel Athlete":      { cat:"green", rule:"Feel>75 & Func Ath>75",               desc:"Rarest badge — elite IQ + elite athleticism. Almost always translates to NBA." },
  "Lurking Elite":          { cat:"green", rule:"USG%<20 & BPM>7.0 & TS%>62",          desc:"The Haliburton-Effect: Massively underutilized talent. Low usage masks star-level production. Efficiency explodes in a larger NBA role." },
  "Analytics Darling":      { cat:"green", rule:"BPM>8.0 & TS%>60 & USG%<22",          desc:"Maximum efficiency at moderate volume — the analytics dream. Statistical impact far exceeds perception." },
  "Efficiency Monster":     { cat:"green", rule:"eFG%>60 & AST/TO>2.0 & STL%>2.0",    desc:"Elite efficiency + elite decision-making + defensive activity. Multi-pillar excellence that guarantees NBA value." },
  "Defensive Stopper Floor":{ cat:"green", rule:"Ht>=6'8\" & STL%>2.5",                desc:"Elite steal rate at plus size. Guaranteed defensive value in any NBA lineup — switchable perimeter stopper." },
  "Glue-Guy Connector":     { cat:"green", rule:"AST/TO>2.5 & DBPM>2.0 & USG%<16",    desc:"High-end role player archetype. Connects offense without mistakes, contributes defensively. Every contender needs this." },

  // ── GREEN — International & Youth Dominance ──
  "International Prodigy":  { cat:"green", rule:"Age < Avg-1.5yr & EFF top 10 pctl",   desc:"1.5+ years younger than tournament peers while statistically dominating. Historically the strongest predictor of NBA stardom. Precociousness multiplier: 1.5x risk reduction.", icon:"globe" },
  "Pro-Ready Teen":         { cat:"green", rule:"Pro League & Age<19 & BPM>2.0",       desc:"Positive impact as a teenager in a professional men's league (ACB, EuroLeague, BBL). Physically and mentally NBA-ready before most prospects enter college.", icon:"globe" },

  // ── GREEN — Server-generated (10c pipeline) ──
  "High Feel":                { cat:"green", rule:"Feel Score > 80",                     desc:"Elite basketball IQ. Reads the game ahead of the play — AST/TO ratio, USG efficiency, and BPM all signal processing speed beyond peers." },
  "Good Defensive Baseline":       { cat:"green", rule:"Def Score > 80",                      desc:"Defensive engine. Elite combination of rim protection, steal rate, and DBPM. Anchors team defense and dictates opponent shot quality." },
  "Rim Protector":          { cat:"green", rule:"BLK% > 5.0 & Height ≥ 6'10\"",       desc:"Elite shot-blocking big. Deters drives and alters shots. The most impactful single defensive skill in basketball." },
  "Self-Creator":           { cat:"green", rule:"Box Creation Percentile > 75",             desc:"Elite offensive creator. High scoring efficiency at volume + generates scoring for teammates. Box Creation = USG×TS + Assist Creation." },
  "Swiss Army Knife":       { cat:"green", rule:"Role Versatility > 75 & 4+ roles > 50", desc:"Elite multi-role utility. Can credibly play 4+ distinct NBA roles. Coaches never have to take this player off the floor — fits every lineup." },
  "Young for Class":        { cat:"green", rule:"Age < expected for class year",         desc:"Younger than classmates. A 17-year-old Freshman, 19-year-old Junior, or any player significantly below the typical age for their class year. More development runway than peers at the same stage." },
  "Scoring Playmaker":    { cat:"green", rule:"Playmaker & USG>25 & TS%>55",         desc:"Dual-threat point guard. Scores efficiently at high volume while maintaining playmaking. The most coveted archetype in modern NBA." },

  // ── YELLOW — Potential / Swing skills ──
  "Latent Sniper":          { cat:"yellow", rule:"FT%>85 & 3P%<33",                    desc:"Elite FT% signals neuromuscular shooting consistency that hasn't yet translated to 3P range. Bayesian prior strongly favors breakout — mechanics are there, volume will follow." },
  "Latent Touch":           { cat:"yellow", rule:"FT%>80 & 3P%<32",                    desc:"Good FT% with weak 3P%. The gap suggests development potential — motor memory is trainable. Watch for improvement trajectory." },
  "Raw Project":            { cat:"yellow", rule:"Age<19.5 & IQ_Pillar<40",            desc:"Young + raw = massive development runway. IQ can be taught with reps. Physical tools are already there." },
  "Interior Engine":        { cat:"yellow", rule:"(W/B) Rim_Proxy>80th & AST%>15",     desc:"Rim pressure + playmaking from the paint. If shooting develops, this becomes a franchise cornerstone. Fallback: FTr>45 & AST%>15." },

  // ── RED — Warning signals (Bust Signals) ──
  "Spacing Killer":         { cat:"red",   rule:"(G/W) 3P%<30 & 3P_Freq<18%",           desc:"Guards/wings who don't threaten from three destroy NBA spacing. Defenders sag off, clogging paint for teammates." },
  "Efficiency Trap":        { cat:"red",   rule:"USG%>26 & TS%<52",                    desc:"High volume, low efficiency. Scoring a lot but hurting the team. Usage will drop in NBA — production collapses." },
  "Empty Calorie Scorer":   { cat:"red",   rule:"USG%>28 & TS%<52 & AST%<15",          desc:"Bust signal: Inefficient ball-dominant scorer who doesn't create for others. Volume without value — the most dangerous profile in the draft." },
  "One-Way Project":        { cat:"red",   rule:"OBPM>3.0 & DBPM<-1.5 & STL%<1.0",    desc:"Offensive hype, defensive liability. All-offense players get benched in playoff rotations when coaching tightens up." },
  "Soft Interior":          { cat:"red",   rule:"(B) FTr<22 & BLK%<2.0",               desc:"Center without physicality or rim protection. No paint presence, no foul drawing. Can't anchor a defense at any level." },
  "Non-Processing Guard":   { cat:"red",   rule:"(G) AST/TO<0.8 & TOV%>20",            desc:"Athleticism without processing speed. High turnover rate with poor assist ratios = decision-making doesn't project to NBA pace." },
  "Tunnel Vision":          { cat:"red",   rule:"(G/W) AST/TO<0.7 & USG%>22",         desc:"Ball-dominant without creating for others. NBA defenses will scheme against predictable scorers." },
  "Passive Driver":         { cat:"red",   rule:"FTr<20",                              desc:"Avoids contact entirely. Jump-shot dependent offense is hard to sustain in NBA when contested." },
  "Foul Magnet":            { cat:"red",   rule:"Fouls/40>4.8",                        desc:"Foul trouble limits minutes. Signals poor mobility, discipline, or defensive IQ at the next level." },
  "Liability Big":          { cat:"red",   rule:"(B) DRB%<15 OR BLK%<1.5",            desc:"Bigs without rebounding or rim protection are a defensive sinkhole. Can't stay on the floor in playoffs." },
  "Defensive Target":       { cat:"red",   rule:"(G) Ht<6'2\" & DBPM<-1.0",           desc:"Small guards with negative defensive impact get hunted in playoffs. Physical weakness that coaching can't fix." },
  "Non-Spacing Perimeter":  { cat:"red",   rule:"(G/W) 3P%<30 & 3P Freq<20%",         desc:"Perimeter players who don't shoot threes can't play off-ball in modern NBA. Limits lineup construction severely." },
  "All-Offense Big":        { cat:"red",   rule:"(B) BLK%<2.5 & DBPM<1.5",            desc:"Bigs without rim protection are a defensive liability at every level. Offense doesn't compensate." },
  "FT Concern":             { cat:"red",   rule:"FT%<65 & USG>25",                    desc:"Hack-a-Player target at high usage. Opposing coaches will exploit this in close games." },
  "Passive Defender":       { cat:"red",   rule:"STL%+BLK%<2.5 & PFR<2.5",            desc:"Low stocks AND low fouls = not engaging defensively. This player avoids contact on both ends — no steals, no blocks, no fouls. At the NBA level, passive defenders get targeted in pick-and-roll and isolation." },
  "Old for Class":          { cat:"red",   rule:"Age > 22.5",                          desc:"Older than typical draft prospect. Development runway is shorter; what you see is closer to the ceiling." },
  "Turnover Prone":         { cat:"red",   rule:"TO% > 25",                            desc:"Excessive turnovers at any position. Ball security is a fundamental NBA requirement that doesn't improve easily." },
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

  // GREEN badge stats: default to 0 (conservative — no badge without data)
  const ft = p.ft ?? 0, tp = p.tp ?? 0, threeF = p.threeF ?? 0;
  const astP = (p.astP ?? 0) * intlMult;
  const stlP = (p.stlP ?? 0) * intlMult * badgeStocksMult;
  const blkP = (p.blkP ?? 0) * intlMult * badgeStocksMult;
  const usg = (p.usg ?? 0) * intlMult;
  const ts = p.ts ?? 0;
  const ftr = p.ftr ?? 0, rimF = p.rimF ?? 0, rimPct = p.rimPct ?? 0;
  const dbpm = (p.dbpm ?? 0) * intlMult;
  const obpm = (p.obpm ?? 0) * intlMult;
  const bpm = (p.bpm ?? 0) * intlMult;
  const feel = p.feel ?? 0, funcAth = p.funcAth ?? 0;
  const htIn = p.htIn ?? 78, drbP = (p.drbP ?? 0) * intlMult;
  const efg = p.efg ?? (ts > 0 ? ts - 3 : 0);
  const twoPct = p.twoPct ?? (p.fg ?? 45);
  const age = p.age ?? 22;

  // RED badge stats: default to AVERAGE (missing data should NOT trigger warnings)
  const astTov = p.astTov ?? 1.5;    // avg AST/TO — missing data ≠ tunnel vision
  const toP = p.toP ?? 15;           // avg TO% — missing ≠ turnover prone
  const tovP = toP;

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
  // Floor General — Playmakers and Wings only (not Bigs — use Passing Hub)
  if ((isG || isW) && astTov > 2.2 && astP > 25)                     green.push("Floor General");
  // Two-Way Wing
  if (isW && p.tp != null && tp > 35 && (stlP > 2.2 || dbpm > 2.0))  green.push("Two-Way Wing");
  // Modern Rim Anchor
  if (isB && blkP > 4.0 && dbpm > 2.5)                              green.push("Modern Rim Anchor");
  // Passing Hub
  if (isB && astP > 18 && astTov > 1.2)                             green.push("Passing Hub");
  // Stocks Machine
  if ((stlP + blkP) > 4.8)                                          green.push("Stocks Machine");
  // Magnetic Hands — elite rebounder both ends
  if (p.orbP != null && p.drbP != null && (p.orbP ?? 0) > 12 && (p.drbP ?? 0) > 25) green.push("Magnetic Hands");
  // Versatile Stopper (with intl fallback: heavier DBPM weighting)
  if ((isW || isB) && htIn >= 79 && stlP > 1.6 && blkP > 1.8)      green.push("Versatile Stopper");
  else if (isIntl && (isW || isB) && htIn >= 79 && dbpm > 3.0)      green.push("Versatile Stopper");
  // Transition Terror (with fallback for no dunk data)
  if ((isG || isW) && p.stlP != null && stlP > 2.5 && dunkR > 8)    green.push("Transition Terror");
  else if ((isG || isW) && stlP > 2.8 && twoPct > 55)               green.push("Transition Terror");
  // FT Grifter
  if (p.ftr != null && ftr > 45 && (rimF > 25 || usg > 24))         green.push("FT Grifter");
  // Efficient High Usage
  if (p.usg != null && usg > 28 && toP < 12 && ts > 58)             green.push("Efficient High Usage");
  // High Feel Athlete
  if (feel > 75 && funcAth > 75)                                     green.push("High Feel Athlete");
  // Lurking Elite (Haliburton-Effekt)
  if (p.bpm != null && usg < 20 && bpm > 7.0 && ts > 62)            green.push("Lurking Elite");
  // Analytics Darling
  if (p.bpm != null && bpm > 8.0 && ts > 60 && usg < 22)            green.push("Analytics Darling");
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
  // Spacing Killer — only if 3P data actually exists
  if ((isG || isW) && p.tp != null && p.threeF != null && tp < 30 && threeF < 18)  red.push("Spacing Killer");
  // Efficiency Trap
  if (p.usg != null && p.ts != null && usg > 26 && ts < 52)         red.push("Efficiency Trap");
  // Empty Calorie Scorer (stricter bust signal)
  if (p.usg != null && p.ts != null && usg > 28 && ts < 52 && astP < 15)  red.push("Empty Calorie Scorer");
  // One-Way Project — only if DBPM data exists
  if (p.obpm != null && p.dbpm != null && obpm > 3.0 && dbpm < -1.5 && stlP < 1.0)  red.push("One-Way Project");
  // Soft Interior — only if FTR and BLK data exist
  if (isB && p.ftr != null && p.blkP != null && ftr < 22 && blkP < 2.0)  red.push("Soft Interior");
  // Non-Processing Guard
  if (isG && p.astTov != null && astTov < 0.8 && tovP > 20)         red.push("Non-Processing Guard");
  // Tunnel Vision
  if ((isG || isW) && p.astTov != null && astTov < 0.7 && usg > 22) red.push("Tunnel Vision");
  // Passive Scorer — only if FTR data actually exists (ftr=0 means missing, not passive)
  if (p.ftr != null && ftr > 0 && ftr < 20 && usg > 20)              red.push("Passive Driver");
  // Foul Magnet
  if ((p.fouls40 ?? 0) > 4.8)                                       red.push("Foul Magnet");
  // Liability Big — only if DRB% and BLK% data exist
  if (isB && p.drbP != null && p.blkP != null && (drbP < 15 || blkP < 1.5))  red.push("Liability Big");
  // Defensive Target (adjusted)
  if (isG && htIn < 74 && p.dbpm != null && dbpm < -1.0)            red.push("Defensive Target");
  // Non-Spacing Perimeter — guards AND wings who can't shoot
  if ((isG || isW) && p.tp != null && p.threeF != null && tp < 30 && threeF < 20)  red.push("Non-Spacing Perimeter");
  // All-Offense Big — only if BLK% and DBPM data exist
  if (isB && p.blkP != null && p.dbpm != null && blkP < 2.5 && dbpm < 1.5)  red.push("All-Offense Big");
  // FT Concern — only if FT% data exists
  if (p.ft != null && ft < 65 && usg > 25)                          red.push("FT Concern");
  // Passive Defender — low stocks + low fouls = not engaging (Session 9b)
  const stocks = (p.stlP ?? 0) + (p.blkP ?? 0);
  const fouls40 = p.fouls40 ?? 0;
  if (p.stlP != null && p.blkP != null) {
    if (stocks < 2.5 && fouls40 > 0 && fouls40 < 2.5)              red.push("Passive Defender");
    else if (stocks < 1.8 && fouls40 === 0)                         red.push("Passive Defender");
  }

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
    obpm: normPctl(d.pctl.obpm), dbpm: normPctl(d.pctl.dbpm),
    ortg: normPctl(d.pctl.ortg), astTo: normPctl(d.pctl.astTo ?? d.pctl.ast_to),
  } : {
    bpm: normPctl(d.pctl_bpm), usg: normPctl(d.pctl_usg), ts: normPctl(d.pctl_ts),
    ast: normPctl(d.pctl_ast), to: normPctl(d.pctl_to), orb: normPctl(d.pctl_orb),
    drb: normPctl(d.pctl_drb), stl: normPctl(d.pctl_stl), blk: normPctl(d.pctl_blk),
    pts36: normPctl(d.pctl_pts36), reb36: normPctl(d.pctl_reb36), ast36: normPctl(d.pctl_ast36),
    ftr: normPctl(d.pctl_ftr), efg: normPctl(d.pctl_efg),
    obpm: normPctl(d.pctl_obpm), dbpm: normPctl(d.pctl_dbpm),
    ortg: normPctl(d.pctl_ortg), astTo: normPctl(d.pctl_ast_to),
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

  // ── NORMALIZATION FUNCTIONS (must be defined before tmpP and return) ──
  const normRate = (v) => {
    if (v == null) return null;
    const n = Number(v);
    if (isNaN(n)) return null;
    return Math.round(n * 10) / 10;
  };
  const normShootPct = (v) => {
    if (v == null) return null;
    const n = Number(v);
    if (isNaN(n)) return null;
    const r = (n > 0 && n < 1) ? n * 100 : n;
    return (r > 100 || r < 0) ? null : Math.round(r * 10) / 10;
  };

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
    twoPct: normShootPct(d.two_pct ?? d.two_p_pct ?? d.twoP_per),
    fouls40:d.fouls_40??0, min:d.min??0, pts:d.pts??0, fg:d.fg_pct??0,
    source:d.source, league:d.league,
  };
  // Only compute client badges when sufficient stats are available
  // Board API only sends bpm/usg/ts/ast_p/blk_p/stl_p — NOT tp/ft/drbP/dbpm etc.
  // Without those, computeBadges defaults them to 0 → false Spacing Killer, Liability Big, etc.
  const hasDetailedStats = tmpP.bpm != null && tmpP.usg != null && tmpP.ts != null
    && (tmpP.tp != null || tmpP.ft != null) && tmpP.drbP != null;
  const computed = hasDetailedStats ? computeBadges(tmpP) : { green: [], yellow: [], red: [] };

  // Merge: server badges + client badges (dedup)
  // CRITICAL: Server badges from pipeline may have position mismatches
  // (e.g., "Floor General" for a Big, "Rim Protector" for a Playmaker)
  // Filter them through position restrictions before including
  const POS_RESTRICTED_GREEN = {
    "Floor General": ["Playmaker","Wing"], // Guards + wings (computeBadges: isG || isW)
    "Passing Hub": ["Big"],                 // Only bigs
    "Two-Way Wing": ["Wing","Playmaker"], // Not bigs
    "Rim Protector": ["Big","Wing"],      // Not playmakers
    "Good Defensive Baseline": null,             // Any position OK
    "High Feel": null, "Elite Shooting": null, "Self-Creator": null,
    "Swiss Army Knife": null, "High Feel Athlete": null, "Stocks Machine": null,
    "Scoring Playmaker": ["Playmaker"], "International Prodigy": null, "Pro-Ready Teen": null,
  };
  const POS_RESTRICTED_RED = {
    "Spacing Killer": ["Playmaker","Wing"],  // Only perimeter players
    "Tunnel Vision": ["Playmaker"],          // Only playmakers
    "Soft Interior": ["Big"],                // Only bigs
    "Non-Processing Guard": ["Playmaker"],
    "Defensive Target": ["Playmaker"],
    "Non-Spacing Perimeter": ["Playmaker","Wing"],
    "All-Offense Big": ["Big"],
    "Liability Big": ["Big"],
  };
  const filterByPos = (badges, restrictions, pos) => badges.filter(b => {
    const allowed = restrictions[b];
    if (allowed === undefined || allowed === null) return true;
    return allowed.includes(pos);
  });
  // Additional stat-validation: server badges must also pass client-side stat checks
  const statValidate = (badge) => {
    const _astP = tmpP.astP ?? 0;
    const _astTov = tmpP.astTov ?? 1.5;
    const _selfCreation = d.self_creation ?? d.self_creation_idx ?? d.self_creation_pct ?? 0;
    if (badge === "Passing Hub" && !(_astP > 18 && _astTov > 1.2)) return false;
    if (badge === "Floor General" && !(_astTov > 2.2 && _astP > 25)) return false; // matches computeBadges thresholds
    if (badge === "Self-Creator" && !(_selfCreation > 70)) return false;
    if (badge === "Tunnel Vision" && !(tmpP.astTov != null && _astTov < 0.8)) return false;
    return true;
  };
  const serverGreen = filterByPos(
    badgeList.filter(b => BADGE_DEFS[b]?.cat === "green"), // unknown badges dropped
    POS_RESTRICTED_GREEN, resolvedPos
  ).filter(statValidate);
  const serverRed = filterByPos(
    redList.filter(b => BADGE_DEFS[b]?.cat === "red"),     // unknown badges dropped
    POS_RESTRICTED_RED, resolvedPos
  ).filter(statValidate);
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
    // Box score — extended fallback chains + per-36 conversion
    pts: d.pts ?? d.college_pts ?? d.ppg ?? d.PPG ?? (d.pts36 && d.min ? Math.round(d.pts36 * d.min / 36 * 10) / 10 : null),
    reb: d.reb ?? d.college_treb ?? d.trb ?? d.treb ?? d.rpg ?? d.RPG ?? d.college_reb ?? (d.reb36 && d.min ? Math.round(d.reb36 * d.min / 36 * 10) / 10 : null),
    ast: d.ast ?? d.college_ast ?? d.apg ?? d.APG ?? (d.ast36 && d.min ? Math.round(d.ast36 * d.min / 36 * 10) / 10 : null),
    stl: d.stl ?? d.college_stl ?? d.spg ?? d.SPG ?? (d.stl36 && d.min ? Math.round(d.stl36 * d.min / 36 * 10) / 10 : null),
    blk: d.blk ?? d.college_blk ?? d.bpg ?? d.BPG ?? (d.blk36 && d.min ? Math.round(d.blk36 * d.min / 36 * 10) / 10 : null),
    astTov: d.ast_to ?? d.astTov ?? d.ast_tov ?? d.college_ast_tov ?? d["ast/tov"] ?? (() => {
      const a = d.ast ?? d.college_ast ?? d.apg;
      const t = d.tov ?? d.college_tov ?? d.topg;
      if (a != null && t != null && t > 0) return Math.round(a / t * 100) / 100;
      const ap = d.ast_p ?? d.astP; const tp2 = d.to_p ?? d.toP;
      if (ap != null && tp2 != null && tp2 > 0) return Math.round(ap / tp2 * 100) / 100;
      return null;
    })(),
    bpm: d.bpm, obpm: d.obpm, dbpm: d.dbpm, ortg: d.ortg ?? d.ORtg ?? d.offensive_rating,
    usg: normRate(d.usg ?? d.usg_p),
    ts: normShootPct(d.ts_pct ?? d.ts),
    fg: normShootPct(d.fg_pct ?? d.fg),
    efg: normShootPct(d.efg_pct ?? d.efg),
    astP: normRate(d.ast_p ?? d.astP),
    toP: normRate(d.to_p ?? d.toP),
    orbP: normRate(d.orb_p ?? d.orbP),
    drbP: normRate(d.drb_p ?? d.drbP),
    stlP: normRate(d.stl_p ?? d.stlP),
    blkP: normRate(d.blk_p ?? d.blkP),
    ft: normShootPct(d.ft_pct ?? d.ft),
    tp: normShootPct(d.tp_pct ?? d.tp),
    ftr: normRate(((v) => { const n = Number(v); return (n != null && !isNaN(n) && n > 0 && n < 2) ? n * 100 : n; })(d.ftr ?? d.ft_rate)),
    rimF: d.rim_f ?? d.rim_freq ?? d.rimF ?? d.rim_fga_pct, rimPct: d.rim_pct ?? d.rimPct ?? d.rim_fg_pct,
    midF: d.mid_f ?? d.mid_freq ?? d.midF ?? d.mid_fga_pct, midPct: d.mid_pct ?? d.midPct ?? d.mid_fg_pct,
    threeF: d.three_f ?? d.three_freq ?? d.threeF ?? d.three_fga_pct, threePar: d.three_par ?? d.threePar,
    dunkR: d.dunk_r ?? d.dunk_rate ?? d.dunkR,
    dunkPct: d.dunk_pct ?? d.dunkPct,
    fta: d.fta, ftm: d.ftm, fga: d.fga,
    selfCreation: d.creation_score ?? d.self_creation ?? d.box_creation_idx ?? d.self_creation_idx ?? 50,
    selfCreationPct: d.box_creation ?? d.self_creation_pct ?? null,
    boxScoring: d.box_scoring ?? null,
    boxAssist: d.box_assist ?? null,
    // PBP self-creation (real assisted-shot data, 2008-2026)
    pbpSelfCreation: d.self_creation_raw ?? d.overall_self_creation ?? null,
    creationScore: d.creation_score ?? null,
    modernShotProfile: d.modern_shot_profile ?? null,
    sosPctl: d.sos_pctl ?? null,
    teamQuality: d.team_quality_pctl ?? null,
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
    archetypesAll:d.archetypes_all||d.archetype||"",
    feas:{repl:d.feas_repl,rot:d.feas_rot,start:d.feas_start,allstar:d.feas_allstar,
      cleared:d.feas_cleared||"",blocker:d.feas_blocker||""},
    mu:d.pred_mu??d.mu??d.projected_pie??d.pred_mu_pie??d.aspm_adj??d.aspm,
    sigma:d.pred_sigma??d.sigma??d.mc_sigma??d.volatility,
    pNba:d.pred_p_nba??d.pNba??d.pn,
    predTier: d.v2Tier ?? d.pred_tier ?? d.predicted_tier ?? d.tier,
    ups: d.ups ?? d.ups_raw,
    // ppWA = Projected Peak Wins Added (Model v2: ElasticNet + Elite Detector)
    ppwa: d.ppwa ?? null,
    pElite: d.pElite ?? null,
    waFloor: d.waFloor ?? null,
    waCeiling: d.waCeiling ?? null,
    waSigma: d.waSigma ?? d.v2_sigma ?? null,
    v2Conf: d.v2Conf ?? null,
    v2TierProbs: d.v2TierProbs ?? null,  // %-scale already: {Superstar:30.9, All-Star:41.8, ...}
    v2Boosters: d.v2Boosters ?? null,
    v2Limiters: d.v2Limiters ?? null,
    war: d.ppwa ?? d.war ?? d.projected_war ?? d.war_score ?? null,
    humble: d.humble ?? d.f_humble ?? d.hmb ?? null,
    aspm: d.aspm ?? d.aspm_adj,
    production: d.production ?? d.prod,
    impact: d.impact,
    careerPath: d.career_path ?? d.path ?? "NBA",
    // Tier probabilities: v2TierProbs is already %-scale from new model
    // Fall back to prob_* fields (×100 for %) from the legacy model
    tiers: d.v2TierProbs ? d.v2TierProbs : {
      Superstar:((d.prob_super??d.prob_superstar??d.probs?.superstar??0)*100),
      "All-Star":((d.prob_allstar??d.probs?.allstar??0)*100),
      Starter:((d.prob_starter??d.probs?.starter??0)*100),
      "Role Player":((d.prob_role??d.prob_roleplayer??d.probs?.roleplayer??0)*100),
      Replacement:((d.prob_repl??d.prob_replacement??d.probs?.replacement??0)*100),
      "Negative":((d.prob_neg??d.prob_negative??d.prob_never??d.probs?.out??0)*100),
    },
    ceiling: d.ceiling, floor: d.floor, volatility: d.volatility ?? d.mc_sigma,
    badges: allGreen, redFlags: allRed, yellowBadges: allYellow,
    btUrl:d.bt_url, btTeamUrl:d.bt_team_url,
    actual:d.tier, peakPie:d.peak_pie??d.nba_peak_actual, nbaName:d.nba_name||"",
    madeNba:d.made_nba, draftYear:d.draftYear??d.draft_year, draftPick:d.draft_pick,
    classRank: d.classRank ?? null,
    intlTier: d.intlTier ?? null,
    intlTierProbs: d.intlTierProbs ?? null,
    actualIntlLeague:  d.actualIntlLeague  ?? null,
    actualIntlTier:    d.actualIntlTier    ?? null,
    actualIntlLeagues: d.actualIntlLeagues ?? null,
    confidence:d.confidence||"full", sampleMin:d.sample_min, sampleGp:d.sample_gp,
    source: d.source ?? "ncaa",
    // Session 9: per-player feature contribution drivers
    projectionBoosters: d.projection_boosters ?? d.proj_boost ?? "",
    projectionLimiters: d.projection_limiters ?? d.proj_limit ?? "",
    statComps:[], anthroComps:[], hasCombine: null, seasonLines: d.seasonLines || [],
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
      <Sec icon="▦" title="Box Score" sub={p.gp ? `${p.gp} GP · ${fmt(p.min)} MIN/G — Traditional counting stats. Look for per-minute efficiency, not raw totals.` : (p.yr && p.yr <= 2009 ? "Per-game counting stats unavailable for 2008-2009 BartTorvik data. Advanced stats shown below." : "Game data unavailable for this player.")}>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
          {[["PTS",p.pts,p.pctl?.pts36],["REB",p.reb,p.pctl?.reb36],["AST",p.ast,p.pctl?.ast36],
            ["STL",p.stl,p.pctl?.stl],["BLK",p.blk,p.pctl?.blk],["A/TO",p.astTov,p.pctl?.astTo],["FTR",p.ftr,p.pctl?.ftr],["TO%",p.toP,p.pctl?.to]
          ].map(([l,v,pc])=><StatCell key={l} label={l} val={v} pctl={pc}/>)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" style={{color:"#6b7280"}}>
          <span>Efficiency:</span>
          {[["TS%",p.ts,p.pctl?.ts],["FG%",p.fg,null],["3P%",p.tp,null],["FT%",p.ft,null],["eFG%",p.efg,null]].map(([l,v,pc])=>(
            <span key={l} className="px-2 py-0.5 rounded" style={{background:valBg(pc),color:pc?valColor(pc):"#e5e7eb"}}>{l} {fmt(v)}</span>
          ))}
        </div>
      </Sec>
      <Sec icon="⚡" title="Advanced" sub="Rate stats that capture efficiency and impact independent of role. BPM and ORtg are the strongest NBA translation signals.">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {[["BPM",p.bpm,p.pctl?.bpm],["OBPM",p.obpm,p.pctl?.obpm],["DBPM",p.dbpm,p.pctl?.dbpm],["ORtg",p.ortg,p.pctl?.ortg],
            ["USG%",p.usg,p.pctl?.usg],["TS%",p.ts,p.pctl?.ts],["AST%",p.astP,p.pctl?.ast],["TO%",p.toP,p.pctl?.to],
            ["ORB%",p.orbP,p.pctl?.orb],["DRB%",p.drbP,p.pctl?.drb],["STL%",p.stlP,p.pctl?.stl],["BLK%",p.blkP,p.pctl?.blk]
          ].map(([l,v,pc])=><StatCell key={l} label={l} val={v} pctl={pc}/>)}
        </div>
      </Sec>

      {/* ═══ TIER FEASIBILITY — Each metric on its own row ═══ */}
      <Sec icon="📊" title={`vs. NBA ${compTier} (${p.pos})`} sub="How does this prospect's statistical profile compare against the p25-p75 corridor of actual NBA players at this tier? Shadow bars show the typical range. Green = within range, Yellow = compensated by elite core skill, Red = critical gap.">
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
                    const maxV = Math.max(m.val||0, Math.max(m.p25,m.p75)) * 1.2;
                    const toX = v => Math.max(0, Math.min(100, (v / maxV) * 100));
                    return (
                      <div key={m.id}>
                        <Tip block wide content={
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
  // Safety: catch rendering errors to prevent page crash
  if (!p) return <div className="p-6 text-center" style={{color:"#6b7280"}}>No player data</div>;
  try {
  const isIntl = p.source && p.source !== "ncaa";
  const norm = (v) => {
    if (v == null || v === "" || v === "—") return null;
    const n = Number(v); if (isNaN(n)) return null;
    if (n > 0 && n < 1 && n !== 0) return Math.round(n * 1000) / 10;
    return Math.round(n * 10) / 10;
  };
  const normPct = (v) => {
    const n = norm(v); if (n == null) return null;
    // Values 0-1 are ratios (0.605 = 60.5%, 1.0 = 100%). Convert.
    // Safe: no shooting pct is legitimately < 2% as a percentage
    if (n > 0 && n <= 1.0) return Math.round(n * 1000) / 10;
    if (n > 100) return Math.round(n / 10) / 10;
    return n;
  };
  const rimPct = normPct(p.rimPct), midPct = normPct(p.midPct), tp = normPct(p.tp), ft = normPct(p.ft);
  const efg = normPct(p.efg), ftr = norm(p.ftr), ts = normPct(p.ts);
  const twoPct = normPct(p.twoPct);
  const rimF = norm(p.rimF), midF = norm(p.midF), threeF = norm(p.threeF), dunkR = norm(p.dunkR);
  const dunkPct = normPct(p.dunkPct);
  const hasRim = rimF != null && rimF > 0, hasMid = midF != null && midF > 0;
  const hasDunk = dunkR != null && dunkR > 0, hasTracking = hasRim || hasMid;
  const useSimplifiedCourt = !hasTracking;

  const gp = p.gp ?? 0;
  const rawFga = p.fga ?? null;
  const estFgaPG = (p.pts && ts && ts > 0) ? p.pts / (2 * ts / 100) : null;
  const totalFga = rawFga ? (rawFga > 50 ? Math.round(rawFga) : Math.round(rawFga * gp)) : (estFgaPG && gp ? Math.round(estFgaPG * gp) : null);
  const rawFta = p.fta ?? null;
  const ftaPerGame = rawFta && gp > 0 ? (rawFta > 50 ? rawFta / gp : rawFta) : null;
  const totalFta = (ftaPerGame != null && ftaPerGame < 15)
    ? Math.round(ftaPerGame * gp)
    : (ftr != null && totalFga ? Math.round(ftr / 100 * totalFga) : null);
  const totalShots = (totalFga || 0) + (totalFta || 0);

  const zoneAtt = (freq) => (freq != null && totalFga) ? Math.round(totalFga * freq / 100) : null;
  const zoneMade = (freq, pct) => (freq != null && pct != null && totalFga) ? Math.round(totalFga * freq / 100 * pct / 100) : null;

  // ── Shot zone attempts ──
  const rimAtt = zoneAtt(rimF), dunkAtt = zoneAtt(dunkR), midAtt = zoneAtt(midF), threeAtt = zoneAtt(threeF);

  // ── 2P/3P/FT split for simplified court ──
  let threePA = threeAtt ?? (totalFga && threeF ? Math.round(totalFga * threeF / 100) : null);
  let twoPA = totalFga && threePA != null ? totalFga - threePA : null;
  let dietFta = totalFta; // may be overridden by estimate for diet bars

  // Fallback: estimate from PPG and shooting splits when no raw counts
  if (useSimplifiedCourt && twoPA == null && tp != null && p.pts && gp > 0) {
    const estThreeRate = tp > 35 ? 0.40 : tp > 30 ? 0.30 : 0.20;
    const estFgaPG2 = p.pts / (2 * (ts || 52) / 100);
    const est3pa = Math.round(estFgaPG2 * estThreeRate * gp);
    const est2pa = Math.round(estFgaPG2 * (1 - estThreeRate) * gp);
    if (est3pa > 0 && est2pa > 0) {
      threePA = est3pa;
      twoPA = est2pa;
    }
    // Estimate FTA from FT% and approximate FT scoring share (~25% of points)
    if (!dietFta && ft != null && p.pts) {
      const estFtPoints = p.pts * 0.25;
      dietFta = Math.round(estFtPoints / ((ft || 75) / 100) * gp);
    }
  }
  const twoPMade = twoPA != null && twoPct != null ? Math.round(twoPA * twoPct / 100) : null;
  const threePMade = threePA != null && tp != null ? Math.round(threePA * tp / 100) : null;
  const ftMade = dietFta != null && ft != null ? Math.round(dietFta * ft / 100) : null;

  // ── Shot diet percentages ──
  const estTotalShots = totalShots > 0 ? totalShots : ((twoPA||0) + (threePA||0) + (dietFta||0));
  const rimPctOfTotal = estTotalShots > 0 && rimAtt != null ? Math.round(rimAtt / estTotalShots * 1000) / 10 : null;
  const dunkPctOfTotal = estTotalShots > 0 && dunkAtt != null ? Math.round(dunkAtt / estTotalShots * 1000) / 10 : null;
  const midPctOfTotal = estTotalShots > 0 && midAtt != null ? Math.round(midAtt / estTotalShots * 1000) / 10 : null;
  const threePctOfTotal = estTotalShots > 0 && threePA != null ? Math.round(threePA / estTotalShots * 1000) / 10 : null;
  const ftPctOfTotal = estTotalShots > 0 && dietFta != null ? Math.round(dietFta / estTotalShots * 1000) / 10 : null;
  const twoPctOfTotal = estTotalShots > 0 && twoPA != null ? Math.round(twoPA / estTotalShots * 1000) / 10 : null;

  // ── Self-creation: PBP real data (preferred) or Box Creation fallback ──
  const hasPbpCreation = p.pbpSelfCreation != null && p.pbpSelfCreation > 0;
  const selfCreationRaw = hasPbpCreation ? p.pbpSelfCreation : null;
  const selfCreationScore = hasPbpCreation
    ? p.pbpSelfCreation
    : (p.box_creation ?? p.selfCreationPct ?? ((p.usg ?? 20) * (ts ?? 52) / 100));
  const selfCreationLabel = hasPbpCreation
    ? (selfCreationRaw > 65 ? "Elite Creator" : selfCreationRaw > 50 ? "Good Creator" : selfCreationRaw > 35 ? "Average" : "Assisted Scorer")
    : (selfCreationScore > 25 ? "Elite" : selfCreationScore > 18 ? "Good" : selfCreationScore > 12 ? "Average" : "Low");
  const creationPctl = p.creationScore ?? p.selfCreation ?? null;

  // ── Touch prior + Bayesian ──
  const hasMidData = midPct != null;
  const midForPrior = midPct ?? (twoPct ? twoPct * 0.6 : null);
  // When no midrange data (intl/08-09): FT%-heavy prior (absorbs mid weight)
  const touchPrior = p.projPrior ?? (hasMidData
    ? ((0.20 + 0.18 * (ft ?? 75) / 100 + 0.05 * (midForPrior) / 100) * 100)
    : ((0.22 + 0.22 * (ft ?? 75) / 100) * 100));  // FT-only prior
  const projNba3p = p.projNba3p ?? (() => {
    if (ft == null) return null;
    const mu0 = hasMidData
      ? 0.20 + 0.18 * (ft / 100) + 0.05 * (midForPrior / 100)
      : 0.22 + 0.22 * (ft / 100);  // FT-only prior (no midrange data)
    const kappa = 200;
    const est3PA = threePA || (threeF != null && estFgaPG ? Math.round(estFgaPG * gp * threeF / 100) : 50);
    const est3PM = tp != null ? Math.round(est3PA * tp / 100) : Math.round(est3PA * mu0);
    return Math.round(((kappa * mu0 + est3PM) / (kappa + est3PA)) * 1000) / 10;
  })();

  const tierPosFga = {
    "Superstar":{Playmaker:19.5,Wing:18.5,Big:15.0}, "All-Star":{Playmaker:16.5,Wing:15.5,Big:13.0},
    "Starter":{Playmaker:13.5,Wing:13.0,Big:11.0}, "Role Player":{Playmaker:11.0,Wing:10.5,Big:9.0},
    "Replacement":{Playmaker:9.0,Wing:8.5,Big:7.5},
  };
  const bestTier = p.predTier || "Starter";
  const projFGA = (tierPosFga[bestTier]||tierPosFga["Starter"])[p.pos] || 13;
  const proj3PAr = threeF != null ? Math.min(55, Math.round(threeF * 0.85 + (ft > 80 ? 3 : 0) + 5)) : null;
  const projNba3pa = proj3PAr != null ? Math.round(projFGA * proj3PAr / 100 * 10) / 10 : null;

  const sc = (pct, type) => {
    if (pct == null) return "#6b7280";
    if (type==="3pt") return pct>38?"#22c55e":pct>34?"#86efac":pct>30?"#fbbf24":"#ef4444";
    if (type==="ft") return pct>80?"#22c55e":pct>72?"#86efac":pct>65?"#fbbf24":"#ef4444";
    if (type==="mid"||type==="2pt") return pct>50?"#22c55e":pct>45?"#86efac":pct>40?"#fbbf24":"#ef4444";
    if (type==="rim") return pct>65?"#22c55e":pct>58?"#86efac":pct>50?"#fbbf24":"#ef4444";
    return "#e5e7eb";
  };

  // ═══ DIET BAR COMPONENT ═══
  const DietBar = ({label, color, pctOfTotal, children}) => (
    pctOfTotal != null && pctOfTotal > 0 ? (
      <div>
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-sm font-semibold" style={{color}}>{label} {children||""}</span>
          <span className="text-sm font-bold" style={{color:"#e5e7eb"}}>{fmt(pctOfTotal,1)}%</span>
        </div>
        <div className="h-8 rounded-lg overflow-hidden" style={{background:"#1f2937"}}>
          <div className="h-full rounded-lg flex items-center pl-2" style={{width:`${Math.max(4,pctOfTotal)}%`,background:`linear-gradient(90deg,${color}55,${color})`}}>
            {pctOfTotal>12&&<span className="text-xs font-bold text-white">{fmt(pctOfTotal,0)}%</span>}
          </div>
        </div>
      </div>
    ) : null
  );

  return (
    <div className="space-y-5">
      {useSimplifiedCourt && (
        <div className="p-3 rounded-lg text-sm" style={{background:"#1e3a5f33",border:"1px solid #3b82f644",color:"#93c5fd"}}>
          {isIntl ? "International prospect" : "Pre-2010 NCAA"} — shot-type tracking (rim/mid/dunk) not available. Showing 2P/3P/FT split.
        </div>
      )}

      <Sec icon="🏀" title="3.5 Level Scoring" sub="Accuracy, volume (made-att), and shot diet per zone">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* ══ COURT ══ */}
          <div className="lg:col-span-3 mx-auto w-full" style={{maxWidth:580}}>
            {useSimplifiedCourt ? (
              /* ── SIMPLIFIED COURT: 2P / 3P / FT ── */
              <svg viewBox="0 0 580 460" className="w-full" style={{minHeight:360}}>
                <rect x="0" y="0" width="580" height="460" rx="12" fill="#0d1117"/>
                <line x1="15" y1="15" x2="565" y2="15" stroke="#1f2937" strokeWidth="2.5"/>
                <path d="M 62 15 L 62 110 A 235 235 0 0 0 518 110 L 518 15" fill="none" stroke="#3b82f644" strokeWidth="2.5"/>
                <rect x="175" y="15" width="230" height="250" fill="none" stroke="#1f2937" strokeWidth="2" rx="3"/>
                <circle cx="290" cy="265" r="78" fill="none" stroke="#1f293744" strokeWidth="1.5"/>
                <line x1="175" y1="265" x2="405" y2="265" stroke="#8b5cf644" strokeWidth="2" strokeDasharray="8,4"/>
                <circle cx="290" cy="50" r="22" fill="none" stroke="#ef444466" strokeWidth="2.5"/>
                <line x1="266" y1="25" x2="314" y2="25" stroke="#6b7280" strokeWidth="4"/>
                {/* 2-POINT (inside arc) */}
                <g>
                  <text x="290" y="80" textAnchor="middle" fill="#f97316" style={{fontSize:16,fontWeight:"bold"}}>2-POINT</text>
                  <text x="290" y="115" textAnchor="middle" fill={sc(twoPct,"2pt")} style={{fontSize:32,fontWeight:"bold"}}>{twoPct!=null?`${fmt(twoPct)}%`:"—"}</text>
                  {twoPMade!=null&&twoPA!=null&&<text x="290" y="138" textAnchor="middle" fill="#9ca3af" style={{fontSize:13}}>{twoPMade}-{twoPA} FGA</text>}
                </g>
                {/* FREE THROW */}
                <g>
                  <text x="290" y="210" textAnchor="middle" fill="#8b5cf6" style={{fontSize:13,fontWeight:"bold"}}>FREE THROW</text>
                  <text x="290" y="240" textAnchor="middle" fill={sc(ft,"ft")} style={{fontSize:24,fontWeight:"bold"}}>{ft!=null?`${fmt(ft)}%`:"—"}</text>
                  {ftMade!=null&&dietFta!=null&&<text x="290" y="260" textAnchor="middle" fill="#9ca3af" style={{fontSize:12}}>{ftMade}-{dietFta} FTA{dietFta!==totalFta?" (est)":""}</text>}
                </g>
                {/* 3-POINT (outside arc) */}
                <g opacity={tp!=null?1:0.3}>
                  <text x="290" y="355" textAnchor="middle" fill="#3b82f6" style={{fontSize:16,fontWeight:"bold"}}>3-POINT</text>
                  <text x="290" y="390" textAnchor="middle" fill={sc(tp,"3pt")} style={{fontSize:32,fontWeight:"bold"}}>{tp!=null?`${fmt(tp)}%`:"—"}</text>
                  {threePMade!=null&&threePA!=null&&<text x="290" y="413" textAnchor="middle" fill="#9ca3af" style={{fontSize:13}}>{threePMade}-{threePA} 3PA</text>}
                </g>
              </svg>
            ) : (
              /* ── FULL COURT: @Rim / Dunks / Mid / FT / 3P ── */
              <svg viewBox="0 0 580 460" className="w-full" style={{minHeight:360}}>
                <rect x="0" y="0" width="580" height="460" rx="12" fill="#0d1117"/>
                <line x1="15" y1="15" x2="565" y2="15" stroke="#1f2937" strokeWidth="2.5"/>
                <path d="M 62 15 L 62 110 A 235 235 0 0 0 518 110 L 518 15" fill="none" stroke="#3b82f644" strokeWidth="2.5"/>
                <rect x="175" y="15" width="230" height="250" fill="none" stroke="#1f2937" strokeWidth="2" rx="3"/>
                <circle cx="290" cy="265" r="78" fill="none" stroke="#1f293744" strokeWidth="1.5"/>
                <line x1="175" y1="265" x2="405" y2="265" stroke="#8b5cf644" strokeWidth="2" strokeDasharray="8,4"/>
                <circle cx="290" cy="50" r="22" fill="none" stroke="#ef444466" strokeWidth="2.5"/>
                <line x1="266" y1="25" x2="314" y2="25" stroke="#6b7280" strokeWidth="4"/>
                {/* @RIM */}
                <g opacity={hasRim?1:0.3}>
                  <text x="155" y="42" textAnchor="middle" fill="#f97316" style={{fontSize:12,fontWeight:"bold"}}>@RIM</text>
                  <text x="155" y="68" textAnchor="middle" fill={sc(rimPct,"rim")} style={{fontSize:22,fontWeight:"bold"}}>{rimPct!=null?`${fmt(rimPct)}%`:"N/A"}</text>
                  {rimAtt!=null&&<text x="155" y="86" textAnchor="middle" fill="#9ca3af" style={{fontSize:11}}>{zoneMade(rimF,rimPct)||"?"}-{rimAtt} FGA</text>}
                </g>
                {/* DUNKS */}
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
            )}
          </div>

          {/* ══ SHOT DIET ══ */}
          <div className="lg:col-span-2">
            <div className="text-xs uppercase tracking-wider mb-2 font-semibold" style={{color:"#6b7280"}}>Shot Diet (% of all shots · FGA+FTA)</div>
            {estTotalShots > 0 ? (
              <div className="space-y-3">
                {useSimplifiedCourt ? (
                  /* Simplified: 2P / 3P / FT */
                  <>
                    <DietBar label="2-Point" color="#f97316" pctOfTotal={twoPctOfTotal}/>
                    <DietBar label="3-Point" color="#3b82f6" pctOfTotal={threePctOfTotal}/>
                    <DietBar label="Free Throws" color="#8b5cf6" pctOfTotal={ftPctOfTotal}/>
                  </>
                ) : (
                  /* Full: Rim(+dunks) / Mid / 3P / FT */
                  <>
                    {rimPctOfTotal != null && (
                      <div>
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="text-sm font-semibold" style={{color:"#f97316"}}>@Rim <span style={{color:"#ef4444",fontSize:11}}>(incl. {dunkPctOfTotal!=null?`${fmt(dunkPctOfTotal,0)}%`:""} dunks)</span></span>
                          <span className="text-sm font-bold" style={{color:"#e5e7eb"}}>{fmt(rimPctOfTotal,1)}%</span>
                        </div>
                        <div className="h-8 rounded-lg overflow-hidden relative" style={{background:"#1f2937"}}>
                          <div className="absolute top-0 bottom-0 rounded-l-lg" style={{left:0,width:`${rimPctOfTotal}%`,background:"linear-gradient(90deg,#f9731655,#f97316aa)"}}/>
                          {dunkPctOfTotal!=null&&<div className="absolute top-0 bottom-0 rounded-l-lg" style={{left:0,width:`${dunkPctOfTotal}%`,background:"linear-gradient(90deg,#ef4444aa,#ef4444dd)"}}/>}
                          <div className="absolute inset-0 flex items-center pl-2 text-xs font-bold text-white">
                            {dunkPctOfTotal!=null&&dunkPctOfTotal>4&&<span className="mr-1" style={{color:"#fecaca"}}>{fmt(dunkPctOfTotal,0)}🏀</span>}
                            {rimPctOfTotal>15&&<span>{fmt(rimPctOfTotal,0)}%</span>}
                          </div>
                        </div>
                      </div>
                    )}
                    <DietBar label="Mid-Range" color="#fbbf24" pctOfTotal={midPctOfTotal}/>
                    <DietBar label="3-Point" color="#3b82f6" pctOfTotal={threePctOfTotal}/>
                    <DietBar label="Free Throws" color="#8b5cf6" pctOfTotal={ftPctOfTotal}/>
                  </>
                )}
                <div className="text-xs mt-1" style={{color:"#4b5563"}}>{estTotalShots > 0 ? `${estTotalShots} total shots` : "Shot volume unknown"}{estTotalShots > 0 && useSimplifiedCourt ? " (estimated)" : estTotalShots > 0 ? ` (${totalFga||"?"} FGA + ${totalFta||"?"} FTA)` : ""}</div>
              </div>
            ) : (
              <div className="py-6 text-center rounded-lg" style={{background:"#0d1117",color:"#6b7280"}}>
                <div className="text-sm mb-1">No shot distribution data</div>
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-6 text-sm" style={{color:"#9ca3af"}}>
          <Tip content={<div>True Shooting % — PTS / (2 × FGA + 0.44 × FTA).</div>}>
            <span className="cursor-help">TS%: <strong style={{color:sc(ts,"ft")}}>{ts!=null?fmt(ts):"—"}</strong></span>
          </Tip>
                    <Tip content={<div>{hasPbpCreation
            ? <>Self-Creation Rate (PBP). Percentage of made shots that were unassisted — higher means more shots created off the dribble. Based on real play-by-play assisted shot tracking data (2008-2026). Elite: &gt;65%, Good: 50-65%, Average: 35-50%.</>
            : <>Box Creation (Ben Taylor). Scoring Creation (USG×TS) + Assist Creation. Measures total offensive creation. Elite: &gt;25, Good: 18-25, Average: 12-18.</>
          }</div>}>
            <span className="cursor-help">{hasPbpCreation ? "Self-Creation" : "Box Creation"}: <strong style={{color: hasPbpCreation
              ? (selfCreationRaw > 65 ? "#22c55e" : selfCreationRaw > 50 ? "#86efac" : selfCreationRaw > 35 ? "#fbbf24" : "#ef4444")
              : (selfCreationScore > 25 ? "#22c55e" : selfCreationScore > 18 ? "#f97316" : selfCreationScore > 12 ? "#fbbf24" : "#ef4444")
            }}>{hasPbpCreation ? fmt(selfCreationRaw) + "%" : fmt(selfCreationScore)}</strong> <span style={{color:"#4b5563"}}>({selfCreationLabel})</span>
            {creationPctl != null && <span style={{color:"#475569"}}> · Pctl: {Math.round(creationPctl)}</span>}
            </span>
          </Tip>
        </div>
      </Sec>

      {/* ═══ NBA SHOOTING PROJECTION ═══ */}
      <Sec icon="🔮" title="NBA Shooting Projection" sub={isIntl||useSimplifiedCourt?"Bayesian priors using FT% as primary shooting touch signal (no midrange data available)":"Bayesian Beta-Binomial model (Berger 2022) — FT% + midrange touch predict NBA 3P translation"}>
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
            <span style={{color:"#6b7280"}}>{hasMidData
              ? <>Touch Prior: FT% (<span style={{color:"#8b5cf6"}}>{ft!=null?fmt(ft):"—"}</span>) × 0.18 + Mid% (<span style={{color:"#fbbf24"}}>{fmt(midForPrior)}</span>) × 0.05 + 0.20</>
              : <>Touch Prior (FT-only): FT% (<span style={{color:"#8b5cf6"}}>{ft!=null?fmt(ft):"—"}</span>) × 0.22 + 0.22 <span style={{color:"#475569"}}>(no midrange data)</span></>
            } = <span className="font-bold" style={{color:touchPrior>37?"#22c55e":"#fbbf24"}}>{fmt(touchPrior)}%</span> <span style={{color:"#475569"}}>ⓘ</span></span>
          </Tip>
        </div>
      </Sec>
    </div>
  );
  } catch(e) {
    console.error("ShootingTab render error:", e);
    return <div className="p-6 text-center rounded-xl" style={{background:"#111827",color:"#ef4444"}}>
      <div className="text-lg font-bold mb-2">Shooting data error</div>
      <div className="text-sm" style={{color:"#6b7280"}}>Could not render shooting profile. This player may have incomplete shooting data. Error: {String(e?.message||e)}</div>
    </div>;
  }
}
function ProjectionTab({p}) {
  if (!p) return null;
  // Prefer v2TierProbs (new model, %-scale already) over legacy prob_* fields
  const v2Probs = p.v2TierProbs || null;
  const tiers = v2Probs || p.tiers || {};
  const tierOrder = ["Superstar","All-Star","Starter","Role Player","Replacement","Negative"];

  // P(NBA) scaling: tier probs from v2TierProbs are CONDITIONAL on NBA career.
  // For low-probability prospects we scale each bar by P(NBA) and add a "Non-NBA" bar,
  // so the chart reflects true unconditional career outcome probabilities.
  // Never scale for players who already made the NBA (madeNba=true).
  const pNba = p.pNba != null ? p.pNba
    : (p.pElite != null ? Math.min(0.95, p.pElite + 0.25) : null); // rough fallback
  const showNonNba = !p.madeNba && pNba != null && pNba < 0.80;
  const nbaScale  = showNonNba ? pNba : 1.0;

  const tierData = [
    ...tierOrder.map(t => ({
      name: t.replace("Role Player","Role"),
      pct:  Math.round((tiers[t] || 0) * nbaScale * 10) / 10,
      fill: TC[t] || "#374151",
      isNonNba: false,
    })),
    ...(showNonNba ? [{
      name: "Non-NBA",
      pct:  Math.round((1 - pNba) * 100 * 10) / 10,
      fill: "#374151",
      isNonNba: true,
    }] : []),
  ];
  // ppWA (v2 model) — primary metric; fallback to legacy war
  const ppwa = p.ppwa;
  const pElite = p.pElite;
  const waFloor = p.waFloor;
  const waCeiling = p.waCeiling;
  const war = ppwa ?? p.war;
  const sigma = p.sigma ?? p.volatility ?? 0;
  const predTier = p.predTier || "—";
  const bestTierPct = Math.max(...tierOrder.map(t => tiers[t]||0));

  // Key model inputs
  const drivers = [
    {label:"BPM", val:p.bpm, desc:"Box Plus/Minus — strongest single predictor of NBA value", color:p.bpm>8?"#22c55e":p.bpm>4?"#86efac":p.bpm>0?"#fbbf24":"#ef4444"},
    {label:"Age", val:p.age, desc:"Younger = more development runway. Age <20 gets bonus, >22 gets penalty", color:p.age!=null?(p.age<20?"#22c55e":p.age<21?"#86efac":p.age<22?"#fbbf24":"#f97316"):"#6b7280"},
    {label:"Conference", val:p.confTier||p.conf, desc:"Conference/league strength (empirical weights from bridge players)", color:p.confTier==="Power"?"#22c55e":"#f97316", isText:true},
    {label:"TS%", val:p.ts, desc:"Shooting efficiency — translates directly to NBA value", color:p.ts>58?"#22c55e":p.ts>54?"#86efac":p.ts>50?"#fbbf24":"#ef4444"},
    {label:"Height", val:p.htIn ? `${Math.floor(p.htIn/12)}'${p.htIn%12}"` : null, desc:"Physical profile — size at position affects projection", color:"#9ca3af", isText:true},
    {label:"USG%", val:p.usg, desc:"Usage rate — production volume signal", color:p.usg>25?"#22c55e":p.usg>20?"#86efac":"#fbbf24"},
  ].filter(d => d.val != null);

  // ppWA color scale (Wins Added thresholds)
  const warColor = war >= 25 ? "#fbbf24" : war >= 10 ? "#f97316" : war >= 4 ? "#3b82f6" : war >= 1 ? "#06b6d4" : war > 0 ? "#8b5cf6" : "#6b7280";

  // Confidence (v2Conf from model, fallback to legacy)
  const rawConf = p.v2Conf || p.confidence;
  const confLabel = rawConf === "High" || rawConf === "full" ? "High" : rawConf === "Medium" || rawConf === "medium" ? "Medium" : rawConf === "Low" || rawConf === "insufficient" ? "Low" : "—";
  const confColor = confLabel === "High" ? "#22c55e" : confLabel === "Medium" ? "#fbbf24" : "#ef4444";

  return (
    <div className="space-y-5">
      {/* ═══ ppWA PROJECTION — Hero Card ═══ */}
      <div className="rounded-2xl p-6 text-center relative overflow-hidden" style={{background:"linear-gradient(135deg,#0d1117 0%,#111827 100%)",border:`1px solid ${warColor}33`}}>
        <div className="absolute top-0 right-0 w-48 h-48 opacity-5 blur-3xl rounded-full" style={{background:`radial-gradient(circle,${warColor},transparent)`}}/>
        <div className="relative">
          <Tip wide content={<div>
            <div className="font-bold mb-2" style={{color:"#f97316"}}>ppWA — Projected Peak Wins Added</div>
            <div className="mb-2" style={{color:"#cbd5e1"}}>
              <strong>Formula:</strong> ppWA = P(Elite) × E[WA|Elite] + (1−P(Elite)) × WA_reg
            </div>
            <div className="mb-2" style={{color:"#9ca3af",fontSize:"0.85em"}}>
              Two-component mixture: a regularized regression (WA_reg) combined with a calibrated Elite Detector that estimates the probability of reaching All-Star level (WA ≥ 10). If elite probability is high, the projection is pushed toward the average WA of elite players (22.2 WA).
            </div>
            <div style={{color:"#6b7280",fontSize:"0.8em"}}>
              Trained on 1,784 prospects (2010–2016) · Validated on 2017–2019 holdout · Spearman ρ = 0.46 (craftednba.com baseline: 0.373) · WA tiers: Superstar ≥25, All-Star ≥10, Starter ≥4, Role ≥1
            </div>
          </div>}>
            <div className="cursor-help">
              <div className="text-xs uppercase tracking-widest mb-2" style={{color:"#6b7280"}}>Projected Peak Wins Added <span style={{color:"#475569"}}>ⓘ</span></div>
              <div className="text-6xl font-bold mb-1" style={{color:warColor,fontFamily:"'Oswald',sans-serif"}}>{war != null ? fmt(war,1) : "—"}</div>
              {pElite != null && (
                <div className="mt-2 text-sm font-semibold" style={{color: pElite >= 0.5 ? "#f97316" : pElite >= 0.25 ? "#fbbf24" : "#6b7280"}}>
                  P(All-Star+): {(pElite * 100).toFixed(0)}%
                </div>
              )}
            </div>
          </Tip>
          <div className="flex justify-center gap-6 mt-4">
            <div className="text-center">
              <div className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Predicted Tier</div>
              <div className="text-lg font-bold mt-0.5" style={{color:TC[predTier]||"#6b7280"}}>{predTier}</div>
            </div>
            <div className="text-center">
              <div className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Career Path</div>
              <div className="text-lg font-bold mt-0.5" style={{color:"#22c55e"}}>{p.careerPath || "NBA"}</div>
            </div>
            <div className="text-center">
              <div className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Confidence</div>
              <div className="text-lg font-bold mt-0.5" style={{color:confColor}}>{confLabel}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ TIER DISTRIBUTION ═══ */}
      <Sec icon="◆" title="Tier Distribution"
        sub={showNonNba
          ? `Unconditional career outcome distribution — NBA tier bars scaled by P(NBA) ${(pNba*100).toFixed(0)}%. "Non-NBA" covers G League, international, or out of pro ball.`
          : "What career outcome is most likely? Probabilities derived from the ppWA Gaussian distribution (v2 model). Tier thresholds: Superstar ≥25 WA · All-Star ≥10 · Starter ≥4 · Role Player ≥1."}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={tierData} margin={{top:5,right:5,bottom:5,left:5}}>
            <XAxis dataKey="name" tick={{fill:"#9ca3af",fontSize:11}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:"#6b7280",fontSize:11}} axisLine={false} tickLine={false} domain={[0,Math.max(50,...tierData.map(t=>t.pct+5))]} tickFormatter={v=>`${v}%`}/>
            <RTooltip
              contentStyle={{background:"#1f2937",border:"1px solid #374151",borderRadius:8,color:"#e5e7eb"}}
              content={({active,payload}) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{background:"#1f2937",border:"1px solid #374151",borderRadius:8,padding:"8px 12px"}}>
                    <div className="font-bold mb-0.5" style={{color: d.isNonNba ? "#6b7280" : (TC[d.name.replace("Role","Role Player")] || "#e5e7eb")}}>{d.name}</div>
                    <div style={{color:"#9ca3af",fontSize:"0.85em"}}>{d.pct.toFixed(1)}%</div>
                    {d.isNonNba && <div style={{color:"#6b7280",fontSize:"0.78em",marginTop:3}}>G League · International · Out of pro ball</div>}
                    {showNonNba && !d.isNonNba && <div style={{color:"#6b7280",fontSize:"0.78em",marginTop:3}}>= P(NBA) × P(tier | NBA career)</div>}
                  </div>
                );
              }}
            />
            <Bar dataKey="pct" radius={[6,6,0,0]}>{tierData.map((e,i)=><Cell key={i} fill={e.fill}/>)}</Bar>
          </BarChart>
        </ResponsiveContainer>
        {/* Actual NBA outcome (if available) */}
        {(p.actual || p.peakPie != null) && (
          <div className="mt-3 flex items-center gap-3 p-3 rounded-lg" style={{background:"#0c1222",border:"1px solid #1e3a5f"}}>
            <span className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Actual NBA Outcome:</span>
            {p.actual && <TierBadge tier={p.actual}/>}
            {p.peakPie != null && <span className="text-sm" style={{color:"#9ca3af"}}>Peak PIE: <strong style={{color:"#fbbf24"}}>{fmt(p.peakPie,3)}</strong></span>}
          </div>
        )}
      </Sec>

      {/* ═══ PROJECTION DRIVERS — SHAP-based per-player feature contributions (Session 9) ═══ */}
      {(() => {
        // Parse pipe-delimited "Label:strength" strings from backend
        // Translation map: German pipeline labels → English display labels
        // Translation map: all German v2_patch labels → English display labels
        // Keys must match exactly what the backend emits (check v2_patch.csv label column)
        const LABEL_EN = {
          // v2_patch model-derived labels (actual keys from CSV)
          "BPM-Entwicklung":              "BPM Development Trend",
          "BPM-Langzeittrend":            "BPM Long-Term Trend",
          "BPM-Perzentil (era-adjusted)": "BPM Percentile (era-adj.)",
          "Funktionale Athletik":         "Functional Athleticism",
          "Alter bei Draft":              "Draft Age",
          // Legacy / alternate key formats (keep for backward compatibility)
          "Funktionale Athletik (0-100)": "Functional Athleticism",
          "Alter am Draft-Tag":           "Age at Draft",
          "BPM-Percentile (era-adj.)":    "BPM Percentile (era-adj.)",
          "Free-Throw-% (per 100)":       "Free-Throw %",
          "Assist/Turnover-Ratio":        "Assist/Turnover Ratio",
          "BPM-Sprung (letztes Jahr)":    "BPM Jump (final year)",
          "Steals per 100":               "Steals per 100",
          "BPM-Wachstumskurve":           "BPM Growth Curve",
          "Free-Throw-Rate":              "Free-Throw Rate",
          "Konferenzstärke":              "Conference Strength",
          "3-Punkt-Quote":                "3-Point %",
          "Blocks per 100":               "Blocks per 100 Possessions",
        };
        const parseDrvs = (raw) => {
          if (!raw) return [];
          // New format: JSON array from v2 model [{label, strength?, wa_impact?, value, ...}]
          if (Array.isArray(raw)) {
            return raw.map(item => {
              // Prefer explicit strength set by backend; fall back to wa_impact magnitude
              const abs = Math.abs(item.wa_impact || 0);
              const strength = item.strength != null ? item.strength
                : abs >= 0.4 ? 3 : abs >= 0.2 ? 2 : 1;
              const rawLabel = item.label || item.feature || "?";
              const label = LABEL_EN[rawLabel] || rawLabel;
              return { label, strength, value: item.value, group: item.group, description: item.description };
            });
          }
          // Legacy format: "label:strength|label:strength|..."
          if (typeof raw !== "string") return [];
          return raw.split("|").filter(Boolean).map(s => {
            const [label, str] = s.split(":");
            return { label: label || "?", strength: parseInt(str) || 1 };
          });
        };
        const boosters = parseDrvs(p.projectionBoosters);
        const limiters = parseDrvs(p.projectionLimiters);
        const hasDrvData = boosters.length > 0 || limiters.length > 0;

        // Strength pips: filled squares for strength, empty for remaining slots
        const pipRow = (s, filled, empty) =>
          [filled.repeat(Math.min(s,3)), empty.repeat(Math.max(0,3-s))].join("");
        const boostSym = (s) => pipRow(s, "■", "□");
        const limitSym = (s) => pipRow(s, "■", "□");
        // Opacity by strength
        const opac = (s) => s >= 3 ? 1.0 : s >= 2 ? 0.82 : 0.6;

        if (!hasDrvData) {
          // Fallback: old hardcoded drivers
          return (
            <Sec icon="🔬" title="Key Model Drivers" sub="What's pushing this player's projection up or down? Green = above average for tier, Red = below. These are the features LightGBM weights most heavily.">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {drivers.map(d => (
                  <Tip key={d.label} content={<div><div className="font-bold mb-1" style={{color:"#f97316"}}>{d.label}</div><div style={{color:"#cbd5e1"}}>{d.desc}</div></div>}>
                    <div className="rounded-lg p-4 cursor-help" style={{background:"#0d1117",border:`1px solid ${d.color}22`}}>
                      <div className="text-xs uppercase tracking-wider mb-1" style={{color:"#6b7280"}}>{d.label}</div>
                      <div className="text-2xl font-bold" style={{color:d.color,fontFamily:"'Oswald',sans-serif"}}>{d.isText ? d.val : fmt(d.val)}</div>
                    </div>
                  </Tip>
                ))}
              </div>
            </Sec>
          );
        }

        return (
          <Sec icon="🔬" title="Projection Drivers" sub="Which features push this projection up or down? Our model decomposes each prediction into per-feature contributions. The top 5 boosters (green) lift the projected career value; the top 5 limiters (red) pull it down. Strength: +++ = very strong influence, ++ = strong, + = moderate.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* ── BOOSTERS (green) ── */}
              <div>
                <div className="text-xs uppercase tracking-widest mb-3 flex items-center gap-2" style={{color:"#22c55e"}}>
                  <span style={{fontSize:14}}>▲</span> Boosters
                </div>
                <div className="space-y-2">
                  {boosters.length > 0 ? boosters.map((b, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{background:"#0d1117",border:"1px solid #22c55e18",opacity:opac(b.strength)}}>
                      <span className="font-mono font-bold text-sm flex-shrink-0" style={{color:"#22c55e",minWidth:36,textAlign:"right"}}>{boostSym(b.strength)}</span>
                      <span className="text-sm" style={{color:"#d1d5db"}}>{b.label}</span>
                    </div>
                  )) : (
                    <div className="text-sm py-2" style={{color:"#4b5563"}}>No significant positive drivers</div>
                  )}
                </div>
              </div>
              {/* ── LIMITERS (red) ── */}
              <div>
                <div className="text-xs uppercase tracking-widest mb-3 flex items-center gap-2" style={{color:"#ef4444"}}>
                  <span style={{fontSize:14}}>▼</span> Limiters
                </div>
                <div className="space-y-2">
                  {limiters.length > 0 ? limiters.map((l, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{background:"#0d1117",border:"1px solid #ef444418",opacity:opac(l.strength)}}>
                      <span className="font-mono font-bold text-sm flex-shrink-0" style={{color:"#ef4444",minWidth:36,textAlign:"right"}}>{limitSym(l.strength)}</span>
                      <span className="text-sm" style={{color:"#d1d5db"}}>{l.label}</span>
                    </div>
                  )) : (
                    <div className="text-sm py-2" style={{color:"#4b5563"}}>No significant negative drivers</div>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-4 p-3 rounded-lg text-xs leading-relaxed" style={{background:"#0d111744",color:"#4b5563"}}>
              <strong style={{color:"#6b7280"}}>How this works:</strong> For each prospect, our LightGBM model decomposes the WAR projection
              into individual feature contributions (SHAP tree decomposition). Boosters are features where this prospect's value
              pushes the prediction above the population baseline; limiters pull it below. Strength reflects relative magnitude
              within this player's own top contributors — <span style={{color:"#22c55e"}}>+++</span> = dominant influence,{" "}
              <span style={{color:"#22c55e"}}>+</span> = still top-5 but smaller effect.
              The ensemble blends PIE (30%) and xRAPM (70%) model contributions.
            </div>
          </Sec>
        );
      })()}

      {/* ═══ INTERNATIONAL CAREER OUTLOOK ═══ */}
      {/* Only shown for players with P(NBA) < 25% and intl projection available */}
      {/* Guards: (1) not already in NBA, (2) pElite < 0.15 (not just borderline),
           (3) ppWA < 10 (model doesn't project as NBA Starter+) */}
      {p.intlTierProbs && !p.madeNba && pElite != null && pElite < 0.15 && (war == null || war < 10) && (() => {
        const INTL_COLORS = {
          "EuroLeague Impact": "#fbbf24",
          "EuroLeague":        "#f97316",
          "Top European Liga": "#60a5fa",
          "Pro Basketball":    "#a78bfa",
          "Fringe Pro":        "#6b7280",
        };
        const bestTier = p.intlTier || p.intlTierProbs?.[0]?.tier || "—";
        const bestColor = INTL_COLORS[bestTier] || "#f97316";
        const bestDesc = p.intlTierProbs?.find(t => t.tier === bestTier)?.desc || "";
        const bestLeagues = p.intlTierProbs?.find(t => t.tier === bestTier)?.leagues || "";

        // Bar chart data — short label for X axis
        const SHORT = {
          "EuroLeague Impact": "EL Impact",
          "EuroLeague":        "EuroLeague",
          "Top European Liga": "Top League",
          "Pro Basketball":    "Pro Ball",
          "Fringe Pro":        "Fringe",
        };
        const chartData = (p.intlTierProbs || []).map(t => ({
          name:  SHORT[t.tier] || t.tier,
          full:  t.tier,
          pct:   Math.round((t.prob || 0) * 100 * 10) / 10,
          fill:  INTL_COLORS[t.tier] || "#6b7280",
          leagues: t.leagues,
          desc:  t.desc,
        }));

        // Prediction vs Actual comparison
        const hasActual = !!p.actualIntlTier;
        const actualColor = INTL_COLORS[p.actualIntlTier] || "#6b7280";
        const TIER_RANK_UI = {"EuroLeague Impact":4,"EuroLeague":3,"Top European Liga":2,"Pro Basketball":1,"Fringe Pro":0};
        const predRank   = TIER_RANK_UI[bestTier]       ?? -1;
        const actualRank = TIER_RANK_UI[p.actualIntlTier] ?? -1;
        const matchDelta = hasActual ? actualRank - predRank : null; // + = outperformed, 0 = exact, - = under
        const matchLabel = matchDelta === 0 ? "Exact match ✓"
          : matchDelta === 1 ? "Outperformed by 1 tier ↑"
          : matchDelta >= 2 ? `Outperformed by ${matchDelta} tiers ↑↑`
          : matchDelta === -1 ? "Below prediction by 1 tier ↓"
          : matchDelta <= -2 ? "Below prediction ↓↓" : null;
        const matchColor = matchDelta === 0 ? "#22c55e" : matchDelta > 0 ? "#fbbf24" : "#ef4444";

        return (
          <Sec icon="🌍" title="International Career Outlook"
            sub={`P(NBA) ${(pElite*100).toFixed(0)}% — projected trajectory based on ${war != null ? fmt(war,1) + " ppWA" : "model output"}, calibrated from 254 bridge players (2010–2019).`}>

            {/* Hero + Actual side-by-side when historical data available */}
            <div className={`grid gap-3 mb-4 ${hasActual ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {/* Predicted */}
              <div className="rounded-xl p-4 flex items-center gap-3" style={{background:"#0d1117",border:`1px solid ${bestColor}33`}}>
                <div className="flex-shrink-0 w-1.5 self-stretch rounded-full" style={{background:bestColor}}/>
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-widest mb-0.5" style={{color:"#6b7280"}}>Model Prediction</div>
                  <div className="text-lg font-bold leading-tight" style={{color:bestColor,fontFamily:"'Oswald',sans-serif"}}>{bestTier}</div>
                  <div className="text-xs mt-0.5 truncate" style={{color:"#9ca3af"}}>{bestLeagues}</div>
                </div>
              </div>

              {/* Actual (if available) */}
              {hasActual && (
                <div className="rounded-xl p-4 flex items-center gap-3" style={{background:"#0d1117",border:`1px solid ${actualColor}33`}}>
                  <div className="flex-shrink-0 w-1.5 self-stretch rounded-full" style={{background:actualColor}}/>
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-widest mb-0.5" style={{color:"#6b7280"}}>Actual Career</div>
                    <div className="text-lg font-bold leading-tight" style={{color:actualColor,fontFamily:"'Oswald',sans-serif"}}>{p.actualIntlTier}</div>
                    <div className="text-xs mt-0.5 truncate" style={{color:"#9ca3af"}}>
                      {(p.actualIntlLeagues||[p.actualIntlLeague]).filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Match verdict */}
            {hasActual && matchLabel && (
              <div className="mb-4 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2"
                style={{background:`${matchColor}11`,border:`1px solid ${matchColor}33`,color:matchColor}}>
                {matchLabel}
                {matchDelta > 0 && <span style={{color:"#6b7280",fontWeight:400}}>— model was conservative, player exceeded projection</span>}
              </div>
            )}

            {/* Bar chart — probability distribution */}
            <ResponsiveContainer width="100%" height={195}>
              <BarChart data={chartData} margin={{top:5,right:5,bottom:5,left:5}}>
                <XAxis dataKey="name" tick={{fill:"#9ca3af",fontSize:11}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:"#6b7280",fontSize:11}} axisLine={false} tickLine={false}
                  domain={[0, Math.max(50, ...chartData.map(d => d.pct + 5))]}
                  tickFormatter={v=>`${v}%`}/>
                <RTooltip
                  contentStyle={{background:"#1f2937",border:"1px solid #374151",borderRadius:8,color:"#e5e7eb"}}
                  content={({active,payload}) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    const isActualTier = d.full === p.actualIntlTier;
                    return (
                      <div style={{background:"#1f2937",border:"1px solid #374151",borderRadius:8,padding:"10px 14px",maxWidth:220}}>
                        <div className="font-bold mb-1" style={{color:d.fill}}>{d.full}</div>
                        {isActualTier && <div className="text-xs mb-1" style={{color:"#22c55e"}}>✓ Actual career tier</div>}
                        <div style={{color:"#9ca3af",fontSize:"0.82em"}}>{d.leagues}</div>
                        <div style={{color:"#cbd5e1",fontSize:"0.85em",marginTop:4}}>{d.desc}</div>
                        <div style={{color:"#6b7280",fontSize:"0.8em",marginTop:4}}>Probability: {d.pct}%</div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="pct" radius={[6,6,0,0]}>
                  {chartData.map((d,i) => {
                    const isActual = d.full === p.actualIntlTier;
                    return <Cell key={i} fill={d.fill} opacity={d.full===bestTier||isActual?1:0.4}/>;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Validation note */}
            <div className="mt-3 p-3 rounded-lg text-xs leading-relaxed" style={{background:"#0d111744",color:"#4b5563"}}>
              <strong style={{color:"#6b7280"}}>Model validation:</strong>{" "}
              EuroLeague Impact predictions reach EL or higher in 86% of historical cases.
              Classes 2020–2024: 68–76% within one tier.
              The model is deliberately conservative — actual careers tend to exceed projections.
              {hasActual && <span style={{color:"#6b7280"}}> This player's outcome is from verified league data.</span>}
            </div>
          </Sec>
        );
      })()}

      {/* ═══ SEASON-BY-SEASON ═══ */}
      <Sec icon="📈" title="Season-by-Season" sub="Development trajectory — ▲▼ shows year-over-year change. Green = improvement, Red = regression. For internationals, 'League' shows the competition level. Multi-season improvement is one of the strongest NBA success signals.">
        {(p.seasonLines||[]).length > 1 ? (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
            {["Year","League","GP","MIN","PTS","REB","AST","STL","BLK","BPM","TS%","USG"].map(h=><th key={h} className="px-2 py-1 text-xs uppercase text-left" style={{color:"#6b7280",borderBottom:"1px solid #1f2937"}}>{h}</th>)}
          </tr></thead><tbody>
            {(p.seasonLines||[]).map((s,i)=>{
              const prev=i>0?(p.seasonLines||[])[i-1]:null;
              const D=(cur,prv,inv)=>{if(!prev||cur==null||prv==null)return null;const d=Number(cur)-Number(prv);if(isNaN(d))return null;const c=inv?(d<0?"#22c55e":d>0?"#ef4444":"#6b7280"):(d>0?"#22c55e":d<0?"#ef4444":"#6b7280");return<span className="text-xs ml-1" style={{color:c}}>{d>0?"▲":"▼"}{Math.abs(d).toFixed(1)}</span>;};
              const leagueOrCls = s.league || s.cls || "";
              return(<tr key={i} style={{borderBottom:"1px solid #1f293744"}}>
                <td className="px-2 py-2 font-semibold" style={{color:"#e5e7eb"}}>{s.yr}</td>
                <td className="px-2" style={{color:"#9ca3af"}}><span className="truncate block max-w-20" title={leagueOrCls}>{leagueOrCls}</span></td>
                <td className="px-2">{s.gp}</td><td className="px-2">{fmt(s.min)}</td>
                <td className="px-2">{fmt(s.pts)}{D(s.pts,prev?.pts)}</td><td className="px-2">{fmt(s.reb)}{D(s.reb,prev?.reb)}</td>
                <td className="px-2">{fmt(s.ast)}{D(s.ast,prev?.ast)}</td><td className="px-2">{fmt(s.stl)}{D(s.stl,prev?.stl)}</td>
                <td className="px-2">{fmt(s.blk)}{D(s.blk,prev?.blk)}</td>
                <td className="px-2 font-semibold" style={{color:valColor(s.bpm>10?85:s.bpm>5?60:30)}}>{fmt(s.bpm)}{D(s.bpm,prev?.bpm)}</td>
                <td className="px-2" style={{color:valColor(s.ts>58?80:s.ts>53?55:30)}}>{fmt(s.ts)}{D(s.ts,prev?.ts)}</td>
                <td className="px-2">{fmt(s.usg)}{D(s.usg,prev?.usg)}</td>
              </tr>);
            })}
          </tbody></table></div>
        ) : (p.seasonLines||[]).length === 1 ? (
          <div className="text-center py-4" style={{color:"#6b7280"}}>
            Single season on record ({(p.seasonLines||[])[0]?.yr} · {(p.seasonLines||[])[0]?.league || (p.seasonLines||[])[0]?.cls || ""}).
          </div>
        ) : (
          <div className="text-center py-6" style={{color:"#6b7280"}}>
            {p.seasonsPlayed > 1
              ? "Multi-season data available but not yet linked. Pipeline re-run needed."
              : "One-and-done — no multi-season trajectory."}
          </div>
        )}
      </Sec>
    </div>
  );
}
function ScoutingTab({p}) {
  const badges = { green: p.badges || [], yellow: p.yellowBadges || [], red: p.redFlags || [] };
  const allBadges = [...badges.green, ...badges.yellow, ...badges.red];

  const pillars = [
    {key:"feel",name:"IQ & Feel",value:p.feel??0,color:"#fbbf24",icon:"🧠"},
    {key:"shootScore",name:"Shooting",value:p.shootScore??0,color:"#22c55e",icon:"🎯"},
    {key:"defScore",name:"Defense",value:p.defScore??0,color:"#3b82f6",icon:"🛡"},
    {key:"funcAth",name:"Athleticism",value:p.funcAth??0,color:"#f97316",icon:"⚡"},
    {key:"selfCreation",name:"Box Creation",value:p.selfCreation??0,color:"#06b6d4",icon:"✦"},
  ];

  // ── Roles ──
  const rr = p.roles || {};
  const ROLE_INFO = {
    scorer:     {name:"Scorer",      cat:"Offensive", inputs:"PTS/36, USG%, TS%, eFG%",                desc:"Volume scoring ability. Weights production × efficiency."},
    playmaker:  {name:"Playmaker",   cat:"Offensive", inputs:"AST%, AST/TO, USG%, Feel Score",         desc:"Creates for others. Passing vision and decision-making under pressure."},
    spacer:     {name:"Spacer",      cat:"Offensive", inputs:"3P%, 3PAr, FT%, three_frequency",        desc:"Floor spacing gravity. Draws defenders beyond the arc."},
    driver:     {name:"Driver",      cat:"Offensive", inputs:"Rim%, FTR, USG%, Dunk Rate*",          desc:"Rim pressure via drives. Creates contact and free throws. *Dunk Rate unavailable for internationals — FTR weighted higher as proxy."},
    crasher:    {name:"Crasher",     cat:"Offensive", inputs:"ORB%, Dunk Rate, FTR, Func Ath",         desc:"Offensive rebounds and put-backs. Second-chance creation."},
    onball:     {name:"On-Ball D",   cat:"Defensive", inputs:"STL%, DBPM, Height (size proxy)",      desc:"Perimeter defense. Ball pressure and steal ability. No direct lateral quickness data available — STL% and DBPM serve as proxies."},
    switchPot:  {name:"Switch Pot.", cat:"Defensive", inputs:"Height, STL%, BLK%, Wingspan",           desc:"Can defend multiple positions in switching schemes."},
    rimProt:    {name:"Rim Protect", cat:"Defensive", inputs:"BLK%, DBPM, Height, DRB%",              desc:"Shot-blocking and rim deterrence. Anchors paint defense."},
    rebounder:  {name:"Rebounder",   cat:"Defensive", inputs:"DRB%, ORB%, Height, Func Ath",          desc:"Board control on both ends. Ends possessions and starts breaks."},
    connector:  {name:"Connector",   cat:"Hybrid",    inputs:"AST/TO>2, DBPM>0, USG%<18",             desc:"Glue guy. Connects offense without mistakes, contributes defensively."},
    helio:      {name:"Helio-Scorer",cat:"Hybrid",    inputs:"USG%>28, PTS/36>18, TS%>55",            desc:"Ball-dominant scoring engine. Offense revolves around this player."},
    event:      {name:"Event Creator",cat:"Hybrid",   inputs:"Box Creation Pctl>70, AST%>20, USG%>25",desc:"Creates scoring opportunities from nothing. Iso + playmaking dual threat."},
    zone:       {name:"Zone Pressure",cat:"Hybrid",   inputs:"STL%>2.5, BLK%>1.5, Func Ath>70",      desc:"Defensive chaos agent. Forces turnovers and blocks in multiple zones."},
    microSpacer:{name:"Micro-Spacer",cat:"Hybrid",    inputs:"3P%>35, USG%<16, DBPM>0",               desc:"Low-usage spacer who contributes defensively. 3&D role player archetype."},
  };

  const roleGroups = [
    {label:"Offensive",color:"#f97316",roles:["scorer","playmaker","spacer","driver","crasher"]},
    {label:"Defensive",color:"#3b82f6",roles:["onball","switchPot","rimProt","rebounder"]},
    {label:"Hybrid",color:"#8b5cf6",roles:["connector","helio","event","zone","microSpacer"]},
  ];

  // ── Archetype ──
  const archetype = p.archetype || "Unknown";
  const ARCH_MAP = {
    "Scoring Playmaker": {desc:"Dual-threat point guard. Scores at high volume while maintaining playmaking.",color:"#fbbf24",
      pos:["Playmaker"],formula:"Scorer>65 + Playmaker>55",roles:["Scorer","Playmaker","Event Creator"]},
    "Floor General":       {desc:"Lead playmaker who creates for others. Elite AST/TO and half-court orchestration.",color:"#f97316",
      pos:["Playmaker"],formula:"Playmaker>65",roles:["Playmaker","Connector","Event Creator"]},
    "Spacing Guard":      {desc:"Off-ball scoring guard. Elite spacing with catch-and-shoot gravity.",color:"#22c55e",
      pos:["Playmaker"],formula:"Spacer>65",roles:["Spacer","Scorer","Micro-Spacer"]},
    "Defensive Guard":     {desc:"Perimeter lockdown specialist. Ball pressure and steal ability define his value.",color:"#3b82f6",
      pos:["Playmaker"],formula:"Def Score>60",roles:["On-Ball D","Connector","Zone Pressure"]},
    "Non-Specialized Playmaker":         {desc:"Versatile guard without a dominant skill. Jack-of-all-trades backcourt piece.",color:"#8b5cf6",
      pos:["Playmaker"],formula:"Default (no role >65)",roles:["Scorer","Playmaker","Spacer"]},
    "Scoring Wing":        {desc:"Pure scorer without elite creation. Efficient finisher who needs structure.",color:"#ef4444",
      pos:["Wing"],formula:"Scorer>65",roles:["Scorer","Driver","Spacer"]},
    "3-and-D Wing":        {desc:"Shoot and defend. The most valuable role player archetype in modern NBA.",color:"#3b82f6",
      pos:["Wing"],formula:"Spacer>65 + Def Score>55",roles:["Spacer","On-Ball D","Micro-Spacer"]},
    "Defensive Wing":      {desc:"Elite wing defender. Versatile stopper who guards multiple positions.",color:"#06b6d4",
      pos:["Wing"],formula:"Def Score>65",roles:["On-Ball D","Switch Pot.","Zone Pressure"]},
    "Slashing Wing":       {desc:"Attacks the rim with explosiveness. Transition weapon and paint-pressure.",color:"#f43f5e",
      pos:["Wing"],formula:"Driver>65",roles:["Driver","Crasher","On-Ball D"]},
    "Non-Specialized Wing":      {desc:"Multi-tool forward without a dominant skill. Fits many lineups.",color:"#a78bfa",
      pos:["Wing"],formula:"Default (no role >65)",roles:["Connector","Switch Pot.","Spacer"]},
    "Point Forward":       {desc:"Oversized playmaker. Creates mismatches with size + passing vision.",color:"#10b981",
      pos:["Wing","Big"],formula:"Playmaker>60",roles:["Playmaker","Connector","Driver"]},
    "Stretch Big":         {desc:"Shooting big who spaces the floor. Gravity from the 5 position.",color:"#22c55e",
      pos:["Big"],formula:"Spacer>65",roles:["Spacer","Rim Protect","Rebounder"]},
    "Stretch Rim Protector":{desc:"Unicorn big — protects the rim AND stretches the floor. Extreme roster flexibility.",color:"#10b981",
      pos:["Big"],formula:"Rim Protect>75 + Spacer>65",roles:["Rim Protect","Spacer","Rebounder"]},
    "Rim Protector":       {desc:"Elite shot-blocker. Deters drives and alters shots. Anchors paint defense.",color:"#3b82f6",
      pos:["Big"],formula:"Rim Protect>75",roles:["Rim Protect","Rebounder","Switch Pot."]},
    "Passing Hub":       {desc:"Playmaking big — Jokic/Draymond archetype. Creates from post/elbow with vision.",color:"#fbbf24",
      pos:["Big"],formula:"Playmaker>55",roles:["Playmaker","Connector","Driver"]},
    "Short Roll Playmaker":{desc:"Decision-making big in the short roll. Drives and passes from the elbow/FT line area.",color:"#f59e0b",
      pos:["Big"],formula:"Driver>55 + Playmaker>55",roles:["Driver","Playmaker","Connector"]},
    "Glass Cleaner":       {desc:"Dominant rebounder. Controls both boards and creates second chances.",color:"#f97316",
      pos:["Big"],formula:"Rebounder>65",roles:["Rebounder","Crasher","Rim Protect"]},
    "Scoring Big":         {desc:"Offense-first big. Post scoring, face-up game, or finishing at the rim.",color:"#ef4444",
      pos:["Big"],formula:"Scorer>65",roles:["Scorer","Crasher","Driver"]},
    "Non-Specialized Big":          {desc:"Well-rounded center without a standout skill. Does a bit of everything.",color:"#60a5fa",
      pos:["Big"],formula:"Default (no role >65)",roles:["Rim Protect","Rebounder","Switch Pot."]},
    "Initiator Wing":        {desc:"Creates own offense off the dribble. Self-creation specialist with high usage.",color:"#fb923c",
      pos:["Wing","Playmaker"],formula:"Scorer>70 + Playmaker>55 + USG>26",roles:["Scorer","Driver","Helio-Scorer"]},
  };
  const allArchetypes = Object.entries(ARCH_MAP);
  // Pipeline-triggered archetypes (from 10c assign_archetypes_multi)
  const pipelineTriggered = new Set((p.archetypesAll || p.archetype || "").split("|").filter(Boolean));
  // Detect secondary/tertiary by matching role profiles
  const archScores = allArchetypes.map(([name,info]) => {
    let score = 0;
    const posMatch = (info.pos||[]).includes(p.pos);
    const isTriggered = pipelineTriggered.has(name);
    if (isTriggered) score += 10;
    if (posMatch) score += 5;
    (info.roles||[]).forEach(r => {
      const key = Object.keys(ROLE_INFO).find(k => ROLE_INFO[k].name === r);
      if (key && rr[key]) score += Math.max(0, roleToZ(rr[key]));
    });
    return {name, score, info, posMatch, isTriggered};
  }).sort((a,b) => b.score - a.score);
  // PRIMARY: use pipeline archetype if it matches ARCH_MAP, otherwise best role-score match
  const primaryArch = ARCH_MAP[archetype] ? archetype : (archScores.find(a => a.posMatch)?.name || archScores[0]?.name);
  // Secondary/tertiary from triggered archetypes first, then role-score fallback
  const triggeredNotPrimary = archScores.filter(a => a.name !== primaryArch && a.isTriggered);
  const posFilteredArchs = archScores.filter(a => a.name !== primaryArch && a.posMatch && !a.isTriggered);
  const secondaryArch = triggeredNotPrimary[0]?.name || posFilteredArchs[0]?.name;
  const tertiaryArch = triggeredNotPrimary[1]?.name || (triggeredNotPrimary[0] ? posFilteredArchs[0]?.name : posFilteredArchs[1]?.name);

  // ── CFFR / Possession Impact ──
  const ffEfg = p.ff?.efg ?? 50, ffTov = p.ff?.tov ?? 50, ffOrb = p.ff?.orb ?? 50, ffFtr = p.ff?.ftr ?? 50;
  const npv = p.ff?.comp ?? 50;
  const pToZ = (pctl) => pctl == null ? 0 : Math.max(-3, Math.min(3, (pctl - 50) / 16.67));
  const ffFactors = [
    {key:"efg",label:"Shot Quality (eFG%)",z:pToZ(ffEfg),pctl:ffEfg,weight:"40%",color:"#fbbf24",
     desc:"Shooting efficiency adjusted for 3-point value. Positive = better than role-peers."},
    {key:"tov",label:"Ball Security (TO%)",z:pToZ(ffTov),pctl:ffTov,weight:"25%",color:"#3b82f6",
     desc:"Turnover control inverted: positive = fewer turnovers than peers."},
    {key:"orb",label:"Extra Possessions (ORB%)",z:pToZ(ffOrb),pctl:ffOrb,weight:"20%",color:"#06b6d4",
     desc:"Offensive rebounding creates second-chance points."},
    {key:"ftr",label:"Foul Pressure (FTr)",z:pToZ(ffFtr),pctl:ffFtr,weight:"15%",color:"#8b5cf6",
     desc:"Drawing fouls generates free points and creates foul trouble."},
  ];
  const npvZ = pToZ(npv);
  const npvLabel = npvZ >= 1.2 ? "Elite Floor Raiser" : npvZ >= 0.3 ? "Winning Piece" : npvZ >= -0.3 ? "Role Dependent" : "High Maintenance";
  const npvColor = npvZ >= 1.2 ? "#22c55e" : npvZ >= 0.3 ? "#86efac" : npvZ >= -0.3 ? "#fbbf24" : "#ef4444";
  const usageRole = p.cffr?.usageRole || "Unknown";

  return (
    <div className="space-y-5">
      {/* ── BADGES ── */}
      <Sec icon="🏅" title="Skill Badges" sub="Position-filtered skill signals. Green = elite NBA-translatable skills. Yellow = development potential. Red = bust warning signals. Hover each badge for the statistical trigger and scouting context.">
        {p.source !== "ncaa" && <div className="mb-3 px-3 py-1.5 rounded-lg inline-block text-xs" style={{background:"#3b82f622",color:"#60a5fa",border:"1px solid #3b82f644"}}>International Adjuster Active</div>}
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
        {allBadges.length === 0 && <div className="text-sm" style={{color:"#6b7280"}}>No badges earned.</div>}
      </Sec>

      {/* ── PILLARS ── */}
      <Sec icon="🔬" title="The 5 Pillars" sub="Prospect DNA — position-adjusted percentile scores (0-100). These are the building blocks the model uses. Hover each for formula details.">
        {p.source !== "ncaa" && <div className="mb-3 px-3 py-1.5 rounded-lg text-xs" style={{background:"#f9731611",color:"#f97316",border:"1px solid #f9731633"}}>
          ⚠ International data gaps: Athleticism uses Dunk Rate which is unavailable for most intl players — score may undervalue athletic intl prospects. Box Creation uses USG%, TS%, AST% — same formula for NCAA and international players. No shot zone data needed.
        </div>}
        <div className="grid grid-cols-5 gap-3">
          {pillars.map(pl=>(
            <Tip key={pl.key} wide content={
              <div><div className="font-bold mb-1" style={{color:pl.color}}>{METHODS[pl.key]?.name||pl.name}</div>
              {METHODS[pl.key]?.formula&&<div className="mb-1"><span style={{color:"#94a3b8"}}>Formula:</span><br/><code className="text-xs" style={{color:"#7dd3fc"}}>{METHODS[pl.key].formula}</code></div>}
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

      {/* ── POSSESSION IMPACT (CFFR) — wider bars, usage role prominent ── */}
      <Sec icon="↗" title="Possession Impact & Carefree Playability" sub="How efficiently does this player use possessions? Based on Dean Oliver's Four Factors, adjusted for usage role.">
        <Tip wide content={<div><div className="font-bold mb-1" style={{color:"#f97316"}}>{METHODS.fourFactors?.name||"Four Factors"}</div>{METHODS.fourFactors?.formula&&<div className="mb-1"><code className="text-xs" style={{color:"#7dd3fc"}}>{METHODS.fourFactors.formula}</code></div>}<div style={{color:"#cbd5e1"}}>{METHODS.fourFactors?.desc||"Dean Oliver's Four Factors adjusted for usage role. Measures net possession quality relative to role-peers."}</div></div>}>
          <div className="text-xs mb-4 cursor-help" style={{color:"#6b7280"}}>Efficiency index: how much value this player creates per possession, relative to his usage role. <span style={{color:"#475569"}}>ⓘ</span></div>
        </Tip>
        {/* NPV scale */}
        <div className="p-5 rounded-xl mb-4" style={{background:"#0d1117",border:`1px solid ${npvColor}33`}}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs uppercase tracking-wider mb-1" style={{color:"#6b7280"}}>Net Possession Value</div>
              <div className="text-4xl font-bold" style={{color:npvColor,fontFamily:"'Oswald',sans-serif"}}>{Math.round(npv)}</div>
            </div>
            <div className="text-right">
              <div className="px-4 py-2 rounded-lg text-sm font-bold" style={{background:npvColor+"22",color:npvColor,border:`1px solid ${npvColor}44`}}>{npvLabel}</div>
            </div>
          </div>
          {/* NPV scale bar */}
          <div className="relative h-6 rounded-full overflow-hidden mb-2" style={{background:"linear-gradient(90deg,#ef4444,#fbbf24,#86efac,#22c55e)"}}>
            <div className="absolute top-0 bottom-0 w-1.5 rounded" style={{left:`${Math.max(2,Math.min(98,npv))}%`,background:"#fff",boxShadow:"0 0 6px #fff"}}/>
          </div>
          <div className="flex justify-between text-xs" style={{color:"#4b5563"}}>
            <span>High Maintenance</span><span>Role Dependent</span><span>Winning Piece</span><span>Elite Floor Raiser</span>
          </div>
        </div>
        {/* Usage Role — prominent */}
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg" style={{background:"#0d111788",border:"1px solid #1f2937"}}>
          <span className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Usage Role Context:</span>
          <span className="px-3 py-1 rounded-lg text-sm font-bold" style={{background:"#f9731622",color:"#f97316",border:"1px solid #f9731644"}}>{usageRole}</span>
          <Tip content={<div>CFFR compares this player against peers with similar usage. Primary (USG≥28%), Secondary (≥22%), Finisher (≥15%), Low-Usage (&lt;15%). A "Winning Piece" at Primary usage is far more valuable than at Low usage.</div>}>
            <span className="text-xs cursor-help" style={{color:"#475569"}}>ⓘ Four Factors are percentiled within this usage bucket</span>
          </Tip>
        </div>
        {/* Factor bars — each on own row, full width */}
        <div className="space-y-4">
          {ffFactors.map(f => {
            const barPct = Math.abs(f.z) / 3 * 50;
            const isPos = f.z >= 0;
            return (
              <Tip key={f.key} block wide content={<div><div className="font-bold mb-1" style={{color:f.color}}>{f.label}</div><div className="text-xs mb-1" style={{color:"#94a3b8"}}>Weight: {f.weight} · Percentile: {Math.round(f.pctl)}</div><div style={{color:"#cbd5e1"}}>{f.desc}</div></div>}>
                <div className="cursor-help">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold" style={{color:f.color}}>{f.label} <span style={{color:"#475569"}}>ⓘ</span></span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{color:"#6b7280"}}>Wt: {f.weight}</span>
                      <span className="text-lg font-bold" style={{color:f.z>=0?f.color:"#ef4444",fontFamily:"'Oswald',sans-serif"}}>{f.z>0?"+":""}{f.z.toFixed(1)}σ</span>
                      <span className="text-xs" style={{color:"#4b5563"}}>Pctl: {Math.round(f.pctl)}</span>
                    </div>
                  </div>
                  <div className="relative h-10 rounded-lg overflow-hidden" style={{background:"#0d1117",border:"1px solid #1f2937"}}>
                    <div className="absolute top-0 bottom-0 w-0.5 z-10" style={{left:"50%",background:"#ffffff44"}}/>
                    {isPos ? (
                      <div className="absolute top-1 bottom-1 rounded-r" style={{left:"50%",width:`${barPct}%`,background:`linear-gradient(90deg,${f.color}44,${f.color})`}}/>
                    ) : (
                      <div className="absolute top-1 bottom-1 rounded-l" style={{right:"50%",width:`${barPct}%`,background:`linear-gradient(270deg,${f.color}44,${f.color})`}}/>
                    )}
                    <div className="absolute inset-0 flex items-center justify-between px-3 text-xs" style={{color:"#ffffff22"}}>
                      <span>− Drain</span><span>+ Impact</span>
                    </div>
                  </div>
                </div>
              </Tip>
            );
          })}
        </div>
      </Sec>

      {/* ── ROLE INFERENCE MATRIX — hoverable with inputs ── */}
      <Sec icon="📊" title="Role Inference Matrix" sub="14 NBA roles scored as z-scores vs position peers. ≥+2.0σ = Elite (top 2%), ≥+1.0σ = Impact, ≤-1.0σ = Liability. Hover each role for the statistical inputs that drive it.">
        {roleGroups.map(grp=>(
          <div key={grp.label} className="mb-5">
            <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{color:grp.color}}>{grp.label}</div>
            <div className="grid grid-cols-5 gap-2">
              {grp.roles.map(key=>{
                const info = ROLE_INFO[key]||{};
                const z = roleToZ(rr[key]);
                return (
                  <Tip key={key} content={
                    <div>
                      <div className="font-bold mb-1" style={{color:zColor(z)}}>{info.name||key}: {z>0?"+":""}{z} σ</div>
                      <div className="mb-1"><span style={{color:"#94a3b8"}}>Inputs:</span> <span style={{color:"#7dd3fc"}}>{info.inputs||"—"}</span></div>
                      <div style={{color:"#cbd5e1"}}>{info.desc||""}</div>
                    </div>
                  }>
                    <div className="rounded-lg p-3 text-center cursor-help" style={{background:zBg(z),border:`1px solid ${zColor(z)}22`}}>
                      <div className="text-xs mb-1 truncate" style={{color:"#9ca3af"}}>{info.name||key} <span style={{color:"#475569"}}>ⓘ</span></div>
                      <div className="font-bold font-mono text-lg" style={{color:zColor(z),fontFamily:"'Oswald',sans-serif"}}>{z>0?"+":""}{z}</div>
                      <div className="text-xs" style={{color:zColor(z),opacity:0.7}}>{zLabel(z)}</div>
                    </div>
                  </Tip>
                );
              })}
            </div>
          </div>
        ))}
      </Sec>

      {/* ── ARCHETYPE — formulas + secondary/tertiary + versatility ── */}
      <Sec icon="🏷" title="NBA Archetype Fit" sub="What NBA role does this prospect project into? PRIMARY = pipeline-assigned from dominant role scores. 2ND/3RD = best alternative fits within the same position group. Colored = triggered by pipeline thresholds. Greyed = not triggered.">
        {/* Role Versatility — prominent */}
        {p.roleVersatility != null && (
          <div className="flex items-center gap-4 mb-4 p-3 rounded-lg" style={{background:"#0d111788",border:"1px solid #1f2937"}}>
            <Tip content={<div><div className="font-bold mb-1" style={{color:"#f97316"}}>Role Versatility</div><div style={{color:"#cbd5e1"}}>Count of roles where z-score ≥ +0.5, normalized to 0-100. Higher = more lineup flexibility. 80+ = Swiss Army Knife territory.</div></div>}>
              <div className="cursor-help">
                <span className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Role Versatility <span style={{color:"#475569"}}>ⓘ</span></span>
                <div className="text-2xl font-bold" style={{color:p.roleVersatility>70?"#22c55e":p.roleVersatility>45?"#fbbf24":"#6b7280",fontFamily:"'Oswald',sans-serif"}}>{Math.round(p.roleVersatility)}/100</div>
              </div>
            </Tip>
            <div className="flex-1 h-3 rounded-full overflow-hidden" style={{background:"#1f2937"}}>
              <div className="h-full rounded-full" style={{width:`${Math.min(100,p.roleVersatility)}%`,background:`linear-gradient(90deg,#f9731688,${p.roleVersatility>70?"#22c55e":"#f97316"})`}}/>
            </div>
            <div className="text-xs" style={{color:"#4b5563"}}>{p.roleVersatility>75?"Swiss Army Knife":p.roleVersatility>55?"Multi-Role":p.roleVersatility>35?"Specialist":"One-Dimensional"}</div>
          </div>
        )}
        {/* Orange-only archetype system: rank distinction via weight/opacity, not color */}
        {(() => {
          const O = { pri:"#f97316", sec:"#fb923c", ter:"#fdba74" };
          return (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {allArchetypes.map(([name, info]) => {
              const isPrimary   = primaryArch   === name;
              const isSecondary = secondaryArch === name;
              const isTertiary  = tertiaryArch  === name;
              const isRanked    = isPrimary || isSecondary || isTertiary;
              const isTriggered = pipelineTriggered.has(name);
              const rank = isPrimary ? "PRIMARY" : isSecondary ? "2ND" : isTertiary ? "3RD" : null;
              const posMatch = (info.pos||[]).includes(p.pos);
              // Card color: unified orange scale, never green/red/blue for rank distinction
              const cardColor = isPrimary ? O.pri : isSecondary ? O.sec : isTertiary ? O.ter : O.pri;
              const cardOpacity = isPrimary ? 1.0 : isSecondary ? 0.78 : isTertiary ? 0.58 : isTriggered ? 0.4 : 0.22;
              const showDesc = isRanked;
              return (
                <Tip key={name} content={
                  <div>
                    {/* Tooltip keeps original archetype color for reference */}
                    <div className="font-bold mb-1" style={{color:info.color}}>{name}</div>
                    <div className="mb-1" style={{color:"#cbd5e1"}}>{info.desc}</div>
                    {info.formula&&<div className="mb-1"><span style={{color:"#94a3b8"}}>Formula:</span> <code className="text-xs" style={{color:"#7dd3fc"}}>{info.formula}</code></div>}
                    {info.roles&&<div><span style={{color:"#94a3b8"}}>Key roles:</span> <span style={{color:"#f97316"}}>{info.roles.join(", ")}</span></div>}
                    {info.pos&&<div className="mt-1"><span style={{color:"#94a3b8"}}>Positions:</span> <span style={{color:posMatch?"#86efac":"#fca5a5"}}>{info.pos.join(", ")}{posMatch?"":" ⚠ mismatch"}</span></div>}
                    {isTriggered && !isRanked && <div className="mt-1 text-xs" style={{color:"#fb923c"}}>✓ Triggered by pipeline thresholds</div>}
                  </div>
                }>
                  <div className={`rounded-lg cursor-help transition-all ${isPrimary ? "ring-2 p-4" : isRanked ? "p-4" : "p-3"}`}
                    style={{
                      background: isRanked
                        ? cardColor + (isPrimary ? "1e" : isSecondary ? "14" : "0e")
                        : isTriggered ? "#f9731608" : "#0d1117",
                      border: `${isPrimary?"2":"1"}px solid ${isRanked
                        ? cardColor + (isPrimary ? "cc" : isSecondary ? "77" : "44")
                        : isTriggered ? "#f9731622" : "#1f293744"}`,
                      opacity: cardOpacity,
                      outline: isPrimary ? `2px solid ${O.pri}55` : "none",
                    }}>
                    <div className="flex items-center gap-2">
                      {rank && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${isPrimary ? "text-sm" : ""}`}
                          style={{
                            background: cardColor + "33",
                            color: cardColor,
                            fontWeight: isPrimary ? 800 : isSecondary ? 700 : 600,
                          }}>
                          {rank}
                        </span>
                      )}
                      {!rank && isTriggered && <span className="text-xs px-1.5 py-0.5 rounded" style={{background:"#f9731618",color:"#fb923c"}}>✓</span>}
                      <div className={`truncate ${isRanked ? "text-sm" : "text-xs"}`}
                        style={{
                          color: isRanked ? cardColor : isTriggered ? "#fb923c88" : "#4b5563",
                          fontWeight: isPrimary ? 700 : isSecondary ? 600 : 500,
                        }}>
                        {name} <span style={{color:"#475569",fontWeight:400}}>ⓘ</span>
                      </div>
                    </div>
                    {showDesc && <div className="mt-1.5 text-xs leading-relaxed" style={{color: cardColor + "aa", fontWeight: isPrimary ? 500 : 400}}>{info.desc.split(".")[0]}.</div>}
                    {showDesc && info.formula && <div className="mt-1 text-xs" style={{color:"#4b5563"}}>Trigger: {info.formula}</div>}
                  </div>
                </Tip>
              );
            })}
          </div>
          );
        })()}
      </Sec>
    </div>
  );
}
function BodyTab({p}) {
  const [wsAdj, setWsAdj] = useState(0);
  const [wtAdj, setWtAdj] = useState(0);
  const [dynComps, setDynComps] = useState(null);   // null = show pre-loaded comps
  const [dynLoading, setDynLoading] = useState(false);

  // ── Wingspan estimate (Ape Index by position when not measured) ──
  const apeIndex = p.pos==="Playmaker" ? 1.04 : p.pos==="Big" ? 1.06 : 1.05;
  const estimatedWs = p.ws || Math.round((p.htIn||78) * apeIndex * 10) / 10;
  const isWsEstimated = !p.ws;

  // ── Weight estimate (BMI by position when not measured) ──
  const htM = (p.htIn||78) * 0.0254;
  const posBmi = p.pos==="Playmaker" ? 23.5 : p.pos==="Big" ? 26.5 : 24.8;
  const estimatedWt = p.wt || Math.round(posBmi * htM * htM * 2.205);
  const isWtEstimated = !p.wt;

  const adjWs = estimatedWs + wsAdj;
  const adjWt = estimatedWt + wtAdj;
  const wsDelta = adjWs - (p.htIn||78);
  const apeRatio = adjWs / (p.htIn||78);

  // ── Frame labels ──
  const wsLabel = wsDelta > 6 ? "Elite Length / Disruptor Frame"
    : wsDelta > 3 ? "Above Average Length"
    : wsDelta > 0 ? "Neutral Wingspan"
    : "Negative Wingspan";
  const wsLabelColor = wsDelta > 6 ? "#22c55e" : wsDelta > 3 ? "#86efac" : wsDelta > 0 ? "#6b7280" : "#ef4444";
  const posMedianWt = p.pos==="Playmaker" ? 190 : p.pos==="Big" ? 240 : 215;
  const wtDeviation = adjWt - posMedianWt;
  const wtLabel = wtDeviation > 15 ? "High Strength / Power Build"
    : wtDeviation < -15 ? "Slight Frame / Needs Development"
    : "Average Frame";
  const wtLabelColor = wtDeviation > 15 ? "#22c55e" : wtDeviation < -15 ? "#ef4444" : "#6b7280";

  // ── Combine data (if available) ──
  const hasCombine = p.comb != null;

  // Pre-loaded comps (on initial load, before any slider adjustment)
  // sim is already stored correctly from the backend's normalized similarity field
  const staticComps = useMemo(() => {
    return (p.anthroComps || []).slice().sort((a, b) => b.sim - a.sim);
  }, [p.anthroComps]);

  // ── Client-side re-sort when sliders change (instant, no network call) ──
  // Re-computes distances from the prospect's adjusted measurements to each stored comp.
  // Distance formula mirrors the backend: ht×1.0, wt×0.5, ws×1.5 — same weights.
  useEffect(() => {
    if (wsAdj === 0 && wtAdj === 0) { setDynComps(null); return; }
    const baseHt = p.htIn || 78;
    const baseWt = estimatedWt + wtAdj;
    const baseWs = estimatedWs + wsAdj;
    const resorted = staticComps.map(c => {
      const ht_d = Math.abs((c.ht || baseHt) - baseHt);
      const wt_d = Math.abs((c.wt || baseWt) - baseWt) * 0.5;
      const ws_d = Math.abs((c.ws || baseWs) - baseWs) * 1.5;
      const dist = Math.sqrt(ht_d ** 2 + wt_d ** 2 + ws_d ** 2);
      const sim = Math.max(0, Math.min(100, Math.round((3.0 - dist) / 3.0 * 100)));
      return { ...c, dist, sim };
    }).sort((a, b) => a.dist - b.dist);
    setDynComps(resorted);
  }, [wsAdj, wtAdj, staticComps, estimatedWt, estimatedWs, p.htIn]);

  const displayComps = dynComps ?? staticComps;

  // GM-facing NBA success metrics
  const nbaComps = displayComps.filter(c => c.nba);
  const nbaRate = displayComps.length > 0 ? Math.round(nbaComps.length / displayComps.length * 100) : null;
  const tierCounts = nbaComps.reduce((acc, c) => { acc[c.tier] = (acc[c.tier]||0)+1; return acc; }, {});

  const htDisplay = p.ht || (p.htIn ? `${Math.floor(p.htIn/12)}'${p.htIn%12}"` : "—");
  const isAdjusted = wsAdj !== 0 || wtAdj !== 0;

  return (
    <div className="space-y-5">
      {/* ── PHYSICAL PROFILE ── */}
      <Sec icon="📏" title="Physical Profile" sub={`Measurements${isWsEstimated||isWtEstimated ? " (≈ = estimated from position average)" : ""}. Wingspan Delta = Wingspan − Height. NBA average: +3" to +4". Ape Index > 1.05 = above average length.`}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          {[
            ["Height", htDisplay, false, null],
            ["Weight", `${adjWt} lbs`, isWtEstimated, wtLabelColor],
            ["Wingspan", `${adjWs.toFixed(1)}"`, isWsEstimated, wsLabelColor],
            ["WS Delta", `${wsDelta >= 0 ? "+" : ""}${wsDelta.toFixed(1)}"`, false, wsLabelColor],
            ["Ape Index", apeRatio.toFixed(3), false, apeRatio >= 1.06 ? "#22c55e" : apeRatio < 1.02 ? "#ef4444" : "#6b7280"],
          ].map(([l, v, est, accent]) => (
            <div key={l} className="rounded-lg p-3 text-center" style={{background:"#0d1117", border: accent ? `1px solid ${accent}33` : "1px solid #1f2937"}}>
              <div className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>{l}{est ? " ≈" : ""}</div>
              <div className="font-bold text-lg mt-0.5" style={{color: accent || "#e5e7eb", fontFamily:"'Oswald',sans-serif"}}>{v}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mb-5">
          <Tip content={<div><div className="font-bold mb-1" style={{color:wsLabelColor}}>Wingspan Assessment</div><div style={{color:"#cbd5e1"}}>Delta = WS − Height. +6" = disruptive length, affects multiple defensive positions. Negative = tactical limitations in switching schemes.</div></div>}>
            <span className="px-3 py-1 rounded-lg text-xs cursor-help" style={{background:wsLabelColor+"22",color:wsLabelColor,border:`1px solid ${wsLabelColor}44`}}>{wsLabel}</span>
          </Tip>
          <Tip content={<div><div className="font-bold mb-1" style={{color:wtLabelColor}}>Frame Assessment</div><div style={{color:"#cbd5e1"}}>Relative to {p.pos} median (~{posMedianWt} lbs). Heavy frame = contact absorption. Light frame = needs strength development for NBA physicality.</div></div>}>
            <span className="px-3 py-1 rounded-lg text-xs cursor-help" style={{background:wtLabelColor+"22",color:wtLabelColor,border:`1px solid ${wtLabelColor}44`}}>{wtLabel}</span>
          </Tip>
        </div>

        {/* ── Combine data ── */}
        {hasCombine && (
          <div className="mb-5 p-4 rounded-lg" style={{background:"#0d1117",border:"1px solid #1f2937"}}>
            <div className="text-xs uppercase tracking-wider mb-3 font-bold" style={{color:"#f97316"}}>NBA Combine Measurements</div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center">
              {[
                ["No-Shoes Ht", p.comb.height_ns],
                ["Shoes Ht", p.comb.height_ws],
                ["Weight", p.comb.weight ? `${p.comb.weight} lbs` : null],
                ["Wingspan", p.comb.wingspan ? `${p.comb.wingspan}"` : null],
                ["Standing Reach", p.comb.reach ? `${p.comb.reach}"` : null],
                ["Body Fat", p.comb.body_fat ? `${p.comb.body_fat}%` : null],
              ].filter(([,v]) => v != null).map(([l,v]) => (
                <div key={l} className="rounded p-2" style={{background:"#111827"}}>
                  <div className="text-xs" style={{color:"#6b7280"}}>{l}</div>
                  <div className="text-sm font-semibold mt-0.5" style={{color:"#e5e7eb"}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Scout Scenario Sliders ── */}
        <div className="p-4 rounded-xl" style={{background:"#0d1117",border:"1px solid #1f2937"}}>
          <div className="text-xs uppercase tracking-wider font-bold mb-4" style={{color:"#6b7280"}}>
            Scenario Modeling — How do the comps change?
          </div>
          <div className="space-y-5">
            {/* Weight slider */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <div>
                  <span className="text-sm font-semibold" style={{color:"#e5e7eb"}}>Weight</span>
                  <span className="text-xs ml-2" style={{color:"#6b7280"}}>{isWtEstimated ? "≈ estimated" : "measured"}</span>
                </div>
                <div className="text-sm font-bold" style={{color: wtAdj > 0 ? "#22c55e" : wtAdj < 0 ? "#ef4444" : "#f97316"}}>
                  {adjWt} lbs {wtAdj !== 0 && <span style={{fontSize:11}}>({wtAdj > 0 ? "+" : ""}{wtAdj})</span>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs w-16 text-right" style={{color:"#6b7280"}}>−30 lbs</span>
                <input type="range" min={-30} max={30} step={1} value={wtAdj}
                  onChange={e => setWtAdj(+e.target.value)} className="flex-1" style={{accentColor:"#f97316"}}/>
                <span className="text-xs w-16" style={{color:"#6b7280"}}>+30 lbs</span>
              </div>
              <div className="flex justify-between text-xs mt-1" style={{color:"#374151"}}>
                <span>Leaner / Weight loss</span>
                <span style={{color:"#4b5563"}}>Base</span>
                <span>Heavier / Muscle gain</span>
              </div>
            </div>
            {/* Wingspan slider */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <div>
                  <span className="text-sm font-semibold" style={{color:"#e5e7eb"}}>Wingspan</span>
                  <span className="text-xs ml-2" style={{color: isWsEstimated ? "#fbbf24" : "#6b7280"}}>{isWsEstimated ? "≈ estimated — use slider to model uncertainty" : "measured"}</span>
                </div>
                <div className="text-sm font-bold" style={{color: wsAdj > 0 ? "#22c55e" : wsAdj < 0 ? "#ef4444" : "#f97316"}}>
                  {adjWs.toFixed(1)}" {wsAdj !== 0 && <span style={{fontSize:11}}>({wsAdj > 0 ? "+" : ""}{wsAdj}")</span>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs w-16 text-right" style={{color:"#6b7280"}}>−6"</span>
                <input type="range" min={-6} max={6} step={0.25} value={wsAdj}
                  onChange={e => setWsAdj(+e.target.value)} className="flex-1" style={{accentColor:"#f97316"}}/>
                <span className="text-xs w-16" style={{color:"#6b7280"}}>+6"</span>
              </div>
              <div className="flex justify-between text-xs mt-1" style={{color:"#374151"}}>
                <span>Short wingspan</span>
                <span style={{color:"#4b5563"}}>Base estimate</span>
                <span>Elite length</span>
              </div>
            </div>
          </div>
          {isAdjusted && (
            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs" style={{color:"#fbbf24"}}>
                ⚡ Scenario active — comps updated for adjusted measurements
              </div>
              <button onClick={() => { setWsAdj(0); setWtAdj(0); }} className="text-xs px-2 py-1 rounded"
                style={{background:"#1f2937",color:"#9ca3af"}}>Reset</button>
            </div>
          )}
        </div>
      </Sec>

      {/* ── NBA PHYSICAL COMPS ── */}
      <Sec icon="👥"
        title={isAdjusted ? `Anthropometric Comps — Scenario (${wtAdj > 0 ? "+" : ""}${wtAdj || ""}${wtAdj !== 0 ? " lbs" : ""}${wtAdj !== 0 && wsAdj !== 0 ? " · " : ""}${wsAdj > 0 ? "+" : ""}${wsAdj !== 0 ? wsAdj + '"' : ""})` : "Anthropometric Comps"}
        sub={`Physical similarity across the NBA draft database (Height 60% · Weight 20% · Wingspan 20%). No stats — body type only. ${isAdjusted ? "Results re-queried from full database at adjusted measurements." : "Adjust sliders to model scenarios: 'What if he adds 20 lbs?' or 'What if his wingspan is longer than estimated?'"}`}>

        {/* NBA Success Banner */}
        {displayComps.length > 0 && (
          <div className="flex items-center gap-4 p-4 rounded-xl mb-4" style={{background:"#0d1117",border:"1px solid #1f2937"}}>
            <div className="text-center px-4" style={{borderRight:"1px solid #1f2937"}}>
              <div className="text-xs uppercase tracking-wider mb-1" style={{color:"#6b7280"}}>NBA Rate</div>
              <div className="text-3xl font-bold" style={{color: nbaRate >= 70 ? "#22c55e" : nbaRate >= 40 ? "#fbbf24" : "#ef4444", fontFamily:"'Oswald',sans-serif"}}>
                {nbaRate ?? "—"}%
              </div>
              <div className="text-xs mt-0.5" style={{color:"#4b5563"}}>{nbaComps.length}/{displayComps.length} made it</div>
            </div>
            <div className="flex-1">
              <div className="text-xs uppercase tracking-wider mb-2 font-semibold" style={{color:"#6b7280"}}>Outcomes of physical comps</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(tierCounts).filter(([t]) => t).sort(([,a],[,b]) => b-a).map(([tier, count]) => (
                  <div key={tier} className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs" style={{background:(TC[tier]||"#6b7280")+"22",border:`1px solid ${(TC[tier]||"#6b7280")}44`}}>
                    <span style={{color:TC[tier]||"#6b7280"}}>{tier}</span>
                    <span className="font-bold" style={{color:"#e5e7eb"}}>×{count}</span>
                  </div>
                ))}
                {nbaComps.length === 0 && <span className="text-xs" style={{color:"#4b5563"}}>No NBA players in comps</span>}
              </div>
            </div>
            {dynLoading && <div className="text-xs" style={{color:"#f97316"}}>Updating…</div>}
          </div>
        )}

        {dynLoading && !displayComps.length ? (
          <div className="text-center py-8" style={{color:"#6b7280"}}>Recalculating comps…</div>
        ) : displayComps.length > 0 ? (
          <div className="space-y-1.5">
            {(() => {
              // Normalize similarity relative to best match in this player's comp set.
              // Best comp = 100%; remaining comps scaled down proportionally.
              // Avoids the "all show 76-77%" problem from similar absolute distances.
              const hasSim = displayComps.some(c => typeof c.sim === "number");
              const rawVals = displayComps.map(c =>
                hasSim ? (c.sim ?? 0) : Math.max(0, 100 - (c.dist || 0) * 4)
              );
              const maxVal = Math.max(...rawVals, 1);
              const minVal = Math.min(...rawVals, 0);
              const range  = Math.max(maxVal - minVal, 1);
              // Scale to 60–100 range so even the worst comp shows meaningful bar
              const normSim = rawVals.map(v => Math.round(60 + ((v - minVal) / range) * 40));

              return displayComps.map((c, i) => {
              const htStr = c.ht ? `${Math.floor(c.ht/12)}'${c.ht%12}"` : "—";
              const wsDeltaC = c.ws && c.ht ? (c.ws - c.ht).toFixed(1) : null;
              const simC = normSim[i];
              // Bar fills orange → more orange = closer match; no traffic-light encoding
              const barOpacity = 0.5 + (simC / 100) * 0.5;
              return (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{background: i < 3 ? "#0d1117" : "#0a0e1799", border: i < 3 ? "1px solid #1f2937" : "1px solid #1f293744"}}>
                  {/* Rank */}
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{background: i < 3 ? "#f9731622" : "#1f293766", color: i < 3 ? "#f97316" : "#6b7280"}}>
                    {i+1}
                  </div>
                  {/* Name + NBA badge */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm" style={{color: c.nba ? "#e5e7eb" : "#9ca3af"}}>{c.name}</span>
                      {c.nba && c.tier && <TierBadge tier={c.tier}/>}
                      {!c.nba && <span className="text-xs px-1.5 py-0 rounded" style={{background:"#1f2937",color:"#4b5563"}}>Never NBA</span>}
                    </div>
                    {/* Physical measurements — no stats */}
                    <div className="text-xs mt-0.5 flex gap-3" style={{color:"#6b7280"}}>
                      <span>{htStr}</span>
                      {c.wt && <span>{c.wt} lbs</span>}
                      {c.ws && <span>WS {c.ws}"</span>}
                      {wsDeltaC && <span style={{color: Number(wsDeltaC) >= 3 ? "#86efac" : Number(wsDeltaC) < 0 ? "#ef444488" : "#6b7280"}}>Δ{Number(wsDeltaC) >= 0 ? "+" : ""}{wsDeltaC}"</span>}
                    </div>
                  </div>
                  {/* Similarity bar — normalized, orange-only, no traffic-light */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-20">
                      <div className="h-2 rounded-full overflow-hidden" style={{background:"#1f2937"}}>
                        <div className="h-full rounded-full transition-all"
                          style={{width:`${simC}%`, background:`rgba(249,115,22,${barOpacity})`}}/>
                      </div>
                    </div>
                    <span className="w-10 text-xs font-bold text-right" style={{color:`rgba(249,115,22,${barOpacity})`}}>
                      {i === 0 ? "Best" : `#${i+1}`}
                    </span>
                  </div>
                </div>
              );
              });
            })()}
          </div>
        ) : (
          <div className="text-center py-8 rounded-lg" style={{background:"#0d1117",border:"1px solid #1f2937"}}>
            {p.hasCombine === false ? (
              <>
                <div className="text-2xl mb-2">📋</div>
                <div className="text-base font-semibold mb-1" style={{color:"#f97316"}}>No NBA Combine Attendance</div>
                <div className="text-sm mb-2" style={{color:"#9ca3af"}}>
                  This prospect has not attended the NBA Combine. Physical comps are only shown for players with verified combine measurements.
                </div>
                <div className="text-xs px-4" style={{color:"#6b7280"}}>
                  Combine attendance itself is a signal — top prospects are typically invited. Use the sliders above to estimate body type scenarios.
                </div>
              </>
            ) : (
              <>
                <div className="text-lg mb-1" style={{color:"#6b7280"}}>No anthropometric data available</div>
                <div className="text-xs" style={{color:"#4b5563"}}>Physical comps require height, weight, or wingspan data in the database.</div>
              </>
            )}
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
  const nbaCompsOnly = allComps.filter(c => c.nba);
  // When NBA-only is active but there are no NBA comps (e.g. 2026 prospects),
  // fall back to all comps sorted with highest-tier players first
  const fStat = nbaOnly
    ? (nbaCompsOnly.length > 0
        ? nbaCompsOnly
        : [...allComps].sort((a,b) => {
            const tr = {"All-Star":5,"Starter":4,"Role Player":3,"Replacement":2,"Negative":1};
            return (tr[b.tier]??0) - (tr[a.tier]??0);
          }))
    : allComps;
  const nbaFallback = nbaOnly && nbaCompsOnly.length === 0 && allComps.length > 0;

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
          {nbaOnly ? "★ NBA Players Only" : "All Prospects"}
        </button>
      </div>

      {nbaFallback && (
        <div className="text-xs px-3 py-2 rounded-lg" style={{background:"#1f293744",color:"#fbbf24"}}>
          ⚠ No NBA players in comps for this prospect (2026 class). Showing all comps sorted by projected tier instead.
        </div>
      )}

      {/* ── STATISTICAL COMPS TABLE ── */}
      <Sec icon="📊" title="Statistical Comps" sub="Nearest-neighbor matching on era-adjusted percentiles. Weights: Position match (30%), Age proximity (20%), Production profile (25%), Efficiency (25%). 'Reached Tier' shows actual NBA career outcome or v2 tier projection.">
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
    {cat:"ppWA Projection Model (v2)",items:["monteCarlo","posClassification"],desc:"Core engine: position-stratified ElasticNet regression + calibrated Elite Detector, trained on 1,784 NCAA and international prospects (draft classes 2010–2016) with verified NBA outcomes. Target variable: Peak Wins Added — best 3-consecutive-season window in first 8 NBA years (min 200 minutes/season). Features: 8–12 theoretically grounded variables per position group (Playmaker / Wing / Big), including age, BPM percentile, BPM trajectory, conference strength, free-throw rate, athleticism score, and position-specific shooting/playmaking signals. Output: ppWA = Projected Peak Wins Added (a single, interpretable number: 'this player projects to add X wins above replacement at his peak'). Validated on holdout classes 2017–2019: Spearman ρ = 0.460 (craftednba.com benchmark: 0.373), MAR = 12.0 per class."},
    {cat:"International Adjustments",items:[],desc:"International players receive three adjustments: (1) League Strength via empirical bridge-player ratios (2,655 players who played both intl and NBA). Euroleague=1.40, ACB=1.39, BBL=1.18 (NCAA Power=1.0 anchor). (2) Liga-BPM-Scaler: Raw BPM proxy (PER+eDiff) is multiplied by a league-specific scaler (Euroleague ×2.1, ACB ×1.9, NBL ×1.65, etc.) to translate to NCAA-equivalent BPM before feature engineering. (3) Conf-adj post-hoc with translatable-USG-aware caps for strong leagues."},
    {cat:"The 5 Pillars (DNA Scores)",items:["feel","shootScore","defScore","funcAth","selfCreation","overall"],desc:"Position-adjusted percentile scores (0–100) capturing the fundamental dimensions of prospect evaluation. Each pillar uses era-adjusted percentiles computed against ~34k college + ~9k international players since 2008. Box Creation (Ben Taylor method) measures total offensive creation: Scoring Creation (USG×TS) + Assist Creation (AST%×teammate possessions). Works identically for NCAA and international players."},
    {cat:"Shooting Projection",items:["projNba3p","projNba3pa","projNba3par","touchPrior"],desc:"Bayesian Beta-Binomial model for NBA 3P shooting translation. Prior: FT%-based 'motor touch' (strongest single predictor of NBA shooting per Berger 2023). κ=200 pseudo-attempts means low-volume college shooters regress heavily toward their FT% prior. For players without midrange data (internationals, pre-2010), a simplified FT%-only prior is used with higher FT% weighting."},
    {cat:"Possession Impact (CFFR)",items:["fourFactors"],desc:"Context-Free Four Factor Rating measuring possession efficiency per Dean Oliver's framework. Usage-role adjusted: Primary (USG≥28%), Secondary (≥22%), Finisher (≥15%), Low-Usage (<15%). Each factor (eFG% 40%, TO% 25%, ORB% 20%, FTr 15%) is percentiled WITHIN the player's usage bucket, so a primary scorer with 52% eFG rates correctly against peers, not low-usage finishers."},
    {cat:"Role Inference Matrix",items:[],desc:"14 NBA roles scored as z-scores relative to position peers. Offensive: Scorer, Playmaker, Spacer, Driver, Crasher. Defensive: On-Ball, Switch Potential, Rim Protect, Rebounder. Hybrid: Connector, Helio-Scorer, Event Creator, Zone Pressure, Micro-Spacer. Each role combines 2-4 statistical inputs weighted by NBA translation research. Z≥+2.0 = Elite, ≥+1.0 = Impact, <-1.0 = Liability."},
    {cat:"Archetype Classification",items:[],desc:"18 NBA archetypes assigned by position + dominant role scores. Playmaker archetypes: Scoring Playmaker, Floor General, Spacing Guard, Defensive Guard, Non-Specialized Playmaker. Wing: Initiator Wing, Scoring Wing, 3-and-D, Defensive Wing, Point Forward, Slashing Wing, Non-Specialized Wing. Big: Stretch Big, Stretch Rim Protector, Rim Protector, Short Roll Playmaker, Passing Hub, Glass Cleaner, Scoring Big, Non-Specialized Big. Primary archetype from pipeline, secondary/tertiary from role-score matching within position."},
    {cat:"Tier Feasibility (vs NBA)",items:[],desc:"Position-specific comparison against NBA tier benchmarks (p25-p75 corridors). For each tier (Replacement through All-Star), core metrics are checked: Wings = TS%+3P%, Playmakers = AST%+TO%, Bigs = BLK%+ORB%. If a core metric exceeds p75 of the target tier, deficiencies in secondary metrics are marked 'Compensated' (yellow) instead of 'Critical Gap' (red)."},
    {cat:"Data Sources & Coverage",items:[],desc:"NCAA: BartTorvik (34k+ player-seasons 2008-2026, per-game + advanced + shooting zones). International: RealGM (9k+ player-seasons across 12 European leagues). NBA Outcomes: NBA API Advanced stats (27 seasons, PIE + minutes for peak computation). Anthropometrics: NBA Draft Combine measurements + Databallr wingspan data. Scouting: Scout consensus rankings (2008-2026) for humble/draft-stock adjustment."},
  ];
  /* ── Pipeline Flow Diagram ── */
  const PipelineDiagram = () => {
    const boxStyle = (color) => ({
      background:"#0d1117", border:`1.5px solid ${color}44`, borderRadius:10,
      padding:"10px 14px", textAlign:"center", position:"relative",
    });
    const arrow = (dir="down") => (
      <div style={{textAlign:"center",color:"#374151",fontSize:18,lineHeight:"20px"}}>
        {dir==="down"?"▼":dir==="right"?"▶":"▼"}
      </div>
    );
    const dataBox = (label, sub, color="#60a5fa") => (
      <div style={boxStyle(color)}>
        <div style={{color, fontSize:12, fontWeight:700, fontFamily:"'Oswald',sans-serif"}}>{label}</div>
        <div style={{color:"#6b7280", fontSize:10, marginTop:2}}>{sub}</div>
      </div>
    );

    return (
      <div style={{padding:"8px 0"}}>
        {/* Row 1: Data Sources */}
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, marginBottom:4}}>
          {dataBox("BartTorvik", "34k NCAA players\nBPM, TS%, USG%, shooting", "#60a5fa")}
          {dataBox("RealGM", "9k intl players\n12 European leagues", "#f97316")}
          {dataBox("NBA API", "27 seasons\nPIE + minutes → Peak WA", "#22c55e")}
          {dataBox("Combine + Scout", "Anthro, wingspan\nConsensus rankings", "#a78bfa")}
        </div>
        {arrow()}

        {/* Row 2: Feature Engineering */}
        <div style={{...boxStyle("#fbbf24"), marginBottom:4}}>
          <div style={{color:"#fbbf24", fontSize:13, fontWeight:700, fontFamily:"'Oswald',sans-serif"}}>Feature Engineering</div>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginTop:6}}>
            {[
              ["BPM Percentile", "Era-adjusted, global rank"],
              ["BPM Trajectory", "Slope + delta (multi-season)"],
              ["Func. Athleticism", "Dunk rate × usage proxy"],
              ["League Translation", "Bridge-player ratios (2,655)"],
              ["Position Group", "Playmaker / Wing / Big"],
              ["Age at Draft", "Development runway"],
              ["Conference Str.", "Power / Mid / Low tier"],
              ["FT Rate + 3P%", "Contact creation + range"],
              ["Pos-Specific", "AST% (PG) · BLK% (C) · 3P (W)"],
            ].map(([l,s])=>(
              <div key={l} style={{background:"#1a1a2e",borderRadius:6,padding:"5px 8px"}}>
                <div style={{color:"#e5e7eb",fontSize:10,fontWeight:600}}>{l}</div>
                <div style={{color:"#4b5563",fontSize:9}}>{s}</div>
              </div>
            ))}
          </div>
        </div>
        {arrow()}

        {/* Row 3: Two-Component Model */}
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:4}}>
          <div style={boxStyle("#ef4444")}>
            <div style={{color:"#ef4444", fontSize:12, fontWeight:700, fontFamily:"'Oswald',sans-serif"}}>ElasticNet Regression</div>
            <div style={{color:"#6b7280", fontSize:10, marginTop:3}}>Position-stratified<br/>8–12 features per group<br/>→ wa_pred (continuous)</div>
          </div>
          <div style={boxStyle("#8b5cf6")}>
            <div style={{color:"#8b5cf6", fontSize:12, fontWeight:700, fontFamily:"'Oswald',sans-serif"}}>Elite Detector</div>
            <div style={{color:"#6b7280", fontSize:10, marginTop:3}}>Calibrated classifier<br/>P(All-Star+) probability<br/>→ pElite (0–1)</div>
          </div>
        </div>
        <div style={{textAlign:"center",color:"#6b7280",fontSize:10,marginBottom:2}}>
          ppWA = P(Elite) × E[WA|Elite] + (1 − P(Elite)) × wa_pred
        </div>
        {arrow()}

        {/* Row 4: Outputs */}
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8}}>
          <div style={boxStyle("#f97316")}>
            <div style={{color:"#f97316", fontSize:12, fontWeight:700, fontFamily:"'Oswald',sans-serif"}}>NBA Projection</div>
            <div style={{color:"#6b7280", fontSize:10, marginTop:3}}>ppWA score<br/>5 tier probabilities<br/>Boosters + Limiters</div>
          </div>
          <div style={boxStyle("#60a5fa")}>
            <div style={{color:"#60a5fa", fontSize:12, fontWeight:700, fontFamily:"'Oswald',sans-serif"}}>Intl Projection</div>
            <div style={{color:"#6b7280", fontSize:10, marginTop:3}}>If P(NBA) &lt; 15%<br/>5 intl tiers (sigmoid)<br/>Calibrated from 254 bridge</div>
          </div>
          <div style={boxStyle("#22c55e")}>
            <div style={{color:"#22c55e", fontSize:12, fontWeight:700, fontFamily:"'Oswald',sans-serif"}}>Player Profile</div>
            <div style={{color:"#6b7280", fontSize:10, marginTop:3}}>DNA Pillars · Roles<br/>Archetypes · Comps<br/>Season trajectory</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* ── Pipeline Diagram ── */}
      <Sec icon="🔬" title="Model Pipeline" sub="How data flows from raw sources through feature engineering to final projections.">
        <PipelineDiagram/>
      </Sec>

      <Sec icon="📖" title="Methodology & Model Documentation" sub="Complete documentation of all computed metrics, formulas, and their statistical foundations.">
        <div className="text-sm mb-3" style={{color:"#9ca3af"}}>
          ProspectTheory v2 uses <strong style={{color:"#e5e7eb"}}>ppWA (Projected Peak Wins Added)</strong> — a single, interpretable metric built from a two-component mixture model: position-stratified ElasticNet regression combined with a calibrated Elite Detector. Trained on 1,784 prospects (2010–2016) with verified NBA outcomes. Target: best 3-consecutive-season peak in first 8 NBA years. All scores are position-aware (Playmaker / Wing / Big) and era-adjusted.
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          {[
            ["ρ = 0.46","Spearman (holdout 2017–19)"],
            ["0.373","craftednba.com baseline"],
            ["8–12","Features per position group"],
            ["1,784","Training prospects (2010–16)"],
          ].map(([val,label])=>(
            <div key={label} className="p-3 rounded-lg text-center" style={{background:"#0d1117"}}>
              <div className="text-lg font-bold" style={{color:"#f97316",fontFamily:"'Oswald',sans-serif"}}>{val}</div>
              <div className="text-xs" style={{color:"#6b7280"}}>{label}</div>
            </div>
          ))}
        </div>
        <div className="text-xs" style={{color:"#475569"}}>
          Key features: Age at draft day · BPM percentile (global) · BPM trajectory slope · Conference strength · Free-throw rate · Functional athleticism · Position-specific: AST/TOV ratio (Playmaker), 3P% (Wing), BLK% (Big). Model validated on holdout 2017–2019 using temporal split (no future leakage).
        </div>
      </Sec>

      {/* ── LIMITATIONS & HONEST CAVEATS ── */}
      <Sec icon="⚠️" title="Honest Limitations" sub="What the model cannot know — and why that's okay.">
        <div className="space-y-3 text-sm" style={{color:"#94a3b8"}}>
          <div className="p-4 rounded-lg" style={{background:"#0d1117",border:"1px solid #1f2937"}}>
            <div className="font-semibold mb-1" style={{color:"#fbbf24"}}>Prediction Error is Large by Design</div>
            <div>Player development is fundamentally uncertain. Injuries, team fit, coaching, and mental growth cannot be predicted from college statistics. Our RMSE of ~9 WA means a player projected at Starter level (12 WA) could plausibly reach All-Star (21 WA) or Role Player (7 WA) outcomes. <strong style={{color:"#e5e7eb"}}>Use ppWA as a probability-weighted central estimate, not a guarantee</strong> — that's why we show tier distributions, not just a single number.</div>
          </div>
          <div className="p-4 rounded-lg" style={{background:"#0d1117",border:"1px solid #1f2937"}}>
            <div className="font-semibold mb-1" style={{color:"#fbbf24"}}>Selection Bias: Non-Drafted Players Are Invisible</div>
            <div>The model trains only on players who entered our database as prospects — typically those who declared for the draft or played in tracked leagues. Late bloomers like Isaiah Thomas or Jalen Brunson, who slipped through or were underdogs, are systematically underrepresented. If you see a high ppWA for a late-round prospect, that's based on the statistical profile alone — not on any pre-draft consensus signal.</div>
          </div>
          <div className="p-4 rounded-lg" style={{background:"#0d1117",border:"1px solid #1f2937"}}>
            <div className="font-semibold mb-1" style={{color:"#fbbf24"}}>Future Classes Are Out-of-Sample</div>
            <div>The model was trained on 2010–2016 drafts, validated on 2017–2019. Every class from 2020 onward is true out-of-sample data — the model has never seen their NBA outcomes. We update the training window over time, but there is always a lag. Treat current-class projections as informed priors, not retrospective validations.</div>
          </div>
          <div className="p-4 rounded-lg" style={{background:"#0d1117",border:"1px solid #1f2937"}}>
            <div className="font-semibold mb-1" style={{color:"#fbbf24"}}>International Translations Are Approximations</div>
            <div>League strength adjustments (Euroleague ×1.40, ACB ×1.39, etc.) are derived from bridge players who played in both leagues. A player with no bridge-player comparison — e.g., a dominant presence in a weaker domestic league — has higher uncertainty than a Power-5 NCAA prospect. The model applies conservative adjustments, which may systematically undervalue elite international players.</div>
          </div>
          <div className="p-3 rounded-lg text-xs" style={{background:"#0d111744",color:"#4b5563",border:"1px solid #1f293744"}}>
            <strong style={{color:"#6b7280"}}>Context:</strong> ProspectTheory v2's Spearman ρ = 0.46 compares favorably to craftednba.com (0.373) and published NBA team benchmarks (~0.33). But all prospect models, including those used by NBA front offices, are limited by the same fundamental ceiling: player development is irreducibly noisy. The goal is better-than-random, not perfect.
          </div>
        </div>
      </Sec>
      {sections.map(({cat,items,desc})=>(
        <Sec key={cat} icon="▸" title={cat}>
          {desc&&<div className="text-sm mb-4" style={{color:"#94a3b8"}}>{desc}</div>}
          {items.length > 0 && (
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
          )}
        </Sec>
      ))}
      <Sec icon="🏅" title="Badge Definitions" sub="Green = elite NBA skills · Yellow = swing/potential · Red = warning signals. Position-filtered: Bigs can't earn Floor General, Playmakers can't earn Rim Protector.">
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
    setYearFilter(String(newYear));
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
    const tierRank = {"Superstar":6,"All-Star":5,"Starter":4,"Role Player":3,"Replacement":2,"Negative":1};
    const sortFn = {
      war:     (a,b) => (b.war ?? b.ppwa ?? -999) - (a.war ?? a.ppwa ?? -999),
      age:     (a,b) => (a.age ?? 99) - (b.age ?? 99),
      bpm:     (a,b) => (b.bpm ?? -999) - (a.bpm ?? -999),
      super:   (a,b) => (b.tiers?.Superstar ?? 0) - (a.tiers?.Superstar ?? 0),
      allstar: (a,b) => (b.tiers?.["All-Star"] ?? 0) - (a.tiers?.["All-Star"] ?? 0),
      starter: (a,b) => (b.tiers?.Starter ?? 0) - (a.tiers?.Starter ?? 0),
      role:    (a,b) => (b.tiers?.["Role Player"] ?? 0) - (a.tiers?.["Role Player"] ?? 0),
      repl:    (a,b) => (b.tiers?.Replacement ?? 0) - (a.tiers?.Replacement ?? 0),
      tier:    (a,b) => (tierRank[b.predTier]??0) - (tierRank[a.predTier]??0),
    };
    list = [...list].sort(sortFn[sortBy] || sortFn.war);
    return list.slice(0, 60);
  }, [allPlayers, sortBy, posFilter]);

  const posColors = {Playmaker:"#3b82f6", Wing:"#f97316", Big:"#8b5cf6"};

  // Sort label for header
  const sortLabels = {war:"ppWA", age:"Age (youngest)", bpm:"BPM", super:"Star %", allstar:"All-Star %", starter:"Starter %", role:"Role %", tier:"Tier"};

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
          {[["war","ppWA"],["age","Age"],["bpm","BPM"]].map(([k,l])=>(
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
                <SortTh sortKey="war">ppWA</SortTh>
                <SortTh sortKey="bpm">BPM</SortTh>
                <SortTh sortKey="tier">NBA Tier</SortTh>
                <th className="px-3 py-2.5 text-left text-xs uppercase tracking-wider font-semibold" style={{color:"#6b7280",borderBottom:"1px solid #1f2937"}}>Intl Tier</th>
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
                    <td className="px-3 py-2.5 font-bold" style={{color: p.war != null ? (p.war>=25?"#fbbf24":p.war>=10?"#f97316":p.war>=4?"#3b82f6":"#6b7280") : "#374151", fontFamily:"'Oswald',sans-serif"}}>{p.war != null ? fmt(p.war, 1) : "—"}</td>
                    <td className="px-3 py-2.5 text-xs font-semibold" style={{color: p.bpm != null ? (p.bpm > 8 ? "#22c55e" : p.bpm > 4 ? "#86efac" : "#9ca3af") : "#374151"}}>{p.bpm != null ? fmt(p.bpm, 1) : "—"}</td>
                    {/* NBA Tier */}
                    <td className="px-3 py-2.5 text-xs font-bold" style={{color:TC[p.predTier]||"#6b7280"}}>{p.predTier||"—"}</td>
                    {/* International Tier — only for genuine non-NBA prospects:
                        not already in NBA, pElite < 15%, ppWA < 10 */}
                    {(() => {
                      const ppwa = p.war ?? p.ppwa;
                      const pEl  = p.pElite;
                      const showIntl = !p.madeNba && pEl != null && pEl < 0.15 && ppwa != null && ppwa < 10;
                      if (!showIntl) return <td className="px-3 py-2.5 text-xs" style={{color:"#374151"}}>—</td>;
                      const INTL_COLORS = {"EL Impact":"#fbbf24","EuroLeague":"#f97316","Top League":"#60a5fa","Pro Ball":"#a78bfa","Fringe":"#6b7280"};
                      const label = ppwa>=7?"EL Impact":ppwa>=4?"EuroLeague":ppwa>=2?"Top League":ppwa>=0.5?"Pro Ball":"Fringe";
                      return <td className="px-3 py-2.5 text-xs font-semibold" style={{color:INTL_COLORS[label]||"#6b7280"}}>🌍 {label}</td>;
                    })()}
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
  const [apiVersion,setApiVersion]=useState(null);

  useEffect(()=>{
    setLoading(true);
    fetch(`${API_BASE}/years`)
      .then(r=>r.json())
      .then(yearData=>{
        const yrs = yearData.years || [];
        setAvailableYears(["All", ...yrs]);
        if (yearData.api_version) setApiVersion(yearData.api_version);
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
    setSel(name); setSearch(""); setShowS(false); setTab("overview");
    if (profileCache[name]) return;

    // If board already loaded rich profile data (ppwa present), show Overview
    // immediately and load full profile + comps in background — no blocking spinner.
    const boardProfile = PLAYERS[name];
    const alreadyRich = boardProfile && (boardProfile.ppwa != null || boardProfile.pctl != null);
    if (alreadyRich) {
      setProfileCache(prev => ({...prev, [name]: boardProfile}));
      // Fetch full profile + comps in background (non-blocking)
      // This ensures Shooting/Scouting/Projection tabs always get complete data
      Promise.all([
        fetch(`${API_BASE}/player/${encodeURIComponent(name)}`).then(r=>r.ok?r.json():null).catch(()=>null),
        fetch(`${API_BASE}/comps/stats/${encodeURIComponent(name)}`).then(r=>r.ok?r.json():null).catch(()=>null),
        fetch(`${API_BASE}/comps/anthro/${encodeURIComponent(name)}`).then(r=>r.ok?r.json():null).catch(()=>null),
      ]).then(([profRes, statsRes, anthroRes]) => {
        // Use full profile if available, fall back to board profile
        const updated = profRes?.profile ? mapProfile(profRes.profile) : {...boardProfile};
        if (statsRes?.comps) updated.statComps = statsRes.comps.map(c => {
          let sim = null;
          if (c.similarity != null) {
            const raw = Number(c.similarity);
            if (raw > 100) sim = Math.max(0, Math.round(100 - raw / 5));
            else if (raw > 1 && raw <= 100) sim = Math.round(raw);
            else if (raw >= 0 && raw <= 1) sim = Math.round(raw * 100);
            else sim = Math.max(0, Math.round(100 - Math.abs(raw) * 2));
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
        if (anthroRes) {
          updated.hasCombine = anthroRes.has_combine ?? (anthroRes.comps?.length > 0);
          updated.anthroComps = (anthroRes.comps||[]).map(c=>({
            name:c.name, dist:c.distance, sim:Math.round(c.similarity||0),
            ht:c.height||c.ht, wt:c.weight||c.wt, ws:c.wingspan||c.ws,
            nba:!!c.made_nba, tier:c.tier||"",
          }));
        }
        PLAYERS[name] = updated;
        setProfileCache(prev => ({...prev, [name]: updated}));
      }).catch(() => {});
      return;
    }

    // Full fetch for players not in board cache (search results, etc.)
    setProfileLoading(true);
    try {
      const [profRes, statsRes, anthroRes] = await Promise.all([
        fetch(`${API_BASE}/player/${encodeURIComponent(name)}`).then(r=>r.ok?r.json():null),
        fetch(`${API_BASE}/comps/stats/${encodeURIComponent(name)}`).then(r=>r.ok?r.json():null).catch(()=>null),
        fetch(`${API_BASE}/comps/anthro/${encodeURIComponent(name)}`).then(r=>r.ok?r.json():null).catch(()=>null),
      ]);
      if (profRes?.profile) {
        const mapped = mapProfile(profRes.profile);
        if (statsRes?.comps) mapped.statComps = statsRes.comps.map(c => {
          let sim = null;
          if (c.similarity != null) {
            const raw = Number(c.similarity);
            if (raw > 100) sim = Math.max(0, Math.round(100 - raw / 5));
            else if (raw > 1 && raw <= 100) sim = Math.round(raw);
            else if (raw >= 0 && raw <= 1) sim = Math.round(raw * 100);
            else sim = Math.max(0, Math.round(100 - Math.abs(raw) * 2));
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
        if (anthroRes) {
          mapped.hasCombine = anthroRes.has_combine ?? (anthroRes.comps?.length > 0);
          mapped.anthroComps = (anthroRes.comps||[]).map(c=>({
            name:c.name, dist:c.distance, sim:Math.round(c.similarity||0),
            ht:c.height||c.ht, wt:c.weight||c.wt, ws:c.wingspan||c.ws,
            nba:!!c.made_nba, tier:c.tier||"",
          }));
        }
        PLAYERS[name] = mapped;
        setProfileCache(prev => ({...prev, [name]: mapped}));
      }
    } catch(e) { console.error("Profile fetch failed:", e); }
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
  // pReady: full profile loaded — accept ppwa OR legacy pctl+stats signal
  const pReady = p && (
    (p.ppwa != null) ||
    (p.pctl != null && (p.pts != null || p.usg != null || p.feel != null))
  );

  return (
    <div className="min-h-screen" style={{background:"#080b12",fontFamily:"'Barlow',sans-serif",color:"#e5e7eb"}}>
      <header className="sticky top-0 z-50 px-4 md:px-8 py-3" style={{background:"rgba(8,11,18,0.92)",backdropFilter:"blur(12px)",borderBottom:"1px solid #1f293744"}}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={()=>{setSel(null);setTab("overview");}}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm" style={{background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#000"}}>PT</div>
            <div>
              <div className="font-bold text-sm tracking-wider" style={{fontFamily:"'Oswald',sans-serif",color:"#f97316"}}>PROSPECT THEORY</div>
              <div className="flex items-center gap-2">
                <div className="text-xs" style={{color:"#6b7280"}}>NBA Draft Intelligence</div>
                {apiVersion && <span className="text-xs px-1.5 py-0.5 rounded" style={{background:"#1f2937",color:"#4b5563",fontSize:9}}>API v{apiVersion}</span>}
              </div>
            </div>
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
                    <div className="text-xs uppercase tracking-widest mb-1 flex items-center gap-2" style={{color:"#6b7280"}}>
                      <span>{p.draftYear || p.yr} Draft Class{p.source!=="ncaa"?` · ${p.source?.toUpperCase()}`:""}</span>
                      {p.classRank && (
                        <Tip content={<div><div className="font-bold mb-1" style={{color:"#f97316"}}>Model Draft Class Rank</div><div style={{color:"#cbd5e1"}}>Ranked #{p.classRank} in the {p.draftYear||p.yr} class by projected peak wins added (ppWA). Based on ProspectTheory v2 model — not a scout consensus ranking.</div></div>}>
                          <span className="px-1.5 py-0.5 rounded font-bold cursor-help" style={{background:"#f9731622",color:"#fb923c",border:"1px solid #f9731644",fontFamily:"'Oswald',sans-serif",fontSize:"0.7rem"}}>
                            #{p.classRank} MODEL
                          </span>
                        </Tip>
                      )}
                    </div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight" style={{fontFamily:"'Oswald',sans-serif"}}>{sel}</h1>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-sm" style={{color:"#9ca3af"}}>
                      <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{background:"#f9731622",color:"#f97316"}}>{p.pos}</span>
                      {(() => {
                        const allArch = (p.archetypesAll || p.archetype || "").split("|").filter(Boolean);
                        return allArch.map((a, i) => {
                          const ac = ARCH_COLORS[a] || "#60a5fa";
                          return (
                            <span key={a} className="px-2 py-0.5 rounded text-xs font-semibold" style={{
                              background: i === 0 ? ac + "33" : ac + "18",
                              color: i === 0 ? ac : ac + "cc",
                              border: `1px solid ${i === 0 ? ac + "55" : ac + "33"}`
                            }}>{a}</span>
                          );
                        });
                      })()}
                      <span>{p.team}</span><span>·</span><span>{p.ht}</span><span>·</span><span>Age {p.age!=null?Number(p.age).toFixed(1):"—"}</span>
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
        <span style={{color:"#6b7280"}}>ProspectTheory</span> · NBA Draft Intelligence · Data: BartTorvik, RealGM, NBA API, Draft Combine, Databallr
      </footer>
    </div>
  );
}
