import { useState, useEffect, useMemo, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, Cell, ResponsiveContainer, AreaChart, Area, CartesianGrid } from "recharts";

// ═══════════════════════════════════════════════════════════
// CONSTANTS & HELPERS
// ═══════════════════════════════════════════════════════════
const TC = { Superstar:"#fbbf24","All-Star":"#f97316",Starter:"#3b82f6","Role Player":"#06b6d4",Replacement:"#8b5cf6",Negative:"#6b7280","Never Made NBA":"#374151","Out":"#374151" };
// Empirical NBA outcomes per archetype — what tier these players TYPICALLY reach.
// Source: data-pipeline archetype_value_prior.csv (realized peak Wins Added of
// ~1,210 NBA players by their pre-draft archetype, draft classes ~2008–2024).
// ceiling = tier of the top-10% (p90) outcome; starterPlus/allstarPlus = % who
// reached Starter+ (peak WA≥15) / All-Star+ (≥25). Empirical, not normative.
const ARCHETYPE_TIER = {
  "Scoring Playmaker":        {ceiling:"All-Star",   starterPlus:20, allstarPlus:13, n:123},
  "Stretch Rim Protector":    {ceiling:"All-Star",   starterPlus:21, allstarPlus:13, n:61},
  "Rim Protector":            {ceiling:"Starter",    starterPlus:23, allstarPlus:9,  n:57},
  "Stretch Big":              {ceiling:"Starter",    starterPlus:15, allstarPlus:9,  n:100},
  "Passing Hub":              {ceiling:"Starter",    starterPlus:17, allstarPlus:8,  n:24},
  "Initiator Wing":           {ceiling:"Role Player",starterPlus:10, allstarPlus:8,  n:106},
  "Non-Specialized Playmaker":{ceiling:"Starter",    starterPlus:20, allstarPlus:7,  n:30},
  "Point Forward":            {ceiling:"Starter",    starterPlus:14, allstarPlus:7,  n:42},
  "Spacing Guard":            {ceiling:"Starter",    starterPlus:15, allstarPlus:6,  n:54},
  "3-and-D Wing":             {ceiling:"Role Player",starterPlus:11, allstarPlus:5,  n:19},
  "Non-Specialized Wing":     {ceiling:"Starter",    starterPlus:18, allstarPlus:5,  n:62},
  "Defensive Guard":          {ceiling:"Starter",    starterPlus:21, allstarPlus:3,  n:39},
  "Scoring Wing":             {ceiling:"Starter",    starterPlus:11, allstarPlus:3,  n:374},
  "Glass Cleaner":            {ceiling:"Role Player",starterPlus:7,  allstarPlus:3,  n:29},
  "Defensive Wing":           {ceiling:"Role Player",starterPlus:9,  allstarPlus:0,  n:33},
  "Short Roll Playmaker":     {ceiling:"Role Player",starterPlus:4,  allstarPlus:0,  n:27},
};
// Value bands for the Research tab: realized peak Wins Added by archetype.
// floor = 25th pct outcome (downside), median = typical, ceiling = 90th pct (upside).
// n = sample size → how confident we are the band is real (more data = tighter estimate).
// grp = position group (for color). Same source as ARCHETYPE_TIER.
const ARCHETYPE_BANDS = {
  "Scoring Playmaker":        {floor:-0.8, median:2.0, ceiling:29.2, n:123, grp:"Playmaker"},
  "Stretch Rim Protector":    {floor:2.2,  median:6.1, ceiling:28.4, n:61,  grp:"Big"},
  "Stretch Big":              {floor:-1.5, median:1.7, ceiling:23.4, n:100, grp:"Big"},
  "Rim Protector":            {floor:0.7,  median:4.6, ceiling:22.1, n:57,  grp:"Big"},
  "Defensive Guard":          {floor:-1.0, median:1.8, ceiling:21.6, n:39,  grp:"Playmaker"},
  "Point Forward":            {floor:-0.6, median:0.4, ceiling:19.5, n:42,  grp:"Wing"},
  "Non-Specialized Wing":     {floor:-2.1, median:-0.6,ceiling:19.4, n:62,  grp:"Wing"},
  "Spacing Guard":            {floor:-0.4, median:3.2, ceiling:19.1, n:54,  grp:"Playmaker"},
  "Passing Hub":              {floor:-1.4, median:0.8, ceiling:18.3, n:24,  grp:"Big"},
  "Non-Specialized Playmaker":{floor:-2.0, median:0.3, ceiling:16.7, n:30,  grp:"Playmaker"},
  "Scoring Wing":             {floor:-1.7, median:0.8, ceiling:16.3, n:374, grp:"Wing"},
  "Initiator Wing":           {floor:-1.8, median:0.4, ceiling:13.8, n:106, grp:"Wing"},
  "3-and-D Wing":             {floor:-2.1, median:-1.0,ceiling:13.8, n:19,  grp:"Wing"},
  "Glass Cleaner":            {floor:-1.4, median:0.5, ceiling:12.4, n:29,  grp:"Big"},
  "Defensive Wing":           {floor:-1.8, median:-0.4,ceiling:12.3, n:33,  grp:"Wing"},
  "Short Roll Playmaker":     {floor:-0.2, median:2.7, ceiling:10.2, n:27,  grp:"Big"},
};
// Example NBA players per archetype, grouped by the tier they actually REACHED.
// Source: same archetype × peak-WA join, strict name-match (no Jr/Sr collisions),
// lightly curated to recognizable, correctly-attributed names. NOTE: these are
// PRE-DRAFT archetypes — some players evolved into a different NBA role (e.g. Jokic
// was a pre-draft "Scoring Wing"). That's the point: it shows the realized range.
const ARCHETYPE_EXAMPLES = {
  "Scoring Playmaker":         {allstar:["Shai Gilgeous-Alexander","Stephen Curry"], starter:["De'Aaron Fox"], role:["Marcus Smart"]},
  "Stretch Rim Protector":     {allstar:["Joel Embiid","Anthony Davis"], starter:["Jusuf Nurkic","Hassan Whiteside"]},
  "Stretch Big":               {allstar:["Amar'e Stoudemire","Blake Griffin"], starter:["Zion Williamson"], role:["OG Anunoby"]},
  "Rim Protector":             {allstar:["Rudy Gobert","DeAndre Jordan"], starter:["Steven Adams"], role:["John Collins"]},
  "Defensive Guard":           {starter:["Jrue Holiday","Dejounte Murray"], role:["De'Anthony Melton"]},
  "Point Forward":             {starter:["Boris Diaw","Nicolas Batum"], role:["Mike James"]},
  "Spacing Guard":             {allstar:["Klay Thompson","Darius Garland"], starter:["George Hill"], role:["Donte DiVincenzo"]},
  "Scoring Wing":              {allstar:["Nikola Jokic","Jayson Tatum"], starter:["Franz Wagner"], role:["Sam Hauser"]},
  "Non-Specialized Playmaker": {allstar:["Michael Jordan","Russell Westbrook"], starter:["Jordan Clarkson"]},
  "Non-Specialized Wing":      {allstar:["Josh Smith"], role:["Ricky Davis"]},
  "Passing Hub":               {allstar:["Carlos Boozer"], starter:["Udonis Haslem"]},
  "Initiator Wing":            {allstar:["Kawhi Leonard","Paul George"], starter:["Malcolm Brogdon"], role:["Cade Cunningham"]},
  "Glass Cleaner":             {starter:["Tiago Splitter"]},
  "Short Roll Playmaker":      {starter:["Aaron Gordon"], role:["Jakob Poeltl"]},
};
// Pre-draft archetype → NBA outcome distribution (drafted classes ≤2020, n≥15).
// Source: nba_transition.csv. "Did Not Stick" = no established ≥500-min NBA role.
const ARCHETYPE_TRANSITION = {
  "Scoring Wing":              {n:227, stick:0.24, outcomes:[["Did Not Stick",0.326],["Non-Specialized Wing",0.167],["Scoring Wing",0.132],["Stretch Big",0.088],["Non-Specialized Big",0.053],["Point Forward",0.053]]},
  "Scoring Playmaker":         {n:95,  stick:0.34, outcomes:[["Non-Specialized Playmaker",0.263],["Did Not Stick",0.221],["Scoring Playmaker",0.168],["Defensive Guard",0.105],["Spacing Guard",0.095],["Floor General",0.042]]},
  "Stretch Big":               {n:76,  stick:0.22, outcomes:[["Did Not Stick",0.303],["Stretch Big",0.25],["Non-Specialized Big",0.118],["Short Roll Playmaker",0.079],["Non-Specialized Wing",0.066],["Passing Hub",0.066]]},
  "Initiator Wing":            {n:67,  stick:0.18, outcomes:[["Did Not Stick",0.269],["Non-Specialized Wing",0.179],["Scoring Wing",0.164],["Stretch Big",0.104],["Defensive Wing",0.075],["Non-Specialized Playmaker",0.045]]},
  "Stretch Rim Protector":     {n:53,  stick:0.32, outcomes:[["Stretch Big",0.321],["Did Not Stick",0.208],["Rim Protector",0.17],["Stretch Rim Protector",0.094],["Non-Specialized Big",0.075],["Passing Hub",0.075]]},
  "Rim Protector":             {n:52,  stick:0.27, outcomes:[["Did Not Stick",0.423],["Rim Protector",0.173],["Non-Specialized Big",0.154],["Glass Cleaner",0.115],["Stretch Big",0.058],["Scoring Big",0.038]]},
  "Spacing Guard":             {n:30,  stick:0.27, outcomes:[["Non-Specialized Playmaker",0.3],["Did Not Stick",0.2],["Scoring Wing",0.167],["Spacing Guard",0.1],["Non-Specialized Wing",0.1],["Point Forward",0.067]]},
  "Short Roll Playmaker":      {n:25,  stick:0.32, outcomes:[["Did Not Stick",0.28],["Passing Hub",0.16],["Stretch Big",0.16],["Non-Specialized Big",0.12],["Rim Protector",0.08],["Glass Cleaner",0.08]]},
  "Defensive Guard":           {n:20,  stick:0.4,  outcomes:[["Did Not Stick",0.25],["Non-Specialized Wing",0.2],["Defensive Guard",0.15],["Non-Specialized Playmaker",0.15],["Scoring Wing",0.1],["Spacing Guard",0.05]]},
  "Non-Specialized Playmaker": {n:19,  stick:0.21, outcomes:[["Did Not Stick",0.474],["Non-Specialized Playmaker",0.263],["Defensive Guard",0.105],["Spacing Guard",0.105],["Initiator Wing",0.053]]},
};
// Talent gradient: pre-draft archetype × projected-value tercile → [stick%, AllStar%, n].
// Same pre-draft type, very different outcome by talent ("a scoring guard must be elite").
const ARCHETYPE_TALENT = {
  "Scoring Playmaker":     {low:[6,0,32], mid:[19,3,31], high:[75,38,32]},
  "Stretch Rim Protector": {low:[0,0,18], mid:[24,6,17], high:[72,28,18]},
  "Rim Protector":         {low:[6,0,18], mid:[19,6,16], high:[56,22,18]},
  "Spacing Guard":         {low:[0,0,10], mid:[20,10,10], high:[60,10,10]},
  "Stretch Big":           {low:[4,0,25], mid:[8,0,25],  high:[54,23,26]},
  "Scoring Wing":          {low:[4,0,76], mid:[17,0,75], high:[50,12,76]},
  "Initiator Wing":        {low:[4,0,23], mid:[5,0,21],  high:[43,30,23]},
};
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

// ── Position-spezifische Empirical-Percentile (BartTorvik 2008-2026) ──
// Tobias 2026-05-09: Frontend-Fallback wenn API kein pctl_ast / pctl_to liefert.
// AST% Verteilung pro Position (D1 NCAA, ≥10 GP):
//   Playmaker: p10=12, p25=18, p50=24, p75=31, p90=38
//   Wing:      p10= 5, p25= 8, p50=12, p75=17, p90=24
//   Big:       p10= 4, p25= 6, p50= 9, p75=13, p90=18
function estPctlAstWithinPos(ast, pos) {
  if (ast == null) return null;
  const breaks = pos === "Playmaker" ? [12, 18, 24, 31, 38]
               : pos === "Big"       ? [4, 6, 9, 13, 18]
               :                        [5, 8, 12, 17, 24];  // Wing default
  const pcts = [10, 25, 50, 75, 90];
  if (ast <= breaks[0]) return Math.max(2, Math.round(ast / breaks[0] * 10));
  if (ast >= breaks[4]) return Math.min(99, Math.round(90 + (ast - breaks[4]) / 2));
  for (let i = 1; i < breaks.length; i++) {
    if (ast <= breaks[i]) {
      const t = (ast - breaks[i-1]) / (breaks[i] - breaks[i-1]);
      return Math.round(pcts[i-1] + t * (pcts[i] - pcts[i-1]));
    }
  }
  return null;
}
// TO% Distribution (lower = better, position-agnostic):
//   p10=8.5, p25=11, p50=14, p75=17.5, p90=22
// Returns inverted percentile (low TO% → high pctl).
function estPctlToInverted(to) {
  if (to == null) return null;
  const breaks = [8.5, 11, 14, 17.5, 22];
  const pctsInv = [90, 75, 50, 25, 10];   // INVERTED: less TO% = higher pctl
  if (to <= breaks[0]) return Math.min(99, Math.round(90 + (breaks[0] - to) * 4));
  if (to >= breaks[4]) return Math.max(2, Math.round(10 - (to - breaks[4]) * 1.5));
  for (let i = 1; i < breaks.length; i++) {
    if (to <= breaks[i]) {
      const t = (to - breaks[i-1]) / (breaks[i] - breaks[i-1]);
      return Math.round(pctsInv[i-1] + t * (pctsInv[i] - pctsInv[i-1]));
    }
  }
  return null;
}
const fmt = (v,d=1) => v!=null?Number(v).toFixed(d):"—";
const pct = (v) => v!=null?(v*100).toFixed(1)+"%":"—";

// Tier thresholds for comparison
// ── Anthropometric NBA-Tier-Median Schwellen (Tobias 2026-05-09 v2) ───────
// 5-Position-Klassifikation (PG/SG/SF/PF/C) — präziser als 3-Position-System
// weil "Wing" zu breit war (umfasste SG 6'5" und SF 6'8" gleichzeitig).
// Quelle: NBA Combine Database 2010-2024 (1835 Spieler), gefiltert nach
// Career-Outcome-Tier (peak_pie ≥40/25/15/8 = Sup/AS/St/RP) × NBA-Position.
//   ht = Höhe mit Schuhen (NBA-Convention, +1.25″ shoe-lift)
//   wt = Gewicht (lbs)
//   ws = Wingspan (inches)
//   sr = Standing Reach (inches)
const ANTHRO_TIER_THRESHOLDS = {
  Replacement: {
    PG: {ht:74.5, wt:185, ws:77.5, sr:97.5},
    SG: {ht:76.5, wt:195, ws:80.5, sr:101.0},
    SF: {ht:79.0, wt:210, ws:82.5, sr:104.5},
    PF: {ht:81.5, wt:228, ws:85.0, sr:107.0},
    C:  {ht:83.0, wt:243, ws:87.5, sr:110.5},
  },
  "Role Player": {
    PG: {ht:75.0, wt:190, ws:79.0, sr:99.0},
    SG: {ht:77.0, wt:200, ws:81.5, sr:102.0},
    SF: {ht:79.5, wt:215, ws:84.0, sr:105.5},
    PF: {ht:82.0, wt:235, ws:87.0, sr:108.5},
    C:  {ht:83.5, wt:250, ws:89.0, sr:112.0},
  },
  Starter: {
    PG: {ht:75.5, wt:195, ws:80.5, sr:100.5},
    SG: {ht:77.5, wt:205, ws:82.5, sr:103.5},
    SF: {ht:80.0, wt:220, ws:85.0, sr:106.5},
    PF: {ht:82.5, wt:245, ws:88.5, sr:110.5},
    C:  {ht:84.0, wt:255, ws:90.5, sr:113.5},
  },
  "All-Star": {
    PG: {ht:75.5, wt:198, ws:81.0, sr:101.0},
    SG: {ht:78.0, wt:210, ws:84.0, sr:105.0},
    SF: {ht:80.5, wt:225, ws:86.0, sr:107.5},
    PF: {ht:82.5, wt:250, ws:89.5, sr:112.0},
    C:  {ht:84.5, wt:260, ws:92.0, sr:115.0},
  },
};

// Fallback wenn pos_detailed (PG/SG/SF/PF/C) fehlt — leite aus pos + height ab.
// Wird genutzt für historische / intl Spieler ohne BartTorvik-role.
function inferDetailedPos(pos3, htIn, astP) {
  const h = htIn || 78;
  const a = astP || 0;
  if (pos3 === "Playmaker") return (h <= 76 && a >= 22) ? "PG" : (h <= 76 ? "PG" : "SG");
  if (pos3 === "Big")       return (h >= 83 ? "C" : "PF");
  // Wing
  if (h <= 78) return "SG";
  if (h <= 80) return "SF";
  if (h <= 82) return "SF";  // Tall Wings
  return "PF";
}

// TIER_THRESHOLDS — empirically calibrated medians (Tobias 2026-06-02).
// Method: NBA-drafted players from mature classes 2008-2018 (n=353) grouped by
// their realized peak Wins Added outcome (NBA tier = percentile-bucket of peak_wa:
// Replacement≥0.8 / Role Player≥3.3 / Starter≥10.1 / All-Star≥22.5). For each
// (tier × position) we compute the MEDIAN of each pre-draft college stat across
// the cohort. The frontend then derives p25 = median*0.75 and p75 = median*1.30
// for the in-range / below / critical bands. Values are monotonized along the
// tier axis (higher tier never below lower tier; TO% inverse) — small distortion
// to avoid the unintuitive case "starter threshold > all-star threshold". The
// real reason for inversions is that pre-draft college stats only weakly
// separate Starter and All-Star: the actual talent spike happens AFTER the
// draft via role + minutes + team context. Caveat in Methods Tab.
const TIER_THRESHOLDS = {
  Replacement: {
    Playmaker:{bpm:8.5,usg:27.2,ts:56.6,ast_p:32.5,to_p:17.3,stl_p:2.3,blk_p:0.7,orb_p:2.0,drb_p:10.4,ortg:131.8},
    Wing:{bpm:6.8,usg:25.1,ts:56.7,ast_p:13.0,to_p:15.7,stl_p:1.9,blk_p:1.9,orb_p:5.7,drb_p:14.3,ortg:124.6},
    Big:{bpm:6.2,usg:21.8,ts:58.7,ast_p:6.7,to_p:17.3,stl_p:1.4,blk_p:5.9,orb_p:10.8,drb_p:19.8,ortg:119.2},
  },
  "Role Player": {
    Playmaker:{bpm:9.1,usg:28.7,ts:56.8,ast_p:32.5,to_p:16.7,stl_p:2.8,blk_p:0.7,orb_p:3.2,drb_p:14.3,ortg:133.6},
    Wing:{bpm:7.5,usg:25.3,ts:57.5,ast_p:13.3,to_p:14.8,stl_p:2.2,blk_p:2.0,orb_p:5.7,drb_p:16.1,ortg:127.2},
    Big:{bpm:8.6,usg:22.2,ts:58.8,ast_p:9.2,to_p:16.2,stl_p:1.7,blk_p:5.9,orb_p:10.8,drb_p:22.1,ortg:119.9},
  },
  Starter: {
    Playmaker:{bpm:9.1,usg:28.7,ts:57.0,ast_p:32.5,to_p:16.7,stl_p:3.0,blk_p:1.1,orb_p:3.7,drb_p:14.3,ortg:133.6},
    Wing:{bpm:7.6,usg:25.3,ts:58.4,ast_p:14.2,to_p:14.8,stl_p:2.2,blk_p:2.8,orb_p:7.3,drb_p:16.1,ortg:127.2},
    Big:{bpm:8.6,usg:23.4,ts:62.1,ast_p:9.2,to_p:16.2,stl_p:1.7,blk_p:7.8,orb_p:11.8,drb_p:22.1,ortg:124.0},
  },
  "All-Star": {
    Playmaker:{bpm:9.1,usg:28.7,ts:59.5,ast_p:32.5,to_p:16.7,stl_p:3.0,blk_p:1.1,orb_p:3.7,drb_p:14.3,ortg:137.3},
    Wing:{bpm:8.1,usg:26.1,ts:58.4,ast_p:14.4,to_p:14.8,stl_p:2.3,blk_p:2.8,orb_p:7.3,drb_p:18.9,ortg:127.2},
    Big:{bpm:8.6,usg:23.4,ts:62.1,ast_p:9.2,to_p:16.2,stl_p:1.7,blk_p:10.6,orb_p:13.1,drb_p:22.1,ortg:124.0},
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
    formula: "NCAA (with PBP dunk data):  0.25·FTr + 0.20·Dunk% + 0.20·Stocks + 0.20·RimFreq + 0.15·DRB%\nIntl / older NCAA (no PBP):    0.30·FTr + 0.25·ORB% + 0.20·Stocks + 0.15·DRB% + 0.10·USG%",
    desc: "How athletic gifts manifest in-game. Source-aware: NCAA players with play-by-play data get Dunk% and rim frequency as direct finishing-power signals. Internationals and older NCAA classes without PBP use ORB% as a vertical-leap proxy (offensive rebounders explode over opponents) plus heavier FTr weighting (driving + foul-drawing). Both formulas sum to 1.0 and are 0-100 percentiled — directly comparable across sources.",
  },
  shootScore: {
    name: "Shooting",
    formula: "pctl(FT%) × 0.40 + pctl(3PA/40) × 0.40 + pctl(3P%) × 0.20",
    desc: "FT% weighted highest because it's the single best predictor of NBA shooting translation (Berger 2022). Volume (3PA/40) valued over raw percentage because willingness to shoot predicts NBA role.",
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
    name: "Projected NBA 3P% (Diss-M1, Berger 2022)",
    formula: "Stage 1: p̂ᵢ = (α₀ + 3PMᵢ) / (α₀ + β₀ + 3PAᵢ)   |   Stage 2: logit⁻¹(β₀ + β₁·FT + β₂·2PJ + β₃·p̂ᵢ)",
    desc: "Two-stage model (Berger 2022, Ch. 7). Stage 1 = Empirical Bayes shrinkage of pre-draft 3P% against the NCAA league-wide distribution (α₀=23.89, β₀=44.67, μ₀=34.8%, effective κ=69 — all fitted from data, none hand-tuned). Stage 2 = beta-regression M1: NBA 3P% projected from FT% + 2PJ% (NCAA PBP) + 3P-Estimate. Holdout RMSE 0.0380 (n=675 NCAA, beats the dissertation's 0.0559). Intl variant without 2PJ% (no PBP available), RMSE 0.0367 (n=392). NO hand-tuned values — fully data-fitted.",
  },
  projNba3pa: {
    name: "Projected NBA 3PA/game (Heuristic)",
    formula: "projected_FGA_tier × proj_3PAr / 100",
    desc: "ROLE-DEPENDENT estimate. 3PA/G depends on minutes and possessions — we don't know a prospect's NBA role in advance. This estimate multiplies the role-independent 3PAr (from M4) by a tier-specific FGA value (Role Player 9, Starter 12, All-Star 15). More of an indicator than a point estimate. For a clean shooter signature that's independent of role, 3P% (M1) and 3PAr (M4) are the methodologically correct metrics.",
  },
  projNba3par: {
    name: "Projected NBA 3P-Attempt-Rate (Diss-M4, role-independent)",
    formula: "logit⁻¹(β₀ + β₁·NCAA-3PAr + β₂·2PJ% + β₃·FT% + β₄·3P-Estimate)",
    desc: "Dissertation Stage 3 (modified): NBA 3PAr = 3PA/FGA from beta regression. ROLE-INDEPENDENT, because 3PAr is a pure shooter signature (what share of his own attempts come from beyond the arc). Even role players and starters have their own 3PAr. Holdout RMSE 0.130 NCAA n=662, 0.126 Intl n=383. Inputs: college 3PAr + 2PJ% (NCAA PBP only) + FT% + EB-3P-Estimate. The dissertation originally projected 3PAp40 (role-dependent — driven by possessions/minutes); we switched the target to 3PAr (role-independent).",
  },
  touchPrior: {
    name: "Pre-Draft 3P% Estimate (Empirical Bayes)",
    formula: "p̂ᵢ = (α₀ + 3PMᵢ) / (α₀ + β₀ + 3PAᵢ)   |   α₀=23.89, β₀=44.67 (NCAA league fit)",
    desc: "Dissertation Stage 1 (Berger 2022). Empirical Bayes shrinkage of college 3P% against the NCAA league-wide distribution — for small 3PA samples (Boozer: 2 attempts, 0%) the prior pulls the estimate strongly toward the league median (34.8%); for high-volume samples (Curry: 327 attempts, 38.8%) the observation dominates. α₀ and β₀ fitted via method-of-moments from 16,771 NCAA players with ≥20 3PA — NO hand-tuned values. Eliminates small-sample shooting luck exactly as the dissertation prescribes.",
  },
  fourFactors: {
    name: "Possession Impact (CFFR)",
    formula: "reliability × (0.40 × z_eFG + 0.25 × z_TOV + 0.20 × z_ORB + 0.15 × z_FTR)",
    desc: "Usage-role-adjusted Four Factors measuring possession efficiency. Players bucketed by usage (Primary ≥28%, Secondary ≥22%, Finisher ≥15%, LowUsage <15%). Each factor z-scored within role × season. NPV > +2.0 = 'Elite Floor Raiser', +0.5–2.0 = 'Winning Piece', −0.5–0.5 = 'Role Dependent', < −1.0 = 'High Maintenance'. This is NOT a talent rating — it's an efficiency index measuring how 'expensive' it is for a coach to keep this player on the floor.",
  },
  monteCarlo: {
    name: "Projected Peak Wins Added (PPWA)",
    formula: "Rank: PPWA = P(NBA) × E[Added Wins | NBA]   ·   Probability width: realized spread of a prospect's comps",
    desc: "Target: a prospect's best consecutive-3-season Added Wins peak (team-anchored, on-court impact via xRAPM 70% + box production 30%, scaled so a roster's player-wins sum to the team's wins). The system is DECOUPLED into a ranking signal and a probability signal. RANKING — a two-stage statistical model, dual-track by data depth: Stage 1 P(NBA); Stage 2 E[Added Wins | NBA]. NCAA prospects use the full BartTorvik feature set (adjoe / strength-of-schedule / shot-location / recruiting) that separates real prospects from weak-competition stat-stuffers; internationals use the box-stat common core (no tracking abroad), league-weighted onto the NCAA scale via bridge players and unit-normalized so an intl 61% TS reads as elite. The product P(NBA)×E[AW|NBA] is smoothly rescaled to the realized Wins-Added scale and drives the board order. PROBABILITY WIDTH — a comparable-player method: each prospect is matched to his pre-draft archetype peers (leave-one-out — never himself — with an adaptive bandwidth that guarantees ≥10 effective comps, so even sparse elite tails get a real cohort). The REALIZED spread of those comps (busts → stars) sets the width of the tier-probability distribution, centred on the headline — so probabilities are honest (no 99% certainties) instead of a tight parametric band. WHY DECOUPLED: used for ranking, the comp method over-rates high-projected role players and regresses true one-of-one stars (who have no comp), so the regression ranks; the comps calibrate the uncertainty. Holdout: regression ranking Spearman ρ ≈ 0.39; P(NBA) ROC-AUC 0.95 (0.98 on NCAA). Tiers calibrated to realistic per-class output (~0.5 Superstar, 3 All-Star, 12 Starter per draft class). Honest caveat: the regression cannot fully see generational profiles with no historical comp (e.g. a 7'4\" creator) — a documented blind spot, like a 2nd-round Jokić.",
  },
  projectionDrivers: {
    name: "Projection Drivers (SHAP Decomposition)",
    formula: "contribution_i = Σ(split gains involving feature i across all trees)",
    desc: "Per-player feature contributions from the value model. For each prospect, the Added-Wins projection is broken into the additive contribution of each input feature (exact linear attribution for the ElasticNet backbone). Boosters push the projection above the population baseline; limiters pull it below. The Added-Wins target itself blends box production (30%) and on-court impact / xRAPM (70%).",
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
  // ── YELLOW — Shot profile / style tags (neither good nor bad) ──
  "Moreyballer":            { cat:"yellow", rule:"≥75% of shots from rim + 3P + FTs",   desc:"Shot distribution is heavily skewed toward high-value zones (rim, 3P, free throws) with minimal mid-range. Named after former Rockets GM Daryl Morey who popularized this approach. This reflects shot selection only — not skill level." },
  // ── GREEN — Elite NBA-scalable skills ──
  "Elite Shooting":         { cat:"green", rule:"3P%>40 & 3P_Freq>30% & FT%>85",       desc:"Top-tier shooting across both lines + elite volume. Most translatable skill in modern NBA. Berger (2022): FT% is the #1 predictor." },
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
  "Possession Demon":       { cat:"green", rule:"All 4 CFFR Factors positive (min ≥ 55) & mean ≥ 70", desc:"Helps on all four possession dimensions — shoots efficiently (eFG), protects the ball (TO), generates extra possessions (OREB), and draws fouls (FTR). Rare composite of value-per-possession. Role-context-adjusted via CFFR z-scores." },

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
  "High Maintenance":       { cat:"red",   rule:"CFFR < 45 (red zone of Net Possession Value)", desc:"Drains team possessions overall. Net Possession Value is in the red zone — at least one Four Factor (eFG / TO / OREB / FTR) is well below role expectation, and the composite signals he hurts the team's possession economy more than he helps." },
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

// ── Archetype × Position allowlist (Tobias 2026-05-09) ─────────────────────
// Pipeline emits up to 7 archetype matches per player but does not filter by
// position group. Result: Caleb Wilson (Wing) gets "Stretch Big | Passing Hub",
// Allen Graves (Big) gets "Scoring Wing | 3-and-D Wing". Filter at display time.
const ARCH_POS_ALLOW = {
  // Playmaker-only
  "Non-Specialized Playmaker": ["Playmaker"],
  "Scoring Playmaker":         ["Playmaker"],
  "Spacing Guard":             ["Playmaker"],
  "Defensive Guard":           ["Playmaker"],
  "Floor General":             ["Playmaker"],
  // Wing-only
  "Non-Specialized Wing":      ["Wing"],
  "Scoring Wing":              ["Wing"],
  "Defensive Wing":            ["Wing"],
  "Slashing Wing":             ["Wing"],
  "3-and-D Wing":              ["Wing"],
  // Hybrid (cross-position)
  "Point Forward":             ["Wing", "Big"],
  "Initiator Wing":            ["Wing", "Playmaker"],
  // Big-only
  "Non-Specialized Big":       ["Big"],
  "Stretch Big":               ["Big"],
  "Rim Protector":             ["Big"],
  "Short Roll Playmaker":      ["Big"],
  "Passing Hub":               ["Big"],
  "Glass Cleaner":             ["Big"],
  "Stretch Rim Protector":     ["Big"],
  "Scoring Big":               ["Big"],
};
// Tall-Wing exception: 6'9"+ Wings can plausibly be Stretch-4 / glass-cleaning forwards.
// We allow Big-archetypes that describe forward-roles (not pure-5 archetypes like Rim
// Protector) for Wings ≥81". This matches NBA reality (Tatum, Markkanen: nominally
// wings, but archetypally Stretch Big or Scoring Big in many lineups).
const TALL_WING_BIG_OK = new Set(["Stretch Big", "Scoring Big", "Glass Cleaner", "Short Roll Playmaker"]);

// Tobias 2026-05-09 v2: Smart fallback when frontend pos-override flips a player
// from Wing→Playmaker (Westbrook, Wagler, Haggerty etc.). Backend pipeline emitted
// only Wing-archetypes for them, but Frontend now classifies as Playmaker.
// Without this, all six players would just show "Non-Specialized Playmaker" —
// which is uninformative. Use the live-computed NCAA-archetype to pick the
// closest matching Pipeline-Archetype.
const NCAA_TO_PIPELINE_ARCH = {
  "Combo Guard":            "Scoring Playmaker",   // Westbrook, Wagler-style combo guards
  "Playmaker":              "Floor General",       // Pure point guards
  "Ball Dominant Scorer":   "Scoring Playmaker",   // High-usage scoring lead-handlers (Cade, Haggerty)
  "Two-Way Wing":           "3-and-D Wing",        // Already wing
  "Shot Creator Wing":      "Scoring Wing",
  "Secondary Wing":         "Non-Specialized Wing",
  "Defensive Specialist":   "Defensive Guard",     // Maps to G/W default
  "Versatile Role Player":  "Non-Specialized Playmaker",
  "Rim Anchor":             "Rim Protector",
  "Stretch Big":            "Stretch Big",
  "Passing Big":            "Passing Hub",
  "Paint Presence":         "Scoring Big",
};

function filterArchetypesByPos(archStr, pos, htIn, ncaaArch) {
  if (!archStr || !pos) return archStr || "";
  const list = archStr.split("|").filter(Boolean);
  const isTallWing = pos === "Wing" && htIn != null && htIn >= 81;
  const filtered = list.filter(a => {
    const allow = ARCH_POS_ALLOW[a];
    if (!allow) return true; // unknown archetype — pass through
    if (allow.includes(pos)) return true;
    if (isTallWing && TALL_WING_BIG_OK.has(a)) return true;
    return false;
  });
  if (filtered.length > 0) return filtered.join("|");
  // Smart fallback: use ncaaArch-derived archetype if available, else pos-default
  if (ncaaArch && NCAA_TO_PIPELINE_ARCH[ncaaArch]) {
    const candidate = NCAA_TO_PIPELINE_ARCH[ncaaArch];
    const allow = ARCH_POS_ALLOW[candidate];
    if (!allow || allow.includes(pos)) return candidate;
  }
  const POS_DEFAULT = {
    "Playmaker": "Non-Specialized Playmaker",
    "Wing":      "Non-Specialized Wing",
    "Big":       "Non-Specialized Big",
  };
  return POS_DEFAULT[pos] || (list[0] || "");
}

// ── Tier label re-calibration (Tobias 2026-05-09) ────────────────────────────
// Issue: backend's predicted_tier = modal tier (single highest probability bin).
// For pre-draft prospects this is statistically dominant "Replacement" because
// most NBA prospects don't pan out. The board ends up looking too pessimistic
// — only 3 Starters, zero All-Stars in the 2026 class.
//
// Solution: cumulative-threshold tier. Pick the highest tier T where the
// cumulative probability P(T or better) clears a calibrated threshold. This
// surfaces upside without retraining the model.
//
// Thresholds calibrated against historical NBA base rates:
//   - ~28 All-Stars across 17 NCAA classes (2008-2024) → ~1.6 All-Stars/year
//   - ~10-20 Starters/year produced from each class
//   - Goal: 2026 class shows 1-3 All-Star labels and 5-15 Starter labels,
//           consistent with what a sharp scout would label a class on June 25.
//
// Returns the recalibrated tier OR the model's predTier if no tier dist available.
const TIER_PROB_THRESHOLDS = {
  // Cumulative P(tier-or-better) thresholds — % scale (0-100).
  //
  // T6 (Tobias 2026-05-09 v3): Replacement-mass NICHT in den "wertvolle NBA"-Pfad.
  // Begründung Tobias: Replacement-Spieler sind per Definition austauschbar —
  // wenn ein Modell sagt "30% Wahrscheinlichkeit Replacement, 5% Starter" sollte
  // das nicht "Role Player" produzieren. Role/Starter werden nur mit P(S+A+St+R)
  // bewertet (rotational+ tiers). Replacement bekommt eigene Schwelle.
  //
  // Validierung 2026-Klasse:
  //   1 All-Star (Boozer) / 13 Starter (Top-14) / 61 Role Player / Rest Rp+Out
  //   Top-30 Spieler bekommen ALLE ein meaningful NBA-Label.
  Superstar:    12,   // P(Superstar) ≥ 12%
  "All-Star":   18,   // P(S+A) ≥ 18%
  Starter:      26,   // P(S+A+St) ≥ 26%        ← deutlich gesenkt von 32
  "Role Player":38,   // P(S+A+St+R) ≥ 38%      ← gesenkt von 45, OHNE pRp
  // Replacement-Pfad (separat): klare Roster-Wahrscheinlichkeit oder hoher pRp
  Replacement_Rp:    30,  // pRp allein ≥ 30%        → klarer Bench-Kandidat
  Replacement_Total: 45,  // P(S+A+St+R+Rp) ≥ 45%   → kumulierte NBA-Plausibilität
};
function recalibrateTier(tiers, fallback) {
  if (!tiers || typeof tiers !== "object") return fallback ?? "Replacement";
  const pS  = Number(tiers.Superstar) || 0;
  const pA  = Number(tiers["All-Star"]) || 0;
  const pSt = Number(tiers.Starter) || 0;
  const pR  = Number(tiers["Role Player"]) || 0;
  const pRp = Number(tiers.Replacement) || 0;
  // ── Wertvolle-NBA-Pfad — ohne pRp ──
  if (pS >= TIER_PROB_THRESHOLDS.Superstar) return "Superstar";
  if (pS + pA >= TIER_PROB_THRESHOLDS["All-Star"]) return "All-Star";
  if (pS + pA + pSt >= TIER_PROB_THRESHOLDS.Starter) return "Starter";
  if (pS + pA + pSt + pR >= TIER_PROB_THRESHOLDS["Role Player"]) return "Role Player";
  // ── Replacement-Pfad — separates Gate ──
  if (pRp >= TIER_PROB_THRESHOLDS.Replacement_Rp ||
      pS + pA + pSt + pR + pRp >= TIER_PROB_THRESHOLDS.Replacement_Total) return "Replacement";
  return "Negative";
}

// ── Actual-tier display override from peak_pie (Tobias 2026-05-09) ───────────
// Backend's `tier` field uses strict peak_pie thresholds — Tatum (PIE 52) shows
// as "Starter", Brunson (32) as "Roleplayer", Trae (32) as "Starter". These are
// real All-Stars/Superstars; the strict thresholds make the model APPEAR to
// learn wrong labels in the comps display.
//
// We override at display-time using lenient public-perception thresholds:
//   peak_pie ≥ 40 → Superstar  (Curry 58, Tatum 52, Embiid 51, AD 43, Lillard 43)
//   peak_pie ≥ 25 → All-Star   (KAT 37, Mitchell 35, Booker 33, Brunson/Trae 32, Brown 31)
//   peak_pie ≥ 15 → Starter    (Aaron Gordon 24, Mikal Bridges 23, Markkanen 20, Rob Williams 18)
//   peak_pie ≥  8 → Role Player
//   peak_pie ≥  3 → Replacement
//   else          → Out (didn't have NBA career)
//
// Note: only changes display labels, NOT model training data or prob_* fields.
function tierFromPeakPie(pie) {
  if (pie == null || !isFinite(pie)) return null;
  const v = Number(pie);
  if (v >= 40) return "Superstar";
  if (v >= 25) return "All-Star";
  if (v >= 15) return "Starter";
  if (v >=  8) return "Role Player";
  if (v >=  3) return "Replacement";
  return "Negative";
}

// ── Draft-day-age display helper (Tobias 2026-05-09) ─────────────────────────
// Pipeline (10c_ml_calibration.compute_age) uses ref_date = Feb 1 of season_year
// as the universal age reference. The actual NBA Draft is held in late June
// (~June 25). The 144-day gap means our stored `age` is systematically ~0.40
// years younger than "age on draft day" — Boozer reads 18.5 instead of his
// true 18.9 on draft night.
//
// Until the pipeline switches its ref_date to draft day, we add the constant
// offset HERE for *display only* (header / Key Facts / board table). Internal
// model logic continues to use raw `p.age` — the calibrated v2 model was
// trained on Feb-1-age, so changing the input feature would break tier probs.
//
// Constant 0.39 = 144 days / 365.25 (Feb 1 → June 25).
const DRAFT_DAY_AGE_OFFSET = 0.39;
function ageOnDraftDay(age) {
  if (age == null || !isFinite(age)) return null;
  return Number(age) + DRAFT_DAY_AGE_OFFSET;
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
  // FT Grifter: elite contact creator. Threshold raised to 60 FTA/100 FGA (true outlier).
  // rimF > 35 guards against players who only draw fouls on few rim attempts.
  if (p.ftr != null && ftr > 60 && (rimF > 35 || usg > 26))         green.push("FT Grifter");
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
  // Possession Demon — positiv auf allen vier CFFR-Faktoren (Tobias 2026-06-01).
  // CFFR-Werte sind 0–100 (50 = mean, 75 ≈ z=0.5, 25 ≈ z=-0.5). Schwelle: jeder
  // Faktor mindestens leicht überdurchschnittlich (>55), composite >70.
  // Reliability-Gate via cffr (Backend filtert intern auf >=200 min).
  // TODO Migrationspfad: nach Backend (10c_ml_calibration compute_badges) verschieben
  // beim nächsten vollen 10c-Rerun für Single-Source-of-Truth.
  {
    const _ffEfg = p.ff_efg, _ffTov = p.ff_tov, _ffOrb = p.ff_orb, _ffFtr = p.ff_ftr;
    const _allPresent = _ffEfg != null && _ffTov != null && _ffOrb != null && _ffFtr != null;
    if (_allPresent) {
      const _ffMin  = Math.min(_ffEfg, _ffTov, _ffOrb, _ffFtr);
      const _ffMean = (_ffEfg + _ffTov + _ffOrb + _ffFtr) / 4;
      const _cffr   = p.cffr ?? 0;
      if (_ffMin >= 55 && _ffMean >= 70 && _cffr >= 60) green.push("Possession Demon");
    }
  }

  // ═══ YELLOW BADGES ═══
  // Moreyballer: ≥75% of shots from rim + 3P (excludes mid-range).
  // Only require rimF data; threeF defaults to 0 (valid: rim-only players qualify without 3P data).
  if (p.rimF != null && rimF + threeF >= 75)    yellow.push("Moreyballer");
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
  // Spacing Killer — stricter: very low 3P% AND very low 3PA rate
  if ((isG || isW) && p.tp != null && p.threeF != null && tp < 28 && threeF < 16)  red.push("Spacing Killer");
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
  // Non-Spacing Perimeter — only if Spacing Killer not already assigned (avoid double-badge)
  if ((isG || isW) && p.tp != null && p.threeF != null && tp < 30 && threeF < 20
      && !red.includes("Spacing Killer"))  red.push("Non-Spacing Perimeter");
  // All-Offense Big — only if BLK% and DBPM data exist
  if (isB && p.blkP != null && p.dbpm != null && blkP < 2.5 && dbpm < 1.5)  red.push("All-Offense Big");
  // FT Concern — requires real FT% data (≥30% filters out data artefacts with 0-5 FT attempts)
  // 1612 players had ft_pct < 65 including many with ft=0.8% (1-2 FTA entire season).
  if (p.ft != null && ft >= 30 && ft < 65 && usg > 25)              red.push("FT Concern");
  // Passive Defender — low stocks + low fouls = not engaging (Session 9b)
  const stocks = (p.stlP ?? 0) + (p.blkP ?? 0);
  const fouls40 = p.fouls40 ?? 0;
  if (p.stlP != null && p.blkP != null) {
    if (stocks < 2.5 && fouls40 > 0 && fouls40 < 2.5)              red.push("Passive Defender");
    else if (stocks < 1.8 && fouls40 === 0)                         red.push("Passive Defender");
  }
  // High Maintenance — CFFR in der roten Zone des Net Possession Value (Tobias 2026-06-01).
  // Spiegel-Badge zu Possession Demon: drainiert Possessions mehr als er hilft.
  // TODO Migrationspfad: nach Backend (10c_ml_calibration) beim nächsten 10c-Rerun.
  if (p.cffr != null && p.cffr < 45)                                 red.push("High Maintenance");

  return { green, yellow, red };
}

// ═══════════════════════════════════════════════════════════
// NCAA ARCHETYPE → NBA PROJECTION PIPELINE
// ═══════════════════════════════════════════════════════════

// Step 1 — What does this player DO right now in college?
// Uses the same tmpP fields as computeBadges (pos, usg, astP, dbpm, etc.)
function computeNcaaArchetype(p) {
  const pos   = getBadgePos(p);          // "G" | "W" | "B"
  const usg   = p.usg   ?? 0;
  const astP  = p.astP  ?? 0;
  const astTov= p.astTov?? 1.5;
  const dbpm  = p.dbpm  ?? 0;
  const blkP  = p.blkP  ?? 0;
  const orbP  = p.orbP  ?? 0;
  const threeF= p.threeF?? 0;
  const tp    = p.tp    ?? 0;
  const ftr   = p.ftr   ?? 0;
  const htIn  = p.htIn  ?? 78;
  // selfCreation comes from mapProfile's selfCreation field
  const sc    = p.selfCreation ?? p.pbpSelfCreation ?? 50;

  // ── Bigs ──────────────────────────────────────────────
  if (pos === "B") {
    if (blkP >= 4  && orbP >= 7)          return "Rim Anchor";
    if ((tp >= 35 && threeF >= 15) || (htIn >= 82 && ftr > 35 && threeF >= 12)) return "Stretch Big";
    if (astP >= 22 && astTov >= 1.5)      return "Passing Big";
    return "Paint Presence";
  }

  // ── Guards & Wings ────────────────────────────────────
  // Priority: most restrictive first
  if (usg >= 27 && sc >= 60)              return "Ball Dominant Scorer";
  if (astP >= 28 && astTov >= 1.8)        return "Playmaker";
  if (pos === "W" && dbpm >= 1.5 && tp >= 32 && threeF >= 25) return "Two-Way Wing";
  // Tobias 2026-05-09: usg-Schwelle gesenkt von 22→18. Defensive Combo-Guards (Jrue Holiday usg=20.5
  // im UCLA-System) wurden vorher als "Versatile Role Player" klassifiziert. astP≥20 garantiert dass
  // es echte Ball-Handler sind, nicht no-creation Wings die zufällig als G klassifiziert wurden.
  if (pos === "G" && usg >= 18 && astP >= 20) return "Combo Guard";
  if (usg >= 24 && pos === "W")           return "Shot Creator Wing";
  if (threeF >= 30 && tp >= 35)           return "Secondary Wing";
  if (dbpm >= 2.5 && usg <= 18)           return "Defensive Specialist";
  return "Versatile Role Player";
}

// Short description of NCAA archetype for UI
const NCAA_ARCH_DESC = {
  "Ball Dominant Scorer": "High-usage primary scorer — creates shots off the dribble with little off-ball reliance",
  "Playmaker":            "High AST% ball-handler — organizes offense, low turnover rate",
  "Two-Way Wing":         "Wing with credible defense + shooting — most coveted modern NBA profile",
  "Combo Guard":          "Guard who creates + facilitates — blend of scoring and playmaking",
  "Shot Creator Wing":    "High-usage wing scorer — relies on individual creation",
  "Secondary Wing":       "Off-ball wing — catches, shoots, cuts; spacing-first profile",
  "Defensive Specialist": "Low-usage player whose value is defensive impact",
  "Rim Anchor":           "Rim-protecting, rebounding big — defensive cornerstone",
  "Stretch Big":          "Shot-blocking or floor-spacing big — modern 4/5",
  "Passing Big":          "High-AST% big — playmaking from the elbow/high post",
  "Paint Presence":       "Traditional interior big — dunks, rebounds, screens",
  "Versatile Role Player":"Multi-dimensional contributor — no dominant skill signature",
};

// Step 2 — Project to most likely NBA role given tier ceiling
// ncaaArch × predTier → what role this player fills on an NBA roster
function projectNbaArchetype(ncaaArch, predTier) {
  const rank = {"Superstar":5,"All-Star":4,"Starter":3,"Role Player":2,"Replacement":1,"Negative":0}[predTier] ?? 1;
  const PROJ = {
    "Ball Dominant Scorer":   ["Non-Roster","Fringe Scorer","Scoring Role Player","Secondary Creator","Primary Creator","Franchise Scorer"],
    "Playmaker":              ["Non-Roster","Fringe PG","Connective Playmaker","Starting Playmaker","Elite Orchestrator","Generational PG"],
    "Two-Way Wing":           ["Non-Roster","Fringe Contributor","3-and-D Contributor","3-and-D Starter","3-and-D Star","Franchise Wing"],
    "Combo Guard":            ["Non-Roster","Fringe Guard","Bench Creator","Starting Guard","Quality Starter Guard","Star Guard"],
    "Shot Creator Wing":      ["Non-Roster","Fringe Scorer","Bench Scorer","Rotation Wing","Quality Wing Starter","Star Wing"],
    "Secondary Wing":         ["Non-Roster","Camp Invite","Spot-Up Specialist","Rotation Shooter","Quality Off-Ball Scorer","Elite Off-Ball Weapon"],
    "Defensive Specialist":   ["Non-Roster","Two-Way Contract","Def. Specialist","Quality Def. Rotation","Elite Def. Starter","Defensive Star"],
    "Rim Anchor":             ["Non-Roster","Camp Invite","Backup Rim Protector","Starting Rim Protector","Elite Rim Protector","Defensive Cornerstone"],
    "Stretch Big":            ["Non-Roster","Camp Invite","Spacing Backup Big","Starting Stretch Big","Star Stretch Big","Modern Star Big"],
    "Passing Big":            ["Non-Roster","Camp Invite","Connective Backup Big","Playmaking Big","Star Playmaking Big","Generational Playmaking Big"],
    "Paint Presence":         ["Non-Roster","Camp Invite","Bench Bruiser","Starting Paint Center","Quality Starting Big","Dominant Interior Big"],
    "Versatile Role Player":  ["Non-Roster","Two-Way Contract","Bench Versatility","Rotation Player","Quality Role Player","Versatile Starter"],
  };
  return PROJ[ncaaArch]?.[rank] ?? "Undefined";
}

// Short description of NBA projection for UI
const NBA_PROJ_DESC = {
  "Franchise Scorer":       "Capable of carrying an offense as the #1 option — rare",
  "Primary Creator":        "#1 scoring option — creates own shot + others on a contender",
  "Secondary Creator":      "High-usage co-star — star-level production without sole creation burden",
  "Scoring Role Player":    "Reliable scorer off bench or in limited starting role",
  "Generational PG":        "All-time caliber playmaker — orchestrates offense at elite level",
  "Elite Orchestrator":     "Elite primary playmaker — sets table for entire roster",
  "Starting Playmaker":     "Starting PG who runs offense — reliable facilitator",
  "Connective Playmaker":   "High-IQ secondary playmaker — glue-guy creator",
  "Franchise Wing":         "Two-way cornerstone — coveted on any contender",
  "3-and-D Star":           "Premium two-way wing — All-Star caliber on both ends",
  "3-and-D Starter":        "Starting-quality 3-and-D — staple of winning rosters",
  "3-and-D Contributor":    "Reliable two-way rotation wing",
  "Star Wing":              "Star-level wing scorer — primary option without elite defense",
  "Quality Wing Starter":   "Dependable starting wing — scoring + some shot creation",
  "Rotation Wing":          "Rotation-level wing — contributes in 20-25 MPG",
  "Star Guard":             "Star-level combo guard — scoring and playmaking",
  "Quality Starter Guard":  "Reliable starting guard — efficient in both creation and finishing",
  "Starting Guard":         "Starting guard who can run offense",
  "Elite Off-Ball Weapon":  "Premium catch-and-shoot — unlocks floor spacing at star level",
  "Quality Off-Ball Scorer":"Reliable floor spacer — above-average off-ball threat",
  "Rotation Shooter":       "Rotation spot-up shooter — spacing + smart play",
  "Spot-Up Specialist":     "Pure catch-and-shoot — valuable when paired with creators",
  "Defensive Cornerstone":  "Elite rim protector — defines team's defensive identity",
  "Elite Rim Protector":    "Starting-caliber rim protector — shot-blocker + rebounder",
  "Starting Rim Protector": "Solid starting center — anchors paint defense",
  "Backup Rim Protector":   "Rotation-level rim protection",
  "Modern Star Big":        "Stretch-5 star — combines spacing, mobility, and production",
  "Star Stretch Big":       "All-Star caliber stretch 4/5 — shooting + rim presence",
  "Starting Stretch Big":   "Starting stretch big — spacing + solid rotation defense",
  "Spacing Backup Big":     "Floor-spacing backup center",
  "Generational Playmaking Big": "All-time caliber playmaking big — Jokic-tier vision",
  "Star Playmaking Big":    "Star-level big who creates for others",
  "Playmaking Big":         "Starting big with credible playmaking — high value",
  "Connective Backup Big":  "Backup big who moves the ball",
  "Dominant Interior Big":  "Star-level paint scorer — traditional post dominance",
  "Quality Starting Big":   "Reliable starting big — production + physicality",
  "Starting Paint Center":  "Workhorse starting center — rebounding + rim scoring",
  "Bench Bruiser":          "Backup interior big — physical minutes",
  "Defensive Star":         "Star-level defensive specialist — elite impact without creation",
  "Elite Def. Starter":     "Starting-caliber defensive ace — changes games defensively",
  "Quality Def. Rotation":  "Valued rotation defender — earns minutes through defense",
  "Def. Specialist":        "Pure defensive backup — minimal offensive role",
  "Quality Role Player":    "Reliable rotation player — fits winning culture",
  "Rotation Player":        "Solid NBA rotation contributor",
  "Versatile Starter":      "Starting-caliber versatile player — does multiple things",
  "Bench Versatility":      "Valuable bench player — does a bit of everything",
};

// Ceiling / Floor scores from tier probability distribution (both 0–10)
function computeCeilingFloor(tiers) {
  if (!tiers) return { ceiling: 5, floor: 5, riskTag: null };
  const SS = (tiers.Superstar       ?? 0) / 100;
  const AS = (tiers["All-Star"]     ?? 0) / 100;
  const ST = (tiers.Starter         ?? 0) / 100;
  const RP = (tiers["Role Player"]  ?? 0) / 100;
  const RE = (tiers.Replacement     ?? 0) / 100;
  const NE = (tiers.Negative        ?? 0) / 100;
  // Ceiling: upside-weighted score. Weights scaled so elite prospects (SS≥30%) reach 7-9.
  const ceiling = Math.min(10, Math.round((SS*15 + AS*8 + ST*4 + RP*1.5) * 10) / 10);
  // Floor: reliability score (% chance of contributing as Replacement or better).
  const floor   = Math.min(10, Math.round((1 - RE - NE) * 10 * 10) / 10);
  // Risk labels based on raw probabilities — more stable than derived ceiling/floor scores.
  const starP = (SS + AS) * 100;   // % upside (All-Star+)
  const bustP = (RE + NE) * 100;   // % bust (Replacement or worse)
  const riskTag = (starP >= 25 && bustP >= 15) ? "Boom/Bust"
                : (starP >= 25 && bustP <  12) ? "High Upside"
                : (bustP <   8 && starP <  20) ? "Safe Floor"
                : (floor  >=  7) ? "Bankable" : null;
  return { ceiling, floor, riskTag };
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
  const tpFreq_raw = d.three_f ?? d.three_freq ?? d.threeF ?? d.tp_per ?? 0;
  // Tobias 2026-05-09: three_f scale split: NCAA stores 0-100 (e.g. 26.4), intl
  // stores 0-1 ratio (e.g. 0.34). Disambiguate by source — naive 0-1 detection
  // would mis-classify true low-volume bigs (Bidunga 3PAr=0.6%) as 60% shooters.
  const _isIntlForPos = !!(d.source && d.source !== "ncaa");
  const tpFreq = (_isIntlForPos && tpFreq_raw > 0 && tpFreq_raw < 1) ? tpFreq_raw * 100 : tpFreq_raw;
  const tp = d.tp_pct ?? d.tp ?? 0;
  const blkP = d.blk_p ?? d.blkP ?? 0;
  const orbP = d.orb_p ?? d.orbP ?? 0;

  // Ball-handler override: high AST% = Playmaker, WITH height guard
  // Tobias 2026-05-09 (relaxed): combo guards rated by usg+astP combo, not just astP cutoff.
  // Old thresholds (astP>25) missed Wagler 23.2, Cade Cunningham 20.2, Jrue Holiday 23.8.
  // Guards (<79"): astP>22 + usg≥22 (Curry, Harden, Westbrook, Wagler, Holiday)
  // Taller (<81"): astP≥20 + usg≥26 (Cade, Magic-style point forwards)
  if (ht != null && ht < 79 && astP > 22 && usg >= 22) return "Playmaker";
  if (ht != null && ht < 79 && astP > 28) return "Playmaker";
  if (ht != null && ht < 81 && astP >= 20 && usg >= 26) return "Playmaker";
  if (astP > 30) return "Playmaker"; // Any height — true point-big

  // Tobias 2026-05-09: Big-override for tall non-shooters with rim-protection profile.
  // Catches Tarris Reed (82", 3PAr=1.2%, BLK%=8.4) which the pipeline mis-tags as Wing.
  // Trigger: ≥81" AND (3PAr < 8% OR no shooting attempts) AND (BLK% > 4 OR ORB% > 11).
  if (ht != null && ht >= 81 && tpFreq < 8 && (blkP > 4 || orbP > 11)) return "Big";

  // Stretch/shooting forward override: 6'7"-6'10" with shooting = Wing, not Big
  if (ht != null && ht >= 79 && ht <= 82 && (tp > 30 || tpFreq > 25)) return "Wing";

  // Tobias 2026-05-09: Height-floor override BEFORE existing-pos check.
  // Backend pipeline mislabels short players as Wing (e.g. Westbrook 6'3" → Wing,
  // should be Playmaker). Anyone ≤75" who isn't a stat-Playmaker is at minimum
  // a combo-guard, not a wing.
  if (ht != null && ht <= 75) return "Playmaker";

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

// Tobias 2026-05-06: Intl-Liga → 4-Tier-Klassifikation basierend auf empirischen
// League-Weights (NCAA Power = 1.0 Anker, siehe data/processed/empirical_league_weights.json).
// Premier ≥1.8 | Strong 1.6-1.8 | Mid 1.4-1.6 | Low <1.4
const INTL_LEAGUE_TIER = {
  // Premier (Top-3)
  "Euroleague":              {tier:"Premier", weight:2.50},
  "Spanish ACB":             {tier:"Premier", weight:2.19},
  "Spanish-ACB":             {tier:"Premier", weight:2.19},
  "Eurocup":                 {tier:"Premier", weight:1.82},
  // Strong (1.6-1.8)
  "Italian Serie A":         {tier:"Strong",  weight:1.70},
  "Italian-Lega-Basket-Serie-A": {tier:"Strong", weight:1.70},
  "Turkish BSL":             {tier:"Strong",  weight:1.69},
  "Turkish-BSL":             {tier:"Strong",  weight:1.69},
  "French LNB":              {tier:"Strong",  weight:1.68},
  "France-LNB":              {tier:"Strong",  weight:1.68},
  "Champions League":        {tier:"Strong",  weight:1.67},
  "Champions-League":        {tier:"Strong",  weight:1.67},
  "VTB United League":       {tier:"Strong",  weight:1.67},
  "VTB-United-League":       {tier:"Strong",  weight:1.67},
  "Adriatic ABA":            {tier:"Strong",  weight:1.64},
  "Adriatic-League-Liga-ABA":{tier:"Strong",  weight:1.64},
  "Greek HEBA A1":           {tier:"Strong",  weight:1.60},
  "Greek-HEBA-A1":           {tier:"Strong",  weight:1.60},
  // Mid (1.4-1.6)
  "Israeli BSL":             {tier:"Mid",     weight:1.59},
  "Israeli-BSL":             {tier:"Mid",     weight:1.59},
  "German BBL":              {tier:"Mid",     weight:1.52},
  "Germany-BBL":             {tier:"Mid",     weight:1.52},
  "Australian NBL":          {tier:"Mid",     weight:1.48},
  "Australia-NBL":           {tier:"Mid",     weight:1.48},
  "Lithuanian LKL":          {tier:"Mid",     weight:1.42},
  "Lithuanian-LKL":          {tier:"Mid",     weight:1.42},
  // Low (<1.4)
  "Chinese CBA":             {tier:"Low",     weight:1.15},
  "China-CBA":               {tier:"Low",     weight:1.15},
};

const TIER_COLOR = {
  "Power":   "#10b981",
  "Premier": "#10b981",
  "Strong":  "#22c55e",
  "Mid":     "#fbbf24",
  "Mid-Major":"#fbbf24",
  "Low":     "#f97316",
  "Low-Major":"#f97316",
};

function classifyConfTier(p) {
  // NCAA: confTier kommt aus Pipeline (Power/Mid-Major/Low-Major)
  if (p.source !== "intl") return p.confTier || "—";
  // Intl: aus Liga-Mapping
  const lg = p.conf;
  if (!lg) return "—";
  const m = INTL_LEAGUE_TIER[lg] || INTL_LEAGUE_TIER[lg.replace(/\s+/g,"-")];
  return m ? m.tier : "Mid";  // unbekannte Liga → conservative Mid
}

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
  // ── Phase 2D (Tobias 2026-05-17): Source-aware Cohort-Percentile ──
  // Intl-Spieler bekommen pctl_*_intl-Werte als primary (vs Intl-Peers),
  // weil Vergleich mit NCAA-Peers für Stats wie FTR/FT% unfair ist (College-
  // Reffing inflates FTR). Original `pctl_*` (vs all/NCAA) wird zusätzlich
  // gespeichert für Tooltip-Dual-Display.
  const _isIntl = (d.source === 'intl');
  // Helper: pick intl_value wenn intl + vorhanden, sonst all_value
  const _pickCohort = (intlVal, allVal) =>
    _isIntl && intlVal != null ? intlVal : allVal;
  // Debug-Log entfernt nach Phase 2D-Verify (Tobias 2026-05-17).

  const pctl = d.pctl ? {
    bpm: normPctl(d.pctl.bpm), usg: normPctl(d.pctl.usg), ts: normPctl(d.pctl.ts),
    ast: normPctl(d.pctl.ast), to: normPctl(d.pctl.to), orb: normPctl(d.pctl.orb),
    drb: normPctl(d.pctl.drb), stl: normPctl(d.pctl.stl), blk: normPctl(d.pctl.blk),
    pts36: normPctl(d.pctl.pts36), reb36: normPctl(d.pctl.reb36), ast36: normPctl(d.pctl.ast36),
    ftr: normPctl(d.pctl.ftr), efg: normPctl(d.pctl.efg),
    obpm: normPctl(d.pctl.obpm), dbpm: normPctl(d.pctl.dbpm),
    ortg: normPctl(d.pctl.ortg), astTo: normPctl(d.pctl.astTo ?? d.pctl.ast_to),
  } : {
    // Primary: für Intl pctl_*_intl, sonst pctl_*
    bpm: normPctl(_pickCohort(d.pctl_bpm_intl, d.pctl_bpm)),
    usg: normPctl(_pickCohort(d.pctl_usg_intl, d.pctl_usg)),
    ts: normPctl(_pickCohort(d.pctl_ts_intl, d.pctl_ts)),
    ast: normPctl(_pickCohort(d.pctl_ast_intl, d.pctl_ast)),
    to: normPctl(_pickCohort(d.pctl_to_intl, d.pctl_to)),
    orb: normPctl(_pickCohort(d.pctl_orb_intl, d.pctl_orb)),
    drb: normPctl(_pickCohort(d.pctl_drb_intl, d.pctl_drb)),
    stl: normPctl(_pickCohort(d.pctl_stl_intl, d.pctl_stl)),
    blk: normPctl(_pickCohort(d.pctl_blk_intl, d.pctl_blk)),
    pts36: normPctl(d.pctl_pts36), reb36: normPctl(d.pctl_reb36), ast36: normPctl(d.pctl_ast36),
    ftr: normPctl(_pickCohort(d.pctl_ftr_intl, d.pctl_ftr)),
    efg: normPctl(_pickCohort(d.pctl_efg_intl, d.pctl_efg)),
    obpm: normPctl(_pickCohort(d.pctl_obpm_intl, d.pctl_obpm)),
    dbpm: normPctl(_pickCohort(d.pctl_dbpm_intl, d.pctl_dbpm)),
    ortg: normPctl(_pickCohort(d.pctl_ortg_intl, d.pctl_ortg)),
    astTo: normPctl(d.pctl_ast_to),
    // Secondary: für Intl-Spieler die "vs all/NCAA"-Werte für Tooltip
    bpmAll: normPctl(d.pctl_bpm), usgAll: normPctl(d.pctl_usg),
    tsAll: normPctl(d.pctl_ts), astAll: normPctl(d.pctl_ast),
    toAll: normPctl(d.pctl_to), orbAll: normPctl(d.pctl_orb),
    drbAll: normPctl(d.pctl_drb), stlAll: normPctl(d.pctl_stl),
    blkAll: normPctl(d.pctl_blk), ftrAll: normPctl(d.pctl_ftr),
    efgAll: normPctl(d.pctl_efg), obpmAll: normPctl(d.pctl_obpm),
    dbpmAll: normPctl(d.pctl_dbpm), ortgAll: normPctl(d.pctl_ortg),
    // Cohort-Label für Frontend-Anzeige
    cohort: _isIntl ? 'intl' : 'ncaa',
    cohortLabel: _isIntl ? 'vs Intl peers' : 'vs NCAA peers',
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
  // ast/tov fallback: DB stores to_p but sometimes no explicit ast_to. Compute from ast_p/to_p
  // to guarantee hasAstTovData gate (prevents Boozer-style Floor General false positives at 1.7).
  const _astP_raw = d.ast_p ?? d.astP;
  const _toP_raw  = d.to_p  ?? d.toP;
  const _astTov_raw = (d.ast_to ?? d.astTov ?? d.ast_tov) ??
    ((_astP_raw != null && _toP_raw != null && _toP_raw > 0) ? _astP_raw / _toP_raw : null);
  // Tobias 2026-05-09: Box-score derivation for ts/efg/twoPct when missing.
  // Pre-2017 NCAA pipeline + intl pipeline don't store these. Without derivation,
  // Westbrook/Sabonis/Doncic get 0 badges that depend on ts/efg.
  const _ftDerive  = normShootPct(d.ft_pct ?? d.ft);
  const _tpDerive  = normShootPct(d.tp_pct ?? d.tp);
  const _fgDerive  = normShootPct(d.fg_pct ?? d.fg);
  const _3fRaw     = d.three_f ?? d.three_freq ?? d.threeF;
  const _3f01      = (_3fRaw == null) ? null : (_3fRaw > 1 ? _3fRaw / 100 : _3fRaw);
  const _ftrRaw    = d.ftr ?? d.ft_rate;
  const _ftr01     = (_ftrRaw == null) ? null : (_ftrRaw > 2 ? _ftrRaw / 100 : _ftrRaw);
  const _efgDerived = (() => {
    const direct = normShootPct(d.efg_pct ?? d.efg);
    if (direct != null) return direct;
    if (_fgDerive != null && _tpDerive != null && _3f01 != null) {
      return Math.round((_fgDerive + 0.5 * _tpDerive * _3f01) * 10) / 10;
    }
    return null;
  })();
  const _tsDerived = (() => {
    const direct = normShootPct(d.ts_pct ?? d.ts);
    if (direct != null) return direct;
    if (_efgDerived != null && _ftDerive != null && _ftr01 != null) {
      return Math.round((2 * _efgDerived + _ftDerive * _ftr01) / (2 * (1 + 0.44 * _ftr01)) * 10) / 10;
    }
    return null;
  })();
  const _twoPctDerived = (() => {
    const direct = normShootPct(d.two_pct ?? d.two_p_pct ?? d.twoP_per);
    if (direct != null) return direct;
    if (_fgDerive != null && _tpDerive != null && _3f01 != null && _3f01 < 0.95) {
      const two = (_fgDerive - _tpDerive * _3f01) / (1 - _3f01);
      return (two >= 0 && two <= 100) ? Math.round(two * 10) / 10 : null;
    }
    return null;
  })();

  const tmpP = {
    pos: resolvedPos,
    // All shooting % fields run through normShootPct — 2026 profiles store decimals (0.39),
    // pre-2026 store percentages (38.5). Without normalization, every 2026 prospect fails
    // thresholds like `tp > 40` for Elite Shooting etc.
    ft: _ftDerive,
    tp: _tpDerive,
    ts: _tsDerived,
    efg: _efgDerived,
    rimPct: normShootPct(d.rim_pct ?? d.rimPct),
    twoPct: normShootPct(d.two_pct ?? d.two_p_pct ?? d.twoP_per),
    threeF: d.three_f ?? d.three_freq ?? d.threeF,
    astP: _astP_raw, astTov: _astTov_raw, stlP: d.stl_p ?? d.stlP,
    blkP: d.blk_p ?? d.blkP, usg: d.usg ?? d.usg_p, toP: _toP_raw,
    // Tobias 2026-05-09: ftr scale normalization. Intl pipeline stores 0-1 ratio
    // (Doncic 0.56 = 56%), NCAA stores 0-100 percentage (38.6 = 38.6%). Without
    // normalization, badge filter sees 0.56 < 20 → Passive Driver false positive
    // for elite intl FT-drawers (Wemby, Luka, Sengun all flagged incorrectly).
    ftr: (() => {
      const v = d.ftr ?? d.ft_rate;
      if (v == null) return null;
      const n = Number(v);
      if (isNaN(n)) return null;
      return (n > 0 && n < 2) ? n * 100 : n;
    })(),
    rimF: d.rim_f ?? d.rim_freq ?? d.rimF,
    dbpm: d.dbpm, obpm: d.obpm, bpm: d.bpm,
    feel: d.feel ?? 0, funcAth: d.func_ath ?? 0,
    htIn: d.ht ?? d.height_in ?? d.college_height_inches,
    drbP: d.drb_p ?? d.drbP, orbP: d.orb_p ?? d.orbP,
    dunkR: d.dunk_r ?? d.dunk_rate ?? d.dunkR, age: d.age,
    shootScore: d.shoot_score,
    fouls40: d.fouls_40 ?? 0, min: d.min ?? 0, pts: d.pts ?? 0, fg: d.fg_pct ?? 0,
    source: d.source, league: d.league,
  };
  // ── Archetype pipeline (uses same tmpP stats as badges) ──
  const _ncaaArch = computeNcaaArchetype(tmpP);
  // Pre-compute tiers for recalibrate + ceiling/floor (same logic as tiers field below)
  const _tiersForCF = d.v2TierProbs ? d.v2TierProbs : {
    Superstar:     (d.prob_super??d.prob_superstar??d.probs?.superstar??0)*100,
    "All-Star":    (d.prob_allstar??d.probs?.allstar??0)*100,
    Starter:       (d.prob_starter??d.probs?.starter??0)*100,
    "Role Player": (d.prob_role??d.prob_roleplayer??d.probs?.roleplayer??0)*100,
    Replacement:   (d.prob_repl??d.prob_replacement??d.probs?.replacement??0)*100,
    Negative:      (d.prob_out??d.prob_neg??d.prob_negative??d.prob_never??d.probs?.out??0)*100,
  };
  const { ceiling: _ceilingScore, floor: _floorScore, riskTag: _riskTag } = computeCeilingFloor(_tiersForCF);

  // Tobias 2026-05-09: NBA-Projection nutzt recalibrated Tier (kumulative Schwellen),
  // nicht das rohe Backend modal-tier. Sonst inkonsistent: Steinbach predTier=Starter
  // aber nbaProjection="Camp Invite" (basiert auf Backend-Replacement-Modal).
  const _backendTier = d.v2Tier ?? d.pred_tier ?? d.predicted_tier ?? d.tier ?? "Replacement";
  const _recalTier = recalibrateTier(_tiersForCF, _backendTier);
  const _nbaProjection = projectNbaArchetype(_ncaaArch, _recalTier);

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
  // Additional stat-validation: server badges must also pass client-side stat checks.
  // tmpP.astTov is computed from ast_p/to_p when not explicitly stored (see tmpP above),
  // so astTov is now always available for NCAA prospects → no more "missing data" bypass.
  // Thresholds mirror computeBadges exactly; server badges that fail here get rejected.
  const statValidate = (badge) => {
    const pos    = getBadgePos(tmpP);              // "G" | "W" | "B"
    const isG = pos === "G", isW = pos === "W", isB = pos === "B";
    const _astP   = tmpP.astP   ?? 0;
    const _astTov = tmpP.astTov ?? null;
    const _stlP   = tmpP.stlP   ?? null;
    const _blkP   = tmpP.blkP   ?? null;
    const _usg    = tmpP.usg    ?? 0;
    const _ts     = tmpP.ts     ?? 0;
    const _efg    = tmpP.efg    ?? (_ts > 0 ? _ts - 3 : 0);
    const _ft     = tmpP.ft     ?? null;
    const _tp     = tmpP.tp     ?? null;
    const _threeF = tmpP.threeF ?? null;
    const _ftr    = tmpP.ftr    ?? null;
    const _rimF   = tmpP.rimF   ?? null;
    const _dbpm   = tmpP.dbpm   ?? null;
    const _obpm   = tmpP.obpm   ?? null;
    const _bpm    = tmpP.bpm    ?? null;
    const _drbP   = tmpP.drbP   ?? null;
    const _orbP   = tmpP.orbP   ?? null;
    const _dunkR  = tmpP.dunkR  ?? 0;
    const _toP    = tmpP.toP    ?? null;
    const _feel   = tmpP.feel   ?? null;
    const _funcAth= tmpP.funcAth?? null;
    const _htIn   = tmpP.htIn   ?? 78;
    const _twoPct = tmpP.twoPct ?? null;
    const _age    = tmpP.age    ?? null;
    const _isIntl = (tmpP.source && tmpP.source !== "ncaa") || (tmpP.league && tmpP.league !== "NCAA");
    const _selfCreation = d.self_creation_raw ?? d.self_creation ?? d.self_creation_idx ?? d.self_creation_pct ?? null;

    // ── Passer badges (astTov-sensitive) ──
    // Tobias 2026-05-09: removed null-astTov bypass — when AST/TO is missing,
    // we should NOT auto-pass passer-badges (false positives like Boozer getting
    // Floor General with astTov=1.74 from ast_p/to_p but server-side tov=null).
    // Now require astTov data explicitly. astTov fallback in mapProfile uses
    // ast_p/to_p as last resort, so missing data really means "no info".
    if (badge === "Passing Hub"    && !(isB && _astP > 18 && _astTov != null && _astTov > 1.2)) return false;
    if (badge === "Floor General"  && !((isG || isW) && _astP > 25 && _astTov != null && _astTov > 2.0)) return false;
    if (badge === "Self-Creator"   && !(_selfCreation != null && _selfCreation > 70)) return false;
    if (badge === "Tunnel Vision"  && !(_astTov != null && _astTov < 0.8 && _usg > 22)) return false;

    // ── Shooting badges ──
    if (badge === "Elite Shooting") {
      if (_tp == null || _ft == null) return false;
      const g1 = (_tp > 40 && (_threeF ?? 0) > 30 && _ft > 85);
      const g2 = (_ft > 82 && _tp > 38 && (_threeF ?? 0) > 25);
      if (!(g1 || g2)) return false;
    }
    if (badge === "Latent Sniper"   && !(_ft != null && _tp != null && _ft > 85 && _tp < 33)) return false;
    if (badge === "Latent Touch"    && !(_ft != null && _tp != null && _ft > 80 && _tp < 32)) return false;
    if (badge === "Spacing Killer"  && !((isG || isW) && _tp != null && _threeF != null && _tp < 28 && _threeF < 16)) return false;
    if (badge === "Non-Spacing Perimeter" && !((isG || isW) && _tp != null && _threeF != null && _tp < 30 && _threeF < 20)) return false;
    if (badge === "FT Concern"      && !(_ft != null && _ft >= 30 && _ft < 65 && _usg > 25)) return false;

    // ── Defense / two-way ──
    if (badge === "Two-Way Wing"        && !(isW && _tp != null && _tp > 35 && ((_stlP ?? 0) > 2.2 || (_dbpm ?? 0) > 2.0))) return false;
    if (badge === "Modern Rim Anchor"   && !(isB && (_blkP ?? 0) > 4.0 && (_dbpm ?? 0) > 2.5)) return false;
    if (badge === "Stocks Machine"      && !(((_stlP ?? 0) + (_blkP ?? 0)) > 4.8)) return false;
    if (badge === "Versatile Stopper") {
      const g1 = (isW || isB) && _htIn >= 79 && (_stlP ?? 0) > 1.6 && (_blkP ?? 0) > 1.8;
      const g2 = _isIntl && (isW || isB) && _htIn >= 79 && (_dbpm ?? 0) > 3.0;
      if (!(g1 || g2)) return false;
    }
    if (badge === "Defensive Stopper Floor" && !(_htIn >= 80 && (_stlP ?? 0) > 2.5)) return false;
    if (badge === "Transition Terror") {
      const g1 = (isG || isW) && (_stlP ?? 0) > 2.5 && _dunkR > 8;
      const g2 = (isG || isW) && (_stlP ?? 0) > 2.8 && (_twoPct ?? 0) > 55;
      if (!(g1 || g2)) return false;
    }
    if (badge === "One-Way Project"    && !(_obpm != null && _dbpm != null && _obpm > 3.0 && _dbpm < -1.5 && (_stlP ?? 99) < 1.0)) return false;
    if (badge === "Soft Interior"      && !(isB && _ftr != null && _blkP != null && _ftr < 22 && _blkP < 2.0)) return false;
    if (badge === "Defensive Target"   && !(isG && _htIn < 74 && _dbpm != null && _dbpm < -1.0)) return false;
    if (badge === "Liability Big"      && !(isB && _drbP != null && _blkP != null && (_drbP < 15 || _blkP < 1.5))) return false;
    if (badge === "All-Offense Big"    && !(isB && _blkP != null && _dbpm != null && _blkP < 2.5 && _dbpm < 1.5)) return false;
    if (badge === "Non-Processing Guard" && !(isG && _astTov != null && _astTov < 0.8 && (_toP ?? 0) > 20)) return false;

    // ── Athleticism / efficiency ──
    if (badge === "Magnetic Hands"     && !(_orbP != null && _drbP != null && _orbP > 12 && _drbP > 25)) return false;
    if (badge === "FT Grifter"         && !(_ftr != null && _ftr > 60 && ((_rimF ?? 0) > 35 || _usg > 26))) return false;
    if (badge === "Efficient High Usage" && !(_usg > 28 && (_toP ?? 99) < 12 && _ts > 58)) return false;
    if (badge === "High Feel Athlete"  && !(_feel != null && _funcAth != null && _feel > 75 && _funcAth > 75)) return false;
    if (badge === "Lurking Elite"      && !(_bpm != null && _usg < 20 && _bpm > 7.0 && _ts > 62)) return false;
    if (badge === "Analytics Darling"  && !(_bpm != null && _bpm > 8.0 && _ts > 60 && _usg < 22)) return false;
    if (badge === "Efficiency Monster" && !(_efg > 60 && _astTov != null && _astTov > 2.0 && (_stlP ?? 0) > 2.0)) return false;
    if (badge === "Glue-Guy Connector" && !(_astTov != null && _astTov > 2.5 && (_dbpm ?? 0) > 2.0 && _usg < 16)) return false;
    if (badge === "Efficiency Trap"    && !(_usg > 26 && _ts != null && _ts < 52)) return false;
    if (badge === "Empty Calorie Scorer" && !(_usg > 28 && _ts != null && _ts < 52 && _astP < 15)) return false;
    if (badge === "Passive Driver"     && !(_ftr != null && _ftr > 0 && _ftr < 20 && _usg > 20)) return false;
    if (badge === "Foul Magnet"        && !((tmpP.fouls40 ?? 0) > 4.8)) return false;

    // ── Age-gate badges (international) ──
    if (badge === "International Prodigy" && !(_isIntl && _age != null && _age < 18.5 && (_bpm ?? 0) > 4.0)) return false;
    if (badge === "Pro-Ready Teen"        && !(_isIntl && _age != null && _age < 19 && (_bpm ?? 0) > 2.0)) return false;

    // ── "High Feel" (server-only badge, not in computeBadges) ──
    if (badge === "High Feel" && !(_feel != null && _feel > 70)) return false;

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
    // Tobias 2026-05-09: 5-Position-Klassifikation (PG/SG/SF/PF/C) für Body-Tab
    // Anthro-Vergleich. Wenn Backend pos_detailed liefert, nehme das. Sonst leite ab.
    posDetailed: d.pos_detailed || inferDetailedPos(resolvedPos, d.ht ?? d.height_in ?? d.college_height_inches, d.ast_p ?? d.astP),
    team: d.team ?? d.college_team ?? "", conf: d.conf ?? d.college_conf ?? "",
    confTier: d.conf_tier ?? d.confTier ?? "", cls: d.cls ?? d.class ?? "",
    yr: d.yr ?? d.season_year ?? d.draft_year ?? 2026,
    age: d.age ?? d.age_on_draft_day,
    // Tobias 2026-05-06: Intl-spezifisch — Years of Pro statt College-Class
    firstProSeason: d.intl_first_pro_season ?? d.first_pro_season ?? null,
    firstProLeague: d.intl_first_pro_league ?? d.first_pro_league ?? null,
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
    bpm: d.bpm, obpm: d.obpm, dbpm: d.dbpm, ogbpm: d.ogbpm ?? null, btPid: d.pid ?? null,
    ortg: d.ortg ?? d.ORtg ?? d.offensive_rating,
    usg: normRate(d.usg ?? d.usg_p),
    // Tobias 2026-05-09: Derive twoPct, eFG%, TS% when missing (international pipeline gap).
    // RealGM exposes FG%, 3P%, 3PA-rate (three_f) but not 2P%/eFG%/TS%. These are
    // mathematically derivable from box-score identities — no model assumption.
    //   2P% = (FG% − 3P%·r) / (1 − r)        with r = 3PA/FGA
    //   eFG% = FG% + 0.5·3P%·r
    //   TS% = (2·eFG% + FT%·ftr) / (2·(1 + 0.44·ftr))   with ftr = FTA/FGA
    ts: (() => {
      const direct = normShootPct(d.ts_pct ?? d.ts);
      if (direct != null) return direct;
      const fg  = normShootPct(d.fg_pct ?? d.fg);
      const tp  = normShootPct(d.tp_pct ?? d.tp);
      const ft  = normShootPct(d.ft_pct ?? d.ft);
      const r_raw = d.three_f ?? d.three_freq ?? d.threeF;
      const r = (r_raw == null) ? null : (r_raw > 1 ? r_raw / 100 : r_raw);
      const ftr_raw = d.ftr ?? d.ft_rate;
      const ftr = (ftr_raw == null) ? null : (ftr_raw > 2 ? ftr_raw / 100 : ftr_raw);
      if (fg == null || tp == null || ft == null || r == null || ftr == null) return null;
      const efg = fg + 0.5 * tp * r;
      const ts_calc = (2 * efg + ft * ftr) / (2 * (1 + 0.44 * ftr));
      return Math.round(ts_calc * 10) / 10;
    })(),
    fg: normShootPct(d.fg_pct ?? d.fg),
    efg: (() => {
      const direct = normShootPct(d.efg_pct ?? d.efg);
      if (direct != null) return direct;
      const fg = normShootPct(d.fg_pct ?? d.fg);
      const tp = normShootPct(d.tp_pct ?? d.tp);
      const r_raw = d.three_f ?? d.three_freq ?? d.threeF;
      const r = (r_raw == null) ? null : (r_raw > 1 ? r_raw / 100 : r_raw);
      if (fg == null || tp == null || r == null) return null;
      return Math.round((fg + 0.5 * tp * r) * 10) / 10;
    })(),
    twoPct: (() => {
      const direct = normShootPct(d.two_pct ?? d.two_p_pct ?? d.twoP_per);
      if (direct != null) return direct;
      const fg = normShootPct(d.fg_pct ?? d.fg);
      const tp = normShootPct(d.tp_pct ?? d.tp);
      const r_raw = d.three_f ?? d.three_freq ?? d.threeF;
      const r = (r_raw == null) ? null : (r_raw > 1 ? r_raw / 100 : r_raw);
      if (fg == null || tp == null || r == null || r >= 0.95) return null;
      const two = (fg - tp * r) / (1 - r);
      return (two >= 0 && two <= 100) ? Math.round(two * 10) / 10 : null;
    })(),
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
    // Shot Creation Spectrum (zone-level PBP data)
    shotCreation: d.shotCreation ?? null,
    // Tobias 2026-06-03: shooting field (Three-Layer block)
    // Emitted by backend after v10 sprint (PID-keyed Skill/Intent/Volume).
    // Conditional render lives in ShootingTab: `{p.shooting && ...}`.
    shooting: d?.shooting ?? null,
    // Leverage-Weighted Efficiency (self-creation-weighted eFG%)
    leverageEff: d.leverageEff ?? null,
    // Offensive Skill Curve (usage scalability + peer curve position)
    skillCurve: d.skillCurve ?? null,
    // Mind-Tab Mental-Resilience metrics (Tobias 2026-05-09)
    mindMetrics: d.mindMetrics ?? null,
    // Per-Game-Stats für Scouting Skill-Curve + Development In-Season-Trajectory
    gameLogs: d.gameLogs ?? null,
    // Draft Risk Profile (Market/Merit range + bust/star risk) — inject_draft_risk.py
    riskProfile: d.riskProfile ?? null,
    // NBA-Rollen-Projektion (pre→post outcome distribution + floor) — inject_nba_role.py
    nbaRoleProjection: d.nbaRoleProjection ?? null,
    // Added-Wins projection (P(NBA) × E[AW|NBA], team-anchored target) — inject_added_wins.py
    addedWins: d.addedWins ?? null,
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
    // Tobias 2026-05-09: Filter pipeline archetypes by player's position group.
    // Pipeline can emit cross-pos matches (Wing getting "Stretch Big" etc.) — drop those.
    // Tall wings (≥81") get Stretch-4 / Glass Cleaner pass-through (Tatum/Markkanen pattern).
    archetype: filterArchetypesByPos(d.archetype || "", resolvedPos, d.ht ?? d.height_in ?? d.college_height_inches, _ncaaArch).split("|")[0] || "",
    archetypesAll: filterArchetypesByPos(d.archetypes_all || d.archetype || "", resolvedPos, d.ht ?? d.height_in ?? d.college_height_inches, _ncaaArch),
    feas:{repl:d.feas_repl,rot:d.feas_rot,start:d.feas_start,allstar:d.feas_allstar,
      cleared:d.feas_cleared||"",blocker:d.feas_blocker||""},
    mu:d.pred_mu??d.mu??d.projected_pie??d.pred_mu_pie??d.aspm_adj??d.aspm,
    sigma:d.pred_sigma??d.sigma??d.mc_sigma??d.volatility,
    pNba:d.pred_p_nba??d.pNba??d.pn,
    // Tobias 2026-05-09: predTier is now threshold-recalibrated (see recalibrateTier).
    // Original modal tier is preserved as `predTierRaw` for debugging / methodology.
    predTier: d.addedWins?.projTier ?? (() => {
      // Added-Wins projTier = reasonable-POTENTIAL tier by class standing (realistic
      // class spread). Falls back to the recalibrated modal tier for legacy profiles.
      const fallback = d.v2Tier ?? d.pred_tier ?? d.predicted_tier ?? d.tier;
      const probs = d.addedWins?.tierProbs ?? d.v2TierProbs;
      if (probs) return recalibrateTier(probs, fallback);
      // Legacy probs from prob_* fields (×100 already in tiers field above)
      const legacy = {
        Superstar:((d.prob_super??d.prob_superstar??d.probs?.superstar??0)*100),
        "All-Star":((d.prob_allstar??d.probs?.allstar??0)*100),
        Starter:((d.prob_starter??d.probs?.starter??0)*100),
        "Role Player":((d.prob_role??d.prob_roleplayer??d.probs?.roleplayer??0)*100),
        Replacement:((d.prob_repl??d.prob_replacement??d.probs?.replacement??0)*100),
      };
      return recalibrateTier(legacy, fallback);
    })(),
    predTierRaw: d.v2Tier ?? d.pred_tier ?? d.predicted_tier ?? d.tier,
    // Tobias 2026-05-05: potential_tier zeigt P(A+)≥30%-basierten Tier (statt nur Modal).
    // Doncic mit S=45% A=51.5% bekommt "Superstar Potential" (45%≥30%), waehrend
    // predicted_tier "All-Star" bleibt. Macht Pre-Draft-Potenzial sichtbar.
    potentialTier: d.potential_tier ?? null,
    countingStatsImputed: d.counting_stats_imputed ?? false,
    ups: d.ups ?? d.ups_raw,
    // Tobias 2026-05-25: PRIMARY VALUE METRIC converged to Added Wins (inject_added_wins.py).
    // Prefer addedWins.* everywhere; fall back to legacy ppWA so players without a new
    // projection still render. Added Wins is on the same realized-WA scale (just an honest,
    // compressed expectation) and tierProbs share the same %-scale keys as v2TierProbs.
    ppwa: d.addedWins?.ev ?? d.ppwa ?? null,
    pElite: d.addedWins?.tierProbs
      ? ((d.addedWins.tierProbs.Superstar || 0) + (d.addedWins.tierProbs["All-Star"] || 0)) / 100
      : (d.pElite ?? null),
    waFloor: d.addedWins?.floor ?? d.waFloor ?? null,
    waCeiling: d.addedWins?.ceiling ?? d.waCeiling ?? null,
    waSigma: d.waSigma ?? d.v2_sigma ?? null,
    pNba: d.addedWins?.pNba ?? d.pNba ?? null,   // real P(NBA) for the Non-NBA chart bar
    v2Conf: d.v2Conf ?? null,
    v2TierProbs: d.addedWins?.tierProbs ?? d.v2TierProbs ?? null,  // %-scale {Superstar:0.3, ...}
    v2Boosters: d.v2Boosters ?? null,
    v2Limiters: d.v2Limiters ?? null,
    war: d.addedWins?.ev ?? d.ppwa ?? d.war ?? d.projected_war ?? d.war_score ?? null,
    humble: d.humble ?? d.f_humble ?? d.hmb ?? null,
    aspm: d.aspm ?? d.aspm_adj,
    production: d.production ?? d.prod,
    impact: d.impact,
    careerPath: d.career_path ?? d.path ?? "NBA",
    // Tier probabilities: v2TierProbs is already %-scale from new model
    // Fall back to prob_* fields (×100 for %) from the legacy model
    tiers: d.addedWins?.tierProbs ? d.addedWins.tierProbs : d.v2TierProbs ? d.v2TierProbs : {
      Superstar:((d.prob_super??d.prob_superstar??d.probs?.superstar??0)*100),
      "All-Star":((d.prob_allstar??d.probs?.allstar??0)*100),
      Starter:((d.prob_starter??d.probs?.starter??0)*100),
      "Role Player":((d.prob_role??d.prob_roleplayer??d.probs?.roleplayer??0)*100),
      Replacement:((d.prob_repl??d.prob_replacement??d.probs?.replacement??0)*100),
      "Negative":((d.prob_out??d.prob_neg??d.prob_negative??d.prob_never??d.probs?.out??0)*100),
    },
    ceiling: d.ceiling, floor: d.floor, volatility: d.volatility ?? d.mc_sigma,
    badges: allGreen, redFlags: allRed, yellowBadges: allYellow,
    btUrl:d.bt_url, btTeamUrl:d.bt_team_url,
    // Tobias 2026-05-09: actual-tier nur wenn Spieler wirklich NBA gespielt hat.
    // Backend setzt d.tier = predicted_tier auch für 2026er — würde fälschlich
    // als "Actual NBA Outcome: Starter" angezeigt obwohl Boozer noch nicht gedraftet.
    // Plus Display-Override: peak_pie → tier mit lenient public-perception thresholds
    // (Tatum/Brunson/Trae sollten All-Star-Karrieren als All-Star+ gelabelt sein).
    actual: (() => {
      const playedNba = d.made_nba === true || d.peak_pie != null || d.nba_peak_actual != null;
      if (!playedNba) return null;
      const pieDerived = tierFromPeakPie(d.peak_pie ?? d.nba_peak_actual);
      return pieDerived || d.tier;  // PIE-derived first, fallback to backend tier
    })(),
    peakPie: d.peak_pie ?? d.nba_peak_actual,
    nbaName: d.nba_name || "",
    madeNba:d.made_nba, draftYear:d.draftYear??d.draft_year, draftPick:d.draft_pick,
    classRank: d.classRank ?? null,
    // ── Intl-Tier-Modell (10e_intl_tier_classifier.py) ──
    // Backend liefert: intl_tier (string) + p_intl_eu_impact / p_intl_eu /
    // p_intl_top_eu / p_intl_pro / p_intl_fringe (probabilities 0..1).
    // Wir bauen die UI-Struktur intlTierProbs als sortiertes Array {tier, prob, leagues, desc}.
    intlTier: d.intl_tier ?? d.intlTier ?? null,
    intlTierProbs: (() => {
      const has = d.intl_tier || d.p_intl_eu_impact != null || d.p_intl_eu != null;
      if (!has) return d.intlTierProbs ?? null;
      const TIER_META = {
        "EuroLeague Impact": {leagues:"Euroleague", desc:"Top international impact player; rotation regular in the strongest league."},
        "EuroLeague":        {leagues:"Euroleague / Eurocup",     desc:"Solid Euroleague regular or top EuroCup player."},
        "Top European Liga": {leagues:"ACB / Italian-A / Adriatic", desc:"Regular in one of Europe's strong top leagues."},
        "Pro Basketball":    {leagues:"German-BBL / Lithuanian-LKL", desc:"Roster player in a pro league below top European tier."},
        "Fringe Pro":        {leagues:"Lower Pro / Domestic-only",   desc:"Marginal pro status; short or domestic-only career."},
      };
      const order = ["EuroLeague Impact","EuroLeague","Top European Liga","Pro Basketball","Fringe Pro"];
      const probs = {
        "EuroLeague Impact": Number(d.p_intl_eu_impact ?? 0),
        "EuroLeague":        Number(d.p_intl_eu ?? 0),
        "Top European Liga": Number(d.p_intl_top_eu ?? 0),
        "Pro Basketball":    Number(d.p_intl_pro ?? 0),
        "Fringe Pro":        Number(d.p_intl_fringe ?? 0),
      };
      return order.map(t => ({ tier:t, prob:probs[t]||0, leagues:TIER_META[t].leagues, desc:TIER_META[t].desc }));
    })(),
    actualIntlLeague:  d.actualIntlLeague  ?? null,
    actualIntlTier:    d.actualIntlTier    ?? null,
    actualIntlLeagues: d.actualIntlLeagues ?? null,
    // Tobias 2026-05-05: Injury-Saison-Fallback (05a_process_barttorvik.py).
    // Wenn aktuelle Saison verletzungsbedingt verkuerzt war (GP<15), fallback
    // auf beste Vorsaison als Pred-Basis. UI zeigt das transparent.
    //   injuryFallbackSeason = Saison die uebersprungen wurde (z.B. 2026)
    //   displaySeason = Anzeigesaison (Team/Class), bleibt aktuelle Saison
    //   season_year = Saison aus der die Stats fuer Pred kamen (Vorsaison)
    injuryFallbackSeason: d.injury_fallback_season ?? null,
    displaySeason: d.display_season ?? null,
    ncaaArchetype: _ncaaArch,
    nbaProjection: _nbaProjection,
    ceilingScore: _ceilingScore,
    floorScore: _floorScore,
    riskTag: _riskTag,
    confidence:d.confidence||"full", sampleMin:d.sample_min, sampleGp:d.sample_gp,
    source: d.source ?? "ncaa",
    // Session 9: per-player feature contribution drivers
    projectionBoosters: d.projection_boosters ?? d.proj_boost ?? "",
    projectionLimiters: d.projection_limiters ?? d.proj_limit ?? "",
    statComps:[], anthroComps:[], hasCombine: null,
    // Filter seasonLines: realistic pre-draft window around the player's draft year (d.yr).
    //  • Upper bound (yr <= d.yr) blocks future-season collisions (Donovan Mitchell 2017 vs 2021 namesake).
    //  • Lower bound blocks past-season collisions (Brandon Jennings 2026 VCU vs 2008 Italy / 2009 Bucks)
    //    but is source-aware: 6y for NCAA (4y college career + buffer), 10y for non-NCAA prospects
    //    so international careers (Doncic: Real Madrid from age 16, Steinbach: BBL pro) stay visible
    //    while still blocking 18+ year-old namesake records.
    //  • GP ≥ 8 suppresses cup-of-coffee records.
    seasonLines: (d.seasonLines || []).filter(s =>
      (s.gp == null || s.gp >= 8) &&
      (d.yr == null || s.yr == null || s.yr <= d.yr) &&
      (d.yr == null || s.yr == null || s.yr >= d.yr - (d.source && d.source !== "ncaa" ? 10 : 6))
    ),
    comb: d.combine || null,
    posPlaymaker:d.pos_playmaker, posWing:d.pos_wing, posBig:d.pos_big,
  };
}

let PLAYERS = {};
let PLAYER_LIST = [];

// ── Canonical identity helpers ──────────────────────────────────────────
// The backend now serves every profile with a stable `player_id` + a
// URL-safe `slug`. The UI still keys its state by *display name* for
// simplicity, but two distinct people can share the same display name
// (e.g. two Cameron Boozers). We solve that at install-time by adding a
// disambiguating suffix "· <team> '<yy>" to collision-affected entries —
// that becomes both the React key AND the implicit secondary-line
// displayed next to the player's name.
//
// The original display name remains on `entry.name`, the slug on
// `entry.slug`, and the player_id on `entry.player_id`. All fetches
// should prefer slug to stay collision-safe end-to-end.
function playerKeyFor(entry) {
  const rawName = entry?.name || "";
  if (!rawName) return entry?.slug || "";
  return rawName;
}
function disambiguateKey(entry) {
  const base = entry?.name || "Unknown";
  const team = entry?.team || "";
  const yr = entry?.yr;
  const yyStr = (yr != null && Number.isFinite(+yr)) ? `'${String(yr).slice(-2)}` : "";
  const suffix = [team, yyStr].filter(Boolean).join(" ");
  return suffix ? `${base} · ${suffix}` : base;
}
function installPlayers(players) {
  // First pass: count display-name occurrences
  const counts = {};
  players.forEach(pl => {
    const k = pl?.name || "";
    if (!k) return;
    counts[k] = (counts[k] || 0) + 1;
  });
  // Second pass: install with disambiguated keys on collisions
  const installedKeys = [];
  players.forEach(pl => {
    const mapped = mapProfile(pl) || {};
    mapped.player_id = pl.player_id || mapped.player_id;
    mapped.slug = pl.slug || mapped.slug;
    mapped.name = pl.name || mapped.name;
    const key = (counts[pl.name] || 0) > 1 ? disambiguateKey(pl) : playerKeyFor(pl);
    // If the disambiguated key *still* collides (identical team+year), append pid
    let finalKey = key;
    if (PLAYERS[finalKey] && PLAYERS[finalKey].player_id !== mapped.player_id) {
      finalKey = `${key} [${mapped.player_id}]`;
    }
    PLAYERS[finalKey] = mapped;
    PLAYER_LIST.push(finalKey);
    installedKeys.push(finalKey);
  });

  // Tobias 2026-05-09: Compute classRank dynamically per draft-year cohort.
  // Backend currently emits classRank=null for all players (pipeline-side TODO).
  // We rank by predicted-peak-wins-added (ppwa) within each draftYear, descending.
  // Ties broken by ups (overall composite). Assigns 1-based rank only if player
  // has ppwa OR ups (otherwise leaves classRank=null to avoid ranking phantoms).
  const byYear = {};
  installedKeys.forEach(k => {
    const p = PLAYERS[k];
    if (!p) return;
    const yr = p.draftYear ?? p.yr;
    if (yr == null) return;
    if (!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(k);
  });
  Object.keys(byYear).forEach(yr => {
    const keys = byYear[yr]
      .filter(k => {
        const p = PLAYERS[k];
        return p && (p.ppwa != null || p.war != null || p.ups != null);
      })
      .sort((a, b) => {
        const pa = PLAYERS[a], pb = PLAYERS[b];
        const va = pa.ppwa ?? pa.war ?? -999;
        const vb = pb.ppwa ?? pb.war ?? -999;
        if (vb !== va) return vb - va;
        return (pb.ups ?? -999) - (pa.ups ?? -999);
      });
    keys.forEach((k, i) => {
      // Only set if backend hasn't already provided a classRank
      if (PLAYERS[k].classRank == null) {
        PLAYERS[k].classRank = i + 1;
      }
    });
  });
}

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

const StatCell = ({label,val,pctl,suffix="",tooltip}) => (
  <div className="text-center p-2 rounded-lg" style={{background:valBg(pctl)}} title={tooltip}>
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
        {(() => {
          // Tobias 2026-05-06: Intl-spezifische Header-Felder.
          // - Class → Years Pro (aus intl_first_pro_season).
          // - Conf Tier → 4-Tier-Klassifikation (Premier/Strong/Mid/Low) aus League-Weights.
          // - Age → "Age on Draft Day" (immer der Reference-Point der Pipeline).
          // Tobias 2026-05-17 Phase 2D: Recruit → Liga-Weight für Intl-Spieler.
          // Multi-Bridge League-Weights (Anchor: NCAA=1.0, Cap=2.0). Zeigt
          // Methodik-Transparenz und erklärt warum Stats-Multiplier angewendet werden.
          const isIntl = p.source === "intl";
          const yearsPro = (isIntl && p.firstProSeason && p.yr)
            ? Math.max(1, Math.round(Number(p.yr) - Number(p.firstProSeason) + 1))
            : null;
          const classOrYearsPro = isIntl
            ? (yearsPro != null ? `${yearsPro} yr${yearsPro === 1 ? "" : "s"} Pro` : "—")
            : (p.cls || "—");
          const classLabel = isIntl ? "Years Pro" : "Class";
          const computedTier = classifyConfTier(p);
          const tierColor = TIER_COLOR[computedTier] || "#9ca3af";
          const confColor = isIntl ? tierColor : (p.confTier === "Power" ? "#10b981" : "#f97316");

          // Multi-Bridge League-Weights (Stand 2026-05-17). NCAA-Power = 1.000.
          // > 1.0 = stärker als NCAA-Power-Conference, < 1.0 = schwächer.
          const LEAGUE_WEIGHTS = {
            "Euroleague": 1.258, "Spanish ACB": 1.145, "Turkish BSL": 1.027,
            "French LNB": 1.023, "Italian Serie A": 1.022, "Eurocup": 1.013,
            "Israeli BSL": 0.989, "Australian NBL": 0.971, "Champions League": 0.963,
            "VTB United": 0.956, "Adriatic ABA": 0.951, "Greek HEBA A1": 0.937,
            "German BBL": 0.935, "Montenegrin Liga": 0.902, "Lithuanian LKL": 0.888,
            "Japanese B": 0.886, "Euroleague NGT": 0.836, "Overtime Elite": 0.831,
            "Korean KBL": 0.828, "Chinese CBA": 0.800, "Serbian KLS": 0.736,
            "Croatian A1": 0.733, "Polish PLK": 0.549,
          };
          const lw = isIntl ? LEAGUE_WEIGHTS[p.conf] : null;
          const lwStr = lw != null ? `×${lw.toFixed(2)}` : (isIntl ? "—" : null);
          const lwColor = lw == null ? "#9ca3af"
            : lw >= 1.20 ? "#22c55e"      // Premier-Tier (Euroleague/ACB)
            : lw >= 1.00 ? "#86efac"      // Strong (NCAA-Power equivalent)
            : lw >= 0.85 ? "#fbbf24"      // Mid
            :              "#f97316";     // Low

          const recruitOrLw = isIntl
            ? ["League Weight", lwStr || "—", lwColor]
            : ["Recruit", p.recRank ? `#${p.recRank}` : "Unranked", "#e5e7eb"];

          return [
            ["Conference",  p.conf, confColor],
            [classLabel,    classOrYearsPro, "#e5e7eb"],
            ["Age on Draft Day", p.age != null ? ageOnDraftDay(p.age).toFixed(1) : "—", "#e5e7eb"],
            recruitOrLw,
            ["Source",      p.source?.toUpperCase() || "NCAA", p.source === "ncaa" ? "#3b82f6" : "#f97316"],
            ["Conf Tier",   computedTier, tierColor],
          ];
        })().map(([l,v,c])=>(
          <div key={l} className="rounded-lg p-3" style={{background:"#111827"}}
               title={l === "League Weight"
                 ? "Multi-bridge methodology: NCAA Power = 1.00 (anchor). League Weight = empirical NBA-translation factor derived from bridge players. >1.0 = stronger than NCAA Power, <1.0 = weaker. Stats are calibrated in the ML model with this factor."
                 : undefined}>
            <div className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>{l}</div>
            <div className="font-semibold mt-0.5" style={{color:c,fontFamily:"'Oswald',sans-serif"}}>{v||"—"}</div>
          </div>
        ))}
      </div>
      <Sec icon="▦" title="Box Score" sub={(() => {
        // Phase 2D (Tobias 2026-05-17): Cohort-Indicator für Intl-Spieler.
        // Percentiles werden für source=intl gegen Intl-Cohort berechnet
        // (NCAA-Vergleich für FTR/FT% etc. wäre unfair wegen College-Reffing).
        const cohortNote = p.pctl?.cohort === 'intl'
          ? ` · Percentiles vs Intl-Peers ${p.pos ? `(${p.pos})` : ''}`
          : '';
        const baseStr = p.gp
          ? `${p.gp} GP · ${fmt(p.min)} MIN/G — Traditional counting stats. Look for per-minute efficiency, not raw totals.`
          : (p.yr && p.yr <= 2009
              ? "Per-game counting stats unavailable for 2008-2009 BartTorvik data. Advanced stats shown below."
              : "Game data unavailable for this player.");
        return baseStr + cohortNote;
      })()}>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
          {(() => {
            // Tobias 2026-05-09: AST/TO percentile fallback wenn pctl_ast_to fehlt.
            // Step-function von typischen NCAA-Verteilung: median ~1.5, p90 ~2.5.
            const astTo = p.astTov;
            const astToPctl = p.pctl?.astTo ?? (
              astTo == null    ? null :
              astTo >= 3.0     ? 95 :
              astTo >= 2.5     ? 85 :
              astTo >= 2.0     ? 70 :
              astTo >= 1.6     ? 55 :
              astTo >= 1.3     ? 40 :
              astTo >= 1.0     ? 25 :
              astTo >= 0.7     ? 12 :
                                 5
            );
            return [["PTS",p.pts,p.pctl?.pts36],["REB",p.reb,p.pctl?.reb36],["AST",p.ast,p.pctl?.ast36],
              ["STL",p.stl,p.pctl?.stl],["BLK",p.blk,p.pctl?.blk],["A/TO",astTo,astToPctl],["FTR",p.ftr,p.pctl?.ftr],
              ["TO%",p.toP,p.pctl?.to ?? estPctlToInverted(p.toP)]
            ].map(([l,v,pc])=><StatCell key={l} label={l} val={v} pctl={pc}/>);
          })()}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" style={{color:"#6b7280"}}>
          <span>Efficiency:</span>
          {[["TS%",p.ts,p.pctl?.ts],["FG%",p.fg,null],["3P%",p.tp,null],["FT%",p.ft,null],["eFG%",p.efg,null]].map(([l,v,pc])=>(
            <span key={l} className="px-2 py-0.5 rounded" style={{background:valBg(pc),color:pc?valColor(pc):"#e5e7eb"}}>{l} {fmt(v)}</span>
          ))}
        </div>
      </Sec>
      <Sec icon="⚡" title="Advanced" sub={(() => {
        // Phase 2D (Tobias 2026-05-17): Liga-Weight-Hinweis für Intl-Spieler.
        const base = "Rate stats that capture efficiency and impact independent of how big a player's role is. BPM (overall impact) and ORtg (offensive efficiency) are the strongest NBA-translation signals on this row.";
        if (p.source === "intl" && p.conf) {
          const LW = {
            "Euroleague": 1.258, "Spanish ACB": 1.145, "Turkish BSL": 1.027,
            "French LNB": 1.023, "Italian Serie A": 1.022, "Eurocup": 1.013,
            "Israeli BSL": 0.989, "Australian NBL": 0.971, "Champions League": 0.963,
            "VTB United": 0.956, "Adriatic ABA": 0.951, "Greek HEBA A1": 0.937,
            "German BBL": 0.935, "Montenegrin Liga": 0.902, "Lithuanian LKL": 0.888,
            "Japanese B": 0.886, "Euroleague NGT": 0.836, "Overtime Elite": 0.831,
            "Korean KBL": 0.828, "Chinese CBA": 0.800, "Serbian KLS": 0.736,
            "Croatian A1": 0.733, "Polish PLK": 0.549,
          };
          const lw = LW[p.conf];
          if (lw != null) {
            return `${base} · Stats from ${p.conf} (League Weight ×${lw.toFixed(2)} vs NCAA Power), ML model calibrated via Multi-Bridge.`;
          }
        }
        return base;
      })()}>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {[["BPM",p.bpm,p.pctl?.bpm],["OBPM",p.obpm,p.pctl?.obpm],
            ...(p.ogbpm != null ? [["O-GBPM", p.ogbpm,
              p.pctl?.ogbpm ??
              // Client-side percentile estimate: lookup table (D1 NCAA OGBPM distribution)
              (p.ogbpm >= 12 ? 99 : p.ogbpm >= 9 ? 97 : p.ogbpm >= 7 ? 94 : p.ogbpm >= 5 ? 89
               : p.ogbpm >= 3 ? 79 : p.ogbpm >= 1 ? 63 : p.ogbpm >= 0 ? 51
               : p.ogbpm >= -1 ? 39 : p.ogbpm >= -3 ? 22 : p.ogbpm >= -5 ? 10 : 4)
            ]] : []),
            ["DBPM",p.dbpm,p.pctl?.dbpm],["ORtg",p.ortg,p.pctl?.ortg],
            ["USG%",p.usg,p.pctl?.usg],["TS%",p.ts,p.pctl?.ts],
            // Tobias 2026-05-09: Fallback-Percentile für AST/TO via Position (BartTorvik 2008-2026 dist).
            ["AST%",p.astP,p.pctl?.ast ?? estPctlAstWithinPos(p.astP, p.pos)],
            ["TO%", p.toP, p.pctl?.to  ?? estPctlToInverted(p.toP)],
            ["ORB%",p.orbP,p.pctl?.orb],["DRB%",p.drbP,p.pctl?.drb],["STL%",p.stlP,p.pctl?.stl],["BLK%",p.blkP,p.pctl?.blk]
          ].map(([l,v,pc])=><StatCell key={l} label={l} val={v} pctl={pc} tooltip={l==="O-GBPM"?"O-GBPM = Offensive Game-Adjusted Box Plus/Minus (BartTorvik). Estimates a player's offensive impact per 100 possessions, adjusted for opponent strength. Higher = more offensive value relative to an average D1 player. Percentile shown is vs. all D1 players for the season.":undefined}/>)}
        </div>
      </Sec>

      {/* ═══ TIER FEASIBILITY — Each metric on its own row ═══ */}
      <Sec icon="📊" title={`vs. NBA ${compTier} (${p.pos})`} sub="How does this prospect's college production line up with what players who reached this NBA tier actually showed pre-draft? Bars show the typical range for that NBA tier and position, built from the empirical median of 353 NBA players drafted 2008–2018 (grouped by realized peak Wins Added). Green = at/above median. Yellow = below median but compensated by an elite core skill. Orange = below median. Red = critical gap. Caveat: pre-draft college stats only weakly separate Starter from All-Star — a prospect can clear Starter and miss All-Star simply because the two tiers' college numbers overlap. The real tier sort happens AFTER the draft (role, minutes, team). Read this as a fit-diagnostic, not a tier prediction.">
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

        {/* Tobias 2026-06-02 v3: Verdict — class-aware for NCAA + bridge-cohort for Intl. */}
        {(() => {
          const inR = assessed.filter(m=>m.status==="In-Range").length;
          const total = assessed.filter(m=>m.pctP50!=null).length;
          if (total < 8) return null;
          // Tobias 2026-06-02 Option C: Min-Floor — kleine Samples = Profile-Artifakt
          const _sampleMin = (Number(p.gp) || 0) * (Number(p.min) || 0);
          const _sampleHardFloor = _sampleMin > 0 && _sampleMin < 100;
          const _sampleSoftWarn  = _sampleMin > 0 && _sampleMin >= 100 && _sampleMin < 500;
          if (_sampleHardFloor) {
            return (
              <div className="mt-4 rounded-xl p-4" style={{background:"#0d1117", border:"1px solid #ef444455"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#6b7280",letterSpacing:1,marginBottom:6}}>
                  CLEARANCE VERDICT vs {compTier.toUpperCase()} · Insufficient Sample
                </div>
                <div style={{fontSize:13,fontWeight:600,color:"#ef4444",marginBottom:6}}>
                  Only {Math.round(_sampleMin)} minutes of college sample — verdict suppressed.
                </div>
                <div style={{fontSize:11,color:"#9ca3af",lineHeight:1.6}}>
                  Below 100 total minutes, the box-stat profile is a small-sample artifact rather than a player signal. Bol Bol (158 min, foot injury) and James Wiseman (16 min, 3-game NCAA suspension) both cleared 8+ on tiny samples and busted in the NBA — exactly because the cleared profile never reflected real college performance. Wait for more data, or rely on Mind, Comp-Engine and Skill-Curve.
                </div>
              </div>
            );
          }
          const clsMap = {"Fr":1,"Freshman":1,"So":2,"Sophomore":2,"Jr":3,"Junior":3,"Sr":4,"Senior":4};
          const clsRaw = p.cls || p.classLabel || "";
          const classNum = clsMap[clsRaw] || (p.seasons ? Math.min(4, parseInt(p.seasons)) : null);
          const className = classNum === 1 ? "Freshman" : classNum === 2 ? "Sophomore" :
                            classNum === 3 ? "Junior" : classNum === 4 ? "Senior" : null;
          // Tobias 2026-06-03: _isIntlSrc + _thresholdCohort derived from the
          // playerSourceMeta helper (single source of truth, defined at top).
          // The verdict-block UI uses these to switch threshold/cohort copy.
          const { isIntl: _isIntlSrc, thresholdCohort: _thresholdCohort } = playerSourceMeta(p);
          const VERDICTS = {
            "Replacement": [
              {min:6, label:"Plays Replacement-level box profile", color:"#22c55e", desc:"Every drafted NBA player reaches Replacement-level — this is the baseline floor, not a forecast."},
              {min:3, label:"Below Replacement-level statistical profile", color:"#fbbf24", desc:"Box profile sits below Replacement-tier medians on most dimensions."},
              {min:0, label:"Atypical for Replacement-tier", color:"#ef4444", desc:"Development-stars (Westbrook 2/10) started here too — pair with Skill-Curve and Comps."},
            ],
            "Role Player": [
              {min:8, label:"Strong Role-Player profile fit", color:"#22c55e", desc:"Historically 70–90% of college players who clear 8+ Role-Player thresholds reach Role-Player tier or higher (1.4–1.7× Base-Rate lift)."},
              {min:6, label:"Plausible Role-Player fit", color:"#22c55e", desc:"6–7/10 cleared. Historical precision 68–70%."},
              {min:4, label:"Mixed Role-Player signals", color:"#fbbf24", desc:"~46% historically reach Role-Player. Mind, Skill-Curve, Comps decide direction."},
              {min:0, label:"Atypical Role-Player profile", color:"#ef4444", desc:"Stars like Tatum (3/10) and SGA (3/10) developed past this profile."},
            ],
            "Starter": [
              {min:9, label:"Generation-level Starter profile", color:"#22c55e", desc:"9+/10 → 80% precision (2.5× Base-Rate). Only a handful per decade."},
              {min:8, label:"Strong Starter profile fit", color:"#22c55e", desc:"8/10 → 64% Precision (2× Base-Rate). Players like Zion Williamson, KAT sat here pre-draft."},
              {min:6, label:"Plausible Starter fit", color:"#fbbf24", desc:"6–7/10 → 36–50% precision. Development signal becomes tie-breaker."},
              {min:0, label:"Atypical Starter profile", color:"#ef4444", desc:"SGA / Tatum / Donovan Mitchell were here pre-draft and became Stars — NOT a hard veto."},
            ],
            "All-Star": [
              {min:9, label:"Historically unique All-Star profile", color:"#22c55e", desc:_isIntlSrc ? "9+/10 within Intl-Bridge-Cohort — extremely rare. Tracy McGrady, Sengun and Andray Blatche are the only historical cases." : "9+/10 against All-Star thresholds — in 18 years of NCAA history only 3 Freshmen with substantial sample (≥500 min) have hit this: Caleb Wilson 2026 (10/10, first ever, UNC), Cameron Boozer 2026 (9/10, Duke), Cooper Flagg 2025 (9/10, Duke). The current 2025-2026 class is historically unique — having three Freshmen at 9+/10 in adjacent years has never happened in our 18-year dataset."},
              {min:8, label:"Strong All-Star profile fit", color:"#22c55e", desc:_isIntlSrc ? "8/10 in Intl-Bridge → 23% precision = 5.5× Intl Base-Rate. Tracy McGrady, Gilbert Arenas, Andrei Kirilenko sat exactly here pre-NBA." : "8/10 → 55% overall precision = 4× Base-Rate. Joel Embiid, KAT, Ben Simmons, Blake Griffin, Kevin Love, Deandre Ayton sat exactly here pre-draft."},
              {min:6, label:"Plausible Star-Candidate signals", color:"#fbbf24", desc:_isIntlSrc ? "6–7/10 in Intl-Bridge → 0–7% precision. Most Intl-All-Stars (Doncic, Wemby) sat BELOW this profile pre-NBA because intl box-stats translate imperfectly." : "6–7/10 cleared. Curry (6/10), Harden (6/10), Kawhi (6/10), AD (7/10) developed past this profile."},
              {min:0, label:"Atypical for All-Star profile", color:"#ef4444", desc:_isIntlSrc ? "<6/10 cleared in Intl-Bridge. Doncic and Wemby sat here — intl box-stats are noisy proxies. Comp-Engine + Skill-Curve decide direction." : "Half of historical All-Stars sat here pre-draft (Tatum 3/10, SGA 3/10, Westbrook 2/10). NOT a veto — focus on Mind, Comps, Skill-Curve."},
            ],
          };
          const list = VERDICTS[compTier] || [];
          const verdict = list.find(v => inR >= v.min) || list[list.length-1];
          if (!verdict) return null;
          let classNote = null;
          if (_isIntlSrc) {
            if (inR >= 8 && compTier === "All-Star") {
              classNote = {color:"#fbbf24", icon:"i", txt:"Intl-Bridge cohort: 400 players who entered the NBA via Euroleague / ACB / BBL / FIBA youth tournaments. Thresholds are the medians of this cohort. Note: league strength varies (Euroleague = top, NBL = low) and pro-experience replaces the college-class concept — the maturity effect runs in a different direction."};
            }
          } else if (compTier === "All-Star" && inR >= 8) {
            if (classNum === 1) classNote = {color:"#22c55e", icon:"✓", txt:"Freshman 8+/10 with substantial sample (≥500 min) historically → 86% Precision (6 of 7). Embiid, KAT, Ben Simmons, Kevin Love, Deandre Ayton and Zion all cleared 8+ as Freshmen with real college minutes and became All-Stars. The single miss: Michael Beasley (Kansas St., 2,508 min) — profile-strong but Off-Court issues killed development. Bol Bol (158 min, foot injury) and James Wiseman (16 min, 3-game NCAA suspension) are excluded because their clearances came from tiny samples, not real profiles. Strongest single signal we measure for a Freshman — pair with Mind for character-risk and Skill-Curve for development."};
            else if (classNum === 2) classNote = {color:"#fbbf24", icon:"~", txt:"Sophomore 8+/10 historically → 25% Precision. Weaker than Freshman: more development time already inside college."};
            else if (classNum === 3) classNote = {color:"#ef4444", icon:"!", txt:"Junior 8+/10 historically → 0% Precision (0 of 1). Maturity advantage over younger competition — box profile reflects age, not star talent."};
            else if (classNum === 4) classNote = {color:"#ef4444", icon:"!", txt:"Senior 8+/10 historically → 0% Precision (0 of 3). Sindarius Thornwell cleared 10/10 as Senior → peakWA −2.9. Senior college dominance is a maturity edge, not an NBA star signal."};
          } else if (compTier === "Starter" && inR === 10 && classNum && classNum >= 4 && !_isIntlSrc) {
            classNote = {color:"#ef4444", icon:"!", txt:"10/10 Starter as Senior: historically 0% Precision. Old-for-Class effect — profile looks strong because of age advantage, but NBA outcomes settled at Replacement-level."};
          }
          return (
            <div className="mt-4 rounded-xl p-4" style={{background:"#0d1117", border:`1px solid ${verdict.color}55`}}>
              <div style={{fontSize:11,fontWeight:700,color:"#6b7280",letterSpacing:1,marginBottom:6}}>
                CLEARANCE VERDICT vs {compTier.toUpperCase()}
                {className && !_isIntlSrc && <span style={{color:"#9ca3af",marginLeft:8}}>· {className}</span>}
                {_isIntlSrc && <span style={{color:"#9ca3af",marginLeft:8}}>· Intl Cohort</span>}
                {_sampleMin > 0 && <span style={{color:"#6b7280",marginLeft:8}}>· {Math.round(_sampleMin)} min sample</span>}
              </div>
              {_sampleSoftWarn && (
                <div className="mb-2 rounded px-2 py-1" style={{background:"#fbbf2410", border:"1px solid #fbbf2444"}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#fbbf24"}}>⚠ Limited sample ({Math.round(_sampleMin)} min). Confidence reduced — small-sample profiles are noisy.</div>
                </div>
              )}
              <div className="flex items-baseline gap-3 mb-2">
                <span style={{fontSize:24,fontWeight:700,color:verdict.color,fontFamily:"Oswald, sans-serif"}}>
                  {inR}<span style={{fontSize:14,color:"#6b7280"}}>/{total}</span>
                </span>
                <span style={{fontSize:14,fontWeight:600,color:verdict.color}}>{verdict.label}</span>
              </div>
              <div style={{fontSize:11,color:"#9ca3af",lineHeight:1.6}}>{verdict.desc}</div>
              {classNote && (
                <div className="mt-3 pt-3" style={{borderTop:"1px solid #1f2937"}}>
                  <div style={{fontSize:11,fontWeight:600,color:classNote.color,lineHeight:1.6}}>
                    <span style={{marginRight:6}}>{classNote.icon}</span>{classNote.txt}
                  </div>
                </div>
              )}
              <div className="mt-2 text-xs" style={{color:"#4b5563"}}>
                Thresholds: {_thresholdCohort}
              </div>
            </div>
          );
        })()}
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
// 2026-05-29 — PBP-Data-Gating
// ESPN PBP for the 2025-26 NCAA season stopped updating after 12/06/2025
// (HTML format change). Features that rely on PBP (Mind-Tab, Game-by-Game
// Skill-Curve, Self-Sufficiency, Shot Creation, In-Season Trajectory) are
// hidden for the 2026 class — partial-season data would mislead. For all
// other classes the full data is in place and these features remain active.
// ═══════════════════════════════════════════════════════════
const isPBPLimited2026 = (p) => {
  const yr = p?.draftYear ?? p?.yr;
  return yr === 2026 || String(yr) === "2026";
};
function PBPNotAvailable({title, icon="📊", season="2025-26"}) {
  return (
    <Sec icon={icon} title={title} sub={`Hidden for the ${season} class — partial PBP coverage`}>
      <div style={{background:"#0d1117",border:"1px solid #1f2937",borderRadius:8,padding:"20px 22px"}}>
        <div style={{color:"#fbbf24",fontSize:12,fontWeight:700,letterSpacing:0.5,marginBottom:8}}>📊 LIMITED COVERAGE</div>
        <div style={{color:"#9ca3af",fontSize:12,lineHeight:1.7}}>
          This view draws on ESPN play-by-play data. For the {season} season, our scrape currently ends at <strong style={{color:"#cbd5e1"}}>12/06/2025</strong> — a partial-season snapshot would mislead, so we hide the view rather than render half-data. Full coverage returns once the scraper catches up.
          <br/><br/>
          For prospects in resolved classes (≤2025) this section is fully populated.
        </div>
      </div>
    </Sec>
  );
}
// Sample-size honesty: render a small inline warning above PBP charts when the
// underlying event count is too small to read confidently.
function PBPSampleWarning({n, threshold, unit="actions"}) {
  if (n == null || n >= threshold) return null;
  return (
    <div style={{background:"#fbbf2410",border:"1px solid #fbbf2444",borderRadius:6,padding:"8px 10px",marginBottom:10,fontSize:11,color:"#fbbf24"}}>
      <strong>⚠ Small sample:</strong> only {n} {unit} analysed (threshold for confident reading: {threshold}). Read direction, not magnitude.
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
  // Dunk attempts: prefer PBP-tracked count (authoritative) over frequency-based estimate.
  // Fixes the 39-vs-42 mismatch between the Court viz (freq × totalFga) and the Shot Creation panel (raw PBP).
  const dunkAttAuthoritative = (p.shotCreation?.dunk?.fga != null && p.shotCreation.dunk.fga > 0) ? p.shotCreation.dunk.fga : dunkAtt;

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
  // Tobias 2026-05-09: Bug fix — for intl-like players (no raw FGA), totalShots
  // contained ONLY FTA, so 2PA/3PA estimates were divided by FTA-only base
  // → values >100%. Now we always rebuild estTotalShots from the actual
  // 2PA + 3PA + FTA components when ANY of them is missing from the FGA-side.
  const fgaSideShots = (totalFga || 0);
  const componentShots = (twoPA || 0) + (threePA || 0) + (dietFta || 0);
  const estTotalShots = (fgaSideShots > 0 && totalShots >= componentShots * 0.9)
    ? totalShots
    : Math.max(componentShots, totalShots);
  const rimPctOfTotal = estTotalShots > 0 && rimAtt != null ? Math.round(rimAtt / estTotalShots * 1000) / 10 : null;
  const dunkPctOfTotal = estTotalShots > 0 && dunkAttAuthoritative != null ? Math.round(dunkAttAuthoritative / estTotalShots * 1000) / 10 : null;
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
  // 2026-05-29 Tobias: Diss-Methodik M1 (Berger 2022, Kap. 7) — der M1-Output kommt
  // jetzt aus dem Pipeline (shooting.m1.projNba3pPctM1) statt aus der hand-getunten
  // Inline-Formel. Stage-1 = Empirical Bayes auf 3PA (α₀=23.89, β₀=44.67 aus NCAA-
  // Liga-Verteilung); Stage-2 = Beta-Regression mit empirisch gefitteten
  // Koeffizienten (NCAA n=675 RMSE=0.0380; Intl n=392 RMSE=0.0367, kein 2PJ%).
  // Legacy-Fallback: alte Bayesian-Variante wenn M1 fehlt (vor-2026-Daten).
  const m1 = p.shooting?.m1 || null;
  const m1Pool = m1?.pool || null;
  const preDraft3pEstimate = m1?.preDraft3pEstimate != null
    ? m1.preDraft3pEstimate * 100 : null;
  // 2026-05-29 Tobias: M4 jetzt auf 3PAr (rollenunabhängig) statt 3PA/G.
  // 3PAr = % der eigenen FGA von draußen → unabhängig von Possessions/Minuten/Rolle.
  const projNba3parM4 = m1?.projNba3parM4 ?? null;
  const hasMidData = midPct != null;
  const midForPrior = midPct ?? (twoPct ? twoPct * 0.6 : null);
  // touchPrior = Diss-Stage-1 (EB 3P-Estimate). Fällt sonst auf alte FT/Mid-Linear-Combo zurück.
  const touchPrior = preDraft3pEstimate ?? p.projPrior ?? (hasMidData
    ? ((0.20 + 0.18 * (ft ?? 75) / 100 + 0.05 * (midForPrior) / 100) * 100)
    : ((0.22 + 0.22 * (ft ?? 75) / 100) * 100));
  // Touch Prior Percentile — Range 28-44% (Liga-Verteilung).
  const touchPriorPctl = touchPrior != null
    ? Math.round(Math.max(0, Math.min(100, ((touchPrior - 28) / 16) * 100)))
    : null;
  // projNba3p = Diss-Stage-2 M1-Output. Fallback auf alte Bayesian-Posterior wenn M1 fehlt.
  const projNba3p = m1?.projNba3pPctM1 ?? p.projNba3p ?? (() => {
    if (ft == null) return null;
    const mu0 = hasMidData
      ? 0.20 + 0.18 * (ft / 100) + 0.05 * (midForPrior / 100)
      : 0.22 + 0.22 * (ft / 100);
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
  // 2026-05-29 Tobias: M4 jetzt rollenunabhängig — proj_nba_3par_m4 ist direkt 3PAr in %.
  // Fallback auf heuristische Berechnung wenn M4 fehlt.
  const proj3PAr = projNba3parM4 ?? (threeF != null ? Math.min(55, Math.round(threeF * 0.85 + (ft > 80 ? 3 : 0) + 5)) : null);
  // 3PA/G ist rollen-abhängig (Possessions × 3PAr) → nur als Indikator wenn wir
  // einen Tier-spezifischen FGA-Wert kennen. Bleibt im UI als heuristische Schätzung.
  const projNba3pa = proj3PAr != null ? Math.round(projFGA * proj3PAr / 100 * 10) / 10 : null;

  const sc = (pct, type) => {
    if (pct == null) return "#6b7280";
    if (type==="3pt") return pct>38?"#22c55e":pct>34?"#86efac":pct>30?"#fbbf24":"#ef4444";
    if (type==="ft")  return pct>80?"#22c55e":pct>72?"#86efac":pct>65?"#fbbf24":"#ef4444";
    if (type==="ts")  return pct>60?"#22c55e":pct>55?"#86efac":pct>50?"#fbbf24":"#ef4444";  // Tobias 2026-05-06: TS% eigene Schwellen
    if (type==="mid"||type==="2pt") return pct>50?"#22c55e":pct>45?"#86efac":pct>40?"#fbbf24":"#ef4444";
    if (type==="rim") return pct>65?"#22c55e":pct>58?"#86efac":pct>50?"#fbbf24":"#ef4444";
    return "#e5e7eb";
  };

  // ═══ DIET BAR COMPONENT — Tobias 2026-05-06 cleanup ═══
  // FG%-Anzeige je Zone entfernt (Court zeigt das schon), Inline-% aus Bar entfernt.
  // Bleibt: Label links + "X% of shots" rechts. Bar visualisiert die Distribution.
  const DietBar = ({label, color, pctOfTotal, children}) => (
    pctOfTotal != null && pctOfTotal > 0 ? (
      <div>
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-sm font-semibold" style={{color}}>{label} {children||""}</span>
          <span className="text-sm font-bold" style={{color:"#e5e7eb"}}>{fmt(pctOfTotal,1)}% of shots</span>
        </div>
        <div className="h-10 rounded-lg overflow-hidden w-full" style={{background:"#1f2937"}}>
          <div className="h-full rounded-lg" style={{width:`${Math.max(3,pctOfTotal)}%`,background:`linear-gradient(90deg,${color}44,${color}cc)`}}/>
        </div>
      </div>
    ) : null
  );

  return (
    <div className="space-y-5">
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
                {/* TS% — rechte untere Ecke, Gesamteffizienz */}
                <g opacity={ts!=null?1:0.3}>
                  <text x="490" y="355" textAnchor="middle" fill="#a78bfa" style={{fontSize:13,fontWeight:"bold"}}>TS%</text>
                  <text x="490" y="385" textAnchor="middle" fill={sc(ts,"ts")} style={{fontSize:24,fontWeight:"bold"}}>{ts!=null?`${fmt(ts)}%`:"—"}</text>
                  <text x="490" y="403" textAnchor="middle" fill="#6b7280" style={{fontSize:10}}>overall</text>
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
                  {dunkAttAuthoritative!=null&&<text x="415" y="86" textAnchor="middle" fill="#9ca3af" style={{fontSize:11}}>{dunkAttAuthoritative} att.</text>}
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
                  {ftaPerGame!=null&&<text x="290" y="274" textAnchor="middle" fill="#9ca3af" style={{fontSize:11}}>{fmt(ftaPerGame,1)} FTA/G {totalFta!=null?`(${totalFta} total)`:""}</text>}
                  {ftaPerGame==null&&<text x="290" y="274" textAnchor="middle" fill="#6b7280" style={{fontSize:11}}>FTR: {ftr!=null?fmt(ftr):"—"}</text>}
                </g>
                {/* 3-POINT */}
                <g opacity={tp!=null?1:0.3}>
                  <text x="290" y="355" textAnchor="middle" fill="#3b82f6" style={{fontSize:16,fontWeight:"bold"}}>3-POINT</text>
                  <text x="290" y="387" textAnchor="middle" fill={sc(tp,"3pt")} style={{fontSize:30,fontWeight:"bold"}}>{tp!=null?`${fmt(tp)}%`:"—"}</text>
                  {threeAtt!=null&&<text x="290" y="407" textAnchor="middle" fill="#9ca3af" style={{fontSize:12}}>{zoneMade(threeF,tp)||"?"}-{threeAtt} 3PA</text>}
                </g>
                {/* TS% — rechte untere Ecke, Gesamteffizienz neben 3PT (Tobias 2026-05-06) */}
                <g opacity={ts!=null?1:0.3}>
                  <text x="490" y="355" textAnchor="middle" fill="#a78bfa" style={{fontSize:13,fontWeight:"bold"}}>TS%</text>
                  <text x="490" y="385" textAnchor="middle" fill={sc(ts,"ts")} style={{fontSize:24,fontWeight:"bold"}}>{ts!=null?`${fmt(ts)}%`:"—"}</text>
                  <text x="490" y="403" textAnchor="middle" fill="#6b7280" style={{fontSize:10}}>overall</text>
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
                          <span className="text-sm font-bold" style={{color:"#e5e7eb"}}>{fmt(rimPctOfTotal,1)}% of shots</span>
                        </div>
                        <div className="h-10 rounded-lg overflow-hidden relative w-full" style={{background:"#1f2937"}}>
                          <div className="absolute top-0 bottom-0 rounded-l-lg" style={{left:0,width:`${rimPctOfTotal}%`,background:"linear-gradient(90deg,#f9731644,#f97316cc)"}}/>
                          {dunkPctOfTotal!=null&&<div className="absolute top-0 bottom-0 rounded-l-lg" style={{left:0,width:`${dunkPctOfTotal}%`,background:"linear-gradient(90deg,#ef444488,#ef4444cc)"}}/>}
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
      </Sec>
      {/* Tobias 2026-06-03 v3-jsx: ShootingTab layout (Shot Chart top, plain-English Three-Layer) */}
      {p.shooting && (
        <Sec icon="🎯" title="NBA 3P Projection — Three Layers" sub="A three-layer model. Each layer answers a separate question. Validation reports typical miss (how far the model is usually off) and fit strength r (1.0 = perfect prediction, 0 = random guess). Ranges below are realistic spreads built from that typical miss.">

          {/* Layer 1 — SKILL */}
          <div className="rounded-xl p-4 mb-3" style={{background:"#0a0e14", border:"1px solid #22c55e33"}}>
            <div className="flex items-start justify-between mb-2 gap-2">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest" style={{color:"#22c55e"}}>Layer 1 · Skill</div>
                <div className="text-xs mt-1" style={{color:"#6b7280"}}>How well does he shoot the three? (projected NBA 3P%)</div>
              </div>
              {p.shooting.touchTier && (
                <span className="px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap" style={{
                  background: (p.shooting.touchTier === "Elite" || p.shooting.touchTier === "Strong") ? "#22c55e22" : p.shooting.touchTier === "Average" ? "#fbbf2422" : "#ef444422",
                  color: (p.shooting.touchTier === "Elite" || p.shooting.touchTier === "Strong") ? "#22c55e" : p.shooting.touchTier === "Average" ? "#fbbf24" : "#ef4444"
                }}>TOUCH: {p.shooting.touchTier.toUpperCase()}</span>
              )}
            </div>
            <div className="flex items-baseline gap-3 mb-3">
              <span style={{fontSize:36, fontWeight:700, color:"#22c55e", fontFamily:"Oswald, sans-serif"}}>{p.shooting.skill?.p50?.toFixed(1) ?? "—"}%</span>
              {p.shooting.skill?.lo != null && p.shooting.skill?.hi != null && (
                <span style={{fontSize:13, color:"#9ca3af"}}>realistically {p.shooting.skill.lo.toFixed(1)} – {p.shooting.skill.hi.toFixed(1)}%</span>
              )}
            </div>

            {/* Tobias 2026-06-03 v5: Strahl-Viz + Intl-Caveat */}
            {p.shooting.skill?.p50 != null && (() => {
              const p50 = p.shooting.skill.p50;
              const lo = p.shooting.skill.lo ?? p50 - 2.7;
              const hi = p.shooting.skill.hi ?? p50 + 2.7;
              const NBA_MIN = 28, NBA_MAX = 42, NBA_MED = 34.8;
              const clamp = (x) => Math.max(0, Math.min(100, x));
              const pos = clamp((p50 - NBA_MIN) / (NBA_MAX - NBA_MIN) * 100);
              const posLo = clamp((lo - NBA_MIN) / (NBA_MAX - NBA_MIN) * 100);
              const posHi = clamp((hi - NBA_MIN) / (NBA_MAX - NBA_MIN) * 100);
              const posMed = clamp((NBA_MED - NBA_MIN) / (NBA_MAX - NBA_MIN) * 100);
              const delta = (p50 - NBA_MED).toFixed(1);
              const deltaPos = p50 >= NBA_MED;
              const deltaColor = deltaPos ? "#22c55e" : "#ef4444";
              return (
                <div className="mb-3 mt-2">
                  <div className="text-xs mb-1" style={{color:"#6b7280"}}>
                    Position on NBA-shooter range ·
                    <span style={{color:deltaColor, marginLeft:6, fontWeight:600}}>
                      {deltaPos ? "+" : ""}{delta} pp vs NBA median (34.8%)
                    </span>
                  </div>
                  <div className="relative h-6 rounded-full overflow-hidden" style={{
                    background:"linear-gradient(90deg, #ef444433 0%, #fbbf2433 35%, #22c55e33 70%, #22c55e55 100%)"
                  }}>
                    <div className="absolute top-0 bottom-0" style={{
                      left: `${posLo}%`,
                      width: `${Math.max(1, posHi - posLo)}%`,
                      background:"#22c55e44",
                      borderLeft:"1px dashed #22c55e88",
                      borderRight:"1px dashed #22c55e88"
                    }}></div>
                    <div className="absolute top-0 bottom-0" style={{
                      left: `${posMed}%`, width:1, background:"#ffffff66"
                    }}></div>
                    <div className="absolute" style={{
                      left: `${pos}%`, top:-2, bottom:-2,
                      width:3, marginLeft:-1.5,
                      background:"#22c55e", boxShadow:"0 0 6px #22c55e"
                    }}></div>
                  </div>
                  <div className="flex justify-between text-xs mt-1" style={{color:"#6b7280"}}>
                    <span>28% (poor)</span>
                    <span>34.8% NBA median</span>
                    <span>42% (elite)</span>
                  </div>
                </div>
              );
            })()}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs leading-relaxed" style={{color:"#9ca3af"}}>
              <div><span style={{color:"#6b7280"}}>Model: </span>Beta-regression on the NBA 3P% (a model that treats percentages cleanly).</div>
              <div><span style={{color:"#6b7280"}}>Inputs: </span>College 3P% (regressed toward league mean for small samples), FT% (touch prior), College 3PAr.</div>
              <div><span style={{color:"#6b7280"}}>How accurate: </span>Typical miss ±2.85 pp on 731 NBA shooters — when the model says 35%, reality is usually 32–38%.</div>
              <div><span style={{color:"#6b7280"}}>Fit strength: </span>r = 0.27 (0 = random, 1.0 = perfect). Modest, because college shooting noise translates imperfectly.</div>
              {p.shooting.ftPct != null && (
                <div className="md:col-span-2 pt-1"><span style={{color:"#6b7280"}}>This player: </span>FT {(p.shooting.ftPct*100).toFixed(1)}% · {Math.round(p.shooting.nNcaa3pa || 0)} college 3PA · {p.shooting.pool || "ncaa"}</div>
              )}
            </div>
            <div className="text-xs mt-3 pt-3 leading-snug" style={{color:"#6b7280", borderTop:"1px solid #1f2937"}}>
              <strong style={{color:"#9ca3af"}}>Touch Tier</strong> reads the FT% signal: Elite (≥ 86%) → 80% of those players hit NBA 3P% ≥ 35%. Strong (78–86%) → 59%. Average (72–78%) → 46%. Weak (&lt; 72%) → 33%.
            </div>

            {/* Tobias 2026-06-03 v5: Intl-Caveat */}
            {p.source && p.source !== "ncaa" && (
              <div className="text-xs mt-2 px-2 py-1 rounded" style={{color:"#fbbf24", background:"#fbbf2411", border:"1px solid #fbbf2433"}}>
                <strong>Intl note:</strong> pro-league shooting stats translate weaker to NBA than NCAA stats (validation r = 0.07 vs 0.38 NCAA). Treat this projection as an indicator, not a precise estimate.
              </div>
            )}
          </div>

          {/* Layer 2 — INTENT */}
          <div className="rounded-xl p-4 mb-3" style={{background:"#0a0e14", border:"1px solid #fbbf2433"}}>
            <div className="flex items-start justify-between mb-2 gap-2">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest" style={{color:"#fbbf24"}}>Layer 2 · Intent</div>
                <div className="text-xs mt-1" style={{color:"#6b7280"}}>How often will he take the three? (NBA 3PAr — share of his shots from beyond the arc)</div>
              </div>
              {p.shooting.intent?.tier && (
                <span className="px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap" style={{
                  background: p.shooting.intent.tier === "High" ? "#22c55e22" : p.shooting.intent.tier === "Moderate" ? "#fbbf2422" : "#ef444422",
                  color: p.shooting.intent.tier === "High" ? "#22c55e" : p.shooting.intent.tier === "Moderate" ? "#fbbf24" : "#ef4444"
                }}>INTENT: {p.shooting.intent.tier.toUpperCase()}</span>
              )}
            </div>
            <div className="flex items-baseline gap-3 mb-3">
              <span style={{fontSize:36, fontWeight:700, color:"#fbbf24", fontFamily:"Oswald, sans-serif"}}>{p.shooting.intent?.p50?.toFixed(0) ?? "—"}%</span>
              {p.shooting.intent?.lo != null && p.shooting.intent?.hi != null && (
                <span style={{fontSize:13, color:"#9ca3af"}}>realistically {p.shooting.intent.lo.toFixed(0)} – {p.shooting.intent.hi.toFixed(0)}%</span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs leading-relaxed" style={{color:"#9ca3af"}}>
              <div><span style={{color:"#6b7280"}}>Model: </span>Beta-regression on the NBA 3PAr.</div>
              <div><span style={{color:"#6b7280"}}>Inputs: </span>College 3PAr + FT% + the Skill estimate from Layer 1.</div>
              <div><span style={{color:"#6b7280"}}>How accurate: </span>Typical miss ±9.7 pp — when the model says 40%, reality is usually 30–50%.</div>
              <div><span style={{color:"#6b7280"}}>Fit strength: </span>r = 0.73 — strong (closer to 1.0 = closer to a perfect prediction).</div>
              <div className="md:col-span-2 pt-1"><span style={{color:"#6b7280"}}>Why separate from Skill: </span>great shooters can take few threes (Joel Embiid). Average shooters can take many (Joe Ingles). The two signals diverge in NBA roles.</div>
            </div>
            <div className="text-xs mt-3 pt-3 leading-snug" style={{color:"#6b7280", borderTop:"1px solid #1f2937"}}>
              <strong style={{color:"#9ca3af"}}>Intent Tier:</strong> High (≥ 50%) → volume shooter, efficiency is the real question. Moderate (35–50%) → standard wing distribution. Low (&lt; 35%) → rarely shoots from 3, a role player who hits open looks.
            </div>
          </div>

          {/* Layer 3 — VOLUME */}
          <div className="rounded-xl p-4" style={{background:"#0a0e14", border:"1px solid #f9731633"}}>
            <div className="mb-3">
              <div className="text-xs font-bold uppercase tracking-widest" style={{color:"#f97316"}}>Layer 3 · Volume</div>
              <div className="text-xs mt-1" style={{color:"#6b7280"}}>How many 3PA per game? Volume is a role function, not a talent function — so we show it CONDITIONAL on which tier he reaches.</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              {[
                {key:"allStar",     label:"If All-Star",     color:"#22c55e"},
                {key:"starter",     label:"If Starter",      color:"#22c55e"},
                {key:"rolePlayer",  label:"If Role",         color:"#fbbf24"},
                {key:"replacement", label:"If Replacement",  color:"#9ca3af"}
              ].map(t => (
                <div key={t.key} className="rounded p-3" style={{background:"#111827"}}>
                  <div className="text-xs uppercase tracking-wider" style={{color:t.color}}>{t.label}</div>
                  <div className="text-2xl font-bold mt-1" style={{color:"#e5e7eb", fontFamily:"Oswald, sans-serif"}}>{p.shooting.volume?.[t.key] != null ? p.shooting.volume[t.key].toFixed(1) : "—"}</div>
                  <div className="text-xs" style={{color:"#6b7280"}}>3PA / game</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs leading-relaxed" style={{color:"#9ca3af"}}>
              <div><span style={{color:"#6b7280"}}>Why no single number: </span>college 3PA/g basically does NOT predict NBA 3PA/g (fit strength r = 0.005 — essentially random).</div>
              <div><span style={{color:"#6b7280"}}>How we get the numbers: </span>3PA = 3PAr (Layer 2) × FGA per game. FGA per game depends on Tier × Position.</div>
              <div><span style={{color:"#6b7280"}}>FGA source: </span>empirical median per Tier × Position, drawn from 369 NBA players with ≥ 5,000 career minutes (2008–2026).</div>
              <div><span style={{color:"#6b7280"}}>How to read: </span>each card is the implied volume IF he reaches that tier — not a prediction of which tier (see Projection tab).</div>
            </div>
          </div>
        </Sec>
      )}

      {/* Tobias 2026-06-03 v5: missing-shooting fallback */}
      {!p.shooting && (
        <Sec icon="🎯" title="NBA 3P Projection" sub="No shooting projection available for this player.">
          <div className="rounded-lg p-4" style={{background:"#0a0e14", border:"1px solid #1f2937"}}>
            <div className="text-sm" style={{color:"#9ca3af"}}>
              We don't have a shooting projection for this player. This usually means college 3-pt sample size was too small (typically &lt; 20 attempts) or the player profile is from a cohort our shooting model doesn't cover well.
            </div>
            <div className="text-xs mt-2" style={{color:"#6b7280"}}>
              The base projection model needs enough 3-pt attempts to estimate shooting skill above noise. For pre-2008 NCAA seasons and some older intl prospects, the data quality wasn't sufficient.
            </div>
          </div>
        </Sec>
      )}

      {/* Tobias 2026-06-02: 3-Layer Shooting Projection explainer (Skill / Intent / Volume). */}
      <div className="rounded-2xl p-5 mb-4" style={{background:"linear-gradient(135deg,#0d1117,#111827)", border:"1px solid #1f2937"}}>
        <h3 className="text-base font-bold text-gray-100 mb-2">How 3P Projection Works — Three Layers</h3>
        <p className="text-xs text-gray-400 mb-4">A 3-point projection mixes three different questions. We split them out so each can be read on its own.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg p-3" style={{background:"#0a0e14", border:"1px solid #22c55e44"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#22c55e",letterSpacing:1,marginBottom:4}}>LAYER 1 — SKILL</div>
            <div style={{fontSize:13,fontWeight:600,color:"#e5e7eb",marginBottom:6}}>How well does he shoot? <span style={{color:"#22c55e"}}>(NBA 3P%)</span></div>
            <p style={{fontSize:11,color:"#9ca3af",lineHeight:1.6}}>
              <strong>Inputs:</strong> College 3P% (Bayesian-shrunken toward the 34.8% league mean), FT% (touch — our single strongest predictor), mid-range FG%.
            </p>
            <p style={{fontSize:11,color:"#9ca3af",lineHeight:1.6,marginTop:4}}>
              <strong>Output:</strong> Point estimate with a confidence range. <em>e.g. "35.5% — realistically 33–38%"</em>.
            </p>
            <p style={{fontSize:10,color:"#6b7280",marginTop:4,fontStyle:"italic"}}>Validation: MAE 2.5 pp on 506 NBA shooters. Pearson r = 0.40.</p>
          </div>

          <div className="rounded-lg p-3" style={{background:"#0a0e14", border:"1px solid #fbbf2444"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#fbbf24",letterSpacing:1,marginBottom:4}}>LAYER 2 — INTENT</div>
            <div style={{fontSize:13,fontWeight:600,color:"#e5e7eb",marginBottom:6}}>How often does he take the three? <span style={{color:"#fbbf24"}}>(NBA 3PAr)</span></div>
            <p style={{fontSize:11,color:"#9ca3af",lineHeight:1.6}}>
              <strong>Inputs:</strong> College 3PAr (share of his college shots from three), touch (FT%), the Layer-1 skill estimate.
            </p>
            <p style={{fontSize:11,color:"#9ca3af",lineHeight:1.6,marginTop:4}}>
              <strong>Why separate:</strong> A great shooter can take few threes (Joel Embiid). An average shooter can take many (Joe Ingles). Skill ≠ Intent.
            </p>
            <p style={{fontSize:10,color:"#6b7280",marginTop:4,fontStyle:"italic"}}>Validation: MAE 9.7 pp. Pearson r = 0.73.</p>
          </div>

          <div className="rounded-lg p-3" style={{background:"#0a0e14", border:"1px solid #f9731644"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#f97316",letterSpacing:1,marginBottom:4}}>LAYER 3 — VOLUME</div>
            <div style={{fontSize:13,fontWeight:600,color:"#e5e7eb",marginBottom:6}}>How many threes per game? <span style={{color:"#f97316"}}>(NBA 3PA / G)</span></div>
            <p style={{fontSize:11,color:"#9ca3af",lineHeight:1.6}}>
              <strong>Not directly predictable from college</strong> — college 3PA-per-game has near-zero correlation with NBA 3PA-per-game (r = 0.005). Volume is a function of role, not talent.
            </p>
            <p style={{fontSize:11,color:"#9ca3af",lineHeight:1.6,marginTop:4}}>
              <strong>How we get there:</strong> 3PA = 3PAr × FGA. FGA depends on Tier × Position. We show conditional ranges: <em>"If Starter: 5 attempts. If All-Star: 6."</em>
            </p>
            <p style={{fontSize:10,color:"#6b7280",marginTop:4,fontStyle:"italic"}}>Empirical NBA FGA-per-36 per Tier × Position table.</p>
          </div>
        </div>

        <div className="mt-4 rounded-lg p-3" style={{background:"#0a0e14", border:"1px solid #1f2937"}}>
          <div style={{fontSize:11,color:"#9ca3af",lineHeight:1.7}}>
            <strong style={{color:"#e5e7eb"}}>Why this matters.</strong> If a player has high touch (FT% 84%) but moderate intent (33% of shots are 3s), he&apos;s a <em>willing-but-not-eager</em> shooter — like Cooper Flagg. A player with weak touch but high intent — many bad-form shooters — is a <em>red flag</em>. We surface both axes so you can read which one is strong and which is weak.
          </div>
          <div className="mt-2" style={{fontSize:11,color:"#9ca3af",lineHeight:1.7}}>
            <strong style={{color:"#e5e7eb"}}>Each layer can be wrong independently.</strong> Skill mis-fires on small samples (Caleb Wilson: 27 college 3PA). Intent shifts with coach and role (Joe Harris was projected at 35% intent and coached into 45%). Volume hinges on the tier projection itself, which has its own error bars. So we show <strong>ranges, not single numbers</strong>.
          </div>
        </div>
      </div>

      

      {useSimplifiedCourt && (
        <div className="p-3 rounded-lg text-sm" style={{background:"#1e3a5f33",border:"1px solid #3b82f644",color:"#93c5fd"}}>
          {isIntl ? "International prospect" : "Pre-2010 NCAA"} — shot-type tracking (rim/mid/dunk) not available. Showing 2P/3P/FT split.
        </div>
      )}

      

      {/* ═══ SHOT CREATION SPECTRUM ═══ */}
      {p.shotCreation && p.shotCreation.overall && p.shotCreation.overall.fga >= 30 && (() => {
        const scd = p.shotCreation;
        const zones = ["rim","mid","three"].filter(z => scd[z] && scd[z].fga >= 10);
        if (zones.length === 0) return null;
        const zoneLabel = {rim:"At Rim", mid:"Mid-Range", three:"3-Point"};
        const zoneColor = {rim:"#f97316", mid:"#fbbf24", three:"#3b82f6"};
        const zoneBg    = {rim:"#f9731622", mid:"#fbbf2422", three:"#3b82f622"};
        const selfColor = (v) => v > 70 ? "#22c55e" : v > 50 ? "#86efac" : v > 30 ? "#fbbf24" : "#94a3b8";
        // Compute self-created shot distribution (where does this player create from?)
        const selfMakesByZone = {};
        let totalSelfMakes = 0;
        zones.forEach(z => {
          const d = scd[z];
          const makes = Math.round(d.fga * (d.pct||0) / 100);
          const selfMakes = Math.round(makes * (d.selfPct||0) / 100);
          selfMakesByZone[z] = selfMakes;
          totalSelfMakes += selfMakes;
        });
        /* Tobias 2026-06-03 v6: SC reactivated for 2026 — season complete */
        // SC was previously hidden for 2026 due to partial-season PBP scrape.
        // As of 2026-06-03 the 2025-26 NCAA season is complete in the source data;
        // PBPSampleWarning still guards low-sample players (<100 FGA threshold).
        return (
          <Sec icon="🎯" title="Shot Creation Spectrum" sub={`PBP-based creation profile — ${scd.overall.fga} FGA tracked · ${fmt(scd.overall.selfPct||0)}% overall self-created`}>
            {/* Sample-size honesty (Tobias 2026-05-30) */}
            <PBPSampleWarning n={scd.overall.fga} threshold={100} unit="FGA"/>
            <div className="space-y-3">
              {/* Zone bars: each zone shows FGA, FG%, self-creation rate */}
              {zones.map(z => {
                const d = scd[z];
                const selfPct = d.selfPct ?? 0;
                const astPct = 100 - selfPct;
                const selfShare = totalSelfMakes > 0 ? Math.round(selfMakesByZone[z] / totalSelfMakes * 100) : 0;
                return (
                  <div key={z}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider" style={{color:zoneColor[z]}}>{zoneLabel[z]}</span>
                        <span className="text-xs" style={{color:"#6b7280"}}>{d.fga} FGA · {fmt(d.pct)}% FG</span>
                      </div>
                      <Tip content={<div>
                        <div className="font-bold mb-1" style={{color:zoneColor[z]}}>{zoneLabel[z]} Creation</div>
                        <div>{fmt(selfPct)}% of makes at {zoneLabel[z].toLowerCase()} were self-created (unassisted).</div>
                        <div className="mt-1">{selfShare > 0 && <>This zone accounts for {selfShare}% of all self-created makes.</>}</div>
                        <div className="mt-1 text-xs" style={{color:"#94a3b8"}}>Based on {d.fga} field goal attempts from play-by-play data.</div>
                      </div>}>
                        <span className="text-xs font-bold cursor-help" style={{color:selfColor(selfPct)}}>{fmt(selfPct)}% self</span>
                      </Tip>
                    </div>
                    {/* Stacked bar: self-created (solid) vs assisted (lighter) */}
                    <div className="h-6 rounded-md overflow-hidden flex" style={{background:"#1f2937"}}>
                      <div className="h-full flex items-center justify-center text-xs font-bold" style={{
                        width: `${selfPct}%`,
                        background: zoneColor[z],
                        color: "#fff",
                        minWidth: selfPct > 8 ? "auto" : "0",
                      }}>
                        {selfPct > 15 && `${fmt(selfPct,0)}%`}
                      </div>
                      <div className="h-full flex items-center justify-center text-xs" style={{
                        width: `${astPct}%`,
                        background: zoneBg[z],
                        color: zoneColor[z],
                        minWidth: astPct > 8 ? "auto" : "0",
                      }}>
                        {astPct > 15 && `${fmt(astPct,0)}%`}
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Legend */}
              <div className="flex items-center gap-4 text-xs pt-1" style={{color:"#6b7280"}}>
                <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{background:"#f97316",verticalAlign:"middle"}}/> Self-Created</span>
                <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{background:"#f9731633",verticalAlign:"middle"}}/> Assisted</span>
                {scd.dunk && <span style={{color:"#475569"}}>Dunks: {scd.dunk.fga} FGA ({fmt(scd.dunk.selfPct||0)}% self)</span>}
              </div>
              {/* Self-creation distribution + Verdict (Tobias 2026-05-06) */}
              {totalSelfMakes > 5 && (() => {
                // Total makes = sum of (fga × pct) over tracked zones
                let totalMakes = 0;
                zones.forEach(z => {
                  const d = scd[z];
                  totalMakes += Math.round(d.fga * (d.pct||0) / 100);
                });
                const overallSelfPct = scd.overall?.selfPct ?? (totalMakes > 0 ? totalSelfMakes / totalMakes * 100 : 0);
                // Verdict-Logik (basierend auf overallSelfPct)
                const verdictTier = overallSelfPct > 65 ? "Elite Creator"
                                  : overallSelfPct > 50 ? "Good Creator"
                                  : overallSelfPct > 35 ? "Average Creator"
                                  : "Assisted Scorer";
                const verdictColor = overallSelfPct > 65 ? "#22c55e"
                                   : overallSelfPct > 50 ? "#86efac"
                                   : overallSelfPct > 35 ? "#fbbf24"
                                   : "#94a3b8";
                const verdictDesc = overallSelfPct > 65
                  ? "Generates a clear majority of his own shots — primary or secondary on-ball role at the next level."
                  : overallSelfPct > 50
                  ? "Mixed creator with above-average self-creation share. Capable of running secondary actions."
                  : overallSelfPct > 35
                  ? "Balanced creator/finisher. Creates some, but benefits from teammates setting him up."
                  : "Predominantly assisted scorer — relies on teammates' creation to score efficiently.";
                return (
                  <div className="mt-3 py-4 px-3 rounded-lg" style={{background:"#0d1117",border:"1px solid #1e293b"}}>
                    <div className="text-sm mb-3 px-1 font-bold" style={{color:"#e5e7eb"}}>Self-Created Shot Distribution</div>
                    {/* Distribution-Bar */}
                    <div className="flex gap-0.5 rounded-lg overflow-hidden w-full" style={{height:40}}>
                      {zones.map(z => {
                        const share = totalSelfMakes > 0 ? selfMakesByZone[z] / totalSelfMakes * 100 : 0;
                        return share > 0 ? (
                          <div key={z} className="h-full" style={{flex:`${share} 1 0`, minWidth: share >= 3 ? 0 : "auto"}}>
                            <Tip content={<div>{fmt(share,0)}% of self-created makes are {zoneLabel[z].toLowerCase()}</div>} block>
                              <div className="h-full flex items-center justify-center text-sm font-bold cursor-help w-full" style={{
                                background: zoneColor[z],
                                color: "#fff",
                              }}>
                                {share > 6 && `${fmt(share,0)}%`}
                              </div>
                            </Tip>
                          </div>
                        ) : null;
                      })}
                    </div>
                    <div className="flex gap-4 mt-2 px-1 text-xs" style={{color:"#9ca3af"}}>
                      {zones.map(z => {
                        const share = totalSelfMakes > 0 ? Math.round(selfMakesByZone[z] / totalSelfMakes * 100) : 0;
                        return share > 0 ? (
                          <span key={z}><span style={{color:zoneColor[z],fontWeight:600}}>{zoneLabel[z]}</span>: {share}%</span>
                        ) : null;
                      })}
                    </div>
                    {/* Verdict-Block — Abschlussurteil */}
                    <div className="mt-4 pt-4 border-t" style={{borderColor:"#1e293b"}}>
                      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-2">
                        <span className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Self-Creation Verdict</span>
                        <span className="text-xl font-bold" style={{color:verdictColor,fontFamily:"'Oswald',sans-serif"}}>{verdictTier}</span>
                        <span className="text-sm" style={{color:"#9ca3af"}}>·</span>
                        <span className="text-sm" style={{color:"#e5e7eb"}}>
                          <strong style={{color:verdictColor}}>{totalSelfMakes}</strong> of <strong>{totalMakes}</strong> makes self-created
                          <span style={{color:"#6b7280"}}> ({fmt(overallSelfPct,1)}%)</span>
                        </span>
                        {creationPctl != null && (
                          <Tip content={<div>Percentile within same-year cohort. Higher = more shots created off the dribble than peers.</div>}>
                            <span className="text-sm cursor-help" style={{color:"#9ca3af"}}>·
                              <span style={{color:"#cbd5e1"}}> Pctl: <strong style={{color:verdictColor}}>{Math.round(creationPctl)}</strong></span>
                            </span>
                          </Tip>
                        )}
                      </div>
                      <div className="text-xs leading-relaxed" style={{color:"#9ca3af"}}>{verdictDesc}</div>
                    </div>

                    {/* Tobias 2026-06-03 v8: Compact cluster pill (full theory in Research tab) */}
                    {(() => {
                      if (!p.pos) return null;
                      const atrM = Math.round((scd.rim?.fga ?? 0) * ((scd.rim?.pct ?? 0)/100) * ((scd.rim?.selfPct ?? 0)/100));
                      const midM = Math.round((scd.mid?.fga ?? 0) * ((scd.mid?.pct ?? 0)/100) * ((scd.mid?.selfPct ?? 0)/100));
                      const tpM  = Math.round((scd.three?.fga ?? 0) * ((scd.three?.pct ?? 0)/100) * ((scd.three?.selfPct ?? 0)/100));
                      let cluster, starterPct, comp;
                      if (p.pos === "Wing") {
                        const aHi = atrM > 50, tHi = tpM > 6;
                        if (aHi && tHi)       { cluster = "Volume-Trap"; starterPct = 15.1; comp = "Jaden Ivey / Tony Wroten"; }
                        else if (aHi)          { cluster = "Rim-Workhorse"; starterPct = 34.8; comp = "SGA / Kawhi / Brunson (college)"; }
                        else if (tHi)          { cluster = "Pullup-3 Volume"; starterPct = 15.8; comp = "Carsen Edwards / Austin Rivers"; }
                        else                    { cluster = "Role-Floor"; starterPct = 18.7; comp = "Trey Murphy / Duncan Robinson"; }
                      } else if (p.pos === "Big") {
                        const aHi = atrM > 70, mHi = midM > 20;
                        if (aHi && mHi)       { cluster = "Two-Way Star-Big"; starterPct = 42.6; comp = "Anthony Davis / KAT"; }
                        else if (aHi)          { cluster = "Rim-Power Big"; starterPct = 38.0; comp = "Jarrett Allen / Sabonis"; }
                        else if (mHi)          { cluster = "Mid-Range Big"; starterPct = 36.4; comp = "Sabonis / Cousins"; }
                        else                    { cluster = "Catch-Big Role-Floor"; starterPct = 16.7; comp = "Steven Adams / Zach Collins"; }
                      } else if (p.pos === "Playmaker") {
                        const aHi = atrM > 80, tHi = tpM > 20;
                        if (aHi && tHi)        { cluster = "Star-PG"; starterPct = 47.0; comp = "Lillard / Trae Young / Brunson"; }
                        else if (aHi)           { cluster = "Iso-Heavy PG"; starterPct = 32.0; comp = "Kemba / Kyrie"; }
                        else if (tHi)           { cluster = "Pullup PG"; starterPct = 27.3; comp = "Lonzo Ball"; }
                        else                    { cluster = "Connector PG"; starterPct = 45.0; comp = "Haliburton / Dellavedova"; }
                      } else { return null; }
                      const color = starterPct >= 30 ? "#22c55e" : starterPct >= 20 ? "#fbbf24" : "#ef4444";
                      return (
                        <div className="mt-3 pt-3 border-t flex flex-wrap items-baseline gap-x-3 gap-y-1" style={{borderColor:"#1e293b"}}>
                          <span className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Historical Cluster</span>
                          <span className="text-sm font-bold" style={{color, fontFamily:"'Oswald',sans-serif"}}>{cluster}</span>
                          <span className="text-xs" style={{color:"#9ca3af"}}>Starter+ rate: <strong style={{color}}>{starterPct.toFixed(1)}%</strong></span>
                          <span className="text-xs" style={{color:"#6b7280"}}>·</span>
                          <span className="text-xs" style={{color:"#cbd5e1"}}>Comp: {comp}</span>
                          <span className="text-[10px] ml-auto" style={{color:"#475569"}}>See <span style={{color:"#94a3b8"}}>Research → Self-Creation Framework</span></span>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
            </div>
          </Sec>
        );
      })()}

      {/* ═══ NBA SHOOTING PROJECTION ═══ */}
      
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
// ═══════════════════════════════════════════════════════════
// CLASS SCATTER + IN-SEASON DEVELOPMENT
// Feature 3 of Mind Tab — fetches cohort & game log data
// ═══════════════════════════════════════════════════════════
function ClassScatterAndDev({p}) {
  const [cohort,  setCohort]  = useState(null);
  const [gameLogs, setGameLogs] = useState(null);
  const [glLoading, setGlLoading] = useState(false);
  const [chartMode, setChartMode] = useState("class"); // "class" | "games"
  const [devMetric, setDevMetric] = useState("efg");   // "efg" | "usg" | "stl" | "blk" | "min"
  const [scatterHover, setScatterHover] = useState(null);
  const [scatterHoverPos, setScatterHoverPos] = useState({x:0,y:0});

  const yr = p?.skillCurve?.curUsg != null ? (p.seasonLines||[]).slice(-1)[0]?.yr : p?.yr;

  useEffect(() => {
    if (!p || !yr) return;
    // Fetch class cohort
    fetch(`${API_BASE.replace("/api","")}/api/cohort/${yr}?n=300`)
      .then(r => r.json())
      .then(d => setCohort(d))
      .catch(() => setCohort({players:[]}));
  }, [p?.name, yr]);

  useEffect(() => {
    if (!p?.name || !yr) return;
    setGlLoading(true);
    fetch(`${API_BASE.replace("/api","")}/api/gamelogs/${encodeURIComponent(p.name)}?year=${yr}`)
      .then(r => r.json())
      .then(d => { setGameLogs(d); setGlLoading(false); })
      .catch(() => { setGameLogs({games:[]}); setGlLoading(false); });
  }, [p?.name, yr]);

  if (!p) return null;

  // Usage-efficiency tradeoff: AdjOrtg DECLINES as usage increases.
  // At USG=10% (spot-up): ~147. At USG=25% (secondary): ~121. At USG=35% (primary): ~100.
  // This is the INDIVIDUAL expectation, not the cross-sectional population effect.
  const peerExp = (usg) => 160 - 1.2*usg - 0.015*usg*usg;
  const playerUsg  = p.usg  || p.skillCurve?.curUsg || 0;
  const playerOrtg = p.ortg || p.skillCurve?.curAdjOrtg || 0;

  // ── CLASS SCATTER ─────────────────────────────────────────
  const ClassScatter = () => {
    const W=560, H=280, PAD={l:44,r:20,t:20,b:36};
    const IW = W-PAD.l-PAD.r, IH = H-PAD.t-PAD.b;

    const pts = (cohort?.players || []).filter(c => c.usg >= 8 && c.ortg >= 70);
    const allUsg  = pts.map(c=>c.usg);
    const allOrtg = pts.map(c=>c.ortg);
    const minU = Math.max(8,  (allUsg.length  ? Math.min(...allUsg)  : 8)  - 2);
    const maxU = Math.min(42, (allUsg.length  ? Math.max(...allUsg)  : 38) + 2);
    const minO = Math.max(80, (allOrtg.length ? Math.min(...allOrtg) : 90) - 5);
    const maxO = Math.min(175,(allOrtg.length ? Math.max(...allOrtg) : 160)+ 5);

    const xS = (u) => PAD.l + (u - minU)/(maxU - minU) * IW;
    const yS = (o) => PAD.t + IH - (o - minO)/(maxO - minO) * IH;

    // Peer curve line
    const curveUsg = [];
    for (let u=minU; u<=maxU; u+=0.5) curveUsg.push(u);
    const curvePts = curveUsg.map(u => `${xS(u).toFixed(1)},${yS(peerExp(u)).toFixed(1)}`).join(" ");

    // Grid lines
    const yTicks = [];
    const step = maxO-minO > 60 ? 20 : 10;
    for (let o=Math.ceil(minO/step)*step; o<=maxO; o+=step) yTicks.push(o);
    const xTicks = [10,15,20,25,30,35,40].filter(u=>u>=minU&&u<=maxU);

    const isLoading = cohort === null;

    return (
      <div style={{position:"relative"}}>
        {/* Hover tooltip */}
        {scatterHover && (
          <div style={{
            position:"fixed",zIndex:100,
            left:Math.min(scatterHoverPos.x+12,window.innerWidth-190),
            top:Math.max(scatterHoverPos.y-10,8),
            background:"#1e293b",border:"1px solid #475569",
            borderRadius:8,padding:"7px 11px",pointerEvents:"none",
            boxShadow:"0 4px 16px rgba(0,0,0,0.5)",minWidth:160,
          }}>
            <div style={{fontSize:12,fontWeight:700,color:"#e5e7eb",marginBottom:3}}>{scatterHover.name}</div>
            <div style={{fontSize:10,color:"#9ca3af"}}>
              USG: <strong style={{color:"#f97316"}}>{scatterHover.usg?.toFixed(1)}%</strong> · AdjOrtg: <strong style={{color: scatterHover.ortg > peerExp(scatterHover.usg) ? "#22c55e" : "#ef4444"}}>{scatterHover.ortg?.toFixed(0)}</strong>
            </div>
            {scatterHover.pos && <div style={{fontSize:10,color:"#6b7280"}}>{scatterHover.pos}</div>}
          </div>
        )}
        {isLoading ? (
          <div style={{height:H,display:"flex",alignItems:"center",justifyContent:"center",color:"#4b5563",fontSize:12}}>
            Loading class data…
          </div>
        ) : (
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
            {/* Grid */}
            {yTicks.map(o=>(
              <g key={o}>
                <line x1={PAD.l} x2={W-PAD.r} y1={yS(o)} y2={yS(o)} stroke="#1f2937" strokeWidth={1}/>
                <text x={PAD.l-4} y={yS(o)+4} textAnchor="end" fontSize={9} fill="#6b7280">{o}</text>
              </g>
            ))}
            {xTicks.map(u=>(
              <g key={u}>
                <line x1={xS(u)} x2={xS(u)} y1={PAD.t} y2={H-PAD.b} stroke="#1f2937" strokeWidth={1}/>
                <text x={xS(u)} y={H-PAD.b+14} textAnchor="middle" fontSize={9} fill="#6b7280">{u}%</text>
              </g>
            ))}
            {/* Axis labels */}
            <text x={W/2} y={H-2} textAnchor="middle" fontSize={10} fill="#6b7280">Usage %</text>
            <text x={10} y={H/2} textAnchor="middle" fontSize={10} fill="#6b7280" transform={`rotate(-90,10,${H/2})`}>AdjOrtg</text>
            {/* Peer curve */}
            <polyline points={curvePts} fill="none" stroke="#f97316" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5}/>
            {/* Quadrant hint */}
            {playerUsg > (minU+maxU)/2 && playerOrtg > peerExp(playerUsg) && (
              <text x={W-PAD.r-5} y={PAD.t+12} textAnchor="end" fontSize={8} fill="#22c55e" opacity={0.5}>High Vol · High Eff</text>
            )}
            {/* Class dots — hoverable */}
            {pts.filter(c=>c.name!==p.name).map((c,i)=>{
              const abovePeer = c.ortg > peerExp(c.usg);
              return (
                <circle key={i} cx={xS(c.usg)} cy={yS(c.ortg)} r={3.5}
                  fill={abovePeer ? "#1e3a5f" : "#2d2d3d"}
                  stroke={abovePeer ? "#60a5fa" : "#6b7280"}
                  strokeWidth={0.8} opacity={0.85}
                  style={{cursor:"pointer"}}
                  onMouseEnter={(e)=>{setScatterHover(c);setScatterHoverPos({x:e.clientX,y:e.clientY});}}
                  onMouseLeave={()=>setScatterHover(null)}/>
              );
            })}
            {/* Selected player */}
            {playerUsg > 0 && playerOrtg > 0 && (
              <g>
                <circle cx={xS(playerUsg)} cy={yS(playerOrtg)} r={7} fill="#f97316" opacity={0.9}/>
                <circle cx={xS(playerUsg)} cy={yS(playerOrtg)} r={7} fill="none" stroke="#fed7aa" strokeWidth={1.5}/>
                <text x={xS(playerUsg)+10} y={yS(playerOrtg)+4} fontSize={9} fontWeight="bold" fill="#f97316"
                  style={{textShadow:"0 0 4px #000"}}>
                  {p.name?.split(" ").slice(-1)[0]}
                </text>
              </g>
            )}
            {/* Peer curve label */}
            <text x={xS(maxU)-5} y={yS(peerExp(maxU))-5} fontSize={8} fill="#f97316" opacity={0.6} textAnchor="end">
              peer avg
            </text>
          </svg>
        )}
        {!isLoading && pts.length > 0 && (
          <div style={{fontSize:10,color:"#6b7280",marginTop:4,textAlign:"right"}}>
            {pts.length} players · {yr} class · orange line = peer curve
            {playerOrtg > peerExp(playerUsg)
              ? <span style={{color:"#22c55e"}}> · {p.name?.split(" ")[0]} is <strong>above</strong> peer curve</span>
              : <span style={{color:"#ef4444"}}> · {p.name?.split(" ")[0]} is <strong>below</strong> peer curve</span>}
          </div>
        )}
      </div>
    );
  };

  // ── RECENT GAMES TABLE ────────────────────────────────────
  // Shows last 15 games: #, Date, Opponent, PTS, REB, AST, STL, BLK, eFG%, TS%
  // Color coding: eFG/TS green ≥55%, yellow ≥45%, red <45%
  const GameScatter = () => {
    if (glLoading) return <div style={{height:120,display:"flex",alignItems:"center",justifyContent:"center",color:"#4b5563",fontSize:12}}>Loading game logs…</div>;
    const allGames = (gameLogs?.games || []).sort((a,b)=>a.game_num-b.game_num);
    if (allGames.length === 0) return (
      <div style={{background:"#0f172a",borderRadius:8,padding:"14px 16px",border:"1px dashed #374151"}}>
        <div style={{fontSize:12,fontWeight:600,color:"#6b7280"}}>📡 Game log data not yet available for this player.</div>
      </div>
    );
    const recent = allGames.slice(-15);
    const effColor = (v) => v == null || !isFinite(v) ? "#6b7280" : v >= 55 ? "#22c55e" : v >= 45 ? "#fbbf24" : "#ef4444";
    const fmtEff = (v) => (v == null || !isFinite(v)) ? "—" : `${v.toFixed(0)}%`;
    const fmtStat = (v) => v == null ? "—" : v;
    return (
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead>
            <tr>
              {["#","Date","Opp","PTS","REB","AST","STL","BLK","eFG%","TS%"].map(h=>(
                <th key={h} style={{textAlign:["PTS","REB","AST","STL","BLK","eFG%","TS%"].includes(h)?"right":"left",
                  fontSize:9,color:"#4b5563",padding:"3px 6px",borderBottom:"1px solid #1f2937",fontWeight:500,whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recent.map((g,i)=>{
              const isLast = i===recent.length-1;
              return (
                <tr key={g.game_num} style={{background:isLast?"#1a1a2e":"transparent",borderBottom:"1px solid #111827"}}>
                  <td style={{padding:"4px 6px",color:"#4b5563",fontSize:9}}>{g.game_num}</td>
                  <td style={{padding:"4px 6px",color:"#6b7280",fontSize:9,whiteSpace:"nowrap"}}>{g.date?.slice(5)||"—"}</td>
                  <td style={{padding:"4px 6px",color:"#9ca3af",maxWidth:90,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.opp||"—"}</td>
                  <td style={{padding:"4px 6px",textAlign:"right",fontWeight:700,color:isLast?"#f97316":"#e5e7eb"}}>{fmtStat(g.pts)}</td>
                  <td style={{padding:"4px 6px",textAlign:"right",color:"#9ca3af"}}>{fmtStat(g.reb)}</td>
                  <td style={{padding:"4px 6px",textAlign:"right",color:"#9ca3af"}}>{fmtStat(g.ast)}</td>
                  <td style={{padding:"4px 6px",textAlign:"right",color:"#9ca3af"}}>{fmtStat(g.stl)}</td>
                  <td style={{padding:"4px 6px",textAlign:"right",color:"#9ca3af"}}>{fmtStat(g.blk)}</td>
                  <td style={{padding:"4px 6px",textAlign:"right",fontWeight:600,color:effColor(g.efg)}}>{fmtEff(g.efg)}</td>
                  <td style={{padding:"4px 6px",textAlign:"right",fontWeight:600,color:effColor(g.ts)}}>{fmtEff(g.ts)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{fontSize:9,color:"#374151",marginTop:6}}>
          Last {recent.length} games · eFG%/TS%: <span style={{color:"#22c55e"}}>≥55% elite</span>, <span style={{color:"#fbbf24"}}>≥45% avg</span>, <span style={{color:"#ef4444"}}>&lt;45% below avg</span>
        </div>
      </div>
    );
  };

  // ── DEV TRAJECTORY ────────────────────────────────────────
  const DevTrajectory = () => {
    const allGames = (gameLogs?.games || []).sort((a,b) => a.game_num - b.game_num);
    if (glLoading) return (
      <div style={{height:60,display:"flex",alignItems:"center",justifyContent:"center",color:"#4b5563",fontSize:12}}>
        Loading in-season data…
      </div>
    );

    // Metric definitions — fields available in game_logs: pts, fgm, fga, fgm3, fga3,
    // ftm, fta, ast, stl, blk, tov, reb, oreb, dreb, efg, ts, fouls, date, opp, game_num
    const METRICS = {
      pts:  {label:"Points",   unit:"",  color:"#f97316", getter:g=>g.pts,  minVal:0,  maxVal:50,
             desc:"Points per game — raw scoring volume. Rising trend signals an expanding offensive role."},
      efg:  {label:"eFG%",     unit:"%", color:"#60a5fa", getter:g=>(g.efg != null && isFinite(g.efg)) ? g.efg : null, minVal:20, maxVal:85,
             desc:"Effective field goal % — weights 3-pointers at 1.5×. Primary shooting efficiency metric. Only shown when FGA > 0."},
      ts:   {label:"TS%",      unit:"%", color:"#22c55e", getter:g=>(g.ts != null && isFinite(g.ts) && g.ts > 0) ? g.ts : null, minVal:20, maxVal:90,
             desc:"True Shooting % — efficiency including free throws. Best single-number shooting metric."},
      reb:  {label:"Rebounds", unit:"",  color:"#a78bfa", getter:g=>g.reb,  minVal:0,  maxVal:20,
             desc:"Total rebounds per game. Rising trend signals growing impact on the glass."},
      ast:  {label:"Assists",  unit:"",  color:"#34d399", getter:g=>g.ast,  minVal:0,  maxVal:15,
             desc:"Assists per game. Rising trend signals developing playmaking and court vision."},
      stl:  {label:"Steals",   unit:"",  color:"#a855f7", getter:g=>g.stl,  minVal:0,  maxVal:5,
             desc:"Steals per game. Rising trend signals improving defensive anticipation."},
      blk:  {label:"Blocks",   unit:"",  color:"#ef4444", getter:g=>g.blk,  minVal:0,  maxVal:6,
             desc:"Blocks per game. Rising trend signals growing rim-protection impact."},
    };

    const metric = METRICS[devMetric] || METRICS.pts;
    const games = allGames.filter(g => g.game_num != null && metric.getter(g) != null);

    if (games.length < 5) return (
      <div style={{background:"#0f172a",borderRadius:8,padding:"14px 16px",border:"1px dashed #1e3a5f",textAlign:"center"}}>
        <div style={{fontSize:13,color:"#4b5563",marginBottom:6}}>📊 In-Season Development</div>
        <div style={{fontSize:11,color:"#374151"}}>
          {games.length === 0
            ? "Game-log data not yet available for this player. Run the game log fetch locally to enable per-game rolling trends."
            : `Only ${games.length} qualifying games — need ≥5 for rolling trend analysis.`}
        </div>
        {games.length === 0 && (
          <div style={{marginTop:10,fontSize:10,color:"#1e3a5f",background:"#111827",borderRadius:4,padding:"4px 8px",display:"inline-block"}}>
            <code style={{color:"#f97316"}}>python scripts/fetch_game_logs.py --top-only</code>
          </div>
        )}
      </div>
    );

    const W=560, H=180, PAD={l:42,r:20,t:16,b:32};
    const IW=W-PAD.l-PAD.r, IH=H-PAD.t-PAD.b;
    const N = games.length;
    const K = Math.min(5, Math.max(3, Math.floor(N/4)));

    const rawVals = games.map(g => metric.getter(g) ?? 0);
    const rolling = games.map((g,i) => {
      const win = rawVals.slice(Math.max(0,i-K+1), i+1);
      return { n: g.game_num, v: win.reduce((s,x)=>s+x,0)/win.length };
    });

    const minV = Math.max(metric.minVal, Math.min(...rolling.map(r=>r.v)) - (metric.unit==="%"?5:0.3));
    const maxV = Math.min(metric.maxVal, Math.max(...rolling.map(r=>r.v)) + (metric.unit==="%"?5:0.3));
    const xS = (n) => PAD.l + (n-1)/(N-1)*IW;
    const yS = (v) => PAD.t + IH - Math.max(0,Math.min(1,(v-minV)/(maxV-minV)))*IH;

    const half = Math.floor(N/2);
    const avgFirst = rolling.slice(0,half).reduce((s,r)=>s+r.v,0)/(half||1);
    const avgSec   = rolling.slice(half).reduce((s,r)=>s+r.v,0)/((N-half)||1);
    const delta    = avgSec - avgFirst;
    const isPos    = delta > 0;
    const trendColor = Math.abs(delta) < 0.5 ? "#fbbf24" : isPos ? "#22c55e" : "#ef4444";
    const trendLabel = Math.abs(delta) < 0.5 ? "Flat" : isPos ? `↑ Improving` : `↓ Declining`;

    // OLS trend
    const xs = rolling.map((_,i)=>i);
    const ys = rolling.map(r=>r.v);
    const xm = xs.reduce((s,x)=>s+x,0)/xs.length;
    const ym = ys.reduce((s,y)=>s+y,0)/ys.length;
    const slope = xs.reduce((s,x,i)=>s+(x-xm)*(ys[i]-ym),0)/xs.reduce((s,x)=>s+(x-xm)**2,0.001);
    const intercept = ym - slope*xm;
    const y0 = yS(intercept), yN = yS(intercept+slope*(N-1));
    const linePts = rolling.map(r=>`${xS(r.n).toFixed(1)},${yS(r.v).toFixed(1)}`).join(" ");

    const yTicks = [];
    const step = (maxV-minV) > 20 ? 10 : (maxV-minV) > 5 ? 5 : 1;
    for (let v=Math.ceil(minV/step)*step; v<=maxV; v+=step) yTicks.push(v);

    return (
      <div>
        {/* Metric picker */}
        <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
          {Object.entries(METRICS).map(([key,m])=>(
            <button key={key} onClick={()=>setDevMetric(key)} style={{
              fontSize:10,padding:"3px 8px",borderRadius:5,border:"none",cursor:"pointer",
              background:devMetric===key ? m.color : "#1f2937",
              color:devMetric===key ? "#000" : "#9ca3af",fontWeight:600}}>
              {m.label}
            </button>
          ))}
        </div>
        <div style={{fontSize:10,color:"#6b7280",marginBottom:8}}>{metric.desc}</div>
        <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:8}}>
          <div style={{fontSize:11,color:"#9ca3af"}}>
            {K}-game rolling {metric.label} · {N} games · 1st half avg: <strong style={{color:"#e5e7eb"}}>{avgFirst.toFixed(1)}{metric.unit}</strong> → 2nd half: <strong style={{color:trendColor}}>{avgSec.toFixed(1)}{metric.unit}</strong>
          </div>
          <div style={{fontSize:11,fontWeight:700,color:trendColor,background:"#1f2937",borderRadius:6,padding:"2px 8px"}}>
            {trendLabel} ({delta>0?"+":""}{delta.toFixed(1)}{metric.unit})
          </div>
        </div>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
          {yTicks.map(v=>(
            <g key={v}><line x1={PAD.l} x2={W-PAD.r} y1={yS(v)} y2={yS(v)} stroke="#1f2937" strokeWidth={1}/>
            <text x={PAD.l-4} y={yS(v)+4} textAnchor="end" fontSize={8} fill="#6b7280">{v}{metric.unit}</text></g>
          ))}
          {[1,Math.ceil(N*0.25),Math.ceil(N*0.5),Math.ceil(N*0.75),N].filter((v,i,a)=>a.indexOf(v)===i&&v>=1&&v<=N).map(n=>(
            <text key={n} x={xS(n)} y={H-PAD.b+12} textAnchor="middle" fontSize={8} fill="#6b7280">G{n}</text>
          ))}
          <text x={W/2} y={H} textAnchor="middle" fontSize={9} fill="#6b7280">Game #</text>
          <text x={10} y={H/2} textAnchor="middle" fontSize={9} fill="#6b7280" transform={`rotate(-90,10,${H/2})`}>{metric.label}</text>
          {/* Season midpoint */}
          <line x1={xS(half+0.5)} x2={xS(half+0.5)} y1={PAD.t} y2={H-PAD.b} stroke="#374151" strokeWidth={1} strokeDasharray="3,2"/>
          {/* OLS trend */}
          <line x1={xS(1)} y1={y0} x2={xS(N)} y2={yN} stroke={trendColor} strokeWidth={1.5} strokeDasharray="5,3" opacity={0.7}/>
          {/* Rolling line */}
          <polyline points={linePts} fill="none" stroke={metric.color} strokeWidth={2}/>
          {rolling.map((r,i)=><circle key={i} cx={xS(r.n)} cy={yS(r.v)} r={2.5} fill={metric.color} opacity={0.75}/>)}
        </svg>
        <div style={{fontSize:10,color:"#6b7280",marginTop:5,display:"flex",gap:12,flexWrap:"wrap"}}>
          <span style={{color:metric.color}}>— {K}-game rolling avg</span>
          <span style={{color:trendColor}}>--- trend (OLS)</span>
          <span>| = season midpoint</span>
          {Math.abs(delta) > 1.5 && <span style={{color:trendColor}}>
            {isPos ? "✓ Progressive improvement" : "⚠ Declining trend"} over season
          </span>}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 3A: Class Scatter — entfernt 2026-05-09 (User: redundant zur In-Season-Trajectory) */}

      {/* 3A.5: Multi-Stat In-Season Trajectory (Tobias 2026-05-09)
            Aus p.gameLogs.games (PBP-aggregated). Zeigt mehrere Stats overlay:
            - Ist die Rolle gewachsen? (USG)
            - Wurde er effizienter? (eFG)
            - Neue Skills? (3PA, AST)
       */}
      {p.gameLogs && p.gameLogs.games && p.gameLogs.games.length >= 8 && (() => {
        const games = [...p.gameLogs.games].sort((a, b) => (a.d || "").localeCompare(b.d || ""));
        // Rolling-mean window
        const N = games.length;
        const K = Math.min(7, Math.max(3, Math.floor(N / 5)));
        const rollMean = (vals) => vals.map((_, i) => {
          const win = vals.slice(Math.max(0, i - K + 1), i + 1).filter(v => v != null);
          if (win.length === 0) return null;
          return win.reduce((a, b) => a + b, 0) / win.length;
        });

        // Available metrics — pick 4 of the most insightful
        // Tobias 2026-05-09: 6 stats — 4 offensive + 2 defensive/discipline.
        // Computed-on-the-fly: stocks = STL+BLK pro Game (Defense-Trend).
        const STATS = [
          {key:"u",  label:"Usage %",       short:"USG", color:"#f97316", min:0,   max:45,  fmt:v=>v.toFixed(1)+"%",
           hint:"Share of team possessions used. Rising = expanding role."},
          {key:"e",  label:"eFG %",         short:"eFG", color:"#22c55e", min:25,  max:75,  fmt:v=>v.toFixed(1)+"%",
           hint:"Effective FG % (weighted for 3pt). Rising = becoming more efficient."},
          {key:"ts", label:"TS %",          short:"TS",  color:"#eab308", min:25,  max:75,  fmt:v=>v.toFixed(1)+"%",
           hint:"True Shooting % — FT-aware shooting efficiency (includes free throws). The best single-number scoring-efficiency metric. Only shown when shot data exists."},
          {key:"a",  label:"Assists",       short:"AST", color:"#a78bfa", min:0,   max:12,  fmt:v=>v.toFixed(1),
           hint:"Per game. Rising = developing playmaking."},
          {key:"ta", label:"3PT Attempts",  short:"3PA", color:"#60a5fa", min:0,   max:14,  fmt:v=>v.toFixed(1),
           hint:"Per game. Rising = expanding shooting range / role."},
          {key:"_stocks", label:"Stocks (Defense)", short:"D",  color:"#06b6d4", min:0, max:8, fmt:v=>v.toFixed(1),
           hint:"STL + BLK per game. Rising = growing defensive disruption — a key NBA-translation signal.",
           getter: g => (g.s||0) + (g.b||0)},
          {key:"pf", label:"Foul Discipline", short:"PF", color:"#ef4444", min:0, max:6, fmt:v=>v.toFixed(1),
           hint:"Personal fouls per game. FALLING is good — discipline grows. Rising fouls + falling production = warning sign.",
           inverted:true},
        ];

        const W = 720, H = 270, PAD = {l: 50, r: 50, t: 16, b: 36};
        const IW = W - PAD.l - PAD.r, IH = H - PAD.t - PAD.b;
        const xS = (i) => PAD.l + (N <= 1 ? IW/2 : (i / (N - 1)) * IW);

        // Compute rolling means + normalize to [0,1] within each metric's domain for overlay
        const series = STATS.map(stat => {
          // Custom getter (e.g. stocks = stl+blk) or simple key-lookup
          const vals = games.map(g => stat.getter ? stat.getter(g) : (g[stat.key] ?? null));
          const roll = rollMean(vals);
          // Normalize to [0,1] for overlay; we keep separate Y-axes labelled
          const norm = roll.map(v => v == null ? null : (v - stat.min) / (stat.max - stat.min));
          // OLS slope on roll values (for trend hint)
          const validIdx = roll.map((v, i) => v != null ? i : null).filter(i => i != null);
          let slope = 0;
          if (validIdx.length >= 3) {
            const xs = validIdx, ys = validIdx.map(i => roll[i]);
            const xm = xs.reduce((a,b)=>a+b,0)/xs.length;
            const ym = ys.reduce((a,b)=>a+b,0)/ys.length;
            const num = xs.reduce((a,x,i)=>a+(x-xm)*(ys[i]-ym),0);
            const den = xs.reduce((a,x)=>a+(x-xm)**2,0.001);
            slope = num/den;
          }
          // Slope expressed in stat-units per game
          const slopeText = (Math.abs(slope) < 0.01) ? "flat" :
            slope > 0 ? `↑ +${(slope*N).toFixed(1)}${stat.fmt(Math.abs(slope*N)).replace(/[\d.]/g,'').trim()} over season` :
                       `↓ ${(slope*N).toFixed(1)}${stat.fmt(Math.abs(slope*N)).replace(/[\d.]/g,'').trim()} over season`;
          return {stat, vals, roll, norm, slope, slopeText};
        });

        const yTicks = [0, 0.25, 0.5, 0.75, 1.0];

        if (isPBPLimited2026(p)) return <PBPNotAvailable title="In-Season Trajectory" icon="📈"/>;
        return (
          <Sec icon="📈" title="In-Season Trajectory — Did The Player Develop?"
            sub={`${N} games this season. Rolling ${K}-game mean for 6 indicators (4 offense + 2 defense/discipline). Use this to spot: role expansion (USG), efficiency growth (eFG), new skills (AST/3PA), defensive growth (Stocks), discipline (PF).`}>
            {/* Verdict bar */}
            <div style={{background:"#0d1117",border:"1px solid #1f2937",borderRadius:8,padding:"10px 12px",marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"#6b7280",letterSpacing:1,marginBottom:6}}>SEASON-SCALE TRENDS</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))",gap:10}}>
                {series.map(s => {
                  // Inverted stats (e.g. PF): falling = good, rising = bad
                  const inv = s.stat.inverted;
                  const trendColor = inv
                    ? (s.slope < -0.005 ? "#22c55e" : s.slope > 0.005 ? "#ef4444" : "#6b7280")
                    : (s.slope > 0.005 ? "#22c55e" : s.slope < -0.005 ? "#ef4444" : "#6b7280");
                  return (
                    <Tip key={s.stat.key} content={<div style={{fontSize:12}}><strong style={{color:s.stat.color}}>{s.stat.label}</strong><br/>{s.stat.hint}</div>}>
                      <div style={{cursor:"help"}}>
                        <div style={{fontSize:11,color:"#9ca3af",marginBottom:2}}>
                          <span style={{color:s.stat.color,fontWeight:600}}>● {s.stat.short}</span> trend
                        </div>
                        <div style={{fontSize:13,color:trendColor,fontWeight:600}}>{s.slopeText}</div>
                      </div>
                    </Tip>
                  );
                })}
              </div>
            </div>

            <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
              {/* Grid (4 horizontal lines: 0, 0.25, 0.5, 0.75, 1.0 of normalized scale) */}
              {yTicks.map(t => (
                <line key={t} x1={PAD.l} x2={W-PAD.r} y1={PAD.t + (1-t)*IH} y2={PAD.t + (1-t)*IH} stroke="#1f2937" strokeWidth={0.5}/>
              ))}
              {/* X-axis: game number */}
              {[1, Math.floor(N*0.25), Math.floor(N*0.5), Math.floor(N*0.75), N].map((g,i,arr)=>{
                if (g < 1) return null;
                if (i > 0 && g === arr[i-1]) return null;
                const dateStr = games[g-1]?.d?.slice(5) || "";
                return (
                  <g key={g}>
                    <line x1={xS(g-1)} y1={PAD.t} x2={xS(g-1)} y2={H-PAD.b} stroke="#1f2937" strokeWidth={0.5}/>
                    <text x={xS(g-1)} y={H-PAD.b+12} textAnchor="middle" fontSize={9} fill="#6b7280">G{g}</text>
                    <text x={xS(g-1)} y={H-PAD.b+24} textAnchor="middle" fontSize={8} fill="#475569">{dateStr}</text>
                  </g>
                );
              })}

              {/* Each stat: smooth polyline */}
              {series.map(s => {
                const points = s.norm.map((v, i) => v == null ? null : `${xS(i)},${PAD.t + (1-Math.max(0,Math.min(1,v)))*IH}`).filter(Boolean).join(" ");
                return <polyline key={s.stat.key} points={points} fill="none" stroke={s.stat.color} strokeWidth={2.2} opacity={0.85}/>;
              })}

              {/* Game dots — colored by stat (small, opaque) */}
              {series.map(s => games.map((g, i) => {
                const v = s.norm[i];
                if (v == null) return null;
                return <circle key={`${s.stat.key}-${i}`} cx={xS(i)} cy={PAD.t + (1-Math.max(0,Math.min(1,v)))*IH}
                  r={2} fill={s.stat.color} opacity={0.5}/>;
              }))}

              {/* Y-axis labels: per-stat scale on left + right */}
              {/* Left: USG (orange) + eFG (green) */}
              {STATS.slice(0,2).map((stat, idx) => (
                <g key={`axis-l-${stat.key}`} opacity={0.75}>
                  <text x={PAD.l-8} y={PAD.t-2} textAnchor="end" fontSize={9} fill={stat.color} fontWeight={600}>
                    {idx === 0 ? `${stat.short}` : ""}
                  </text>
                  {[0,0.5,1].map(t => (
                    <text key={t} x={PAD.l-8 - (idx===0?0:30)} y={PAD.t + (1-t)*IH + 3}
                      textAnchor="end" fontSize={8} fill={stat.color}>
                      {stat.fmt(stat.min + t*(stat.max-stat.min))}
                    </text>
                  ))}
                </g>
              ))}
              {/* Right: AST (purple) + 3PA (blue) */}
              {STATS.slice(2,4).map((stat, idx) => (
                <g key={`axis-r-${stat.key}`} opacity={0.75}>
                  {[0,0.5,1].map(t => (
                    <text key={t} x={W-PAD.r+8 + (idx===0?0:30)} y={PAD.t + (1-t)*IH + 3}
                      textAnchor="start" fontSize={8} fill={stat.color}>
                      {stat.fmt(stat.min + t*(stat.max-stat.min))}
                    </text>
                  ))}
                </g>
              ))}
              <text x={(PAD.l+W-PAD.r)/2} y={H-4} textAnchor="middle" fontSize={11} fill="#9ca3af">Games (chronological)</text>
            </svg>

            <div style={{display:"flex",gap:14,marginTop:8,fontSize:10,color:"#6b7280",flexWrap:"wrap"}}>
              {STATS.map(s => (
                <span key={s.key}>
                  <span style={{color:s.color,fontWeight:700}}>━ {s.short}</span> ({s.fmt(s.min)} … {s.fmt(s.max)} scale)
                </span>
              ))}
            </div>
            <div style={{marginTop:8,fontSize:10,color:"#475569",lineHeight:1.6,fontStyle:"italic"}}>
              <strong style={{color:"#6b7280"}}>How to read:</strong> Each line is a {K}-game rolling mean, plotted on its own scale (left axis: USG/eFG, right axis: AST/3PA).
              An <span style={{color:"#22c55e"}}>upward</span> trend in eFG while USG also rose = he got more efficient AT higher load (rare developmental marker).
              Rising AST or 3PA late in the season = expanding skill set. Compare against age — younger players with mid-season improvements are the strongest signal.
            </div>
          </Sec>
        );
      })()}

      {/* Single-Stat Rolling Trend removed 2026-05-09 — redundant with In-Season Trajectory above */}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MIND TAB — PBP Advanced Intelligence
// Feature 1: Leverage-Weighted Efficiency (Self-Creation-Weighted eFG%)
// ═══════════════════════════════════════════════════════════
function MindTab({p}) {
  if (!p) return null;
  {/* Tobias 2026-06-03 v9: Mind Tab honest disclaimer banner */}
  const MindDisclaimer = () => (
    <div className="rounded-xl p-4 mb-4 text-sm leading-relaxed"
         style={{background:"#0d1117",border:"1px solid #1f2937"}}>
      <div className="font-semibold text-gray-100 mb-2">About these metrics</div>
      <p className="text-gray-300 mb-2">
        The Mind tab measures behavioural patterns under pressure — clutch shooting deltas,
        adverse-event response tendencies (Aggressor, Overdriver, Hothead, Passive),
        stamina drift across halves, and bounceback efficiency after negative streaks.
        These come from BartTorvik aggregated PBP arrays and cover the full 2025-26 NCAA season.
      </p>
      <p className="text-gray-400 text-xs">
        <strong className="text-gray-300">What they show:</strong> Behavioural fingerprint and stylistic tendencies under stress.
        <br/>
        <strong className="text-gray-300">What they do NOT predict:</strong> NBA stardom on their own. Most historical NBA stars
        (Anthony Edwards, Brunson, Trae Young, Haliburton) scored <em>below-median</em> on the mind composite
        in their final NCAA season. Mind correlates weakly with NBA peak Wins Added (|r| &lt; 0.10 univariate).
        Treat this as <strong className="text-gray-200">qualitative behavioural reference</strong>, not a projection.
        Full methodology and historical validation in <span className="text-gray-200">Research → Mind Framework</span>.
      </p>
    </div>
  );

  /* Tobias 2026-06-03 v9: Mind tab reactivated for 2026, with honest disclaimer */

  // Mind metrics use BartTorvik aggregated PBP arrays — full 2025-26 season coverage,

  // same source as Shot Creation. No partial-season concern.

  const le = p.leverageEff ?? null;

  // ── Score ring helper (similar to ShootingTab style) ──
  const ScoreRing = ({score, label, sub, color}) => {
    const pct = Math.max(0, Math.min(100, score ?? 0));
    const tier = pct >= 80 ? "Elite" : pct >= 60 ? "Above Avg" : pct >= 40 ? "Average" : pct >= 20 ? "Below Avg" : "Low";
    const tierColor = pct >= 80 ? "#22c55e" : pct >= 60 ? "#86efac" : pct >= 40 ? "#fbbf24" : "#ef4444";
    return (
      <div className="flex flex-col items-center" style={{minWidth:90}}>
      <MindDisclaimer/>
        <div style={{position:"relative",width:80,height:80}}>
          <svg width={80} height={80} viewBox="0 0 80 80">
            <circle cx={40} cy={40} r={34} fill="none" stroke="#1f2937" strokeWidth={8}/>
            <circle cx={40} cy={40} r={34} fill="none" stroke={color??tierColor} strokeWidth={8}
              strokeDasharray={`${pct/100*213.6} 213.6`}
              strokeLinecap="round"
              transform="rotate(-90 40 40)"/>
          </svg>
          <div style={{position:"absolute",top:0,left:0,width:80,height:80,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}}>
            <span style={{fontSize:18,fontWeight:700,color:"#f9fafb"}}>{pct}</span>
          </div>
        </div>
        <div style={{fontSize:11,fontWeight:600,color:tierColor,marginTop:4,textAlign:"center"}}>{tier}</div>
        <div style={{fontSize:10,color:"#9ca3af",textAlign:"center",lineHeight:"1.3"}}>{label}</div>
        {sub&&<div style={{fontSize:9,color:"#6b7280",textAlign:"center"}}>{sub}</div>}
      </div>
    );
  };

  // ── Difficulty premium bar ──
  const DiffBar = ({value}) => {
    // value is diffPrem in pp, typical range -15 to +10
    const clamp = Math.max(-15, Math.min(10, value ?? 0));
    const pct = ((clamp + 15) / 25) * 100; // map to 0-100 for bar
    const color = value > 0 ? "#22c55e" : value > -3 ? "#fbbf24" : "#ef4444";
    const sign = value > 0 ? "+" : "";
    return (
      <div style={{width:"100%"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
          <span style={{fontSize:11,color:"#9ca3af"}}>Worse on self-created</span>
          <span style={{fontSize:13,fontWeight:700,color}}>{sign}{value?.toFixed(1)}pp</span>
          <span style={{fontSize:11,color:"#9ca3af"}}>Better on self-created</span>
        </div>
        <div style={{background:"#1f2937",borderRadius:6,height:10,position:"relative",overflow:"hidden"}}>
          {/* Zero marker at 60% of bar (where 0 maps to) */}
          <div style={{position:"absolute",left:"60%",top:0,bottom:0,width:2,background:"#374151"}}/>
          <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${pct}%`,background:color,borderRadius:6,transition:"width 0.4s ease"}}/>
        </div>
        <div style={{display:"flex",justifyContent:"center",marginTop:4}}>
          <span style={{fontSize:10,color:"#6b7280"}}>D1 avg: −1.4pp (BartTorvik 2019–24) — self-created shots are harder by design</span>
        </div>
      </div>
    );
  };

  // ── Zone table ──
  // NCAA D1 approximate league-average zone stats (BartTorvik 2020-2024 average)
  const ZONE_AVG = {
    rim:   {eFG: 62.5, selfPct: 42},
    mid:   {eFG: 40.2, selfPct: 58},
    three: {eFG: 51.8, selfPct: 38},  // ~34.5% × 1.5
    dunk:  {eFG: 76.0, selfPct: 22},
  };

  const ZoneRow = ({zone, label, color, data}) => {
    if (!data) return null;
    const {eFG, selfPct, fga} = data;
    const asstPct = selfPct != null ? (100 - selfPct) : null; // assisted = 1 - self%
    const avg = ZONE_AVG[zone] || {};
    const avgAsst = avg.selfPct != null ? (100 - avg.selfPct) : null;
    const efgColor = eFG >= 65 ? "#22c55e" : eFG >= 55 ? "#86efac" : eFG >= 45 ? "#fbbf24" : "#ef4444";
    const selfColor = selfPct >= 60 ? "#f97316" : selfPct >= 35 ? "#fbbf24" : "#6b7280";
    const asstColor = asstPct >= 70 ? "#60a5fa" : asstPct >= 50 ? "#3b82f6" : "#6b7280";
    const efgDelta = avg.eFG ? eFG - avg.eFG : null;
    return (
      <div style={{display:"grid",gridTemplateColumns:"70px 65px 50px 55px 50px 55px 50px 40px",gap:4,alignItems:"center",padding:"5px 0",borderBottom:"1px solid #1f2937"}}>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:color,flexShrink:0}}/>
          <span style={{fontSize:11,fontWeight:600,color:"#e5e7eb"}}>{label}</span>
        </div>
        <div style={{textAlign:"right",fontSize:12,fontWeight:700,color:efgColor}}>
          {eFG?.toFixed(1)}%
          {efgDelta!=null&&<span style={{fontSize:8,marginLeft:2,color:efgDelta>0?"#22c55e":"#ef4444"}}>{efgDelta>0?"+":""}{efgDelta.toFixed(0)}</span>}
        </div>
        <div style={{textAlign:"right",fontSize:10,color:"#4b5563"}}>{avg.eFG?.toFixed(1)}%</div>
        <div style={{textAlign:"right",fontSize:12,fontWeight:600,color:selfColor}}>
          {selfPct?.toFixed(0)}%
        </div>
        <div style={{textAlign:"right",fontSize:10,color:"#4b5563"}}>{avg.selfPct?.toFixed(0)}%</div>
        <div style={{textAlign:"right",fontSize:12,color:asstColor}}>
          {asstPct?.toFixed(0)}%
        </div>
        <div style={{textAlign:"right",fontSize:10,color:"#4b5563"}}>{avgAsst?.toFixed(0)}%</div>
        <div style={{textAlign:"right",fontSize:11,color:"#6b7280"}}>{fga}</div>
      </div>
    );
  };

  const ZONE_CONFIG = {
    rim:   {label:"Rim",   color:"#f97316"},
    mid:   {label:"Mid",   color:"#fbbf24"},
    three: {label:"3-Pt",  color:"#3b82f6"},
    dunk:  {label:"Dunk",  color:"#a855f7"},
  };

  // Fallback nur wenn WEDER leverageEff NOCH mindMetrics → wirklich keine Daten.
  // Tobias 2026-05-19: Phase 3 hat Intl-PBP-Mind (Euroleague + EuroCup) integriert,
  // aber Intl-Spieler haben kein leverageEff (Self-Creation kommt aus NCAA-Pipeline).
  // Tab muss daher rendern wenn mindMetrics existiert — auch ohne le.
  if (!le && !p.mindMetrics) {
    return (
      <div className="p-6">
        <div style={{background:"#111827",borderRadius:12,padding:24,textAlign:"center",color:"#6b7280"}}>
          <div style={{fontSize:18,marginBottom:8}}>🧠</div>
          <div style={{fontSize:14,fontWeight:600,color:"#9ca3af",marginBottom:8}}>Mind Tab — PBP Intelligence</div>
          <div style={{fontSize:13}}>
            {p.source === "intl"
              ? "Mind-Metrics not available — international PBP coverage starts 2017-18 (Euroleague/EuroCup only)."
              : "No play-by-play data for this player (pre-2008 or insufficient shot volume)."}
          </div>
        </div>
      </div>
    );
  }

  // Defensive destructure: `le` kann null sein (Intl-Spieler haben nur mindMetrics).
  const {lweFG, raweFG, diffPrem, score, premPctl, usgPctl, usg, ts, lwTotal, zones} = le ?? {};

  // Insight text based on score + diffPrem
  const getInsight = () => {
    if (score >= 80 && diffPrem > 0) return "Elite shot creator who maintains efficiency even on difficult, unassisted attempts. Rare trait — translates directly to NBA lead creator role.";
    if (score >= 80 && diffPrem > -2) return "Elite efficiency on self-created shots. High-volume self-creator who delivers. Projects as a primary or secondary offensive option.";
    if (score >= 60 && diffPrem > 0) return "Above-average creation efficiency with a positive difficulty premium. Shoots better when creating for himself — sign of real offensive skill.";
    if (score >= 60) return "Above-average creation efficiency. Production holds up well under self-creation load.";
    if (score >= 40 && diffPrem < -5) return "Average range, but efficiency drops notably on self-created shots. Better as an off-ball player who benefits from others' creation.";
    if (score >= 40) return "Average leverage efficiency. Capable self-creator without a clear edge.";
    if (diffPrem < -8) return "Significant drop in efficiency on self-created shots. Best used as a movement/spot-up player — needs creation support.";
    return "Below-average creation efficiency. Relies on teammates to generate open looks.";
  };

  return (
    <div className="p-4 flex flex-col gap-4">

      {/* Header */}
      <div style={{background:"#111827",borderRadius:12,padding:"12px 16px",borderLeft:"3px solid #f97316"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
          <span style={{fontSize:16}}>🧠</span>
          <span style={{fontSize:14,fontWeight:700,color:"#f97316",fontFamily:"Oswald, sans-serif",letterSpacing:1}}>MIND TAB — DECISION MAKING UNDER LOAD</span>
        </div>
        <div style={{fontSize:11,color:"#6b7280",lineHeight:1.5}}>
          How does this player handle <strong style={{color:"#9ca3af"}}>self-creation</strong>, <strong style={{color:"#9ca3af"}}>increased usage</strong>, and <strong style={{color:"#9ca3af"}}>adverse-event sequences</strong>?
          Quantitative tendencies — to be confirmed with film. Built on {Math.round(lwTotal || 0)} leverage-weighted attempts {p.mindMetrics ? `+ ${p.mindMetrics.n_actions||0} player-events` : ""} (BartTorvik 2008–2026 + ESPN PBP 2017–2026; Euroleague/EuroCup 2017–2026 for internationals).
        </div>
      </div>

      {/* Sample-size honesty (Tobias 2026-05-30): warn when PBP event-count
          is too small for confident reading. Threshold 200 events ≈ ~10–15 games. */}
      <PBPSampleWarning n={p.mindMetrics?.n_actions} threshold={200} unit="player-events"/>

      {/* ══════════════════════════════════════════════════════════════════
           Section 1: Self-Sufficiency Profile — 4-Step Decision Tree
         ══════════════════════════════════════════════════════════════════ */}
      {!le && p.mindMetrics && (
        <div style={{background:"#0d1117",border:"1px solid #1f2937",borderRadius:10,padding:"10px 14px"}}>
          <div style={{fontSize:11,color:"#9ca3af",lineHeight:1.5}}>
            <strong style={{color:"#f97316"}}>Note:</strong> Self-Creation metrics (rate, difficulty premium) use NCAA-only PBP data
            and are not available for international players. Pressure response + Mental Resilience below are computed
            from Euroleague + EuroCup PBP (2017–2026) where coverage exists.
          </div>
        </div>
      )}
      <Sec icon="⚡" title="Self-Sufficiency Profile"
        sub="Four sequential questions: How often does he have to create alone? How efficient is he when he does? Does it break down under pressure? And where on the floor does he succeed?">
        {(() => {
          // Self-Creation Rate (% of made FGs that were unassisted)
          const overallSelfPct = p.shotCreation?.overall?.selfPct ?? null;
          const totalFga = p.shotCreation?.overall?.fga ?? 0;

          // Step labels + colors
          const StepHeader = ({n, title, color, hint}) => (
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,marginTop:n>1?20:0}}>
              <div style={{
                background:color, color:"#000", borderRadius:"50%", width:28, height:28,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontWeight:700, fontFamily:"Oswald,sans-serif", fontSize:14, flexShrink:0,
              }}>{n}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:"#e5e7eb",letterSpacing:0.3}}>{title}</div>
                <div style={{fontSize:10,color:"#6b7280",marginTop:1}}>{hint}</div>
              </div>
            </div>
          );

          // Self-creation peer cohort: how does this player rank
          const selfCreationPctl = (() => {
            // Approximate position-aware peer comparison: D1 average self-creation ~45%
            // Top 10% > 60%, Top 25% > 52%, Median ~45%, Bottom 25% < 38%
            if (overallSelfPct == null) return null;
            if (overallSelfPct >= 65) return 95;
            if (overallSelfPct >= 60) return 90;
            if (overallSelfPct >= 55) return 80;
            if (overallSelfPct >= 50) return 65;
            if (overallSelfPct >= 45) return 50;
            if (overallSelfPct >= 40) return 35;
            if (overallSelfPct >= 35) return 20;
            return 10;
          })();
          const selfCreationLabel = (() => {
            if (overallSelfPct == null) return "—";
            if (overallSelfPct >= 60) return "Heavy self-creation load";
            if (overallSelfPct >= 50) return "Above-average self-creator";
            if (overallSelfPct >= 40) return "Balanced creator/finisher";
            if (overallSelfPct >= 30) return "Mostly off-ball / catch-and-shoot";
            return "Predominantly assisted finisher";
          })();

          // Verdict logic — combine signals
          const verdict = (() => {
            const heavy = overallSelfPct != null && overallSelfPct >= 50;
            const lite = overallSelfPct != null && overallSelfPct < 40;
            const efficientHard = diffPrem != null && diffPrem > -2;
            const inefficientHard = diffPrem != null && diffPrem < -8;
            const cltDrop = p.mindMetrics?.clutch_wp?.delta_efg != null && p.mindMetrics.clutch_wp.delta_efg < -8;
            const cltStrong = p.mindMetrics?.clutch_wp?.delta_efg != null && p.mindMetrics.clutch_wp.delta_efg > 5;
            const lateClockBad = p.mindMetrics?.late_clock?.delta_efg != null && p.mindMetrics.late_clock.delta_efg < -10;

            if (heavy && efficientHard && cltStrong) return {
              label: "Self-Sufficient Star Profile", color: "#22c55e",
              text: "Carries heavy self-creation load AND maintains efficiency under pressure. Rare — translates to NBA primary creator role with high confidence.",
            };
            if (heavy && efficientHard) return {
              label: "Self-Sufficient Scorer", color: "#86efac",
              text: "Heavy self-creation load with above-baseline efficiency. Profiles as an offensive engine — needs the ball to be at his best.",
            };
            if (heavy && inefficientHard) return {
              label: "High Volume / Low Efficiency", color: "#ef4444",
              text: "Forced to create alone often, but efficiency drops sharply on those attempts. Production looks high in box scores but is empty calories under pressure. Best deployed with more creator support.",
            };
            if (lite && cltStrong) return {
              label: "Off-Ball Clutch Performer", color: "#86efac",
              text: "Mostly off-ball player who elevates in high-leverage moments. Plug-and-play role player — not a primary creator.",
            };
            if (lite) return {
              label: "Off-Ball Beneficiary", color: "#fbbf24",
              text: "Production depends on creators feeding him open looks. Best in motion-offense or with elite playmakers — limited self-sufficiency.",
            };
            if (lateClockBad && cltDrop) return {
              label: "Pressure-Sensitive Creator", color: "#fb923c",
              text: "Adequate baseline efficiency, but production deteriorates under both shot-clock pressure AND clutch moments. Mental load is a real risk factor.",
            };
            return {
              label: "Balanced Creator", color: "#fbbf24",
              text: "Average self-creation with average efficiency. Versatile but no defining edge — fits a secondary role.",
            };
          })();

          return (
            <>
              {/* Tobias 2026-05-19: Steps 1+2 brauchen leverageEff (NCAA-PBP).
                  Intl-Spieler (kein le) skippen direkt zu Step 3 (Pressure). */}
              {le && <>
              {/* ── Step 1: HOW OFTEN does he need to create alone? ── */}
              <StepHeader n={1} title="HOW OFTEN does he create alone?"
                color="#fbbf24"
                hint={`Share of made field goals that were unassisted (= self-created). Total FGAs tracked: ${totalFga}.`}/>
              <div style={{background:"#0d1117",border:"1px solid #1f2937",borderRadius:8,padding:"14px 16px",marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",flexWrap:"wrap",gap:12}}>
                  <div>
                    <div style={{fontSize:36,fontWeight:700,color:"#fbbf24",fontFamily:"Oswald,sans-serif",lineHeight:1}}>
                      {overallSelfPct != null ? `${overallSelfPct.toFixed(0)}%` : "—"}
                    </div>
                    <div style={{fontSize:11,color:"#9ca3af",marginTop:4}}>
                      Self-creation rate · <span style={{color:"#fbbf24"}}>{selfCreationLabel}</span>
                    </div>
                  </div>
                  {selfCreationPctl != null && (
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:24,fontWeight:700,color:selfCreationPctl >= 75 ? "#22c55e" : selfCreationPctl >= 50 ? "#fbbf24" : "#9ca3af",fontFamily:"Oswald,sans-serif"}}>
                        {selfCreationPctl}<span style={{fontSize:14}}>th</span>
                      </div>
                      <div style={{fontSize:10,color:"#6b7280"}}>percentile vs D1 peers</div>
                    </div>
                  )}
                </div>
                {/* visual bar */}
                <div style={{marginTop:12,position:"relative",height:8,background:"#1f2937",borderRadius:4,overflow:"hidden"}}>
                  <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${Math.min(100, overallSelfPct||0)}%`,background:"linear-gradient(90deg,#fbbf2466,#fbbf24)",borderRadius:4}}/>
                  <div style={{position:"absolute",left:"45%",top:-2,bottom:-2,width:1,background:"#6b7280"}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#475569",marginTop:3}}>
                  <span>0%</span><span>D1 avg ~45%</span><span>100%</span>
                </div>
              </div>

              {/* ── Step 2: HOW EFFICIENT when self-creating? ── */}
              <StepHeader n={2} title="HOW EFFICIENT when he self-creates?"
                color="#f97316"
                hint="Efficiency on unassisted shots vs. assisted shots. Difficulty Premium = self-created eFG% − assisted eFG%."/>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:10,marginBottom:10}}>
                <div style={{background:"#0d1117",border:"1px solid #f9731633",borderRadius:8,padding:"12px 14px",textAlign:"center"}}>
                  <div style={{fontSize:24,fontWeight:700,color:"#f97316",fontFamily:"Oswald,sans-serif"}}>
                    {lweFG != null ? `${lweFG.toFixed(1)}%` : "—"}
                  </div>
                  <div style={{fontSize:11,fontWeight:600,color:"#e5e7eb",marginTop:2}}>Self-Created eFG%</div>
                  <div style={{fontSize:9,color:"#6b7280",marginTop:1}}>leverage-weighted</div>
                </div>
                <div style={{background:"#0d1117",border:"1px solid #60a5fa33",borderRadius:8,padding:"12px 14px",textAlign:"center"}}>
                  <div style={{fontSize:24,fontWeight:700,color:"#60a5fa",fontFamily:"Oswald,sans-serif"}}>
                    {raweFG != null ? `${raweFG.toFixed(1)}%` : "—"}
                  </div>
                  <div style={{fontSize:11,fontWeight:600,color:"#e5e7eb",marginTop:2}}>Assisted eFG%</div>
                  <div style={{fontSize:9,color:"#6b7280",marginTop:1}}>baseline (raw zone)</div>
                </div>
                <div style={{background:"#0d1117",border:`1px solid ${diffPrem>0?"#22c55e":diffPrem>-3?"#fbbf24":"#ef4444"}33`,borderRadius:8,padding:"12px 14px",textAlign:"center"}}>
                  <div style={{fontSize:24,fontWeight:700,color:diffPrem>0?"#22c55e":diffPrem>-3?"#fbbf24":"#ef4444",fontFamily:"Oswald,sans-serif"}}>
                    {diffPrem != null ? `${diffPrem >= 0 ? "+" : ""}${diffPrem.toFixed(1)}pp` : "—"}
                  </div>
                  <div style={{fontSize:11,fontWeight:600,color:"#e5e7eb",marginTop:2}}>Difficulty Premium</div>
                  <div style={{fontSize:9,color:"#6b7280",marginTop:1}}>self − assisted</div>
                </div>
              </div>
              <div style={{background:"#0d1117",borderRadius:8,padding:"10px 14px"}}>
                <DiffBar value={diffPrem}/>
              </div>
              </>}

              {/* ── Step 3: HOW DOES PRESSURE AFFECT this? ── */}
              {p.mindMetrics && (() => {
                const mm = p.mindMetrics;
                const cw = mm.clutch_wp || {};
                const lc = mm.late_clock || {};
                const ft = mm.ft || {};
                const PressureCard = ({title, sub, fga, efg, delta, type, minSample = 8}) => {
                  const lowSample = (fga || 0) < minSample;
                  const dColor =
                    delta == null   ? "#6b7280"
                    : delta >  3     ? "#22c55e"
                    : delta > -3     ? "#fbbf24"
                    : delta > -10    ? "#fb923c"
                    :                  "#ef4444";
                  const verdictText =
                    delta == null    ? "—"
                    : delta >  5     ? "performs better"
                    : delta >  0     ? "slightly better"
                    : delta > -3     ? "near baseline"
                    : delta > -10    ? "drop"
                    :                  "significant drop";
                  return (
                    <Tip wide content={
                      <div>
                        <div style={{fontWeight:700,color:dColor,marginBottom:4}}>{title}</div>
                        <div style={{color:"#cbd5e1",fontSize:11}}>{sub}</div>
                        <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>
                          Sample: {fga||0} {type === "ft" ? "FT" : "FG"} attempts ·{" "}
                          {fga != null && fga >= 8 ? "stable" : "limited (treat as directional)"}
                        </div>
                      </div>
                    }>
                      <div style={{background:"#0d1117",border:`1px solid ${dColor}33`,borderRadius:8,padding:"10px 12px",cursor:"help",opacity:lowSample?0.65:1}}>
                        <div style={{fontSize:10,fontWeight:600,color:"#9ca3af",marginBottom:6}}>{title}</div>
                        <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:4}}>
                          <span style={{fontSize:22,fontWeight:700,color:dColor,fontFamily:"Oswald,sans-serif"}}>
                            {delta != null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}pp` : "—"}
                          </span>
                          <span style={{fontSize:10,color:"#6b7280"}}>vs baseline</span>
                        </div>
                        <div style={{fontSize:9,color:"#475569",marginBottom:4}}>
                          {efg != null ? `eFG ${efg.toFixed(1)}% · n=${fga||0}` : "no data"}
                          {lowSample && fga > 0 && <span style={{color:"#fbbf24",marginLeft:4}}>· low sample</span>}
                        </div>
                        <div style={{fontSize:10,color:dColor,fontWeight:500}}>{verdictText}</div>
                      </div>
                    </Tip>
                  );
                };
                const hasAny = (cw.fga || lc.fga || (ft.clutch_fta||0) > 0);
                if (!hasAny) return null;
                return (
                  <>
                    <StepHeader n={3} title="HOW DOES PRESSURE affect efficiency?"
                      color="#fb923c"
                      hint={`PBP-derived splits from ${mm.season} — clutch (close late game), shot-clock pressure, and clutch free throws. ⚠ Reliability note: clutch-eFG splits barely repeat season-to-season (test-retest r≈0.02) — read as descriptive of this sample, not predictive. Clutch FT tracks FT%, which is far more stable (r≈0.50).`}/>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))",gap:10,marginBottom:6}}>
                      <PressureCard title="Close Late-Game (FG)"
                        sub="Win-prob 20–80% in 2nd half. Real high-leverage moments."
                        fga={cw.fga} efg={cw.efg} delta={cw.delta_efg} type="fg"/>
                      <PressureCard title="Late Shot Clock (FG)"
                        sub="Possession ≥22 secs in. Forced shots when offense couldn't get a clean look."
                        fga={lc.fga} efg={lc.efg} delta={lc.delta_efg} type="fg"/>
                      {ft.clutch_fta != null && ft.clutch_fta >= 5 && (
                        <PressureCard title="Clutch Free Throws"
                          sub="FT in last 5 min Half 2 with ≤5pt diff."
                          fga={ft.clutch_fta} efg={ft.clutch_pct} delta={ft.clutch_delta} type="ft" minSample={5}/>
                      )}
                    </div>
                    <div style={{fontSize:9,color:"#475569",marginTop:4,fontStyle:"italic"}}>
                      Cards with &lt;8 attempts are directional only — a single make/miss can shift eFG dramatically.
                    </div>
                  </>
                );
              })()}

              {/* ── Step 4: WHERE does he succeed (zone breakdown)? ── */}
              {zones && Object.keys(zones).length > 0 && (
                <>
                  <StepHeader n={4} title="WHERE does he succeed (which zones)?"
                    color="#06b6d4"
                    hint="Per-zone shooting profile: how efficient he is, how often he creates the look himself, and how often a teammate sets him up. Elite zones combine high eFG with high Self%."/>
                  {/* Tobias 2026-05-09: bigger + cleaner zone-breakdown layout (2-row card per zone) */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:10}}>
                    {["rim","mid","three","dunk"].map(z => {
                      const cfg = ZONE_CONFIG[z];
                      const zd = zones[z];
                      if (!zd) return null;
                      const ZONE_AVG_LOCAL = {
                        rim:   {eFG: 62.5, selfPct: 42},
                        mid:   {eFG: 40.2, selfPct: 58},
                        three: {eFG: 51.8, selfPct: 38},
                        dunk:  {eFG: 76.0, selfPct: 22},
                      };
                      const avg = ZONE_AVG_LOCAL[z] || {};
                      const efgDelta = avg.eFG ? zd.eFG - avg.eFG : null;
                      const efgColor = zd.eFG >= 65 ? "#22c55e" : zd.eFG >= 55 ? "#86efac" : zd.eFG >= 45 ? "#fbbf24" : "#ef4444";
                      const selfPct = zd.selfPct ?? 0;
                      const asstPct = 100 - selfPct;
                      const elite = (zd.eFG > (avg.eFG||50) && selfPct > 50);
                      return (
                        <div key={z} style={{background:"#0d1117",border:`1px solid ${cfg.color}33`,borderRadius:8,padding:"12px 14px"}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <div style={{width:10,height:10,borderRadius:"50%",background:cfg.color}}/>
                              <span style={{fontSize:14,fontWeight:700,color:"#e5e7eb",fontFamily:"Oswald,sans-serif"}}>{cfg.label}</span>
                            </div>
                            <span style={{fontSize:11,color:"#6b7280"}}>{zd.fga} FGA</span>
                          </div>
                          {/* eFG% — big number + delta vs D1 avg */}
                          <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:4}}>
                            <span style={{fontSize:24,fontWeight:700,color:efgColor,fontFamily:"Oswald,sans-serif"}}>
                              {zd.eFG?.toFixed(1)}%
                            </span>
                            <span style={{fontSize:11,color:"#6b7280"}}>eFG%</span>
                            {efgDelta != null && (
                              <span style={{fontSize:11,marginLeft:"auto",color:efgDelta > 0 ? "#22c55e" : "#ef4444"}}>
                                {efgDelta > 0 ? "+" : ""}{efgDelta.toFixed(1)} vs D1 avg
                              </span>
                            )}
                          </div>
                          {/* Self vs Assisted bars */}
                          <div style={{marginTop:8}}>
                            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#9ca3af",marginBottom:3}}>
                              <span style={{color:"#f97316"}}>Self-Created</span>
                              <span style={{color:"#60a5fa"}}>Assisted</span>
                            </div>
                            <div style={{position:"relative",height:8,background:"#1f2937",borderRadius:4,overflow:"hidden"}}>
                              <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${selfPct}%`,background:"#f97316cc"}}/>
                              <div style={{position:"absolute",right:0,top:0,bottom:0,width:`${asstPct}%`,background:"#60a5facc"}}/>
                            </div>
                            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,fontWeight:600,marginTop:3}}>
                              <span style={{color:"#f97316"}}>{selfPct?.toFixed(0)}%</span>
                              <span style={{color:"#6b7280",fontSize:9}}>D1 avg: {avg.selfPct}% / {100 - (avg.selfPct||0)}%</span>
                              <span style={{color:"#60a5fa"}}>{asstPct?.toFixed(0)}%</span>
                            </div>
                          </div>
                          {elite && (
                            <div style={{marginTop:8,padding:"4px 8px",background:"#22c55e15",border:"1px solid #22c55e44",borderRadius:4,fontSize:10,color:"#22c55e",fontWeight:600,textAlign:"center"}}>
                              ✦ Elite zone — above-avg eFG with high self-creation
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* ── Verdict ── (Tobias 2026-05-19: nur wenn le verfügbar — Verdict
                  basiert auf Steps 1+2 die für Intl-Spieler ohne NCAA-PBP nicht
                  berechnet werden können) */}
              {le && (
              <div style={{marginTop:24,background:`${verdict.color}15`,border:`2px solid ${verdict.color}55`,borderRadius:10,padding:"14px 16px"}}>
                <div style={{fontSize:10,fontWeight:700,color:verdict.color,letterSpacing:1.2,marginBottom:6}}>VERDICT — SELF-SUFFICIENCY</div>
                <div style={{fontSize:18,fontWeight:700,color:verdict.color,fontFamily:"Oswald,sans-serif",marginBottom:6,letterSpacing:0.3}}>
                  {verdict.label}
                </div>
                <div style={{fontSize:12,color:"#cbd5e1",lineHeight:1.6}}>{verdict.text}</div>
                <div style={{marginTop:10,padding:"7px 10px",background:"#0a0e17",borderRadius:5,fontSize:10,color:"#475569",lineHeight:1.6,fontStyle:"italic"}}>
                  Verdict combines: self-creation load (Step 1) × difficulty premium (Step 2) × pressure response (Step 3). Quantitative starting point — confirm with film before drawing conclusions.
                </div>
              </div>
              )}
            </>
          );
        })()}

      </Sec>

      {/* Tobias 2026-06-03 v11: Usage Reaction removed — see backlog Task #19 */}

      {/* ══════════════════════════════════════════════════════════════════
           Section: MENTAL RESILIENCE  (Tobias 2026-05-09)
           PBP-basierte Reaktionsmuster nach Schlechtphasen.
           Datenquelle: mindMetrics-Block (inject_mind_metrics.py).
           Streak = 3 von 4 letzten Player-Actions sind missed/TO/foul/missed-FT.
           Z-Score gegen Position-Peers + 95%-CI für Punkt-Schätzer.
         ══════════════════════════════════════════════════════════════════ */}
      {p.mindMetrics && (() => {
        const mm = p.mindMetrics;
        const limited = mm.limited_sample;
        const nStreaks = mm.n_streaks || 0;

        // Tobias 2026-05-09: Bayesian-Shrinkage zur Position-Population.
        // Bei kleinen Sample-Sizes (n_streaks niedrig) wird der raw-Index zur
        // Population-Mean (=1.0) geshrunken — verhindert overinterpretation
        // von Punkt-Schätzern bei niedriger Konfidenz.
        //
        // posterior = (n × raw + n_prior × pop_mean) / (n + n_prior)
        // Mit pop_mean = 1.0 und n_prior = 30 (entspricht "30 typical streaks worth of prior")
        // Bei n=15 → raw bekommt 33% Gewicht, prior 67%
        // Bei n=60 → raw bekommt 67%, prior 33%
        const N_PRIOR = 30;
        const POP_MEAN = 1.0;
        const shrink = (raw) => {
          if (raw == null) return null;
          return (nStreaks * raw + N_PRIOR * POP_MEAN) / (nStreaks + N_PRIOR);
        };
        // Z-Scores werden ähnlich geshrunken (zur 0)
        const shrinkZ = (rawZ) => {
          if (rawZ == null) return null;
          return (nStreaks * rawZ) / (nStreaks + N_PRIOR);
        };

        // Tendency-Bar mit Z-Score-Visualisierung + CI-Spannweite + Bayesian-Shrinkage
        // type: "neutral" → high oder low können beide Bedeutung haben
        // type: "adverse" → high = bad (mehr TOs/Fouls)
        // type: "positive" → high = good (Bounceback eFG)
        const TendBar = ({label, sub, m, type, hint, reli}) => {
          const rel = reliTier(reli);
          if (!m || m.idx == null) return (
            <div style={{background:"#0d1117",border:"1px solid #1f2937",borderRadius:8,padding:"10px 12px",opacity:0.5}}>
              <div style={{fontSize:11,fontWeight:600,color:"#6b7280"}}>{label}</div>
              <div style={{fontSize:10,color:"#4b5563",marginTop:4}}>insufficient data</div>
            </div>
          );
          // Use shrunken values for display, raw for tooltip
          const idx_raw = m.idx;
          const z_raw = m.z;
          const idx = shrink(idx_raw);    // Bayesian-shrunken display value
          const z = shrinkZ(z_raw);
          const lo = m.lo, hi = m.hi;
          // CI excludes 1.0 = statistically significant deviation from baseline
          const sigDev = (lo != null && hi != null && (lo > 1.0 || hi < 1.0));
          // Color logic: based on type + z (or fallback to idx if no z)
          let barColor = "#9ca3af";
          let pillColor = "#6b7280";
          let verdict = "near baseline";
          const zEff = z != null ? z : (idx > 1.0 ? 0.5 : idx < 1.0 ? -0.5 : 0);
          if (type === "adverse") {
            if (zEff >= 1.5)      { barColor = "#ef4444"; pillColor = "#ef4444"; verdict = "much more under stress"; }
            else if (zEff >= 0.5) { barColor = "#fbbf24"; pillColor = "#fbbf24"; verdict = "slightly more under stress"; }
            else if (zEff <= -1.5){ barColor = "#22c55e"; pillColor = "#22c55e"; verdict = "much less under stress"; }
            else if (zEff <= -0.5){ barColor = "#86efac"; pillColor = "#86efac"; verdict = "slightly less under stress"; }
          } else if (type === "positive") {
            if (zEff >= 1.5)      { barColor = "#22c55e"; pillColor = "#22c55e"; verdict = "much better under stress"; }
            else if (zEff >= 0.5) { barColor = "#86efac"; pillColor = "#86efac"; verdict = "slightly better"; }
            else if (zEff <= -1.5){ barColor = "#ef4444"; pillColor = "#ef4444"; verdict = "much worse under stress"; }
            else if (zEff <= -0.5){ barColor = "#fbbf24"; pillColor = "#fbbf24"; verdict = "slightly worse"; }
          } else {
            if (Math.abs(zEff) >= 1.5)      { barColor = "#f97316"; pillColor = "#f97316"; verdict = "notable deviation"; }
            else if (Math.abs(zEff) >= 0.5) { barColor = "#fdba74"; pillColor = "#9ca3af"; verdict = "some tendency"; }
          }

          // Map z to bar position [-2.5σ, +2.5σ] → [0%, 100%]
          const zClamp = Math.max(-2.5, Math.min(2.5, zEff));
          const zPos   = ((zClamp + 2.5) / 5) * 100;
          // CI position (only if available + we have z to anchor):
          // Approximation: use ratio idx/lo and idx/hi mapped relative to z
          // (Wald CI is on log-scale so we estimate width via ratio of CI bounds)
          let ciLeft = null, ciWidth = null;
          if (lo != null && hi != null && idx != null && idx > 0) {
            // log-ratio half-width
            const halfHi = Math.log(hi / idx);
            const halfLo = Math.log(idx / lo);
            // approximate translation to z-units (rough, but visual)
            // assume idx is centered around population mean ~1.0; CI extent in σ ≈ log-CI / 0.3
            const sdEst = 0.3;
            const ciLoZ = Math.max(-2.5, zEff - halfLo / sdEst);
            const ciHiZ = Math.min(2.5,  zEff + halfHi / sdEst);
            ciLeft  = ((ciLoZ + 2.5) / 5) * 100;
            ciWidth = ((ciHiZ - ciLoZ) / 5) * 100;
          }

          return (
            <Tip wide content={
              <div>
                <div style={{fontWeight:700,color:barColor,marginBottom:4}}>{label}</div>
                <div style={{color:"#cbd5e1",fontSize:11,marginBottom:6}}>{hint}</div>
                <div style={{fontSize:11,color:"#94a3b8"}}>
                  Index = post-streak rate ÷ baseline rate. <span style={{color:barColor,fontWeight:600}}>1.0 = no change</span>.
                </div>
                <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>
                  Shrunken (display): <code style={{color:"#7dd3fc"}}>{idx?.toFixed(2)}</code>
                  {z != null && <> · z = <code style={{color:"#7dd3fc"}}>{z>=0?"+":""}{z.toFixed(2)}σ</code></>} <span style={{color:"#475569"}}>(vs {mm.pos_group||"position"} peers)</span>
                </div>
                <div style={{fontSize:11,color:"#475569",marginTop:2}}>
                  Raw point estimate: <code style={{color:"#94a3b8"}}>{idx_raw?.toFixed(2)}</code>
                  {z_raw != null && <> · raw z = <code style={{color:"#94a3b8"}}>{z_raw>=0?"+":""}{z_raw.toFixed(2)}σ</code></>}
                  {(lo != null && hi != null) && <> · 95% CI [<code style={{color:"#94a3b8"}}>{lo?.toFixed(2)}, {hi?.toFixed(2)}</code>]</>}
                </div>
                <div style={{fontSize:10,color:"#475569",marginTop:4,fontStyle:"italic"}}>
                  Bayesian-Shrinkage: posterior = (n × raw + 30 × 1.0) / (n + 30) with n={nStreaks} streaks. Display shrinks to population mean when sample is small.
                </div>
                <div style={{fontSize:10,marginTop:6,padding:"4px 6px",borderRadius:4,color:rel.color,background:`${rel.color}14`}}>
                  <strong>Reliability {rel.label}{reli!=null?` (test-retest r≈${reli.toFixed(2)})`:""}:</strong> {rel.txt}. For reference, FT% reliability ≈ 0.50 (a real, stable skill).
                </div>
                {sigDev && <div style={{fontSize:11,color:"#fbbf24",marginTop:4}}>⚠ CI excludes 1.0 — statistically significant deviation from baseline.</div>}
              </div>
            }>
              <div style={{background:"#0d1117",border:`1px solid ${barColor}33`,borderRadius:8,padding:"10px 12px",cursor:"help"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:"#e5e7eb"}}>{label}</div>
                    <div style={{fontSize:9,color:"#6b7280",marginTop:1}}>{sub}</div>
                    <div style={{display:"inline-block",fontSize:8,fontWeight:700,letterSpacing:0.3,marginTop:3,padding:"1px 5px",borderRadius:3,color:rel.color,background:`${rel.color}1a`,border:`1px solid ${rel.color}55`}}>
                      RELIABILITY: {rel.label}{reli!=null?` · r≈${reli.toFixed(2)}`:""}
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                    <span style={{fontSize:18,fontWeight:700,color:barColor,fontFamily:"Oswald,sans-serif"}}>
                      {z != null ? `${z>=0?"+":""}${z.toFixed(1)}σ` : `×${idx?.toFixed(2)}`}
                    </span>
                    <span style={{fontSize:9,color:"#475569"}}>
                      ({idx?.toFixed(2)}×)
                    </span>
                  </div>
                </div>
                {/* Z-score scale: -2.5σ → 0 → +2.5σ */}
                <div style={{position:"relative",height:14,background:"#1f2937",borderRadius:4,overflow:"hidden"}}>
                  {/* Center marker (z=0) */}
                  <div style={{position:"absolute",left:"50%",top:0,bottom:0,width:1,background:"#374151"}}/>
                  {/* CI band (visual) */}
                  {ciLeft != null && (
                    <div style={{position:"absolute",left:`${ciLeft}%`,top:3,bottom:3,width:`${ciWidth}%`,background:`${barColor}33`,borderRadius:2}}/>
                  )}
                  {/* Z marker */}
                  <div style={{position:"absolute",left:`${zPos}%`,top:0,bottom:0,width:3,marginLeft:-1.5,background:barColor,borderRadius:1,boxShadow:`0 0 4px ${barColor}88`}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:"#475569",marginTop:3}}>
                  <span>−2σ</span><span>0</span><span>+2σ</span>
                </div>
                <div style={{fontSize:10,color:pillColor,marginTop:6,fontWeight:500}}>
                  {sigDev && <span style={{color:"#fbbf24",marginRight:4}}>⚠</span>}
                  {verdict}
                </div>
              </div>
            </Tip>
          );
        };

        // Tobias 2026-05-09: Stamina als Pseudo-m-Object aus h2/h1 adverse-rate-ratio.
        // Verwendet "adverse" type → niedrig ist gut (weniger adverse events in H2 = stamina-stark)
        const staminaM = mm.stamina_idx != null ? {
          idx: mm.stamina_idx,
          // No CI from spike-script (would need bootstrap), so leave lo/hi null
          z: null,  // No z-score for stamina (population-mean ~1.0, raw idx is interpretable)
        } : null;

        // Profile-Headline based on z-scores (only "auffällig" if |z| > 1.5 OR CI excludes 1.0)
        const auffaellig = [];
        // ── Signal reliability (test-retest r, season n → n+1, measured on 5,390 player-pairs with ≥25 streaks) ──
        // Honest usability label per metric. r≈0 = describes THIS sample only, does NOT replicate next season
        // (i.e. not a stable trait → don't project it forward). Reference: FT% test-retest r≈0.50 (a real skill).
        const reliTier = (r) =>
            r == null      ? {label:"n/a",      color:"#6b7280", txt:"not validated"}
          : r >= 0.40      ? {label:"High",     color:"#22c55e", txt:"replicates season-to-season — usable as a trait"}
          : r >= 0.20      ? {label:"Moderate", color:"#84cc16", txt:"partly replicates — directional"}
          : r >= 0.10      ? {label:"Low",      color:"#fbbf24", txt:"weak season-to-season signal — caution"}
          :                  {label:"Very Low", color:"#ef4444", txt:"≈ noise — does NOT replicate next season; descriptive only"};
        const cards = [
          {key:"hothead",    m:mm.hothead,    type:"adverse",  reli:0.02, label:"Hothead",         sub:"more fouls under stress",       hint:"After multi-event slumps: does PF-Rate spike vs. baseline? High = frustration tells in fouls."},
          {key:"overdriver", m:mm.overdriver, type:"adverse",  reli:0.04, label:"Overdriver",      sub:"more TOs under stress",         hint:"After multi-event slumps: does TO-Rate spike vs. baseline? High = forces plays when frustrated."},
          {key:"passive",    m:mm.passive,    type:"neutral",  reli:0.03, label:"Engagement",      sub:"actions taken under stress",    hint:"After multi-event slumps: how many actions does he take in the next 4 plays vs. expected? Low = withdraws / checks out."},
          {key:"aggressor",  m:mm.aggressor,  type:"neutral",  reli:0.05, label:"Shot-Seeking",    sub:"more shots under stress",       hint:"After multi-event slumps: does FGA-Rate spike (force shots) or fall (fade away)? Both extremes can be tells."},
          {key:"bounceback", m:mm.bounceback, type:"positive", reli:0.04, label:"Bounceback eFG",  sub:"shooting recovers under stress",hint:"After multi-event slumps: does eFG% on subsequent shots recover? High = clutch shot-making mentality."},
          {key:"stamina",    m:staminaM,      type:"adverse",  reli:0.07, label:"Match Stamina",   sub:"adverse rate H2 vs H1",         hint:"Half-2 vs Half-1 adverse-event rate. >1 = gets worse in the 2nd half (conditioning / mental fatigue). <1 = stays stable or improves."},
        ];
        for (const c of cards) {
          if (!c.m || c.m.idx == null) continue;
          const sig = (c.m.lo != null && c.m.hi != null && (c.m.lo > 1.0 || c.m.hi < 1.0));
          const big = (c.m.z != null && Math.abs(c.m.z) >= 1.5);
          if (sig || big) auffaellig.push({...c, z: c.m.z});
        }

        let profileLine = "No statistically significant pattern stands out — this player's stress responses look near-typical for his position peers.";
        if (auffaellig.length > 0) {
          // Sort by absolute z descending
          auffaellig.sort((a,b) => Math.abs(b.z||0) - Math.abs(a.z||0));
          const top = auffaellig[0];
          const dirText =
            top.key === "hothead"    ? (top.z > 0 ? "fouls more after setbacks (frustration tell)" : "stays composed — fouls less than peers")
          : top.key === "overdriver" ? (top.z > 0 ? "forces plays — TOs spike after setbacks" : "highly disciplined — TOs stay flat or drop")
          : top.key === "passive"    ? (top.z < 0 ? "withdraws after setbacks (engagement drops)" : "leans into the game more after setbacks")
          : top.key === "aggressor"  ? (top.z > 0 ? "becomes shot-seeker after setbacks" : "takes fewer shots after setbacks (more cautious)")
          : top.key === "bounceback" ? (top.z > 0 ? "shooting efficiency rises under stress" : "shooting efficiency drops under stress")
          : "";
          profileLine = `Notable tendency: ${dirText}.`;
          if (auffaellig.length > 1) {
            profileLine += ` (${auffaellig.length-1} additional pattern${auffaellig.length>2?"s":""} also flagged.)`;
          }
        }

        return (
          <Sec icon="🧠" title="Mental Resilience"
            sub={`Behavioral tendencies after adverse-event streaks (n=${mm.n_streaks||0} streaks observed in ${mm.season} season). Within-position z-scores vs ${mm.pos_group||"peers"}.`}>
            {/* Disclaimer banner — ALWAYS visible — with detailed methodology tooltip */}
            <Tip wide content={
              <div style={{maxWidth:480,fontSize:11,lineHeight:1.6}}>
                <div style={{fontWeight:700,color:"#7dd3fc",marginBottom:6}}>STREAK DETECTION DETAIL</div>
                <div style={{color:"#cbd5e1",marginBottom:6}}>
                  Adverse events: <strong>missed FG, turnover, personal foul committed, missed FT (trip).</strong> Free-throw trips are aggregated — a 1/2 FT counts as one missed-FT event, not two.
                </div>
                <div style={{color:"#cbd5e1",marginBottom:6}}>
                  Trigger: <strong>≥3 adverse events in last 4 player-actions.</strong> Once triggered, the next 4 player-actions are the "response window". State-based cooldown ends when player has 2 consecutive non-adverse events.
                </div>
                <div style={{color:"#cbd5e1",marginBottom:6}}>
                  Per-game scope: streaks are detected within games (mental reset between games).
                </div>
                <div style={{color:"#cbd5e1"}}>
                  <strong style={{color:"#fbbf24"}}>Bayesian-Shrinkage:</strong> raw indices are shrunken to position-mean (1.0) when sample is small. Formula: <code>posterior = (n × raw + 30 × 1.0) / (n + 30)</code>. Display values are shrunken; raw values shown in tooltips.
                </div>
              </div>
            }>
              <div style={{background:"#1e3a5f22",border:"1px solid #1e3a5f",borderRadius:8,padding:"10px 12px",marginBottom:14,cursor:"help"}}>
                <div style={{fontSize:11,color:"#7dd3fc",fontWeight:600,marginBottom:4}}>📋 How to read this section <span style={{color:"#475569",fontWeight:400}}>(hover for streak-detection details)</span></div>
                <div style={{fontSize:11,color:"#cbd5e1",lineHeight:1.6}}>
                  These are <strong>behavioral tendencies observed in play-by-play data</strong>, not deterministic claims. A "streak" is defined as ≥3 adverse events (missed FG, turnover, foul, missed FT) in a player's last 4 actions; we then track how he behaves in his next 4 actions.
                  Patterns shown here are <strong style={{color:"#fbbf24"}}>quantitative starting points for film review</strong> — confirm with tape before drawing conclusions. Causal interpretation requires controlling for game-state, coach-reactions, and matchup — which we don't.
                </div>
                <div style={{fontSize:11,color:"#fca5a5",lineHeight:1.6,marginTop:8,paddingTop:8,borderTop:"1px solid #1e3a5f"}}>
                  <strong style={{color:"#ef4444"}}>⚠ Signal reliability (read this):</strong> we measured how well each index repeats season-to-season for players with 2+ seasons (test-retest correlation). The streak-response indices score <strong>r ≈ 0.02–0.07 — essentially zero</strong>: a player flagged this season is close to random next season. Treat them as <strong>descriptive of this sample, not as a predictive trait</strong> — do not project them forward. For reference, FT% reliability is <strong>r ≈ 0.50</strong> (a genuinely stable skill). Each card carries its own reliability tag.
                </div>
              </div>
            </Tip>

            {/* Limited sample warning */}
            {limited && (
              <div style={{background:"#7f1d1d33",border:"1px solid #7f1d1d",borderRadius:6,padding:"8px 10px",marginBottom:12,fontSize:11,color:"#fca5a5"}}>
                ⚠ <strong>Limited sample:</strong> only {mm.n_streaks} streaks observed (need ≥25 for reliable patterns). Treat all values as directional only.
              </div>
            )}

            {/* Headline verdict */}
            <div style={{background:"#0d1117",border:"1px solid #1f2937",borderRadius:8,padding:"10px 14px",marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:"#6b7280",letterSpacing:1,marginBottom:4}}>HEADLINE PATTERN</div>
              <div style={{fontSize:13,color:"#e5e7eb",lineHeight:1.5}}>{profileLine}</div>
            </div>

            {/* 5 Tendency Bars */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:10,marginBottom:12}}>
              {cards.map(c => <TendBar key={c.key} {...c}/>)}
            </div>

            {/* Match-Phase-Drift (Tobias 2026-05-09): zeigt ob Mental-Stamina nachlässt
                in der 2. Hälfte. Nur sichtbar wenn beide Hälften ausreichend Streaks haben. */}
            {mm.h1_streaks >= 5 && mm.h2_streaks >= 5 && (mm.overdriver_drift != null || mm.hothead_drift != null || mm.stamina_idx != null) && (
              <div style={{background:"#1a1f2e",border:"1px solid #1e3a5f",borderRadius:8,padding:"10px 14px",marginBottom:12}}>
                <div style={{fontSize:10,fontWeight:700,color:"#7dd3fc",letterSpacing:1.2,marginBottom:8}}>
                  ⏱ MATCH-PHASE DRIFT — does mental load deteriorate in 2nd half?
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))",gap:10}}>
                  {mm.stamina_idx != null && (() => {
                    const s = mm.stamina_idx;
                    const c = s > 1.15 ? "#ef4444" : s > 1.05 ? "#fb923c" : s > 0.95 ? "#fbbf24" : "#22c55e";
                    const label = s > 1.15 ? "noticeable adverse-event spike late"
                                : s > 1.05 ? "slight late-game increase"
                                : s > 0.95 ? "stable across halves"
                                : "actually improves late";
                    return (
                      <Tip wide content={<div style={{fontSize:11}}>
                        <strong>Adverse-Rate-Drift</strong>: ratio of (h2 adverse-events / h2 actions) ÷ (h1 adverse-events / h1 actions).
                        Sample: H1={mm.h1_actions} actions, H2={mm.h2_actions} actions.
                        <br/>&gt;1.0 = MORE adverse events per action in 2nd half (mental fatigue tell).
                      </div>}>
                        <div style={{background:"#0d1117",border:`1px solid ${c}33`,borderRadius:6,padding:"8px 10px",cursor:"help"}}>
                          <div style={{fontSize:9,color:"#9ca3af",marginBottom:3}}>Adverse Rate Drift</div>
                          <div style={{fontSize:18,fontWeight:700,color:c,fontFamily:"Oswald,sans-serif"}}>{s.toFixed(2)}×</div>
                          <div style={{fontSize:10,color:c,marginTop:2}}>{label}</div>
                        </div>
                      </Tip>
                    );
                  })()}
                  {mm.overdriver_drift != null && (() => {
                    const d = mm.overdriver_drift;
                    const c = d > 1.3 ? "#ef4444" : d > 1.05 ? "#fb923c" : d < 0.85 ? "#22c55e" : "#fbbf24";
                    const label = d > 1.3 ? "TO-spike under late-game pressure"
                                : d > 1.05 ? "slight late-game TO increase"
                                : d < 0.85 ? "TO-discipline improves late"
                                : "stable TO-control";
                    return (
                      <Tip wide content={<div style={{fontSize:11}}>
                        <strong>Overdriver Drift</strong>: H2-Overdriver-Index ÷ H1-Overdriver-Index.
                        H1 streaks: {mm.h1_streaks||0}, H2 streaks: {mm.h2_streaks||0}.
                        <br/>&gt;1.0 = bigger TO-spike in 2nd half streaks vs 1st half streaks.
                      </div>}>
                        <div style={{background:"#0d1117",border:`1px solid ${c}33`,borderRadius:6,padding:"8px 10px",cursor:"help"}}>
                          <div style={{fontSize:9,color:"#9ca3af",marginBottom:3}}>Overdriver Drift (H2/H1)</div>
                          <div style={{fontSize:18,fontWeight:700,color:c,fontFamily:"Oswald,sans-serif"}}>{d.toFixed(2)}×</div>
                          <div style={{fontSize:10,color:c,marginTop:2}}>{label}</div>
                        </div>
                      </Tip>
                    );
                  })()}
                  {mm.hothead_drift != null && (() => {
                    const d = mm.hothead_drift;
                    const c = d > 1.3 ? "#ef4444" : d > 1.05 ? "#fb923c" : d < 0.85 ? "#22c55e" : "#fbbf24";
                    const label = d > 1.3 ? "foul-spike when frustrated late"
                                : d > 1.05 ? "slight late-game foul increase"
                                : d < 0.85 ? "foul-discipline improves late"
                                : "stable foul-control";
                    return (
                      <Tip wide content={<div style={{fontSize:11}}>
                        <strong>Hothead Drift</strong>: H2-Hothead-Index ÷ H1-Hothead-Index. Big drift = late-game frustration tells.
                      </div>}>
                        <div style={{background:"#0d1117",border:`1px solid ${c}33`,borderRadius:6,padding:"8px 10px",cursor:"help"}}>
                          <div style={{fontSize:9,color:"#9ca3af",marginBottom:3}}>Hothead Drift (H2/H1)</div>
                          <div style={{fontSize:18,fontWeight:700,color:c,fontFamily:"Oswald,sans-serif"}}>{d.toFixed(2)}×</div>
                          <div style={{fontSize:10,color:c,marginTop:2}}>{label}</div>
                        </div>
                      </Tip>
                    );
                  })()}
                </div>
                <div style={{fontSize:9,color:"#475569",marginTop:8,fontStyle:"italic"}}>
                  Match-Phase-Drift compares mental signals between 1st half and 2nd half. Helpful for spotting conditioning or focus drop-off — but interpret cautiously: per-half streak samples are smaller.
                </div>
              </div>
            )}

            {/* Sample size + sensitivity context */}
            <div style={{background:"#0d1117",borderRadius:6,padding:"8px 12px",fontSize:10,color:"#6b7280",lineHeight:1.6}}>
              <span style={{color:"#9ca3af",fontWeight:600}}>Sample:</span> {mm.n_streaks||0} streaks · {mm.n_actions||0} non-cooldown player-events ·{" "}
              <span style={{color:"#9ca3af",fontWeight:600}}>Definition:</span> ≥3 adverse events in 4-action window, response measured over next 4 actions, state-based cooldown.{" "}
              <span style={{color:"#9ca3af",fontWeight:600}}>Caveats:</span> ratios noisy at single-season scale (95% CIs are typically wide); ~88-95% of the league has CIs that include 1.0 (= no detectable effect). Trust extreme z-scores (|z|&gt;1.5) and CIs that exclude 1.0.
            </div>
          </Sec>
        );
      })()}

      {/* ── Sequential Resilience entfernt 2026-05-09 (User: Mental Resilience deckt das ab) ── */}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: DEVELOPMENT TRAJECTORY
// Season-by-Season table + Class Scatter + In-Season DevTrajectory
// ═══════════════════════════════════════════════════════════
function DevTrajectoryTab({p}) {
  if (!p) return null;

  const [slMetric, setSlMetric] = useState("bpm");

  // ── SEASON LINE CHART ─────────────────────────────────────
  // Shows how a key stat evolved season over season (uses p.seasonLines)
  const SeasonLineChart = () => {
    const SL_METRICS = {
      pts: {label:"PTS",  color:"#f97316", getter:s=>s.pts,  unit:"",  desc:"Points per game"},
      reb: {label:"REB",  color:"#a78bfa", getter:s=>s.reb,  unit:"",  desc:"Rebounds per game"},
      ast: {label:"AST",  color:"#34d399", getter:s=>s.ast,  unit:"",  desc:"Assists per game"},
      ts:  {label:"TS%",  color:"#60a5fa", getter:s=>s.ts,   unit:"%", desc:"True Shooting %"},
      bpm: {label:"BPM",  color:"#22c55e", getter:s=>s.bpm,  unit:"",  desc:"Box Plus/Minus — best single-number value proxy"},
      usg: {label:"USG%", color:"#fbbf24", getter:s=>s.usg,  unit:"%", desc:"Usage rate — offensive load"},
    };
    const lines = (p.seasonLines || []).filter(s => s.yr && (s.gp == null || s.gp >= 8));
    if (lines.length < 2) return null;

    const m = SL_METRICS[slMetric] || SL_METRICS.bpm;
    const vals = lines.map(s => m.getter(s)).filter(v => v != null && isFinite(v));
    if (vals.length < 2) return null;

    const W=480, H=170, PAD={l:44,r:18,t:24,b:34};
    const IW=W-PAD.l-PAD.r, IH=H-PAD.t-PAD.b;
    const pad = m.unit==="%" ? 3 : 0.8;
    const minY = Math.min(...vals) - pad;
    const maxY = Math.max(...vals) + pad;
    const span = maxY - minY || 1;

    const xS = (i) => PAD.l + (lines.length > 1 ? i/(lines.length-1)*IW : IW/2);
    const yS = (v) => PAD.t + IH - ((v - minY)/span)*IH;

    // OLS trend
    const validIdx = lines.map((s,i)=>({i,v:m.getter(s)})).filter(d=>d.v!=null&&isFinite(d.v));
    const xm = validIdx.reduce((s,d)=>s+d.i,0)/validIdx.length;
    const ym = validIdx.reduce((s,d)=>s+d.v,0)/validIdx.length;
    const slope = validIdx.reduce((s,d)=>s+(d.i-xm)*(d.v-ym),0) / (validIdx.reduce((s,d)=>s+(d.i-xm)**2,0)||1);
    const intercept = ym - slope*xm;
    const trendPosY = slope > 0.05 ? "#22c55e" : slope < -0.05 ? "#ef4444" : "#fbbf24";

    // Y-axis ticks: 3 values
    const yTicks = [minY+pad*0.5, (minY+maxY)/2, maxY-pad*0.5].map(v => parseFloat(v.toFixed(1)));

    const polyPts = lines
      .map((s,i)=>{const v=m.getter(s); return v!=null&&isFinite(v)?`${xS(i).toFixed(1)},${yS(v).toFixed(1)}`:null;})
      .filter(Boolean).join(" ");

    return (
      <Sec icon="📊" title="Season Progression"
        sub={`${m.desc} — season over season. Orange = most recent season. Only seasons with meaningful playing time shown.`}>
        <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
          {Object.entries(SL_METRICS).map(([k,mm])=>(
            <button key={k} onClick={()=>setSlMetric(k)} style={{
              fontSize:10,padding:"3px 9px",borderRadius:5,border:"none",cursor:"pointer",
              background:slMetric===k ? mm.color : "#1f2937",
              color:slMetric===k ? "#000" : "#9ca3af", fontWeight:600}}>
              {mm.label}
            </button>
          ))}
        </div>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
          {/* Zero line (for BPM) */}
          {minY < 0 && maxY > 0 && (
            <line x1={PAD.l} x2={W-PAD.r} y1={yS(0)} y2={yS(0)} stroke="#374151" strokeWidth={1} strokeDasharray="4,3"/>
          )}
          {/* Y grid + labels */}
          {yTicks.map(v=>(
            <g key={v}>
              <line x1={PAD.l} x2={W-PAD.r} y1={yS(v)} y2={yS(v)} stroke="#1f2937" strokeWidth={1}/>
              <text x={PAD.l-4} y={yS(v)+4} textAnchor="end" fontSize={8} fill="#6b7280">{v}{m.unit}</text>
            </g>
          ))}
          {/* X labels: season years */}
          {lines.map((s,i)=>(
            <text key={s.yr} x={xS(i)} y={H-4} textAnchor="middle" fontSize={9}
              fill={i===lines.length-1?"#f97316":"#6b7280"}
              fontWeight={i===lines.length-1?700:400}>{s.yr}</text>
          ))}
          {/* Axis label */}
          <text x={10} y={H/2} textAnchor="middle" fontSize={9} fill="#6b7280" transform={`rotate(-90,10,${H/2})`}>{m.label}</text>
          {/* OLS trend line */}
          <line
            x1={xS(validIdx[0].i)} y1={yS(intercept+slope*validIdx[0].i)}
            x2={xS(validIdx[validIdx.length-1].i)} y2={yS(intercept+slope*validIdx[validIdx.length-1].i)}
            stroke={trendPosY} strokeWidth={1.5} strokeDasharray="5,3" opacity={0.6}/>
          {/* Season line */}
          <polyline points={polyPts} fill="none" stroke={m.color} strokeWidth={2.5}/>
          {/* Dots + value labels */}
          {lines.map((s,i)=>{
            const v = m.getter(s);
            if (v == null || !isFinite(v)) return null;
            const isLast = i===lines.length-1;
            return (
              <g key={s.yr}>
                <circle cx={xS(i)} cy={yS(v)} r={isLast?6:4}
                  fill={isLast?"#f97316":m.color}
                  stroke={isLast?"#fed7aa":"transparent"} strokeWidth={1.5}/>
                <text x={xS(i)} y={yS(v)-10} textAnchor="middle" fontSize={9} fontWeight={700}
                  fill={isLast?"#f97316":m.color}>
                  {v.toFixed(1)}{m.unit}
                </text>
              </g>
            );
          })}
        </svg>
        <div style={{fontSize:9,color:"#4b5563",marginTop:5,display:"flex",gap:14,flexWrap:"wrap"}}>
          <span style={{color:m.color}}>— seasonal value</span>
          <span style={{color:trendPosY}}>--- trend (OLS): {slope>0.05?"↑ improving":slope<-0.05?"↓ declining":"→ flat"}</span>
          {minY < 0 && maxY > 0 && <span>| = zero</span>}
        </div>
      </Sec>
    );
  };

  // Season-by-season: reuse peer curve from skillCurve section
  const peerExpDev = (usg) => 160 - 1.2*usg - 0.015*usg*usg;

  const SeasonTable = () => {
    if (!p.skillCurve) return null;
    const sc = p.skillCurve;
    const rawLines = (p.seasonLines || []).filter(s => s.yr && s.usg >= 8);
    if (rawLines.length === 0) return null;
    const seasons = rawLines.map((s, i) => ({
      yr: s.yr, usg: s.usg, ts: s.ts, astP: s.astP, toP: s.toP, bpm: s.bpm,
      adjOrtg: (i === rawLines.length-1 && sc.curAdjOrtg)
        ? sc.curAdjOrtg
        : Math.round(-0.0052*s.usg*s.usg + 1.6262*s.usg + 69.51 + (sc.peerResidual||0)*0.5),
    }));

    return (
      <Sec icon="📅" title="Season-by-Season Breakdown"
        sub="All seasons with meaningful playing time (≥8% USG). Orange = most recent season. AdjOrtg colour: green ≥10 pts above peer curve, yellow = above, red = below.">
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr>
                {["Year","USG%","AdjOrtg","vs Peer","TS%","AST%","TO%","BPM"].map(h=>(
                  <th key={h} style={{textAlign:"right",fontSize:10,color:"#4b5563",padding:"4px 8px",borderBottom:"1px solid #1f2937",fontWeight:500}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {seasons.map((s,i)=>{
                const isLatest = i===seasons.length-1;
                const c = isLatest?"#f97316":"#9ca3af";
                const diff = s.adjOrtg - peerExpDev(s.usg);
                const adjColor = diff > 10 ? "#22c55e" : diff > 0 ? "#fbbf24" : "#ef4444";
                const bpmColor = (s.bpm??0) > 5 ? "#22c55e" : (s.bpm??0) > 0 ? "#fbbf24" : "#ef4444";
                // Delta vs prior season
                const prev = i > 0 ? seasons[i-1] : null;
                const bpmDelta = prev && s.bpm != null && prev.bpm != null ? s.bpm - prev.bpm : null;
                return (
                  <tr key={s.yr} style={{background:isLatest?"#1a1a2e":"transparent"}}>
                    <td style={{textAlign:"right",padding:"5px 8px",fontWeight:isLatest?700:400,color:c}}>{s.yr}</td>
                    <td style={{textAlign:"right",padding:"5px 8px",color:c}}>{s.usg?.toFixed(1)}%</td>
                    <td style={{textAlign:"right",padding:"5px 8px",fontWeight:700,color:adjColor}}>{s.adjOrtg?.toFixed(0)}</td>
                    <td style={{textAlign:"right",padding:"5px 8px",fontSize:11,color:adjColor}}>{diff>0?"+":""}{diff.toFixed(0)}</td>
                    <td style={{textAlign:"right",padding:"5px 8px",color:c}}>{s.ts!=null?`${s.ts.toFixed(1)}%`:"—"}</td>
                    <td style={{textAlign:"right",padding:"5px 8px",color:c}}>{s.astP!=null?`${s.astP.toFixed(1)}%`:"—"}</td>
                    <td style={{textAlign:"right",padding:"5px 8px",color:c}}>{s.toP!=null?`${s.toP.toFixed(1)}%`:"—"}</td>
                    <td style={{textAlign:"right",padding:"5px 8px",color:bpmColor,fontWeight:600}}>
                      {s.bpm!=null?s.bpm.toFixed(1):"—"}
                      {bpmDelta!=null&&<span style={{fontSize:9,marginLeft:3,color:bpmDelta>0?"#22c55e":"#ef4444"}}>{bpmDelta>0?"+":""}{bpmDelta.toFixed(1)}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{marginTop:8,fontSize:9,color:"#4b5563"}}>
          AdjOrtg = BartTorvik opponent-adjusted offensive rating (pts/100). Peer curve: -0.0052·USG²+1.63·USG+69.5. vs Peer = AdjOrtg − peer expected. BPM delta = change vs prior season.
        </div>
      </Sec>
    );
  };

  // ── FIBA NATIONAL TEAM CARD (Tobias 2026-05-05) ─────────────────────
  // Zeigt Karriere bei FIBA Nationalteam-Events (Junior + Senior).
  // Hilft NCAA-Talente UND Intl-Talente direkt vergleichen — die einzige Bühne
  // wo beide gegeneinander spielen. Plus Early-Bloomer-Highlight (Doncic mit 16
  // bei Senior-Slowenien-Nationalmannschaft = generationaler Talent-Marker).
  const FibaCard = () => {
    const apps = Number(p.fiba_total_apps || 0);
    if (apps < 1) return null;  // kein FIBA-data → keine Karte
    const youthDom = Number(p.fiba_youth_dominance || 0);
    const seniorEarly = Number(p.fiba_senior_early || 0);
    const peakPer = Number(p.fiba_career_peak_per || 0);
    const hasYouthSignal = youthDom >= 30;
    const hasEarlySignal = seniorEarly >= 6;
    const hasElitePer = peakPer >= 25;

    // Pro-Liga Early-Bloomer (intl Pre-NBA)
    const proSeason = p.intl_first_pro_season;
    const proBpm = Number(p.intl_first_pro_bpm || 0);
    const proLeague = p.intl_first_pro_league;
    const earlyProScore = Number(p.pro_early_bloomer || 0);
    const hasProEarly = earlyProScore >= 30;

    return (
      <div style={{background:"#0f172a",borderRadius:12,padding:18,border:"1px solid #1e293b"}}>
        <div style={{fontSize:13,fontWeight:700,color:"#9ca3af",marginBottom:10,letterSpacing:"0.05em",textTransform:"uppercase"}}>
          🌍 International Career Signals
        </div>

        {/* FIBA stats */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:12,color:"#6b7280",marginBottom:6}}>FIBA NATIONAL TEAM</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
            <div style={{padding:8,background:"#1e293b",borderRadius:6}}>
              <div style={{fontSize:10,color:"#9ca3af",marginBottom:2}}>Career Apps</div>
              <div style={{fontSize:18,fontWeight:700,color:"#e5e7eb"}}>{apps}</div>
            </div>
            <div style={{padding:8,background:"#1e293b",borderRadius:6}}>
              <div style={{fontSize:10,color:"#9ca3af",marginBottom:2}}>Peak PER</div>
              <div style={{fontSize:18,fontWeight:700,color:hasElitePer?"#22c55e":"#e5e7eb"}}>{peakPer.toFixed(1)}</div>
            </div>
            <div style={{padding:8,background:"#1e293b",borderRadius:6}}>
              <div style={{fontSize:10,color:"#9ca3af",marginBottom:2}}>Youth Dominance</div>
              <div style={{fontSize:18,fontWeight:700,color:hasYouthSignal?"#22c55e":"#e5e7eb"}}>{youthDom.toFixed(0)}</div>
            </div>
            <div style={{padding:8,background:"#1e293b",borderRadius:6}}>
              <div style={{fontSize:10,color:"#9ca3af",marginBottom:2}}>Early Senior 🌟</div>
              <div style={{fontSize:18,fontWeight:700,color:hasEarlySignal?"#fbbf24":"#e5e7eb"}}>{seniorEarly.toFixed(0)}</div>
            </div>
          </div>
          {hasEarlySignal && (
            <div style={{fontSize:11,color:"#fbbf24",marginTop:6,fontStyle:"italic"}}>
              ⭐ Early-Bloomer: spielte schon mit jungem Alter im Senior-Nationalteam — generationaler Talent-Marker
            </div>
          )}
        </div>

        {/* Pro-Liga Early Signal (intl only) */}
        {proSeason && proLeague && (
          <div>
            <div style={{fontSize:12,color:"#6b7280",marginBottom:6}}>FIRST PRO LEAGUE PRODUCTION</div>
            <div style={{padding:10,background:"#1e293b",borderRadius:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:13,color:"#e5e7eb"}}>
                  Season {proSeason} — {proLeague}
                </div>
                <div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>
                  BPM = {proBpm.toFixed(1)} in first significant role (≥12 MPG)
                </div>
              </div>
              {hasProEarly && (
                <div style={{padding:"4px 10px",background:"#fbbf2422",border:"1px solid #fbbf24",borderRadius:4,color:"#fbbf24",fontSize:11,fontWeight:600}}>
                  Early-Bloomer
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <SeasonLineChart />
      <SeasonTable />
      <ClassScatterAndDev p={p} />
      <FibaCard />
    </div>
  );
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

  // Tobias 2026-05-25: color now keyed to the projected TIER (from the calibrated
  // tier distribution), not raw magnitude — Added Wins is an honest expected value
  // (compressed), so magnitude thresholds no longer apply. TC = master tier→color.
  const warColor = TC[predTier] || "#8b5cf6";

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
            <div className="font-bold mb-2" style={{color:"#f97316"}}>PPWA — Projected Peak Wins Added</div>
            <div className="mb-2" style={{color:"#cbd5e1"}}>
              <strong>Rank:</strong> PPWA = P(NBA) × E[Added Wins | NBA] &nbsp;·&nbsp; <strong>Odds:</strong> spread of his comps' real careers
            </div>
            <div className="mb-2" style={{color:"#9ca3af",fontSize:"0.85em"}}>
              Decoupled. The board RANK is a two-stage statistical projection — P(NBA) × expected value if he reaches the league — rescaled to the realized Added-Wins scale (best-3-season peak, team-anchored: xRAPM impact + box production). The tier PROBABILITIES come from a comparable-player method: each prospect's outcome uncertainty is the realized spread of the historical prospects he most resembles before the draft (leave-one-out, ≥10 effective comps) — so the odds are honest (no 99% locks), not a tight parametric band. We deliberately don't let comps drive the rank: they over-rate high-projected role players and regress true one-of-one stars.
            </div>
            <div style={{color:"#6b7280",fontSize:"0.8em"}}>
              Year-grouped holdout: regression ranking Spearman ρ ≈ 0.39 · P(NBA) ROC-AUC 0.95 (0.98 on NCAA) · tiers calibrated to realistic per-class output (~0.5 Superstar / 3 All-Star / 12 Starter per draft class) · the regression cannot fully see generational profiles with no historical comp (documented blind spot) · fringe/undrafted projections are extrapolations.
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
          {(() => {
            // Tobias 2026-05-09: cumulative P(Tier+) — explains why a player whose
            // modal-bin is "Starter" (51%) gets labelled "All-Star" (P(S+A) = 24% ≥ 18% threshold).
            const _t = tiers || {};
            const _pS  = Number(_t.Superstar) || 0;
            const _pA  = Number(_t["All-Star"]) || 0;
            const _pSt = Number(_t.Starter) || 0;
            const _pR  = Number(_t["Role Player"]) || 0;
            const cumByTier = {
              "Superstar":   _pS,
              "All-Star":    _pS + _pA,
              "Starter":     _pS + _pA + _pSt,
              "Role Player": _pS + _pA + _pSt + _pR,
            };
            const cumPct = cumByTier[predTier];
            const tierTooltip = (
              <div>
                <div className="font-bold mb-1" style={{color:TC[predTier]||"#f97316"}}>How is "{predTier}" assigned?</div>
                <div style={{color:"#cbd5e1"}}>
                  Cumulative-threshold tier: highest tier where <b>P(this tier or better)</b> clears its calibrated cutoff.
                  This shows <b>aspirational potential</b>, not the most likely single outcome.
                </div>
                <div className="mt-2 text-xs" style={{color:"#94a3b8"}}>
                  P(Superstar) = <b>{_pS.toFixed(0)}%</b> (cutoff 12%)<br/>
                  P(All-Star+) = <b>{(_pS+_pA).toFixed(0)}%</b> (cutoff 18%)<br/>
                  P(Starter+) = <b>{(_pS+_pA+_pSt).toFixed(0)}%</b> (cutoff 26%)<br/>
                  P(Role Player+) = <b>{(_pS+_pA+_pSt+_pR).toFixed(0)}%</b> (cutoff 38%)
                </div>
                {predTier !== "Superstar" && predTier !== "Negative" && (
                  <div className="mt-2 text-xs" style={{color:"#fbbf24"}}>
                    Modal (most likely single tier): see bar chart below.
                  </div>
                )}
              </div>
            );
            return (
              <div className="flex justify-center gap-6 mt-4">
                <Tip content={tierTooltip}>
                  <div className="text-center cursor-help">
                    <div className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Predicted Tier</div>
                    <div className="text-lg font-bold mt-0.5" style={{color:TC[predTier]||"#6b7280"}}>{predTier}</div>
                    {cumPct != null && cumPct > 0 && (
                      <div className="text-xs mt-0.5" style={{color:"#9ca3af"}}>
                        P({predTier}+) = <span style={{color:TC[predTier]||"#9ca3af",fontWeight:600}}>{cumPct.toFixed(0)}%</span>
                      </div>
                    )}
                  </div>
                </Tip>
                {p.potentialTier && p.potentialTier !== "Marginal/Out" && (
                  <div className="text-center" title={`Highest tier where cumulative probability ≥30%. Doncic: P(Superstar)=45% → Superstar Potential. Unlike the Predicted Tier (modal value), the Potential Tier surfaces a player's pre-draft upside.`}>
                    <div className="text-xs uppercase tracking-wider cursor-help" style={{color:"#6b7280"}}>Potential ★</div>
                    <div className="text-lg font-bold mt-0.5" style={{color: p.potentialTier.includes("Superstar") ? "#fbbf24" : p.potentialTier.includes("All-Star") ? "#f97316" : p.potentialTier.includes("Starter") ? "#3b82f6" : "#06b6d4"}}>
                      {p.potentialTier.replace(" Potential", "")}
                    </div>
                  </div>
                )}
                <div className="text-center">
                  <div className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Career Path</div>
                  <div className="text-lg font-bold mt-0.5" style={{color:"#22c55e"}}>{p.careerPath || "NBA"}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Confidence</div>
                  <div className="text-lg font-bold mt-0.5" style={{color:confColor}}>{confLabel}</div>
                </div>
              </div>
            );
          })()}
          {/* ── Archetype Pipeline ── */}
          {(p.ncaaArchetype || p.nbaProjection) && (
            <div className="mt-4 rounded-xl px-4 py-3" style={{background:"#0a0e17",border:"1px solid #1f2937"}}>
              <div className="text-xs mb-2 mt-0" style={{color:"#6b7280",lineHeight:1.5,textAlign:"center"}}>
                <strong style={{color:"#9ca3af"}}>How to read this:</strong> NCAA Role is what this player IS today — his dominant statistical role at the college level (assigned by the same 14-role z-score matrix used for the Roles & Archetypes tab). NBA Projection is the role he most likely STICKS in as a rotation player — computed from his pre-draft archetype cohort: among historical prospects with the same NCAA Role, which NBA role did they peak at most often? Use this as a fit-and-trade signal, not a guarantee — a player can over- or under-shoot his projected role depending on team context and development.
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {/* NCAA Role (what the player IS now) */}
                <div className="text-center">
                  <div className="text-xs uppercase tracking-widest mb-1" style={{color:"#4b5563",letterSpacing:"0.1em"}}>NCAA Role</div>
                  <div className="px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wide"
                    style={{background:"#1f293788",color:"#9ca3af",border:"1px solid #374151"}}>
                    {p.ncaaArchetype}
                  </div>
                  {NCAA_ARCH_DESC[p.ncaaArchetype] && (
                    <div className="text-xs mt-1 max-w-32" style={{color:"#4b5563",lineHeight:1.3}}>
                      {NCAA_ARCH_DESC[p.ncaaArchetype].split(" — ")[0]}
                    </div>
                  )}
                </div>
                {/* Arrow */}
                <div className="text-2xl font-bold mx-1" style={{color:"#374151"}}>→</div>
                {/* NBA Projection (what he can become) */}
                <div className="text-center">
                  <div className="text-xs uppercase tracking-widest mb-1" style={{color:"#4b5563",letterSpacing:"0.1em"}}>NBA Projection</div>
                  <div className="px-3 py-1 rounded-lg text-sm font-bold"
                    style={{background:(TC[predTier]||"#6b7280")+"22",color:TC[predTier]||"#9ca3af",border:`1px solid ${TC[predTier]||"#374151"}88`}}>
                    {p.nbaProjection}
                  </div>
                  {NBA_PROJ_DESC[p.nbaProjection] && (
                    <div className="text-xs mt-1 max-w-36" style={{color:"#6b7280",lineHeight:1.3}}>
                      {NBA_PROJ_DESC[p.nbaProjection]}
                    </div>
                  )}
                </div>
                {/* Risk-Profile (Ceiling/Floor entfernt — Tobias 2026-05-09: zu opaque, durch Tier-Verteilung & Resilience-Indizes besser dargestellt) */}
                {p.riskTag && (
                  <div className="ml-2 text-center">
                    <div className="text-xs uppercase tracking-widest mb-1" style={{color:"#4b5563"}}>Risk Profile</div>
                    <div className="text-xs font-bold px-2 py-1 rounded" style={{
                      color: p.riskTag==="Boom/Bust"?"#f59e0b":p.riskTag==="High Upside"?"#22c55e":p.riskTag==="Safe Floor"?"#06b6d4":"#3b82f6",
                      background: p.riskTag==="Boom/Bust"?"#78350f44":p.riskTag==="High Upside"?"#14532d44":p.riskTag==="Safe Floor"?"#0c4a6e44":"#1e3a5f44",
                    }}>{p.riskTag}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ TIER DISTRIBUTION ═══ */}
      <Sec icon="◆" title="Tier Distribution"
        sub={showNonNba
          ? `Unconditional career outcome distribution — NBA tier bars scaled by P(NBA) ${(pNba*100).toFixed(0)}%. "Non-NBA" covers G League, international, or out of pro ball.`
          : "How does the projected grade break down? Bars show each tier's probability, from the player's projected Added Wins and the model's uncertainty. Tiers are graded on the projection scale, calibrated to realistic per-class NBA output (~0.5 Superstar · 3 All-Star · 12 Starter per draft class)."}>
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
            <Bar dataKey="pct" radius={[6,6,0,0]}>
              {tierData.map((e,i) => {
                // Tobias 2026-05-09: highlight the bin matching the assigned predicted tier
                // (e.g. Boozer's "All-Star" label → highlight the All-Star bar even though
                // Starter is the modal/highest bin).
                const eName = e.name === "Role" ? "Role Player" : e.name;
                const isSelected = eName === predTier;
                return (
                  <Cell key={i} fill={e.fill}
                    stroke={isSelected ? "#fff" : "transparent"}
                    strokeWidth={isSelected ? 2 : 0}
                    strokeDasharray={isSelected ? "0" : "0"}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-2 text-xs text-center" style={{color:"#6b7280"}}>
          <span style={{color:"#9ca3af"}}>White outline</span> = assigned tier (cumulative-threshold).
          Highest bar = modal outcome (most likely single tier).
        </div>
        {/* Actual NBA outcome (if available) */}
        {(p.actual || p.peakPie != null) && (
          <div className="mt-3 flex items-center gap-3 p-3 rounded-lg" style={{background:"#0c1222",border:"1px solid #1e3a5f"}}>
            <span className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Actual NBA Outcome:</span>
            {p.actual && <TierBadge tier={p.actual}/>}
            {p.peakPie != null && <span className="text-sm" style={{color:"#9ca3af"}}>Peak WA: <strong style={{color:"#fbbf24"}}>{fmt(p.peakPie,3)}</strong></span>}
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
        // v2Boosters/v2Limiters (new SHAP format) take priority over legacy string fields.
        // Filter out Mind-derived labels: the Mind tab's PBP-attribution data isn't deep enough
        // (esp. for intl + pre-2017 NCAA) to flow into the headline projection drivers.
        const MIND_LABEL_RX = /(^basketball iq$|^composure|^mental resil|^hothead|^overdriver|^engagement|^bounceback|^shot[-\s]?seek|^decision quality|^match[-\s]?phase|^stamina|^clutch[-\s]?mind|^mind[_\s]|streak)/i;
        const dropMind = (arr) => arr.filter(d => !MIND_LABEL_RX.test(String(d.label || "")));
        const boosters = dropMind(parseDrvs(p.v2Boosters ?? p.projectionBoosters));
        const limiters = dropMind(parseDrvs(p.v2Limiters ?? p.projectionLimiters));
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
            <Sec icon="🔬" title="Key Model Drivers" sub="What's pushing this player's projection up or down? Green features are pulling the projection higher; red features are pulling it lower. These are the inputs the projection model weighs most heavily for this player.">
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
          <Sec icon="🔬" title="Projection Drivers" sub="What's lifting or limiting this projection? We decompose each prediction into per-feature contributions. Top 5 boosters (green) push the projection higher; top 5 limiters (red) pull it lower. Strength: +++ = very strong influence, ++ = strong, + = moderate.">
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
              <strong style={{color:"#6b7280"}}>How this works:</strong> For each prospect, the value model decomposes the projection
              into individual feature contributions. Boosters are features where this prospect's value
              pushes the prediction above the population baseline; limiters pull it below. Strength reflects relative magnitude
              within this player's own top contributors — <span style={{color:"#22c55e"}}>+++</span> = dominant influence,{" "}
              <span style={{color:"#22c55e"}}>+</span> = still top-5 but smaller effect.
              The Added-Wins target itself blends box production (30%) and on-court impact / xRAPM (70%).
            </div>
          </Sec>
        );
      })()}

      {/* ═══ INTERNATIONAL CAREER OUTLOOK ═══ */}
      {/* Conditional: nur anzeigen wenn die kumulierte NBA-Wahrscheinlichkeit
         (Superstar+All-Star+Starter+Role) < 25 %. Das filtert sowohl etablierte
         NBA-Talente raus als auch borderline-Roleplayer (die noch realistisch
         NBA werden koennen). 10e-Predictions sind fuer ALLE Spieler verfuegbar
         — der Threshold steuert nur Display-Sichtbarkeit. */}
      {(() => {
        const _pNbaTot = (Number(p.tiers?.Superstar)||0) + (Number(p.tiers?.["All-Star"])||0)
                       + (Number(p.tiers?.Starter)||0)  + (Number(p.tiers?.["Role Player"])||0);
        return p.intlTierProbs && !p.madeNba && _pNbaTot < 25;
      })() && (() => {
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
            sub={(() => {
              const _pNba = (Number(p.tiers?.Superstar)||0) + (Number(p.tiers?.["All-Star"])||0)
                          + (Number(p.tiers?.Starter)||0) + (Number(p.tiers?.["Role Player"])||0);
              return `NBA prob. ${_pNba.toFixed(0)}% — secondary tier projection (10e), trained on 9,205 historical non-NBA careers.`;
            })()}>

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
              5-class LightGBM, trained on 9,205 historical non-NBA careers
              (bias fix: successful NBA careers removed from training).
              5-fold CV: 48% top-1 accuracy, 78% top-2 accuracy.
              In 78% of cases the actual league is among the top-2 predictions.
              {hasActual && <span style={{color:"#6b7280"}}> Actual league from realgm career trace.</span>}
            </div>
          </Sec>
        );
      })()}

      {/* ═══ HOW THIS PROJECTION WAS MADE — Tobias 2026-05-09 ═══
           Replaces Season-by-Season (which lives in Development tab anyway).
           Erklärt den 2-Schritt-Pipeline-Flow: Pre-Draft Role + NBA-Projection.
           ════════════════════════════════════════════════════════════════ */}
      <Sec icon="🔭" title="How This Projection Was Made"
        sub="From college / international stats → pre-draft role → NBA outcome distribution. Built to work for both NCAA and international prospects.">
        {(() => {
          const isIntl = p.source === "intl";
          const pos = p.pos || "Wing";
          // Position-spezifische realistische NBA-Outcomes
          const POS_OUTCOMES = {
            Playmaker: {
              high:    "Lead Creator (24+ USG, 25%+ AST) — primary ball-handler tasked with scoring AND playmaking",
              midHigh: "Combo Guard (20-24 USG) — scoring guard with secondary playmaking responsibility",
              mid:     "Spacer / 3-and-D Guard — off-ball shooter who can attack closeouts",
              low:     "Backup Distributor — bench creator with limited offensive load",
              floor:   "Two-Way G-League Bridge",
            },
            Wing: {
              high:    "Initiator Wing / Star Forward — high-usage scorer-creator (Tatum/Brunson/Booker template)",
              midHigh: "Scoring Wing — efficient volume scorer with secondary defense",
              mid:     "3-and-D Wing — corner shooter + multi-position defender (modern NBA's most demanded role)",
              low:     "Movement Shooter / Connective Wing",
              floor:   "Two-Way Wing / Specialist",
            },
            Big: {
              high:    "Cornerstone Big — Rim-Protector + Spacer combo or elite shot-creator (KAT/Embiid template)",
              midHigh: "Starting Big — Roll-and-finish or Stretch-Big with one elite skill",
              mid:     "Paint Specialist — rim-protector OR rebounder OR rim-runner",
              low:     "Rotation Big — situational use, foul-troubled minutes",
              floor:   "Two-Way / Bench Center",
            },
          };
          const outcomes = POS_OUTCOMES[pos] || POS_OUTCOMES.Wing;
          const TopFlow = ({step, title, body, color}) => (
            <div style={{flex:1,minWidth:240,background:"#0d1117",border:`1px solid ${color}33`,borderRadius:10,padding:"12px 14px"}}>
              <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:6}}>
                <span style={{fontSize:10,fontWeight:700,color,letterSpacing:1.2}}>STEP {step}</span>
                <span style={{fontSize:13,fontWeight:700,color:"#e5e7eb"}}>{title}</span>
              </div>
              <div style={{fontSize:11,color:"#9ca3af",lineHeight:1.55}}>{body}</div>
            </div>
          );
          return (
            <div className="space-y-4">
              {/* Top: 3-step flow visualization */}
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                <TopFlow step={1} title={isIntl ? "International Pre-Draft Role" : "NCAA Pre-Draft Role"} color="#3b82f6"
                  body={isIntl
                    ? <>From {(p.seasonLines||[]).length} international season(s) we cluster the prospect into one of 19 archetypes via role-percentile thresholds (Spacer, Defender, Driver, Playmaker, etc.). FIBA pace adjusters (×1.15 for stocks, ×1.25 for assists) compensate for cross-league differences.</>
                    : <>From the 14-Role Inference Matrix (z-scores vs NCAA peers): Spacer + Defender + Driver + Playmaker + Rim-Protector + Rebounder + 6 hybrids. The dominant 1-2 roles determine the archetype. <strong style={{color:"#e5e7eb"}}>You see this in the Roles & Archetypes tab.</strong></>
                  }/>
                <TopFlow step={2} title="Predicted NBA Tier" color="#f97316"
                  body={<>Calibrated model trained on NBA outcomes (validated on Pre-Draft features only). Predicts a probability across 6 tier grades — <strong style={{color:"#e5e7eb"}}>Superstar, All-Star, Starter, Role Player, Replacement, Negative</strong> — graded on the projection scale and calibrated to realistic per-class NBA output (~0.5 Superstar, 3 All-Star, 12 Starter per draft class), so the elite reach Superstar/All-Star while the count stays realistic. Temporal holdout 2017–2019: Spearman ρ = 0.44. <strong style={{color:"#e5e7eb"}}>You see this in the Tier Distribution above.</strong></>
                  }/>
                <TopFlow step={3} title="Position-Specific NBA Role Mapping" color="#22c55e"
                  body={<>The Pre-Draft Role × Predicted Tier matrix maps to one of 72 specific NBA outcomes per position. Higher tier = more demanding role; lower tier = more specialized/limited role. <strong style={{color:"#e5e7eb"}}>The "NBA Projection" pill in the header is the modal outcome.</strong></>
                  }/>
              </div>

              {/* Position-specific outcome ladder for THIS player's position */}
              <div style={{background:"#0d1117",borderRadius:10,padding:"14px 16px",border:"1px solid #1f2937"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#6b7280",letterSpacing:1,marginBottom:10}}>
                  REALISTIC NBA OUTCOMES FOR A {pos.toUpperCase()} (BY TIER)
                </div>
                <div className="space-y-2">
                  {[
                    {label:"Superstar / All-Star",  text:outcomes.high,    color:"#fbbf24", tierName:"Superstar"},
                    {label:"Starter",               text:outcomes.midHigh, color:"#f97316", tierName:"Starter"},
                    {label:"Role Player",           text:outcomes.mid,     color:"#22c55e", tierName:"Role"},
                    {label:"Bench / Specialist",    text:outcomes.low,     color:"#3b82f6", tierName:"Bench"},
                    {label:"Out of NBA",            text:outcomes.floor,   color:"#6b7280", tierName:"Out"},
                  ].map(t => {
                    const isProjected = (p.predTier && (
                      (t.tierName === "Superstar" && /Superstar|All-Star/i.test(p.predTier)) ||
                      (t.tierName === "Starter"   && /Starter/i.test(p.predTier)) ||
                      (t.tierName === "Role"      && /Role/i.test(p.predTier)) ||
                      (t.tierName === "Bench"     && /Bench/i.test(p.predTier)) ||
                      (t.tierName === "Out"       && /Out|Marginal/i.test(p.predTier))
                    ));
                    return (
                      <div key={t.label} className="flex items-start gap-3 px-3 py-2 rounded-lg"
                        style={{background:isProjected?(t.color+"15"):"transparent",
                                border:`1px solid ${isProjected?t.color+"66":"#1f293766"}`}}>
                        <div style={{minWidth:120,fontSize:11,fontWeight:700,color:t.color,paddingTop:2}}>
                          {t.label}
                          {isProjected && <span style={{fontSize:9,marginLeft:6,padding:"1px 5px",background:t.color+"33",borderRadius:3,color:t.color}}>← projected</span>}
                        </div>
                        <div style={{flex:1,fontSize:12,color:"#9ca3af",lineHeight:1.5}}>{t.text}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{fontSize:10,color:"#475569",marginTop:10,fontStyle:"italic"}}>
                  Outcome descriptions are typical for the position × tier combination. The actual probability distribution is shown in the Tier Distribution chart above. Use the Projection Drivers below to see which features push this player toward higher or lower tiers.
                </div>
              </div>

              {/* International disclaimer if relevant */}
              {isIntl && (
                <div style={{background:"#1e3a5f22",border:"1px solid #1e3a5f",borderRadius:8,padding:"10px 12px",fontSize:11,color:"#cbd5e1",lineHeight:1.6}}>
                  <strong style={{color:"#7dd3fc"}}>International caveat:</strong> the model uses a separate intl-trained head with FIBA-pace adjusters and league-strength weights. Sample size is smaller (~9k intl seasons vs 35k NCAA), so confidence intervals tend to be wider. Cross-source comparability requires careful interpretation — see the International Career Outlook section above for additional intl-specific projections.
                </div>
              )}
            </div>
          );
        })()}
      </Sec>

      {/* Role Fit & Team Context placeholder removed 2026-05-09 (User: feature is on backlog, no need to advertise it) */}
    </div>
  );
}
function ScoutingTab({p, mode="scouting"}) {
  // Tobias 2026-05-06: mode="scouting" (default) zeigt Badges + Pillars + Possession Impact.
  // mode="roles" zeigt nur Role Inference Matrix + NBA Archetype Fit.
  // Beide nutzen die gleiche Berechnung damit kein Duplikat-Code entsteht.
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
  // Tobias 2026-05-08: Empirical frequency-based ordering instead of normative value tier.
  // freqPct = how often each archetype is the PRIMARY assignment within its position group,
  // computed from 46,253 player-seasons (NCAA + Intl, 2008-2026).
  // Sort order in Roles-Tab grid: most common (left) → rarest (right).
  // Reasoning: rarity = how strict are the position-specific role thresholds. Rare archetypes
  // are objectively harder to find — that's a useful scouting signal without making
  // normative claims about which archetype is "more valuable".
  const archetype = p.archetype || "Unknown";
  const ARCH_MAP = {
    // === PLAYMAKER (n=12,089) ===
    "Non-Specialized Playmaker": {desc:"Versatile guard without a dominant skill. Jack-of-all-trades backcourt piece.",color:"#8b5cf6",
      pos:["Playmaker"],formula:"Default (no role >70)",roles:["Scorer","Playmaker","Spacer"], freqPct:52.8},
    "Scoring Playmaker": {desc:"Dual-threat point guard. Scores at high volume while maintaining playmaking.",color:"#fbbf24",
      pos:["Playmaker"],formula:"Scorer>70 + Playmaker>55",roles:["Scorer","Playmaker","Event Creator"], freqPct:19.5},
    "Spacing Guard":      {desc:"Off-ball scoring guard. Elite spacing with catch-and-shoot gravity.",color:"#22c55e",
      pos:["Playmaker"],formula:"Spacer>70",roles:["Spacer","Scorer","Micro-Spacer"], freqPct:15.5},
    "Defensive Guard":     {desc:"Perimeter lockdown specialist. Ball pressure and steal ability define his value.",color:"#3b82f6",
      pos:["Playmaker"],formula:"Defender>70",roles:["On-Ball D","Connector","Zone Pressure"], freqPct:7.9},
    "Floor General":       {desc:"Lead playmaker who creates for others. Elite AST/TO and half-court orchestration.",color:"#f97316",
      pos:["Playmaker"],formula:"Playmaker>75",roles:["Playmaker","Connector","Event Creator"], freqPct:4.3},

    // === WING (n=26,838) ===
    "Non-Specialized Wing":      {desc:"Multi-tool forward without a dominant skill. Fits many lineups.",color:"#a78bfa",
      pos:["Wing"],formula:"Default (no role >65)",roles:["Connector","Switch Pot.","Spacer"], freqPct:44.2},
    "Scoring Wing":        {desc:"Pure scorer without elite creation. Efficient finisher who needs structure.",color:"#ef4444",
      pos:["Wing"],formula:"Scorer>75",roles:["Scorer","Driver","Spacer"], freqPct:21.1},
    "Defensive Wing":      {desc:"Elite wing defender. Versatile stopper who guards multiple positions.",color:"#06b6d4",
      pos:["Wing"],formula:"Defender>65",roles:["On-Ball D","Switch Pot.","Zone Pressure"], freqPct:11.1},
    "Point Forward":       {desc:"Oversized playmaker. Creates mismatches with size + passing vision.",color:"#10b981",
      pos:["Wing","Big"],formula:"Playmaker>65",roles:["Playmaker","Connector","Driver"], freqPct:11.1},
    "Slashing Wing":       {desc:"Attacks the rim with explosiveness. Transition weapon and paint-pressure.",color:"#f43f5e",
      pos:["Wing"],formula:"Driver>70",roles:["Driver","Crasher","On-Ball D"], freqPct:5.9},
    "Initiator Wing":        {desc:"Creates own offense off the dribble. Self-creation specialist with high usage.",color:"#fb923c",
      pos:["Wing","Playmaker"],formula:"Scorer>70 + Playmaker>55 + USG>26",roles:["Scorer","Driver","Helio-Scorer"], freqPct:4.0},
    "3-and-D Wing":        {desc:"Shoot and defend — the modern NBA's most coveted role-player template.",color:"#3b82f6",
      pos:["Wing"],formula:"Spacer>65 + Defender>65",roles:["Spacer","On-Ball D","Micro-Spacer"], freqPct:2.6},

    // === BIG (n=5,866) ===
    "Non-Specialized Big":          {desc:"Well-rounded center without a standout skill. Does a bit of everything.",color:"#60a5fa",
      pos:["Big"],formula:"Default (no role >65)",roles:["Rim Protect","Rebounder","Switch Pot."], freqPct:31.5},
    "Stretch Big":         {desc:"Shooting big who spaces the floor. Gravity from the 5 position.",color:"#22c55e",
      pos:["Big"],formula:"Spacer>65",roles:["Spacer","Rim Protect","Rebounder"], freqPct:21.3},
    "Rim Protector":       {desc:"Elite shot-blocker. Deters drives and alters shots. Anchors paint defense.",color:"#3b82f6",
      pos:["Big"],formula:"Rim Protect>75",roles:["Rim Protect","Rebounder","Switch Pot."], freqPct:13.1},
    "Short Roll Playmaker":{desc:"Decision-making big in the short roll. Drives and passes from the elbow/FT line area.",color:"#f59e0b",
      pos:["Big"],formula:"Driver>55 + Playmaker>55",roles:["Driver","Playmaker","Connector"], freqPct:10.2},
    "Passing Hub":       {desc:"Playmaking big — Jokic/Draymond archetype. Creates from post/elbow with vision.",color:"#fbbf24",
      pos:["Big"],formula:"Playmaker>55",roles:["Playmaker","Connector","Driver"], freqPct:9.1},
    "Glass Cleaner":       {desc:"Dominant rebounder. Controls both boards and creates second chances.",color:"#f97316",
      pos:["Big"],formula:"Rebounder>65",roles:["Rebounder","Crasher","Rim Protect"], freqPct:8.3},
    "Stretch Rim Protector":{desc:"Unicorn big — protects the rim AND stretches the floor. Extreme roster flexibility.",color:"#10b981",
      pos:["Big"],formula:"Rim Protect>75 + Spacer>65",roles:["Rim Protect","Spacer","Rebounder"], freqPct:3.4},
    "Scoring Big":         {desc:"Offense-first big. Post scoring, face-up game, or finishing at the rim.",color:"#ef4444",
      pos:["Big"],formula:"Scorer>65",roles:["Scorer","Crasher","Driver"], freqPct:3.2},
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
  // Tobias 2026-05-08: cffr_usage_role wird in der Pipeline nur für NCAA berechnet
  // (Step 10 läuft auf BartTorvik-DataFrame, 35.632 NCAA-Zeilen). Für Internationals
  // berechnen wir den Bucket on-the-fly aus p.usg — gleiches Schema wie Pipeline:
  // bins = [-inf, 15, 22, 28, +inf] → LowUsage / Finisher / Secondary / Primary.
  const _bucketUsageRole = (u) => u >= 28 ? "Primary" : u >= 22 ? "Secondary" : u >= 15 ? "Finisher" : "LowUsage";
  const usageRole = p.cffr?.usageRole && p.cffr.usageRole !== "nan"
    ? p.cffr.usageRole
    : (p.usg != null ? _bucketUsageRole(p.usg) : "Unknown");

  // Tobias 2026-05-08: Sort archetypes by empirical frequency within position.
  // Most common (left) → rarest (right). Frequency = % of position-peers (n=46k profiles)
  // who triggered this archetype as their PRIMARY assignment in the pipeline.
  // Reasoning: rarity is a useful objective scouting signal — strict thresholds = rarer
  // archetype = harder to find on draft day. No normative claim about value attached.
  const POS_META = {
    Playmaker: {color: "#a78bfa", label: "Playmakers"},
    Wing:      {color: "#22c55e", label: "Wings"},
    Big:       {color: "#3b82f6", label: "Bigs"},
  };
  const freqLabel = (pct) => pct >= 20 ? "common" : pct >= 8 ? "uncommon" : pct >= 4 ? "rare" : "very rare";
  const freqColor = (pct) => pct >= 20 ? "#9ca3af" : pct >= 8 ? "#fbbf24" : pct >= 4 ? "#fb923c" : "#ef4444";
  const archetypesByPos = (() => {
    const groups = {Playmaker: [], Wing: [], Big: []};
    allArchetypes.forEach(([name, info]) => {
      const pos = (info.pos || ["Wing"])[0];
      if (groups[pos]) groups[pos].push([name, info]);
    });
    // Sort: highest freqPct first (= most common left). Default to 50 if missing.
    Object.keys(groups).forEach(k => {
      groups[k].sort(([_a, ia], [_b, ib]) => (ib.freqPct ?? 50) - (ia.freqPct ?? 50));
    });
    return groups;
  })();

  return (
    <div className="space-y-5">
      {mode === "scouting" && (<>
      {/* ── BADGES ── */}
      <Sec icon="🏅" title="Skill Badges" sub="Position-aware skill flags from the stat profile. Green = elite NBA-translatable strengths. Yellow = swing skills with development potential. Red = warning signals that historically predict NBA struggles. Hover any badge to see the exact statistical trigger and scouting context.">
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
      <Sec icon="🔬" title="The 5 Pillars" sub="A prospect's DNA in 5 numbers, each on a 0–100 scale. Each score is position-adjusted (a guard's defensive number is rated against guards, a big's against bigs). These are the building blocks the projection model uses. Hover any pillar for the exact formula.">
        {p.source !== "ncaa" && <div className="mb-3 px-3 py-1.5 rounded-lg text-xs" style={{background:"#f9731611",color:"#f97316",border:"1px solid #f9731633"}}>
          ⚠ International data: Athleticism uses a dunk-free formula (FTr + ORB% + Stocks + DRB% + USG%) on the same 0-100 scale — directly comparable to NCAA players, who additionally get Dunk% and rim frequency as signals. Box Creation, Shooting and Defense apply source-specific adjusters (FIBA pace, assist-rate inflation); all values are position-percentiled and cross-source comparable.
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
      <Sec icon="↗" title="Possession Impact (Four Factors)" sub="How efficiently does this player use possessions, given his offensive role? We compare him only to other players with similar usage (Primary/Secondary/Finisher/Low-Usage) — so a primary scorer is rated against fellow primaries, not against low-usage finishers. Built on the four classic offensive efficiency drivers: shooting (eFG%), ball security (TO%), offensive rebounding, and free-throw generation.">
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
          {/* NPV scale bar — Tobias 2026-05-06: Segments aligned mit Tier-Schwellen
              45 / 55 / 70 (vorher linear gradient → Marker bei 50 zeigte "Role Dependent"
              im optisch hellgrünen Bereich). Jetzt 4 diskrete Segmente passend zur Logik. */}
          <div className="relative h-6 rounded-full overflow-hidden mb-2 flex" style={{background:"#1f2937"}}>
            <div style={{width:"45%", background:"#ef4444"}}/>
            <div style={{width:"10%", background:"#fbbf24"}}/>
            <div style={{width:"15%", background:"#86efac"}}/>
            <div style={{width:"30%", background:"#22c55e"}}/>
            <div className="absolute top-0 bottom-0 w-1.5 rounded" style={{left:`${Math.max(2,Math.min(98,npv))}%`,background:"#fff",boxShadow:"0 0 6px #fff"}}/>
          </div>
          <div className="relative h-4 text-xs" style={{color:"#4b5563"}}>
            <span style={{position:"absolute",left:"0%"}}>High Maintenance</span>
            <span style={{position:"absolute",left:"45%",transform:"translateX(-50%)"}}>45</span>
            <span style={{position:"absolute",left:"55%",transform:"translateX(-50%)"}}>55</span>
            <span style={{position:"absolute",left:"70%",transform:"translateX(-50%)"}}>70</span>
            <span style={{position:"absolute",right:"0%"}}>Elite Floor Raiser</span>
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

      {/* ══════════════════════════════════════════════════════════════════
           Game-by-Game Skill Curve (Tobias 2026-05-09)
           Per-Game USG vs Individual ORtg Scatter aus PBP-Daten.
           Smoothed trend (LOESS-like rolling mean) zeigt Skalierung.
         ══════════════════════════════════════════════════════════════════ */}
      {p.gameLogs && p.gameLogs.games && p.gameLogs.games.length >= 5 && (() => {
        const games = p.gameLogs.games.filter(g => g.u != null && g.o2 != null);
        if (games.length < 5) return null;

        const OPP_COL = {T:"#ef4444", M:"#fbbf24", L:"#22c55e"};
        const OPP_LABEL = {T:"Strong opponent", M:"Average opponent", L:"Weak opponent"};
        const hasOpp = games.some(g => g.os === "T" || g.os === "M" || g.os === "L");

        // Multi-season awareness — count distinct seasons across game-rows
        const seasonsSet = new Set(games.map(g => g.yr).filter(Boolean));
        const nSeasons = seasonsSet.size || 1;
        const seasonsList = (p.gameLogs.seasons && p.gameLogs.seasons.length) ? p.gameLogs.seasons : Array.from(seasonsSet).sort();

        const USG_MIN = 0, USG_MAX = 50;
        const ORTG_MIN = 50, ORTG_MAX = 200;
        const W = 720, H = 340, PAD = {l: 50, r: 20, t: 18, b: 36};
        const xS = (u) => PAD.l + ((u - USG_MIN) / (USG_MAX - USG_MIN)) * (W - PAD.l - PAD.r);
        const yS = (o) => PAD.t + ((ORTG_MAX - o) / (ORTG_MAX - ORTG_MIN)) * (H - PAD.t - PAD.b);

        // 2026-05-29 Tobias: LOWESS-Smoother mit tricubic weights (Bart-Torvik-Style).
        // Bandwidth = max(0.30, k/N) — bei kleinen Samples (10 Spiele) ist die Curve
        // notgedrungen lokaler. Plus 1-SD-Konfidenzband aus lokalen Residuen.
        const sortedByUsg = [...games].sort((a, b) => a.u - b.u);
        const N = sortedByUsg.length;
        const bandwidth = Math.max(0.3, Math.min(0.6, 7 / N));   // dynamic
        const kNeighbors = Math.max(5, Math.round(bandwidth * N));
        // Evaluate smoother on a dense grid (60 points), not just at observations
        const gridPts = [];
        for (let i = 0; i <= 60; i++) {
          const u = USG_MIN + (USG_MAX - USG_MIN) * (i / 60);
          // K nearest neighbors by |u - g.u|
          const withDist = sortedByUsg.map(g => ({u: g.u, o: g.o2, d: Math.abs(g.u - u)}));
          withDist.sort((a, b) => a.d - b.d);
          const near = withDist.slice(0, kNeighbors);
          const dMax = near[near.length - 1].d || 1e-6;
          let wSum = 0, weighted = 0, w2Sum = 0, wO2 = 0;
          for (const nd of near) {
            const w = Math.pow(1 - Math.pow(nd.d / dMax, 3), 3);
            wSum += w; weighted += w * nd.o; w2Sum += w * w; wO2 += w * nd.o * nd.o;
          }
          const meanO = wSum > 0 ? weighted / wSum : null;
          // local variance → 1-SD band (clamped)
          const varO = wSum > 0 ? Math.max(0, wO2 / wSum - meanO * meanO) : 0;
          const sd = Math.sqrt(varO);
          gridPts.push({u, o: meanO, sd});
        }
        // Smooth path
        const curvePath = gridPts.map((pt, i) =>
          `${i === 0 ? "M" : "L"} ${xS(pt.u).toFixed(1)} ${yS(Math.max(ORTG_MIN, Math.min(ORTG_MAX, pt.o))).toFixed(1)}`
        ).join(" ");
        // Confidence band (±1 SD), clamped to drawable range
        const upperPath = gridPts.map((pt, i) => {
          const o = Math.max(ORTG_MIN, Math.min(ORTG_MAX, pt.o + pt.sd));
          return `${i === 0 ? "M" : "L"} ${xS(pt.u).toFixed(1)} ${yS(o).toFixed(1)}`;
        }).join(" ");
        const lowerPath = gridPts.slice().reverse().map((pt, i) => {
          const o = Math.max(ORTG_MIN, Math.min(ORTG_MAX, pt.o - pt.sd));
          return `L ${xS(pt.u).toFixed(1)} ${yS(o).toFixed(1)}`;
        }).join(" ");
        const bandPath = `${upperPath} ${lowerPath} Z`;

        // OLS line through raw points for comparison
        const n = games.length;
        const meanU = games.reduce((a, g) => a + g.u, 0) / n;
        const meanO = games.reduce((a, g) => a + g.o2, 0) / n;
        const num = games.reduce((a, g) => a + (g.u - meanU) * (g.o2 - meanO), 0);
        const den = games.reduce((a, g) => a + (g.u - meanU) ** 2, 0);
        const slope = den > 0 ? num / den : 0;
        const intercept = meanO - slope * meanU;
        const slopeColor = slope > 0.5 ? "#22c55e" : slope > -0.5 ? "#fbbf24" : "#ef4444";
        const slopeLabel = slope > 1.0 ? "Scales strongly with usage"
                         : slope > 0.0 ? "Holds efficiency at higher usage"
                         : slope > -1.0 ? "Slight decay at higher usage"
                         : "Significant efficiency drop at high usage";

        // Date-color gradient (early season → late season)
        // Sort by date for color
        const sortedByDate = [...games].sort((a, b) => (a.d || "").localeCompare(b.d || ""));
        const dateRank = new Map(sortedByDate.map((g, i) => [g, i]));

        // Y-axis ticks
        const yTicks = [60, 80, 100, 120, 140, 160, 180];
        const xTicks = [10, 15, 20, 25, 30, 35, 40, 45];

        const avgU = meanU;
        const avgO = meanO;

        if (isPBPLimited2026(p)) return <PBPNotAvailable title="Game-by-Game Skill Curve" icon="📊"/>;
        return (
          <Sec icon="📊" title="Game-by-Game Skill Curve"
            sub={`${games.length} games across ${nSeasons} ${nSeasons===1?"season":"seasons"}${seasonsList.length?` (${seasonsList.join(" · ")})`:""}. Each dot = one game. The orange LOWESS curve traces THIS player's individual response to higher load — a falling orange line = efficiency drops when he carries more. The green dashed line is the peer-expected curve from 71k player-seasons (cross-sectional: high-usage players tend to be the strong ones, so the peer line rises). Sitting above the green line at his usage = better than peers at the same load.`}>
            {/* Sample-size honesty (Tobias 2026-05-30): LOWESS-Smoother braucht ≥ 20 Spiele. */}
            <PBPSampleWarning n={games.length} threshold={20} unit="games"/>
            <div style={{background:"#0d1117",border:"1px solid #1f2937",borderRadius:8,padding:"12px 14px",marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,flexWrap:"wrap",gap:8}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"#6b7280",letterSpacing:1}}>SCALING-VERDICT</div>
                  <div style={{fontSize:14,fontWeight:600,color:slopeColor,marginTop:2}}>{slopeLabel}</div>
                </div>
                <div style={{display:"flex",gap:14,fontSize:11,color:"#9ca3af"}}>
                  <span>Avg USG: <strong style={{color:"#f97316"}}>{avgU.toFixed(1)}%</strong></span>
                  <span>Avg ORtg: <strong style={{color:"#22c55e"}}>{avgO.toFixed(0)}</strong></span>
                  <span>Trend slope: <strong style={{color:slopeColor}}>{slope >= 0 ? "+" : ""}{slope.toFixed(1)}</strong> ORtg per +1% USG</span>
                </div>
              </div>
              {hasOpp && (
                <div style={{display:"flex",gap:14,alignItems:"center",fontSize:10,color:"#9ca3af",marginBottom:6,flexWrap:"wrap"}}>
                  <span style={{color:"#6b7280",fontWeight:600}}>Dot = opponent strength:</span>
                  <span><span style={{color:"#ef4444"}}>●</span> Strong</span>
                  <span><span style={{color:"#fbbf24"}}>●</span> Average</span>
                  <span><span style={{color:"#22c55e"}}>●</span> Weak</span>
                  <span><span style={{color:"#6b7280"}}>●</span> Unknown</span>
                  <span style={{color:"#475569"}}>— do red (strong-opponent) games sink to lower ORtg?</span>
                </div>
              )}
              <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
                {/* Grid */}
                {yTicks.map(v => (
                  <g key={v}>
                    <line x1={PAD.l} x2={W-PAD.r} y1={yS(v)} y2={yS(v)} stroke="#1f2937" strokeWidth={0.5}/>
                    <text x={PAD.l-6} y={yS(v)+3} textAnchor="end" fontSize={9} fill="#6b7280">{v}</text>
                  </g>
                ))}
                {xTicks.map(u => (
                  <g key={u}>
                    <line x1={xS(u)} y1={PAD.t} x2={xS(u)} y2={H-PAD.b} stroke="#1f2937" strokeWidth={0.5}/>
                    <text x={xS(u)} y={H-PAD.b+14} textAnchor="middle" fontSize={9} fill="#6b7280">{u}%</text>
                  </g>
                ))}
                {/* Peer-Expected ORtg curve (Tobias 2026-06-01): population mean adjORtg
                    bei jeder USG aus 71k player-seasons (quadratische Approximation aus
                    inject_skill_curve.py). Die Kurve ist NICHT fallend mit USG, weil
                    Cross-Section: starke Spieler tragen hohe USG. Die orange LOWESS-Kurve
                    zeigt dagegen die individuelle Game-by-Game-Reaktion auf USG-Last —
                    eine fallende orange Curve über einer steigenden Peer-Linie = Spieler
                    bricht bei eigener Last ein. */}
                {(() => {
                  const peer = (u) => -0.00518827 * u * u + 1.62620613 * u + 69.50561015;
                  const pts = [];
                  for (let i = 0; i <= 60; i++) {
                    const u = USG_MIN + (USG_MAX - USG_MIN) * (i / 60);
                    const o = Math.max(ORTG_MIN, Math.min(ORTG_MAX, peer(u)));
                    pts.push(`${i === 0 ? "M" : "L"} ${xS(u).toFixed(1)} ${yS(o).toFixed(1)}`);
                  }
                  const lastY = yS(Math.max(ORTG_MIN, Math.min(ORTG_MAX, peer(USG_MAX - 3)))) - 3;
                  return (
                    <>
                      <path d={pts.join(" ")} fill="none" stroke="#22c55e66" strokeWidth={1.2} strokeDasharray="3,3"/>
                      <text x={W-PAD.r-2} y={lastY} textAnchor="end" fontSize={9} fill="#22c55e99">peer-expected ORtg</text>
                    </>
                  );
                })()}

                {/* OLS trend (dashed) */}
                {Math.abs(slope) > 0.05 && (
                  <line x1={xS(USG_MIN+5)} y1={yS(intercept + slope*(USG_MIN+5))}
                        x2={xS(USG_MAX-5)} y2={yS(intercept + slope*(USG_MAX-5))}
                        stroke={slopeColor} strokeWidth={1.5} strokeDasharray="6,4" opacity={0.7}/>
                )}

                {/* 2026-05-29 — confidence band (±1 SD), beneath the curve */}
                <path d={bandPath} fill="#f9731622" stroke="none"/>
                {/* Smooth curve (LOWESS, tricubic-weighted) — primary visual element */}
                <path d={curvePath} fill="none" stroke="#f97316" strokeWidth={2.5} opacity={0.95}/>

                {/* Game dots — Backlog 3.2: color by opponent strength (else date gradient) */}
                {games.map((g, i) => {
                  let fill;
                  if (hasOpp) {
                    fill = OPP_COL[g.os] || "#6b7280";  // gray = unknown opponent
                  } else {
                    const rank = dateRank.get(g) ?? 0;
                    const t = sortedByDate.length > 1 ? rank / (sortedByDate.length - 1) : 0.5;
                    fill = `rgb(${Math.round(96 + t*(249-96))},${Math.round(165 - t*50)},${Math.round(250 - t*200)})`;
                  }
                  return (
                    <Tip key={i} content={
                      <div>
                        <div style={{fontWeight:700,color:"#f97316"}}>{g.d} {g.h ? "vs" : "@"} {g.o}{g.yr ? ` · ${g.yr}` : ""}{OPP_LABEL[g.os] ? ` · ${OPP_LABEL[g.os]}` : ""}</div>
                        <div style={{fontSize:11,color:"#cbd5e1",marginTop:3}}>
                          {g.p} pts · {g.fm}/{g.fa} FG · {g.tm}/{g.ta} 3PT · {g.a} ast · {g.to} TO · {g.b} blk · {(g.st ?? g.s) ?? 0} stl
                        </div>
                        <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>
                          USG <strong style={{color:"#f97316"}}>{g.u}%</strong> · ORtg <strong style={{color:"#22c55e"}}>{g.o2}</strong> · eFG <strong style={{color:"#fbbf24"}}>{g.e}%</strong>
                        </div>
                      </div>
                    }>
                      <circle cx={xS(g.u)} cy={yS(Math.max(ORTG_MIN, Math.min(ORTG_MAX, g.o2)))}
                        r={4} fill={fill}
                        stroke="#000" strokeWidth={0.5}
                        style={{cursor:"crosshair"}}/>
                    </Tip>
                  );
                })}

                {/* Axis labels */}
                <text x={(PAD.l+W-PAD.r)/2} y={H-4} textAnchor="middle" fontSize={11} fill="#9ca3af">Usage % (per game, share of team possessions)</text>
                <text x={12} y={H/2} textAnchor="middle" fontSize={11} fill="#9ca3af" transform={`rotate(-90,12,${H/2})`}>Individual Offensive Rating</text>
              </svg>
              <div style={{display:"flex",gap:14,marginTop:8,fontSize:10,color:"#6b7280",flexWrap:"wrap"}}>
                {!hasOpp && <span>● <span style={{color:"#60a5fa"}}>early-season</span> → <span style={{color:"#f97316"}}>late-season</span> color gradient</span>}
                <span>━ orange LOWESS curve · ▒ ±1 SD band</span>
                <span style={{color:slopeColor}}>--- {slope >= 0 ? "+" : ""}{slope.toFixed(2)} OLS slope</span>
              </div>
              <div style={{marginTop:8,fontSize:10,color:"#475569",lineHeight:1.6,fontStyle:"italic"}}>
                <strong style={{color:"#6b7280"}}>How to read:</strong> A flat or rising curve = he holds efficiency even as load grows.
                A falling curve at high USG = production drops when defenses focus on him.
                The shaded band ≈ how variable his per-game output is at that load — wide band = boom/bust at that usage, narrow = stable.
                ORtg is individual (not team-context); USG-proxy is share-of-team-possessions (not the standard NBA-USG with minutes adjustment).
              </div>
            </div>
          </Sec>
        );
      })()}
      </>)}

      {mode === "roles" && (<>
      {/* ── ROLE INFERENCE MATRIX — hoverable with inputs ── */}
      <Sec icon="📊" title="Role Inference Matrix" sub="14 NBA roles, each scored against position peers. The z-score tells you how far this prospect stands above or below the average peer in that role. +2.0σ = Elite (top ~2%), +1.0σ = Impact, −1.0σ or lower = Liability. Hover any role to see the statistical inputs feeding it.">
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
      <Sec icon="🏷" title="NBA Archetype Fit" sub="What NBA role does this prospect project into? PRIMARY is his best-fit archetype (assigned from his dominant role scores). 2ND/3RD are alternative fits within his position. Within each position, cards are sorted left → right by how OFTEN that archetype actually appears in real basketball (common → rare). Rarity is measured across 46k player-seasons — so you can see if a prospect projects into a common role-player template or an unusually scarce profile.">
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
        {/* Orange-only archetype system: rank distinction via weight/opacity, not color.
            Tobias 2026-05-08: split flat grid into 3 position sub-grids (Playmaker/Wing/Big),
            each sorted left→right by value (Non-Specialized → Role Player → Specialist → Creator/Anchor). */}
        {(() => {
          const O = { pri:"#f97316", sec:"#fb923c", ter:"#fdba74" };
          const renderCard = ([name, info]) => {
            const isPrimary   = primaryArch   === name;
            const isSecondary = secondaryArch === name;
            const isTertiary  = tertiaryArch  === name;
            const isRanked    = isPrimary || isSecondary || isTertiary;
            const isTriggered = pipelineTriggered.has(name);
            const rank = isPrimary ? "PRIMARY" : isSecondary ? "2ND" : isTertiary ? "3RD" : null;
            const posMatch = (info.pos||[]).includes(p.pos);
            const cardColor = isPrimary ? O.pri : isSecondary ? O.sec : isTertiary ? O.ter : O.pri;
            const cardOpacity = isPrimary ? 1.0 : isSecondary ? 0.78 : isTertiary ? 0.58 : isTriggered ? 0.4 : 0.22;
            const showDesc = isRanked;
            return (
              <Tip key={name} content={
                <div>
                  <div className="font-bold mb-1" style={{color:info.color}}>{name}</div>
                  <div className="mb-1" style={{color:"#cbd5e1"}}>{info.desc}</div>
                  {info.formula&&<div className="mb-1"><span style={{color:"#94a3b8"}}>Formula:</span> <code className="text-xs" style={{color:"#7dd3fc"}}>{info.formula}</code></div>}
                  {info.freqPct != null && <div className="mb-1"><span style={{color:"#94a3b8"}}>Frequency:</span> <span style={{color: freqColor(info.freqPct)}}>{info.freqPct}% of {(info.pos||["Wing"])[0]}s</span> <span style={{color:"#475569"}}>({freqLabel(info.freqPct)})</span></div>}
                  {ARCHETYPE_TIER[name] && <div className="mb-1"><span style={{color:"#94a3b8"}}>Typical NBA value (n={ARCHETYPE_TIER[name].n}):</span> <span style={{color:TC[ARCHETYPE_TIER[name].ceiling]}}>{ARCHETYPE_TIER[name].ceiling} ceiling</span> <span style={{color:"#475569"}}>· {ARCHETYPE_TIER[name].starterPlus}% Starter+, {ARCHETYPE_TIER[name].allstarPlus}% All-Star+</span></div>}
                  {info.roles&&<div><span style={{color:"#94a3b8"}}>Key roles:</span> <span style={{color:"#f97316"}}>{info.roles.join(", ")}</span></div>}
                  {info.pos&&<div className="mt-1"><span style={{color:"#94a3b8"}}>Positions:</span> <span style={{color:posMatch?"#86efac":"#fca5a5"}}>{info.pos.join(", ")}{posMatch?"":" ⚠ mismatch"}</span></div>}
                  {isTriggered && !isRanked && <div className="mt-1 text-xs" style={{color:"#fb923c"}}>✓ Triggered by pipeline thresholds</div>}
                </div>
              }>
                <div className={`rounded-lg cursor-help transition-all ${isPrimary ? "p-4" : isRanked ? "p-4" : "p-3"}`}
                  style={{
                    background: isRanked
                      ? cardColor + (isPrimary ? "30" : isSecondary ? "22" : "16")
                      : isTriggered ? "#f9731610" : "#0d1117",
                    border: `${isPrimary?"2":"1"}px solid ${isRanked
                      ? cardColor + (isPrimary ? "ff" : isSecondary ? "99" : "55")
                      : isTriggered ? "#f9731633" : "#1f293766"}`,
                    opacity: cardOpacity,
                    boxShadow: isPrimary ? `0 0 12px ${O.pri}33` : "none",
                  }}>
                  <div className="flex items-center gap-2">
                    {rank && (
                      <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${isPrimary ? "text-sm" : ""}`}
                        style={{ background: cardColor + "33", color: cardColor, fontWeight: isPrimary ? 800 : isSecondary ? 700 : 600 }}>
                        {rank}
                      </span>
                    )}
                    {!rank && isTriggered && <span className="text-xs px-1.5 py-0.5 rounded" style={{background:"#f9731618",color:"#fb923c"}}>✓</span>}
                    <div className={`truncate ${isRanked ? "text-sm" : "text-xs"}`}
                      style={{ color: isRanked ? cardColor : isTriggered ? "#fb923c88" : "#4b5563", fontWeight: isPrimary ? 700 : isSecondary ? 600 : 500 }}>
                      {name} <span style={{color:"#475569",fontWeight:400}}>ⓘ</span>
                    </div>
                  </div>
                  {showDesc && <div className="mt-1.5 text-xs leading-relaxed" style={{color: cardColor + "aa", fontWeight: isPrimary ? 500 : 400}}>{info.desc.split(".")[0]}.</div>}
                  {showDesc && info.formula && <div className="mt-1 text-xs" style={{color:"#4b5563"}}>Trigger: {info.formula}</div>}
                  {showDesc && ARCHETYPE_TIER[name] && (
                    <div className="mt-1 text-[10px] leading-snug" style={{color: cardColor + "99"}}>
                      NBA ceiling: <span style={{color: TC[ARCHETYPE_TIER[name].ceiling], fontWeight:600}}>{ARCHETYPE_TIER[name].ceiling}</span>
                      <span style={{color:"#475569"}}> · {ARCHETYPE_TIER[name].starterPlus}% Starter+ · {ARCHETYPE_TIER[name].allstarPlus}% All-Star+</span>
                    </div>
                  )}
                  {info.freqPct != null && (
                    <div className="mt-1 text-[10px] flex items-center gap-1" style={{color: isRanked ? cardColor + "88" : "#475569"}}>
                      <span>{info.freqPct}%</span>
                      <span style={{color: isRanked ? cardColor + "55" : "#374151"}}>·</span>
                      <span>{freqLabel(info.freqPct)}</span>
                    </div>
                  )}
                </div>
              </Tip>
            );
          };
          return (
            <div className="space-y-5">
              {["Playmaker", "Wing", "Big"].map(pos => {
                const meta = POS_META[pos];
                const isPlayerPos = p.pos === pos;
                const archs = archetypesByPos[pos] || [];
                return (
                  <div key={pos}>
                    {/* Position header with player-position highlight */}
                    <div className="flex items-center justify-between mb-2 pb-1.5" style={{borderBottom:`1px solid ${meta.color}33`}}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold uppercase tracking-widest" style={{color: meta.color}}>{meta.label}</span>
                        {isPlayerPos && (
                          <span className="text-xs px-2 py-0.5 rounded" style={{background: meta.color + "22", color: meta.color, border: `1px solid ${meta.color}55`}}>
                            ← Player position
                          </span>
                        )}
                        <span className="text-xs" style={{color:"#475569"}}>({archs.length})</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider" style={{color:"#4b5563"}}>
                        <span>← common</span>
                        <span style={{color:"#1f2937"}}>·</span>
                        <span>rare →</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {archs.map(renderCard)}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Sec>
      </>)}
    </div>
  );
}

// ── Anthro vs. NBA-Tier Comparison Section (Tobias 2026-05-09) ────────────
// Spiegelt die Logik aus OverviewTab's `vs.NBA Tier` — gleicher Look & Feel,
// nur für Anthropometric stats (Height, Weight, Wingspan, Standing Reach).
// Range-Bars: p25 = -1″ vom median (vom Tier), p75 = +1″ (oder ±5 lbs für wt).
// Grün = ≥ Median, Gelb = unter Median aber innerhalb Korridor, Rot = unter Floor.
function AnthroTierComparison({p, compTier, setCompTier, compPos, setCompPos, realHt, estimatedWs, estimatedWt, standingReach}) {
  const tierData = ANTHRO_TIER_THRESHOLDS[compTier] || ANTHRO_TIER_THRESHOLDS.Replacement;
  // Tobias 2026-05-09: 5-Position-Klassifikation (PG/SG/SF/PF/C) statt 3-Tier.
  // Fallback-Hierarchie: posDetailed → infer aus pos+ht+astP → SF (sicherster Mittelwert).
  const autoPos = p.posDetailed || inferDetailedPos(p.pos, p.htIn || realHt, p.astP);
  const posDetailed = compPos || autoPos;
  const posRef = tierData[posDetailed] || tierData.SF;

  // Metrics — only include sr if we have a value (Combine-only field, not always available)
  const metrics = [
    {id:"ht",  label:"Height (with shoes)",     val:realHt,        p50:posRef.ht,  unit:'"',  desc:"Standardized with +1.25″ shoe-lift (NBA convention)."},
    {id:"wt",  label:"Weight",                   val:estimatedWt,   p50:posRef.wt,  unit:" lbs", desc:"NBA Combine median for the chosen tier × position."},
    {id:"ws",  label:"Wingspan",                 val:estimatedWs,   p50:posRef.ws,  unit:'"',  desc:"Reach indicator. NBA average is +3-4″ over height."},
    ...(standingReach != null ? [{id:"sr", label:"Standing Reach", val:standingReach, p50:posRef.sr, unit:'"', desc:"Maximum standing reach. Strongest defensive predictor among anthropometrics."}] : []),
  ];

  const fmtV = (v, unit) => v == null ? "—" : (typeof v === "number" ? v.toFixed(1) : v) + unit;

  // Status pro Metrik
  const assessed = metrics.map(m => {
    // Range: ±1.5″ für ht/ws/sr, ±10 lbs für wt
    const tol = m.id === "wt" ? 10 : 1.5;
    const p25 = m.p50 - tol;
    const p75 = m.p50 + tol;
    if (m.val == null) return {...m, p25, p75, status:"unknown", sc:"#4b5563"};
    let status, sc;
    if (m.val >= m.p50)      { status="Above Median";  sc="#22c55e"; }
    else if (m.val >= p25)   { status="Within Range";  sc="#86efac"; }
    else if (m.val >= p25 - tol) { status="Below Range"; sc="#fbbf24"; }
    else                     { status="Critical Gap";  sc="#ef4444"; }
    return {...m, p25, p75, status, sc};
  });

  const valid = assessed.filter(m => m.val != null);
  // Aggregate-Score: 0-100 basierend darauf wo der Spieler liegt
  const score = valid.length > 0
    ? Math.round(valid.reduce((s, m) => {
        const ratio = m.val / m.p50;
        return s + Math.max(0, Math.min(100, (ratio - 0.92) / 0.16 * 100));
      }, 0) / valid.length)
    : null;
  const scoreColor = score >= 70 ? "#22c55e" : score >= 45 ? "#fbbf24" : "#ef4444";
  const nG = assessed.filter(m => m.status === "Above Median").length;
  const nW = assessed.filter(m => m.status === "Within Range").length;
  const nR = assessed.filter(m => m.status === "Critical Gap" || m.status === "Below Range").length;

  return (
    <Sec icon="📏" title={`Anthro vs. NBA ${compTier} (${posDetailed})`}
      sub="How does this player's frame compare to a typical NBA player at the chosen tier? Median values from NBA Combine 2010-2024 (with shoes). Green = above median · Light green = within range · Yellow = below range · Red = critical gap.">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Compare tier:</span>
        <div className="flex gap-1">
          {["Replacement","Role Player","Starter","All-Star"].map(tier => (
            <button key={tier} onClick={() => setCompTier(tier)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{background: compTier===tier ? (TC[tier]||"#f97316") : "#1f2937",
                      color: compTier===tier ? "#000" : "#9ca3af"}}>
              {tier}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>Compare position:</span>
        <div className="flex gap-1">
          <button onClick={() => setCompPos(null)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{background: compPos===null ? "#f97316" : "#1f2937",
                    color: compPos===null ? "#000" : "#9ca3af"}}>
            Auto ({autoPos})
          </button>
          {["PG","SG","SF","PF","C"].map(pos => (
            <button key={pos} onClick={() => setCompPos(pos)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{background: compPos===pos ? "#f97316" : "#1f2937",
                      color: compPos===pos ? "#000" : "#9ca3af"}}>
              {pos}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 mb-5 p-4 rounded-xl"
        style={{background:"#0d111799", border:`1px solid ${scoreColor}33`}}>
        <div className="text-center px-4">
          <div className="text-xs uppercase tracking-wider mb-1" style={{color:"#6b7280"}}>Frame Match</div>
          <div className="text-4xl font-bold" style={{color:scoreColor, fontFamily:"'Oswald',sans-serif"}}>{score ?? '—'}</div>
        </div>
        <div className="flex-1">
          <div className="flex gap-4 text-sm mb-1" style={{color:"#e5e7eb"}}>
            <span><span style={{color:"#22c55e"}}>●</span> {nG} Above Median</span>
            <span><span style={{color:"#fbbf24"}}>●</span> {nW} Within Range</span>
            <span><span style={{color:"#ef4444"}}>●</span> {nR} Gap</span>
          </div>
          <div className="text-xs" style={{color:"#4b5563"}}>
            Shadow = ±{metrics[0]?.id === "wt" ? "10 lbs" : "1.5″"} corridor around tier median.
            | = median. Values use NBA shoe-lift convention.
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {assessed.map(m => {
          const maxV = Math.max(m.val || 0, m.p75) * 1.08;
          const minV = Math.min(m.val || m.p50, m.p25) * 0.92;
          const range = maxV - minV;
          const toX = v => Math.max(0, Math.min(100, ((v - minV) / range) * 100));
          return (
            <Tip key={m.id} block wide content={
              <div>
                <div className="font-bold mb-1" style={{color:m.sc}}>{m.label}: {m.status}</div>
                <div style={{color:"#94a3b8"}}>{m.desc}</div>
                <div className="mt-1 text-xs" style={{color:"#cbd5e1"}}>
                  Range: {fmtV(m.p25, m.unit)} – {fmtV(m.p75, m.unit)} · Tier median: {fmtV(m.p50, m.unit)}
                </div>
                {m.val != null && <div className="mt-1 text-xs" style={{color:m.sc}}>
                  Player: {fmtV(m.val, m.unit)} ({m.val >= m.p50 ? "+" : ""}{(m.val - m.p50).toFixed(1)}{m.unit} vs. median)
                </div>}
              </div>
            }>
              <div className="cursor-help block">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-base font-semibold" style={{color:"#e5e7eb"}}>{m.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold" style={{color:m.sc, fontFamily:"'Oswald',sans-serif"}}>
                      {m.val != null ? fmtV(m.val, m.unit) : "—"}
                    </span>
                    <span className="text-sm" style={{color:"#4b5563"}}>/ {fmtV(m.p50, m.unit)}</span>
                    <div className="w-3.5 h-3.5 rounded-full" style={{background:m.sc}}/>
                  </div>
                </div>
                <div className="relative h-10 rounded-lg overflow-hidden" style={{background:"#0d1117", border:"1px solid #1f2937"}}>
                  <div className="absolute top-0 bottom-0" style={{
                    left: `${toX(m.p25)}%`,
                    width: `${Math.abs(toX(m.p75) - toX(m.p25))}%`,
                    background: `linear-gradient(90deg, ${m.sc}08, ${m.sc}18, ${m.sc}08)`,
                    borderLeft: `1px dashed ${m.sc}44`, borderRight: `1px dashed ${m.sc}44`,
                  }}/>
                  <div className="absolute top-0 bottom-0 w-0.5" style={{left:`${toX(m.p50)}%`, background:"#ffffff55"}}/>
                  {m.val != null && (
                    <>
                      <div className="absolute top-1 bottom-1 rounded-r" style={{
                        left:0, width:`${toX(m.val)}%`,
                        background:`linear-gradient(90deg, ${m.sc}15, ${m.sc}66)`,
                      }}/>
                      <div className="absolute top-0 bottom-0 w-1.5 rounded" style={{
                        left:`${Math.max(0, toX(m.val) - 0.5)}%`, background:m.sc,
                      }}/>
                    </>
                  )}
                </div>
              </div>
            </Tip>
          );
        })}
      </div>
    </Sec>
  );
}

function BodyTab({p}) {
  // Tobias 2026-05-06: Slider entfernt — Scatter ist statisch, Spieler-Position fix.
  const [combineData, setCombineData] = useState(null);
  const [hoverPlayer, setHoverPlayer] = useState(null);
  const [hoverPos, setHoverPos] = useState({x:0,y:0});
  // Tobias 2026-05-09: Anthro-Tier-Vergleich (analog Overview Tab vs.NBA-Tier).
  // Default "Starter" — gleicher Anchor wie Overview-Tab.
  const [anthroCompTier, setAnthroCompTier] = useState("Starter");
  // Tobias 2026-06-03 v12: Body Anthro position selector
  const [anthroCompPos, setAnthroCompPos] = useState(null);  // null = auto-detect from posDetailed

  // ── Fetch combine data on mount ──
  // Tobias 2026-05-06 BUG-FIX: API_BASE.replace("/api","") matchte das
  // ERSTE "/api" (= ":/api" nach https:) → kaputte URL "https:/.prospecttheory.io/api/combine"
  // → Promise rejected → catch() → setCombineData([]) → Plot leer.
  // Fix: direkt API_BASE nutzen (Endpoint ist /combine ohne /api-Präfix).
  useEffect(() => {
    fetch(`${API_BASE}/combine`)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(d => setCombineData(d.players || []))
      .catch(err => { console.warn("Combine fetch failed:", err); setCombineData([]); });
  }, []);

  // Tobias 2026-05-06: bevorzuge echte NBA-Anthro-Daten wenn verfügbar.
  // /api/combine liefert 1.835 NBA-Spieler aus wingspan_all_2026 + Combine-Weight.
  // Wenn Spieler matched, nutze echte ht (mit Schuhen) / ws aus Wingspan-CSV.
  const combineMatch = (combineData || []).find(c =>
    c.name && p.name && c.name.toLowerCase() === p.name.toLowerCase()
  );

  // ── Height (immer mit Schuhen): NBA-DB > Profile ──
  // Tobias 2026-05-09: ht_verified Flag aus /api/combine zeigt verifizierte
  // 2026er Combine-Daten vs. wingspan-CSV-Standard-Daten.
  const realHt = combineMatch?.ht ?? p.htIn;
  const isHtVerified = !!combineMatch?.ht_verified || !!combineMatch?.ht;
  const isHt2026Verified = !!combineMatch?.ht_verified;

  // ── Stats-Enriched Imputation für WS und WT (Tobias 2026-05-06) ──
  // Statt simpler Position-Regression nutzen wir Multi-Variate-Modelle die aus
  // NBA-Combine-Spielern + ihren BartTorvik-Stats trainiert sind:
  //
  // WS = 21.05 + 0.762·ht + 0.30·BLK% + 0.131·STL% + 0.029·DRB% − 0.149·DBPM
  //      + 0.205·is_Big − 0.701·is_Playmaker  (R²=0.735, CV=0.728±0.027, MAE 1.56″)
  //
  // WT = −19.26 + 2.82·ht + 2.25·ORB% − 0.16·DRB% − 0.55·BLK% − 0.04·BPM
  //      + 12.49·is_Big − 5.27·is_Playmaker     (R²=0.614, CV=0.584±0.050, MAE 11.7 lbs)
  //
  // Plus: -8 lbs Age-Discount für age<20 (Pre-Draft sind schlanker als
  // NBA-Combine-Durchschnitt der etablierten Prospects).
  // Validation Cooper Flagg: WS imputed 84.0″ vs real 84.0″ ✓
  const _imputeAnthro = () => {
    const h = realHt || 78;
    const blkP = p.blkP || 0, stlP = p.stlP || 0;
    const orbP = p.orbP || 0, drbP = p.drbP || 0;
    const bpm = p.bpm || 0, dbpm = p.dbpm || 0;
    const isBig = p.pos === "Big" ? 1 : 0;
    const isPM = p.pos === "Playmaker" ? 1 : 0;
    const ws = 21.05 + 0.762*h + 0.30*blkP + 0.131*stlP + 0.029*drbP - 0.149*dbpm + 0.205*isBig - 0.701*isPM;
    let wt = -19.26 + 2.82*h + 2.25*orbP - 0.16*drbP - 0.55*blkP - 0.04*bpm + 12.49*isBig - 5.27*isPM;
    if (p.age != null && p.age < 20) wt -= 8;  // Age-Discount
    return {
      ws: Math.round(ws * 10) / 10,
      wt: Math.max(150, Math.round(wt)),
    };
  };

  // ── Wingspan: NBA-DB > Profile > Stats-enriched Imputation ──
  const _imputed = _imputeAnthro();
  const estimatedWs = combineMatch?.ws ?? p.ws ?? _imputed.ws;
  // Tobias 2026-05-09: ws_verified Flag aus 2026er Combine
  const isWsVerified = !!combineMatch?.ws;
  const isWs2026Verified = !!combineMatch?.ws_verified;
  const isWsEstimated = !isWsVerified && !p.ws;

  // ── Weight: Combine > Profile > Stats-enriched Imputation ──
  const isWtVerified = !!combineMatch?.wt;
  const isWt2026Verified = !!combineMatch?.wt_verified;
  const estimatedWt = combineMatch?.wt ?? p.wt ?? _imputed.wt;
  const isWtEstimated = !isWtVerified && !p.wt;

  // ── Standing Reach (Tobias 2026-05-09): NEW Combine field ──
  const standingReach = combineMatch?.sr ?? p.comb?.reach ?? null;
  const isSrVerified = !!combineMatch?.sr_verified;

  // Tobias 2026-05-06: WS Delta gegen die echte (with-shoes) Höhe rechnen.
  const wsDelta = estimatedWs - (realHt || 78);
  const apeRatio = estimatedWs / (realHt || 78);

  // ── Frame labels ──
  const wsLabel = wsDelta > 6 ? "Elite Length / Disruptor Frame"
    : wsDelta > 3 ? "Above Average Length"
    : wsDelta > 0 ? "Neutral Wingspan"
    : "Negative Wingspan";
  const wsLabelColor = wsDelta > 6 ? "#22c55e" : wsDelta > 3 ? "#86efac" : wsDelta > 0 ? "#6b7280" : "#ef4444";
  const posMedianWt = p.pos==="Playmaker" ? 190 : p.pos==="Big" ? 240 : 215;
  const wtDeviation = estimatedWt - posMedianWt;
  const wtLabel = wtDeviation > 15 ? "High Strength / Power Build"
    : wtDeviation < -15 ? "Slight Frame / Needs Development"
    : "Average Frame";
  const wtLabelColor = wtDeviation > 15 ? "#22c55e" : wtDeviation < -15 ? "#ef4444" : "#6b7280";

  const hasCombine = p.comb != null;
  const htDisplay = p.ht || (p.htIn ? `${Math.floor(p.htIn/12)}'${p.htIn%12}"` : "—");

  // ── Prospect scatter (Tobias 2026-05-06: deaktiviert) ──
  // Globals PLAYERS / PLAYER_LIST sind auf Player-Page meist leer (nur durch Big-Board
  // befüllt). Wir zeigen stattdessen den NBA-Combine-Scatter unten — der hat
  // 488 Spieler aus /api/combine und ist immer voll. Class-Scatter wäre redundant.
  const ProspectScatter = () => {
    // Quelle: modulare Globals PLAYERS / PLAYER_LIST (vom Board befüllt).
    // Wir nutzen ausschließlich reale Messwerte — keine Position-Schätzungen —
    // damit der Plot nicht durch systematische Ape-Index-Annahmen verzerrt wird.
    const allPts = PLAYER_LIST.map(n => ({name:n, ...PLAYERS[n]}))
      .filter(q => q.htIn && q.ws && q.wt)
      .map(q => ({
        name: q.name,
        htIn: q.htIn,
        ws: q.ws,
        wt: q.wt,
        pos: q.pos || "?",
        yr: q.yr || null,
        source: q.source || "ncaa",
        isSelected: q.name === p.name,
      }));

    if (allPts.length < 3) {
      return <div style={{height:100,display:"flex",alignItems:"center",justifyContent:"center",color:"#4b5563",fontSize:12}}>
        Not enough prospects with complete height/weight/wingspan data for the scatter plot.
      </div>;
    }

    const W=580, H=340, PAD={l:46,r:20,t:16,b:38};
    const IW=W-PAD.l-PAD.r, IH=H-PAD.t-PAD.b;

    // X = Wingspan, Y = Height
    const allWs = allPts.map(q=>q.ws);
    const allHt = allPts.map(q=>q.htIn);
    const minWs=Math.min(...allWs)-1, maxWs=Math.max(...allWs)+1;
    const minHt=Math.min(...allHt)-1, maxHt=Math.max(...allHt)+1;
    const xS=(ws)=>PAD.l+(ws-minWs)/(maxWs-minWs)*IW;
    const yS=(ht)=>PAD.t+IH-(ht-minHt)/(maxHt-minHt)*IH;

    // Punktgröße ~ Gewicht
    const allWt = allPts.map(q=>q.wt);
    const minWt=Math.min(...allWt), maxWt=Math.max(...allWt);
    const rSize = (wt) => {
      if (maxWt === minWt) return 5;
      return 4 + ((wt - minWt) / (maxWt - minWt)) * 6; // 4..10px
    };

    // Positionsfarben (konsistent mit Big Board)
    const posColor = (pos) => pos === "Playmaker" ? "#3b82f6"
      : pos === "Big" ? "#8b5cf6"
      : pos === "Wing" ? "#f97316"
      : "#6b7280";

    const xTicks = [72,74,76,78,80,82,84,86,88,90,92,94].filter(v=>v>=minWs&&v<=maxWs);
    const yTicks = [68,70,72,74,76,78,80,82,84,86,88].filter(v=>v>=minHt&&v<=maxHt);

    // Sortierung: selected zuletzt zeichnen (liegt oben)
    const drawOrder = [...allPts].sort((a,b) => (a.isSelected?1:0) - (b.isSelected?1:0));

    // Position-Counts für Legende
    const posCounts = allPts.reduce((acc,q) => { acc[q.pos]=(acc[q.pos]||0)+1; return acc; }, {});

    return (
      <div style={{position:"relative"}}>
        {hoverPlayer && !hoverPlayer.isCombine && (
          <div style={{
            position:"fixed",zIndex:100,
            left:Math.min(hoverPos.x+12,window.innerWidth-240),
            top:Math.max(hoverPos.y-10,8),
            background:"#1e293b",border:"1px solid #475569",
            borderRadius:8,padding:"8px 12px",pointerEvents:"none",
            boxShadow:"0 4px 20px rgba(0,0,0,0.6)",minWidth:200,
          }}>
            <div style={{fontSize:13,fontWeight:700,color:posColor(hoverPlayer.pos),marginBottom:4}}>{hoverPlayer.name}</div>
            <div style={{fontSize:11,color:"#9ca3af"}}>{hoverPlayer.pos}{hoverPlayer.yr?` · ${hoverPlayer.yr}`:""}{hoverPlayer.source && hoverPlayer.source!=="ncaa"?` · ${hoverPlayer.source}`:""}</div>
            <div style={{fontSize:11,color:"#e5e7eb",marginTop:4}}>
              Ht: {Math.floor(hoverPlayer.htIn/12)}'{hoverPlayer.htIn%12}" ({hoverPlayer.htIn}")<br/>
              WS: {hoverPlayer.ws.toFixed(1)}" · Δ: {(hoverPlayer.ws-hoverPlayer.htIn).toFixed(1)}"<br/>
              Wt: {hoverPlayer.wt} lbs
            </div>
          </div>
        )}
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
          {/* Grid */}
          {yTicks.map(ht=>(
            <g key={`y${ht}`}>
              <line x1={PAD.l} x2={W-PAD.r} y1={yS(ht)} y2={yS(ht)} stroke="#1f2937" strokeWidth={1}/>
              <text x={PAD.l-4} y={yS(ht)+4} textAnchor="end" fontSize={8} fill="#4b5563">{Math.floor(ht/12)}'{ht%12}"</text>
            </g>
          ))}
          {xTicks.map(ws=>(
            <g key={`x${ws}`}>
              <line x1={xS(ws)} x2={xS(ws)} y1={PAD.t} y2={H-PAD.b} stroke="#1f2937" strokeWidth={1}/>
              <text x={xS(ws)} y={H-PAD.b+12} textAnchor="middle" fontSize={8} fill="#4b5563">{ws}"</text>
            </g>
          ))}
          {/* WS=Ht Referenzlinie */}
          {(() => {
            const lo = Math.max(minWs, minHt);
            const hi = Math.min(maxWs, maxHt);
            if (hi <= lo) return null;
            return (
              <>
                <line x1={xS(lo)} x2={xS(hi)} y1={yS(lo)} y2={yS(hi)}
                  stroke="#374151" strokeWidth={1} strokeDasharray="4,3" opacity={0.5}/>
                <text x={xS(lo)+2} y={yS(lo)-3} fontSize={8} fill="#4b5563" opacity={0.6}>WS=Ht</text>
              </>
            );
          })()}
          {/* Achsenbeschriftung */}
          <text x={W/2} y={H-PAD.b+28} textAnchor="middle" fontSize={10} fill="#6b7280">Wingspan (inches)</text>
          <text x={12} y={H/2} textAnchor="middle" fontSize={10} fill="#6b7280" transform={`rotate(-90,12,${H/2})`}>Height (inches)</text>
          {/* Punkte (alle — selected zuletzt) */}
          {drawOrder.map((q,i)=>{
            const isSel = q.isSelected;
            const col = posColor(q.pos);
            const r = rSize(q.wt) + (isSel ? 3 : 0);
            return (
              <circle key={i} cx={xS(q.ws)} cy={yS(q.htIn)} r={r}
                fill={col}
                stroke={isSel ? "#fed7aa" : col}
                strokeWidth={isSel ? 2 : 0.5}
                opacity={isSel ? 1 : 0.35}
                style={{cursor:"pointer", transition:"opacity 120ms"}}
                onMouseEnter={(e)=>{setHoverPlayer({...q, isCombine:false});setHoverPos({x:e.clientX,y:e.clientY});}}
                onMouseMove={(e)=>{if(hoverPlayer){setHoverPos({x:e.clientX,y:e.clientY});}}}
                onMouseLeave={()=>setHoverPlayer(null)}/>
            );
          })}
          {/* Label für Selected Player (immer sichtbar) */}
          {(() => {
            const sel = allPts.find(q => q.isSelected);
            if (!sel) return null;
            const lastName = sel.name.split(" ").slice(-1)[0];
            return (
              <text x={xS(sel.ws)+rSize(sel.wt)+6} y={yS(sel.htIn)+4}
                fontSize={12} fontWeight="bold" fill={posColor(sel.pos)}
                style={{textShadow:"0 0 4px #000, 0 0 4px #000"}}>{lastName}</text>
            );
          })()}
        </svg>
        <div style={{fontSize:10,color:"#6b7280",marginTop:6,display:"flex",gap:14,flexWrap:"wrap",alignItems:"center"}}>
          {["Playmaker","Wing","Big"].map(pos => (
            <span key={pos} style={{display:"inline-flex",alignItems:"center",gap:4}}>
              <span style={{display:"inline-block",width:10,height:10,borderRadius:"50%",background:posColor(pos)}}/>
              <span style={{color:"#9ca3af"}}>{pos}</span>
              <span style={{color:"#4b5563"}}>({posCounts[pos]||0})</span>
            </span>
          ))}
          <span style={{color:"#4b5563"}}>Dot size ∝ weight · {allPts.length} prospects · hover for details</span>
        </div>
      </div>
    );
  };

  // ── Combine scatter helpers ──
  const CombineScatter = () => {
    // Tobias 2026-05-06: defensive Filterung — Werte können number ODER string sein,
    // ht=0/ws=0 müssen ausgeschlossen werden, aber 76.0 muss durchgehen.
    const pts = (combineData || []).filter(c => {
      const ht = Number(c.ht); const ws = Number(c.ws);
      return !isNaN(ht) && !isNaN(ws) && ht > 0 && ws > 0;
    });
    if (combineData === null) return <div style={{height:320,display:"flex",alignItems:"center",justifyContent:"center",color:"#4b5563",fontSize:12}}>Loading combine data…</div>;
    if (pts.length === 0) return <div style={{height:100,display:"flex",alignItems:"center",justifyContent:"center",color:"#4b5563",fontSize:12}}>
      No combine data available (combineData length: {(combineData||[]).length})
    </div>;

    // Tobias 2026-05-06: Position-Color-Mapping (konsistent mit Big Board / Overview).
    const posColor = (pos) => pos === "Playmaker" ? "#3b82f6"
      : pos === "Big" ? "#8b5cf6"
      : pos === "Wing" ? "#f97316"
      : "#94a3b8";  // unknown/fallback

    const W=580, H=320, PAD={l:46,r:20,t:16,b:38};
    const IW=W-PAD.l-PAD.r, IH=H-PAD.t-PAD.b;

    // AXES: X = Wingspan, Y = Height (user request)
    const allWs = pts.map(c=>c.ws);
    const allHt = pts.map(c=>c.ht);
    const minWs=Math.max(70,Math.min(...allWs)-1), maxWs=Math.min(100,Math.max(...allWs)+1);
    const minHt=Math.max(68,Math.min(...allHt)-1), maxHt=Math.min(96,Math.max(...allHt)+1);
    const xS=(ws)=>PAD.l+(ws-minWs)/(maxWs-minWs)*IW;  // X = wingspan
    const yS=(ht)=>PAD.t+IH-(ht-minHt)/(maxHt-minHt)*IH;  // Y = height

    const pHt = p.htIn || (hasCombine ? p.comb?.height_ns : null);
    const pWs = p.ws || (hasCombine ? p.comb?.wingspan : null) || estimatedWs;
    const pWt = p.wt || (hasCombine ? p.comb?.weight : null) || estimatedWt;

    const rSize = (wt) => {
      if (!wt) return 4;
      return Math.max(3, Math.min(9, ((wt - 170) / 130) * 6 + 3));
    };

    const xTicks = [72,74,76,78,80,82,84,86,88,90,92,94].filter(v=>v>=minWs&&v<=maxWs);
    const yTicks = [68,70,72,74,76,78,80,82,84,86,88].filter(v=>v>=minHt&&v<=maxHt);

    return (
      <div style={{position:"relative"}}>
        {hoverPlayer && (
          <div style={{
            position:"fixed",zIndex:100,
            left:Math.min(hoverPos.x+12,window.innerWidth-220),
            top:Math.max(hoverPos.y-10,8),
            background:"#1e293b",border:"1px solid #475569",
            borderRadius:8,padding:"8px 12px",pointerEvents:"none",
            boxShadow:"0 4px 20px rgba(0,0,0,0.6)",minWidth:180,
          }}>
            <div style={{fontSize:13,fontWeight:700,color:posColor(hoverPlayer.pos),marginBottom:4}}>{hoverPlayer.name}</div>
            <div style={{fontSize:11,color:"#9ca3af"}}>Draft {hoverPlayer.year ?? "?"} · {hoverPlayer.pos_raw || hoverPlayer.pos || "?"}</div>
            <div style={{fontSize:11,color:"#e5e7eb",marginTop:4}}>
              Ht: {Math.floor((hoverPlayer.ht||0)/12)}'{Math.round((hoverPlayer.ht||0)%12)}" ({hoverPlayer.ht?.toFixed(1)}")<br/>
              WS: {hoverPlayer.ws?.toFixed(1)}" · Δ: {((hoverPlayer.ws||0)-(hoverPlayer.ht||0)).toFixed(1)}"<br/>
              Wt: {hoverPlayer.wt ? `${hoverPlayer.wt} lbs` : "—"}
            </div>
          </div>
        )}
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
          {/* Grid — Y = Height */}
          {yTicks.map(ht=>(
            <g key={ht}>
              <line x1={PAD.l} x2={W-PAD.r} y1={yS(ht)} y2={yS(ht)} stroke="#1f2937" strokeWidth={1}/>
              <text x={PAD.l-4} y={yS(ht)+4} textAnchor="end" fontSize={8} fill="#4b5563">{Math.floor(ht/12)}'{ht%12}"</text>
            </g>
          ))}
          {/* Grid — X = Wingspan */}
          {xTicks.map(ws=>(
            <g key={ws}>
              <line x1={xS(ws)} x2={xS(ws)} y1={PAD.t} y2={H-PAD.b} stroke="#1f2937" strokeWidth={1}/>
              <text x={xS(ws)} y={H-PAD.b+12} textAnchor="middle" fontSize={8} fill="#4b5563">{ws}"</text>
            </g>
          ))}
          {/* Equal line (ws=ht) */}
          <line x1={xS(minWs)} x2={xS(Math.min(maxWs,maxHt))} y1={yS(minWs)} y2={yS(Math.min(maxWs,maxHt))}
            stroke="#374151" strokeWidth={1} strokeDasharray="4,3" opacity={0.5}/>
          <text x={xS(minWs)+2} y={yS(minWs)-3} fontSize={8} fill="#4b5563" opacity={0.6}>WS=Ht</text>
          {/* Axis labels */}
          <text x={W/2} y={H-PAD.b+28} textAnchor="middle" fontSize={10} fill="#6b7280">Wingspan (inches)</text>
          <text x={12} y={H/2} textAnchor="middle" fontSize={10} fill="#6b7280" transform={`rotate(-90,12,${H/2})`}>Height (no shoes)</text>
          {/* All combine players: X=ws, Y=ht
              Tobias 2026-05-06: Position-Färbung mit Transparenz.
              Selected = volle Sättigung, andere = transparent (alpha 0.30). */}
          {pts.filter(c=>c.name!==p.name).map((c,i)=>{
            const r = rSize(c.wt);
            const col = posColor(c.pos);
            return (
              <circle key={i} cx={xS(c.ws)} cy={yS(c.ht)} r={r}
                fill={col} stroke={col} strokeWidth={0.3} opacity={0.30}
                style={{cursor:"pointer", transition:"opacity 120ms"}}
                onMouseEnter={(e)=>{setHoverPlayer(c);setHoverPos({x:e.clientX,y:e.clientY});}}
                onMouseMove={(e)=>{if(hoverPlayer){setHoverPos({x:e.clientX,y:e.clientY});}}}
                onMouseLeave={()=>setHoverPlayer(null)}/>
            );
          })}
          {/* Prospect dot — voll-saturiert mit Highlight-Stroke */}
          {pHt && pWs && (() => {
            const selCol = posColor(p.pos) || "#f97316";
            return (
              <g>
                <circle cx={xS(pWs)} cy={yS(pHt)} r={rSize(pWt)+3} fill={selCol} stroke="#ffffff" strokeWidth={2} opacity={1}/>
                <text x={xS(pWs)+12} y={yS(pHt)+4} fontSize={12} fontWeight="bold" fill={selCol}
                  style={{textShadow:"0 0 4px #000, 0 0 4px #000"}}>{p.name?.split(" ").slice(-1)[0]}</text>
              </g>
            );
          })()}
        </svg>
        <div style={{fontSize:10,color:"#6b7280",marginTop:6,display:"flex",gap:14,flexWrap:"wrap",alignItems:"center"}}>
          {["Playmaker","Wing","Big"].map(pos => (
            <span key={pos} style={{display:"inline-flex",alignItems:"center",gap:4}}>
              <span style={{display:"inline-block",width:10,height:10,borderRadius:"50%",background:posColor(pos),opacity:0.6}}/>
              <span style={{color:"#9ca3af"}}>{pos}</span>
            </span>
          ))}
          <span style={{color:"#4b5563"}}>Point size ∝ weight · {pts.length} combine players (2003–2025) · selected player highlighted</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* ── PHYSICAL PROFILE ── */}
      <Sec icon="📏" title="Physical Profile" sub={(() => {
        // Tobias 2026-05-06: Höhe IMMER mit Schuhen (+1.25″ NBA-Standard).
        // Sub-Title differenziert nach Datenquelle: NBA-verified vs. position-imputed.
        const hasVerified = isHtVerified || isWsVerified || isWtVerified;
        const allVerified = isHtVerified && isWsVerified && isWtVerified;
        if (allVerified) return `All measurements verified from NBA database. Height with shoes (+1.25″ NBA standard). Wingspan Delta = Wingspan − Height. NBA average: +3″ to +4″.`;
        if (hasVerified) {
          const verified = [
            isHtVerified && "height", isWsVerified && "wingspan", isWtVerified && "weight",
          ].filter(Boolean).join(" / ");
          return `${verified.charAt(0).toUpperCase() + verified.slice(1)} verified from NBA database. Other values (≈) imputed from position average. Height with shoes (+1.25″ NBA standard).`;
        }
        return `Class 2026 prospect — no NBA combine data yet. All values (≈) estimated from height + position average. Height with shoes (+1.25″ NBA standard).`;
      })()}>
        {/* Tobias 2026-05-06 v2: Wingspan Ratio entfernt — redundant zu WS Delta.
            Jede Card zeigt explizit Source: NBA-Combine-verified / Stats-imputed. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            {
              label: "Height",
              value: isHtVerified
                ? `${Math.floor(realHt/12)}'${(Math.round((realHt - Math.floor(realHt/12)*12)*10)/10)}"`
                : htDisplay,
              imputed: !isHtVerified && !p.htIn,
              accent: null,
              source: isHtVerified ? `NBA Combine ${combineMatch?.year || ""}` : (p.htIn ? "BartTorvik / RealGM" : "Position avg ≈"),
              tooltip: isHtVerified
                ? `Measured at NBA Draft Combine ${combineMatch?.year || ""} (no shoes + 1.25″ NBA-standard shoe lift).`
                : (p.htIn ? "Reported height (BartTorvik/RealGM, with shoes by college convention)." : "Estimated from position-average — no measurement on file."),
            },
            {
              label: "Weight",
              value: `${estimatedWt} lbs`,
              imputed: isWtEstimated,
              accent: wtLabelColor,
              source: isWtVerified ? `NBA Combine ${combineMatch?.year || ""}` : "Stats-imputed ≈",
              tooltip: isWtVerified
                ? `Measured at NBA Draft Combine ${combineMatch?.year || ""}.`
                : `Imputed via multi-variate regression: WT = -19.26 + 2.82·ht + 2.25·ORB% − 0.16·DRB% − 0.55·BLK% − 0.04·BPM + 12.49·is_Big − 5.27·is_PM. Trained on 528 NBA-Combine players (R²=0.61, MAE 11.7 lbs).${p.age!=null && p.age<20 ? " Plus −8 lbs Pre-Draft age discount." : ""}`,
            },
            {
              label: "Wingspan",
              value: `${estimatedWs.toFixed(1)}"`,
              imputed: isWsEstimated,
              accent: wsLabelColor,
              source: isWsVerified ? "NBA Wingspan-DB" : "Stats-imputed ≈",
              tooltip: isWsVerified
                ? `Measured wingspan from NBA database (1.835 verified players including Combine, G-League Camp, Adidas Eurocamp).`
                : `Imputed via multi-variate regression: WS = 21.05 + 0.762·ht + 0.30·BLK% + 0.131·STL% + 0.029·DRB% − 0.149·DBPM + 0.205·is_Big − 0.701·is_PM. Trained on 1.266 NBA players (R²=0.74, MAE 1.56″).`,
            },
            {
              label: "WS Delta",
              value: `${wsDelta >= 0 ? "+" : ""}${wsDelta.toFixed(1)}"`,
              imputed: false,
              accent: wsLabelColor,
              source: (isHtVerified && isWsVerified) ? "Computed from verified" : (isWsEstimated ? "Computed from imputed" : "Computed"),
              tooltip: `Wingspan minus Height (with shoes). NBA average: +3″ to +4″.`,
            },
          ].map(({label, value, imputed, accent, source, tooltip}) => (
            <Tip key={label} content={<div style={{maxWidth:280}}><div className="font-bold mb-1" style={{color:accent||"#f97316"}}>{label}</div><div className="text-xs" style={{color:"#cbd5e1",lineHeight:1.5}}>{tooltip}</div></div>}>
              <div className="rounded-lg p-3 text-center cursor-help" style={{
                background: "#0d1117",
                border: imputed ? "1px dashed #475569" : (accent ? `1px solid ${accent}33` : "1px solid #1f2937"),
              }}>
                <div className="text-xs uppercase tracking-wider" style={{color:"#6b7280"}}>{label}{imputed ? " ≈" : ""}</div>
                <div className="font-bold text-lg mt-0.5" style={{
                  color: accent || "#e5e7eb",
                  fontFamily:"'Oswald',sans-serif",
                  fontStyle: imputed ? "italic" : "normal",
                }}>{value}</div>
                <div className="text-[10px] mt-1.5 truncate" style={{
                  color: imputed ? "#94a3b8" : "#22c55e",
                  opacity: 0.85,
                }}>{imputed ? "≈ " : "✓ "}{source}</div>
              </div>
            </Tip>
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

      </Sec>

      {/* ── ANTHRO vs. NBA-TIER COMPARISON (Tobias 2026-05-09) ──
           Logik & Look spiegelt OverviewTab's vs.NBA-Tier-Vergleich. */}
      <AnthroTierComparison
        p={p}
        compTier={anthroCompTier}
        setCompTier={setAnthroCompTier}
        compPos={anthroCompPos}
        setCompPos={setAnthroCompPos}
        realHt={realHt}
        estimatedWs={estimatedWs}
        estimatedWt={estimatedWt}
        standingReach={standingReach}
      />

      {/* ── NBA COMBINE SCATTER ──
           Tobias 2026-05-06: einziger Scatter, Class-Scatter entfernt.
           Quelle: /api/combine (488 Combine-Spieler 2000-2022). */}
      <Sec icon="📐" title="Wingspan vs. Height (NBA Combine 2000-2022)"
        sub="488 NBA Draft Combine attendees with complete measurements. X = wingspan, Y = height, point size = weight. Orange dot = selected player (positioned by his measured/estimated values). Hover any dot for name, year, height, wingspan, weight.">
        <CombineScatter />
      </Sec>
    </div>
  );
}

// ─ old anthro comps code removed ─

// ═══════════════════════════════════════════════════════════
// TAB: COMPS (Statistical Prospect-to-Prospect — anthro in Body tab)
// ═══════════════════════════════════════════════════════════
function CompsTab({p}) {
  const [nbaOnly, setNbaOnly] = useState(false);
  const allComps = p.statComps || [];
  const nbaCompsOnly = allComps.filter(c => c.nba);
  // When NBA-only is active but there are no NBA comps (e.g. 2026 prospects),
  // Tobias 2026-05-06: Sortierung nach similarity DESC (vorher kam manchmal
  // schlechtester Match oben raus). NBA-Filter ist ein zweites Sieb.
  const sortBySim = (a, b) => (b.sim ?? -1) - (a.sim ?? -1);
  const fStat = nbaOnly
    ? (nbaCompsOnly.length > 0
        ? [...nbaCompsOnly].sort(sortBySim)
        : [...allComps].sort((a,b) => {
            const tr = {"All-Star":5,"Starter":4,"Role Player":3,"Replacement":2,"Negative":1};
            return (tr[b.tier]??0) - (tr[a.tier]??0);
          }))
    : [...allComps].sort(sortBySim);
  const nbaFallback = nbaOnly && nbaCompsOnly.length === 0 && allComps.length > 0;

  // Similarity values from backend (Z-distance scaled 0-100, observed range
  // typically 30-95 for top comps — players are unique, perfect 100% is rare).
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

  // Tobias 2026-05-06: Schwellen an die Backend-Skala angepasst.
  // Backend nutzt Z-Distance-Range [0.635, 1.716] → 100% / 0%.
  // Real-world Top-Comps für unique Spieler (Cooper Flagg) sind typisch 35-50%.
  // Das ist methodisch ehrlich: niemand ist "97% identisch" — das wäre Marketing-Spin.
  const simColor = (s) => s > 70 ? "#22c55e" : s > 55 ? "#86efac" : s > 40 ? "#3b82f6" : s > 25 ? "#fbbf24" : "#ef4444";

  // Tobias 2026-05-06: Shooting-Pct-Färbung wie im Shooting-Tab Court.
  // Konsistente Skalen: TS%, FT%, 3P% mit standard NBA-Schwellen.
  const tsColor = (v) => v == null ? "#9ca3af" : v >= 60 ? "#22c55e" : v >= 55 ? "#86efac" : v >= 50 ? "#fbbf24" : "#ef4444";
  const ftColor = (v) => v == null ? "#9ca3af" : v >= 80 ? "#22c55e" : v >= 72 ? "#86efac" : v >= 65 ? "#fbbf24" : "#ef4444";
  const tpColor = (v) => v == null ? "#9ca3af" : v >= 38 ? "#22c55e" : v >= 34 ? "#86efac" : v >= 30 ? "#fbbf24" : "#ef4444";

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
      <Sec icon="📊" title="Statistical Comps" sub="Nearest-neighbor matches based on what THIS prospect looked like before the NBA — measured across 8 dimensions (BPM, USG%, TS%, AST%, STL%, BLK%, 3P%, FT%) using era-adjusted percentiles. 'Reached Tier' = the comp's verified NBA outcome (or our model's projection for current prospects).">
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
                <td className="px-2 font-semibold" style={{color:tsColor(p.ts)}}>{fmt(p.ts)}</td>
                <td className="px-2">{fmt(p.astP)}</td>
                <td className="px-2">{fmt(p.stlP)}</td>
                <td className="px-2">{fmt(p.blkP)}</td>
                <td className="px-2 font-semibold" style={{color:tpColor(p.tp)}}>{fmt(p.tp)}</td>
                <td className="px-2 font-semibold" style={{color:ftColor(p.ft)}}>{fmt(p.ft)}</td>
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
                      <Tip content={
                        <div style={{maxWidth:240}}>
                          <div className="font-bold mb-1" style={{color:simColor(sim||0)}}>Match: {sim}%</div>
                          {c.rawSim != null && <div className="text-xs" style={{color:"#94a3b8"}}>Absolute similarity (z-distance scale): <strong style={{color:"#cbd5e1"}}>{c.rawSim}%</strong></div>}
                          <div className="text-xs mt-1" style={{color:"#9ca3af"}}>The displayed % is rescaled within this comp pool (top → 95%, bottom → 50%) for differentiation. Absolute scale rarely exceeds ~50% for unique prospects.</div>
                        </div>
                      }>
                        <div className="flex items-center gap-1 cursor-help">
                          <div className="w-12 h-2 rounded-full overflow-hidden" style={{background:"#1f2937"}}>
                            <div className="h-full rounded-full" style={{width:`${sim||0}%`, background:simColor(sim||0)}}/>
                          </div>
                          <span className="font-bold text-xs" style={{color:simColor(sim||0)}}>{sim != null ? `${sim}%` : "—"}</span>
                        </div>
                      </Tip>
                    </td>
                    <td className="px-2" style={{color:valColor(c.bpm>10?90:c.bpm>5?65:35)}}>{fmt(c.bpm)}</td>
                    <td className="px-2">{fmt(c.usg)}</td>
                    <td className="px-2" style={{color:tsColor(c.ts)}}>{fmt(c.ts)}</td>
                    <td className="px-2">{fmt(c.astP)}</td>
                    <td className="px-2">{fmt(c.stlP)}</td>
                    <td className="px-2">{fmt(c.blkP)}</td>
                    <td className="px-2" style={{color:tpColor(c.tp)}}>{fmt(c.tp)}</td>
                    <td className="px-2" style={{color:ftColor(c.ft)}}>{fmt(c.ft)}</td>
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

        {/* Legend (Tobias 2026-05-06 v2: relative re-scaling im Pool) */}
        {fStat.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3 text-xs" style={{color:"#475569"}}>
            <span>Match: <strong style={{color:"#cbd5e1"}}>relative</strong> similarity within shown comp pool (top match → 95%, bottom → 50%). Hover any value to see the absolute Z-distance score. Sorted by best match first.</span>
            <span>⚠ = physical mismatch (&gt;3" height diff) — statistical similarity may not translate</span>
            <span>Stats from pre-draft season only · era-adjusted</span>
          </div>
        )}
      </Sec>

      {/* Tobias 2026-05-06: Physical Comps Coming Soon-Box entfernt. */}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: RISK PROFILE  (Phase 2 — Market vs Merit + two risk axes)
// ═══════════════════════════════════════════════════════════
function RiskBar({label, pct, color, blurb}) {
  return (
    <div className="rounded-xl p-4" style={{background:"#0d1117",border:`1px solid ${color}33`}}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-semibold text-gray-200">{label}</span>
        <span className="text-2xl font-bold" style={{color}}>{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{background:"#1f2937"}}>
        <div className="h-full rounded-full" style={{width:`${pct}%`,background:color}}/>
      </div>
      <p className="text-xs text-gray-400 mt-2 leading-snug">{blurb}</p>
    </div>
  );
}

function RiskProfileTab({p}) {
  const [yourPick, setYourPick] = useState(7);
  if (!p) return null;
  const rp = p.riskProfile;
  if (!rp || (rp.bustRisk == null && rp.starUpside == null)) {
    return (
      <div className="rounded-2xl p-8 text-center text-gray-400"
           style={{background:"#0d1117",border:"1px solid #1f2937"}}>
        No draft risk profile is available for this player yet.
      </div>
    );
  }

  const proj = p.nbaRoleProjection;  // NBA-Rollen-Projektion (pre→post)
  const aw = p.addedWins;            // Added-Wins projection (P(NBA) × E[AW|NBA])
  const bust = rp.bustRisk != null ? Math.round(rp.bustRisk * 100) : null;
  const star = rp.starUpside != null ? Math.round(rp.starUpside * 100) : null;
  const merit = rp.meritSlot;
  const cons = rp.consensus;
  const p20 = rp.marketP20, p50 = rp.marketP50, p80 = rp.marketP80;
  const hasMarket = p20 != null && p80 != null;
  const showUp = star != null && star >= 15 && (rp.upsideFactors || []).length > 0;
  const showRisk = bust != null && bust >= 35 && (rp.riskFactors || []).length > 0;

  const slotFmt = (s) => s == null ? "—" : `#${Math.round(s)}`;
  const pos = (pick) => `${Math.max(0, Math.min(100, ((pick - 1) / 59) * 100))}%`;

  // Verdict: model (merit) vs market (consensus)
  let verdict = null;
  if (hasMarket && merit != null) {
    const gap = p50 - merit;
    if (gap >= 12) verdict = { txt: "Potential STEAL — our model values him well above where the market drafts him", color: "#22c55e" };
    else if (gap <= -12) verdict = { txt: "DRAFT-DAY RISK — the market is higher on him than our model; an early pick here could disappoint", color: "#ef4444" };
    else verdict = { txt: "Fairly valued — model and market broadly agree", color: "#9ca3af" };
  }

  // "Still there at pick K?"
  let avail = null;
  if (hasMarket) {
    if (yourPick <= p20) avail = { txt: "Very likely still available", color: "#22c55e" };
    else if (yourPick <= p50) avail = { txt: "Likely still available", color: "#86efac" };
    else if (yourPick <= p80) avail = { txt: "Coin flip — leaning gone", color: "#fbbf24" };
    else avail = { txt: "Very likely already gone", color: "#ef4444" };
  }

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="rounded-xl p-4 text-sm text-gray-300 leading-relaxed"
           style={{background:"#0d1117",border:"1px solid #1f2937"}}>
        <span className="font-semibold text-gray-100">How to read this tab.</span> Two
        questions every front office asks: <span className="text-gray-100">“Where will
        he actually be drafted?”</span> (projected from consensus mocks) and <span className="text-gray-100">
        “Where does he belong on talent?”</span> (our model). The gap between them, plus
        two risk axes below, frame the real decision: <span className="text-gray-100">which
        pick could get you fired — and which one would you regret passing on.</span>
      </div>

      {/* NBA Added-Wins Projection */}
      {aw && aw.ev != null && (() => {
        const tp = aw.tierProbs || {};
        const TIERS = [
          {k:"Superstar",c:"#fbbf24"},{k:"All-Star",c:"#f97316"},
          {k:"Starter",c:"#3b82f6"},{k:"Role Player",c:"#06b6d4"},
          {k:"Replacement",c:"#8b5cf6"},{k:"Negative",c:"#ef4444"}];
        const pAS = (tp["Superstar"]||0) + (tp["All-Star"]||0);
        const pStarter = pAS + (tp["Starter"]||0);
        const pNba = aw.pNba != null ? Math.round(aw.pNba*100) : null;
        const floor = aw.pHighPro != null ? Math.round(aw.pHighPro*100) : null;
        return (
          <div className="rounded-xl p-4" style={{background:"#0d1117",border:"1px solid #1f2937"}}>
            <div className="text-sm font-semibold text-gray-100 mb-1">NBA Added-Wins Projection</div>
            <div className="text-xs text-gray-400 mb-3 leading-relaxed">
              Expected extra wins this player adds in his best 3 NBA seasons — a team-anchored
              blend of on-court impact and box production. The expected value is deliberately
              modest (most prospects aren’t stars); the star upside lives in the distribution below.
            </div>
            <div className="flex flex-wrap gap-5 mb-3">
              <div><div className="text-2xl font-bold text-gray-100">{aw.ev.toFixed(1)}</div>
                   <div className="text-[10px] text-gray-500 uppercase tracking-wide">Expected Added Wins</div></div>
              <div><div className="text-lg text-gray-200">{aw.condNba!=null?aw.condNba.toFixed(1):"—"}</div>
                   <div className="text-[10px] text-gray-500 uppercase tracking-wide">If he reaches the NBA</div></div>
              {pNba!=null && <div><div className="text-lg text-gray-200">{pNba}%</div>
                   <div className="text-[10px] text-gray-500 uppercase tracking-wide">P(reaches NBA)</div></div>}
              {floor!=null && <div><div className="text-lg text-gray-200">{floor}%</div>
                   <div className="text-[10px] text-gray-500 uppercase tracking-wide">Floor: NBA/EuroLeague-level</div></div>}
            </div>
            <div className="flex h-5 rounded overflow-hidden mb-1">
              {TIERS.map(t => { const v = tp[t.k]||0; return v>0 ?
                <div key={t.k} style={{width:`${v}%`,background:t.c}} title={`${t.k}: ${v}%`}/> : null; })}
            </div>
            <div className="flex justify-between text-[10px] text-gray-500">
              <span>P(All-Star+): <span className="text-orange-300 font-semibold">{pAS.toFixed(0)}%</span></span>
              <span>P(Starter+): <span className="text-blue-300 font-semibold">{pStarter.toFixed(0)}%</span></span>
            </div>
            {aw.drivers && <div className="text-[11px] text-gray-400 mt-2">Key drivers: {aw.drivers}</div>}
          </div>
        );
      })()}

      {/* Draft Range */}
      <div className="rounded-2xl p-5" style={{background:"linear-gradient(135deg,#0d1117,#111827)",border:"1px solid #1f2937"}}>
        <h3 className="text-base font-bold text-gray-100 mb-1">Draft Range</h3>
        <p className="text-xs text-gray-400 mb-2">Pick 1 (left) → 60 (right). Blue band =
          his likely real draft slot. Gold marker = where our model says he belongs on talent.</p>
        <p className="text-[11px] text-gray-500 mb-5 leading-snug">
          <span className="text-gray-400">How the blue band is built:</span> we take the player's
          existing <span className="text-gray-300">consensus mock ranking</span> and project it onto
          where similarly-ranked players were actually drafted in 2008–2018. So it's a projection of an
          existing consensus, not a fresh independent estimate — and the width shows how a consensus
          rank historically translates into a real pick (teams reach, players slide), not disagreement
          between mock boards.</p>

        <div className="relative h-16 mb-2">
          {/* track */}
          <div className="absolute left-0 right-0 top-7 h-1.5 rounded-full" style={{background:"#1f2937"}}/>
          {/* market band */}
          {hasMarket && (
            <div className="absolute top-6 h-3.5 rounded-full"
                 style={{left:pos(p20), width:`calc(${pos(p80)} - ${pos(p20)})`, background:"#3b82f655", border:"1px solid #3b82f6"}}/>
          )}
          {/* market median */}
          {hasMarket && (
            <div className="absolute flex flex-col items-center" style={{left:pos(p50), transform:"translateX(-50%)", top:0}}>
              <span className="text-[10px] text-blue-300 font-semibold">Market #{Math.round(p50)}</span>
              <div className="w-0.5 h-9 mt-0.5" style={{background:"#3b82f6"}}/>
            </div>
          )}
          {/* merit marker */}
          {merit != null && (
            <div className="absolute flex flex-col items-center" style={{left:pos(merit), transform:"translateX(-50%)", top:0}}>
              <div className="w-0.5 h-9" style={{background:"#fbbf24"}}/>
              <span className="text-[10px] text-yellow-300 font-semibold mt-0.5">Merit #{Math.round(merit)}</span>
            </div>
          )}
        </div>
        {/* scale ticks */}
        <div className="flex justify-between text-[10px] text-gray-600 px-0.5">
          {[1,10,20,30,40,50,60].map(t=> <span key={t}>{t}</span>)}
        </div>

        {verdict && (
          <div className="mt-4 rounded-lg px-3 py-2 text-sm font-medium"
               style={{background:`${verdict.color}11`, border:`1px solid ${verdict.color}44`, color:verdict.color}}>
            {verdict.txt}
          </div>
        )}
        {!hasMarket && (
          <p className="mt-3 text-xs text-gray-500">Not on consensus draft boards — market
            range unavailable. Merit slot reflects model value only.</p>
        )}

        {/* 2026-05-29 Tobias: availability slider removed — the Merit/Market overlap
            visualization already conveys the key signal (where the player belongs vs
            where he'll go). The slider added noise without adding decision-relevant info. */}
      </div>

      {/* Two risk axes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <RiskBar label="🔥 Bust Risk — the pick that gets you fired" pct={bust ?? 0} color="#ef4444"
                 blurb="How likely he delivers LESS than the value his draft slot demands. High here at an early pick is the career-defining miss."/>
        <RiskBar label="⭐ Star Upside — the pick you'd regret passing on" pct={star ?? 0} color="#22c55e"
                 blurb="How likely he becomes an All-Star-level player. High here at a late slot is the lurking star you don't want to let slip."/>
      </div>

      {/* Best-case role / ceiling archetype */}
      {rp.ceilingArchetype && (
        <div className="rounded-xl p-4" style={{background:"#0d1117",border:"1px solid #1f2937"}}>
          <div className="text-xs text-gray-500 mb-3" style={{lineHeight:1.6}}>
            <strong style={{color:"#9ca3af"}}>How to read this:</strong> Two NBA roles below — read them as a pair. <strong style={{color:"#cbd5e1"}}>Best-case role</strong> is the ceiling archetype this prospect could grow INTO under perfect development and team fit (the highest-value role within his archetype-cohort's historical outcomes). <strong style={{color:"#cbd5e1"}}>Projected role</strong> is the role he most likely actually STICKS in based on kernel-weighted comp cohort (where his archetype neighbours peaked, weighted by similarity in projected value). Gap between the two = development upside the team must unlock. A wide gap with a credible bridge (e.g. plays in a system that develops the missing skill) is the steal pattern.
          </div>
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Best-case NBA role</div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-lg font-bold text-gray-100">{rp.ceilingArchetype}</span>
            {ARCHETYPE_TIER[rp.ceilingArchetype] && (
              <span className="text-xs px-2 py-0.5 rounded font-semibold"
                    style={{background:`${TC[ARCHETYPE_TIER[rp.ceilingArchetype].ceiling]}22`, color:TC[ARCHETYPE_TIER[rp.ceilingArchetype].ceiling]}}>
                {ARCHETYPE_TIER[rp.ceilingArchetype].ceiling} ceiling
              </span>
            )}
          </div>
          {ARCHETYPE_TIER[rp.ceilingArchetype] && (
            <p className="text-xs text-gray-400 mt-1.5">Of past {rp.ceilingArchetype}s,
              <span className="text-gray-200 font-semibold"> {ARCHETYPE_TIER[rp.ceilingArchetype].starterPlus}%</span> reached
              Starter level or better and
              <span className="text-gray-200 font-semibold"> {ARCHETYPE_TIER[rp.ceilingArchetype].allstarPlus}%</span> became
              All-Stars (n={ARCHETYPE_TIER[rp.ceilingArchetype].n}). Archetype matters: the same
              physical tools are worth far more as a high-ceiling role than a replaceable one.</p>
          )}
        </div>
      )}

      {/* Projected NBA role — what his pre-draft type actually becomes (pre→post) */}
      {proj && proj.outcomes && proj.outcomes.length > 0 && (
        <div className="rounded-xl p-4" style={{background:"#0d1117",border:"1px solid #1f2937"}}>
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Projected NBA role</div>
          <div className="flex items-baseline gap-2 flex-wrap mb-1">
            <span className="text-lg font-bold text-gray-100">{proj.projRole}</span>
            <span className="text-xs text-gray-500">— most likely role if he sticks</span>
          </div>
          <p className="text-[11px] text-gray-400 mb-3">Players with his pre-draft profile
            {proj.preArchetype ? ` (${proj.preArchetype})` : ""} became — by the NBA role they reached:</p>
          <div className="space-y-1.5">
            {proj.outcomes.map((o, i) => {
              const dns = o.role === "Did Not Stick";
              const col = dns ? "#6b7280" : o.wa >= 15 ? "#3b82f6" : o.wa >= 8 ? "#06b6d4" : "#a78bfa";
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-40 shrink-0 truncate" style={{color: dns ? "#6b7280" : "#cbd5e1"}}>{o.role}</span>
                  <div className="flex-1 h-3 rounded-full overflow-hidden" style={{background:"#1f2937"}}>
                    <div className="h-full rounded-full" style={{width:`${Math.round(o.p*100)}%`, background:col}}/>
                  </div>
                  <span className="w-9 text-right" style={{color:"#9ca3af"}}>{Math.round(o.p*100)}%</span>
                  <span className="w-16 text-right text-[10px]" style={{color:"#6b7280"}}>{dns ? "—" : `~${o.wa} WA`}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-800 flex gap-4 flex-wrap text-xs">
            <span><span className="text-gray-500">Establishes a role: </span><span className="font-semibold text-gray-200">{Math.round((proj.pEstablish ?? 0)*100)}%</span></span>
            <span><span className="text-gray-500">Role-player value+: </span><span className="font-semibold text-gray-200">{Math.round((proj.pStick ?? 0)*100)}%</span></span>
            {proj.expWa != null && <span><span className="text-gray-500">Expected: </span><span className="font-semibold text-gray-200">{proj.expWa} WA</span></span>}
          </div>
          <p className="text-[10px] text-gray-600 mt-2">
            Based on ≈{Math.round(proj.compN || 0)} comparable past prospects (same pre-draft archetype, similar projected value).
            {(proj.compN || 0) < 15 ? " Few comps — interpret with caution." : ""} Bar values are the typical (median) NBA outcome of that role.
          </p>
        </div>
      )}

      {/* Reason codes */}
      {(showUp || showRisk) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {showUp && (
            <div className="rounded-xl p-4" style={{background:"#0d1117",border:"1px solid #22c55e33"}}>
              <div className="text-sm font-semibold text-green-400 mb-2">What raises his ceiling</div>
              <ul className="space-y-1.5">
                {rp.upsideFactors.map((f,i)=>(
                  <li key={i} className="text-xs text-gray-300 flex gap-2"><span className="text-green-500">↑</span>{f}</li>
                ))}
              </ul>
            </div>
          )}
          {showRisk && (
            <div className="rounded-xl p-4" style={{background:"#0d1117",border:"1px solid #ef444433"}}>
              <div className="text-sm font-semibold text-red-400 mb-2">What could sink the pick</div>
              <ul className="space-y-1.5">
                {rp.riskFactors.map((f,i)=>(
                  <li key={i} className="text-xs text-gray-300 flex gap-2"><span className="text-red-500">↓</span>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Footer / confidence */}
      <p className="text-[11px] text-gray-600 leading-relaxed">
        Risk axes are empirical: of past prospects with a similar projected value and archetype,
        what share busted vs. became stars{rp.compStrength!=null ? ` (≈${Math.round(rp.compStrength)} comparable prospects weighted)` : ""}.
        Bust risk is well-calibrated on 2008–2018 drafts; James Wiseman scored 96% bust, Tyrese
        Haliburton 37% star upside. See the Method tab for full methodology and caveats.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: RESEARCH  (parked next to Risk Profile — archetype value bands)
// ═══════════════════════════════════════════════════════════
function _conf(n) {
  if (n >= 80) return { label: "High", color: "#22c55e" };
  if (n >= 40) return { label: "Medium", color: "#fbbf24" };
  return { label: "Low", color: "#9ca3af" };
}

function ResearchTab({p}) {
  const [sortKey, setSortKey] = useState("ceiling");
  const [transPre, setTransPre] = useState("Scoring Wing");
  const playerArch = p?.riskProfile?.ceilingArchetype || p?.archetype || null;
  const GRP_COL = { Playmaker:"#8b5cf6", Wing:"#f59e0b", Big:"#3b82f6" };

  const bands = Object.entries(ARCHETYPE_BANDS).map(([name, b]) => ({ name, ...b }));
  const sorted = [...bands].sort((a, b) => b[sortKey] - a[sortKey]);

  const TIERS = [["allstar","All-Star+","All-Star"],["starter","Starter","Starter"],["role","Role Player","Role Player"]];
  // Example-player block for an archetype (used in tooltip + the player's own card)
  const exampleBlock = (name) => {
    const ex = ARCHETYPE_EXAMPLES[name];
    if (!ex) return <div className="text-[11px] text-gray-500">No clean examples for this type.</div>;
    return (
      <div className="space-y-1">
        {TIERS.filter(([k]) => ex[k]?.length).map(([k, lbl, tc]) => (
          <div key={k} className="text-[11px] flex gap-1.5">
            <span className="shrink-0 font-semibold" style={{color: TC[tc], minWidth:64}}>{lbl}:</span>
            <span className="text-gray-300">{ex[k].join(", ")}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl p-4 text-sm text-gray-300 leading-relaxed"
           style={{background:"#0d1117",border:"1px solid #1f2937"}}>
        <span className="font-semibold text-gray-100">Archetype value bands.</span> Each bar
        is the realized NBA outcome range (peak Wins Added) of past players of that type:
        left edge = downside (25th pct), dot = typical (median), right edge = upside (90th pct).
        Read it as a draft strategy guide: <span className="text-gray-100">go for upside,
        play it safe, or take the best middle bet — by player type.</span> The
        <span className="text-gray-100"> sample size (n)</span> tells you how confident we can be
        in each band: a type seen 374 times is far better understood than one seen 19 times.
      </div>

      {/* Sort toggle */}
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <span className="text-gray-500">Sort by:</span>
        {[["ceiling","Upside (ceiling)"],["median","Typical (median)"],["floor","Floor"],["n","Sample size"]].map(([k,lbl])=>(
          <button key={k} onClick={()=>setSortKey(k)}
                  className="px-2.5 py-1 rounded font-medium transition-colors"
                  style={{background: sortKey===k ? "#f9731622":"#0d1117",
                          color: sortKey===k ? "#fb923c":"#9ca3af",
                          border:`1px solid ${sortKey===k ? "#f9731644":"#1f2937"}`}}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Value-band chart — GM-risk-profile style: horizontal bands on the peak-WA axis */}
      {(() => {
        const WA_TIERS = [
          {short:"Neg",     color:"#ef4444", lo:-5, hi:3},
          {short:"Repl",    color:"#8b5cf6", lo:3,  hi:8},
          {short:"Role",    color:"#06b6d4", lo:8,  hi:15},
          {short:"Starter", color:"#3b82f6", lo:15, hi:25},
          {short:"AS",      color:"#f97316", lo:25, hi:40},
        ];
        const N = sorted.length;
        const RANK_W=18, NAME_W=150, LEFT=RANK_W+NAME_W, CHART_W=360, RIGHT=82;
        const W=LEFT+CHART_W+RIGHT, ROW_H=21, PAD_TOP=48, PAD_BOT=10;
        const H=PAD_TOP+N*ROW_H+PAD_BOT, AMIN=-5, AR=45;
        const xBar=v=>LEFT+(Math.max(-5,Math.min(40,v))-AMIN)/AR*CHART_W;
        const xTicks=[0,10,20,30,40], tierBnds=[3,8,15,25];
        const exTxt=(nm)=>{const e=ARCHETYPE_EXAMPLES[nm]; if(!e) return "";
          return [["allstar","All-Star+"],["starter","Starter"],["role","Role"]].filter(([k])=>e[k]&&e[k].length).map(([k,l])=>`${l}: ${e[k].join(", ")}`).join("  ·  ");};
        return (
          <div style={{overflowX:"auto", background:"#0a0e17", borderRadius:12, border:"1px solid #1f2937"}}>
            <svg width={W} height={H} style={{display:"block", fontFamily:"'Inter',sans-serif"}}>
              <text x={LEFT+CHART_W/2} y={11} fontSize={8} fill="#f97316" textAnchor="middle" opacity={0.8}>Realized NBA peak Wins Added by pre-draft archetype</text>
              {WA_TIERS.map(t=>(<rect key={t.short} x={xBar(t.lo)} y={PAD_TOP} width={Math.max(1,xBar(t.hi)-xBar(t.lo))} height={N*ROW_H} fill={t.color} opacity={0.06}/>))}
              {tierBnds.map(v=>(<line key={v} x1={xBar(v)} y1={PAD_TOP-4} x2={xBar(v)} y2={PAD_TOP+N*ROW_H} stroke="#374151" strokeWidth={0.8} strokeDasharray="3,3"/>))}
              {xTicks.map(v=>(<g key={v}><line x1={xBar(v)} y1={PAD_TOP-4} x2={xBar(v)} y2={PAD_TOP} stroke="#4b5563" strokeWidth={0.8}/><text x={xBar(v)} y={PAD_TOP-7} fontSize={8} fill="#4b5563" textAnchor="middle">{v}</text></g>))}
              {WA_TIERS.map(t=>(<text key={t.short} x={(xBar(t.lo)+xBar(t.hi))/2} y={PAD_TOP-20} fontSize={7.5} fill={t.color} textAnchor="middle" opacity={0.75}>{t.short}</text>))}
              <text x={LEFT+CHART_W/2} y={PAD_TOP-32} fontSize={8} fill="#6b7280" textAnchor="middle">peak Wins Added →</text>
              {sorted.map((b,i)=>{
                const y=PAD_TOP+i*ROW_H+ROW_H/2, gcol=GRP_COL[b.grp]||"#60a5fa", isP=playerArch===b.name, cf=_conf(b.n);
                const nm=b.name.length>22?b.name.slice(0,21)+"…":b.name;
                return (
                  <g key={b.name}>
                    <title>{`${b.name} (n=${b.n}, ${cf.label} confidence)\nFloor ${b.floor} · Median ${b.median} · Ceiling ${b.ceiling} peak WA\n${exTxt(b.name)}`}</title>
                    {i%2===0 && <rect x={0} y={PAD_TOP+i*ROW_H} width={W} height={ROW_H} fill="#ffffff" opacity={0.012}/>}
                    {isP && <rect x={0} y={PAD_TOP+i*ROW_H} width={W} height={ROW_H} fill="#f97316" opacity={0.09}/>}
                    <rect x={0} y={PAD_TOP+i*ROW_H+3} width={3} height={ROW_H-6} fill={gcol} opacity={0.85} rx={1}/>
                    <text x={RANK_W-3} y={y+3} fontSize={8} fill="#4b5563" textAnchor="end">{i+1}</text>
                    <text x={RANK_W+4} y={y+3} fontSize={8.5} fill={isP?"#fb923c":"#cbd5e1"} fontWeight={isP?700:400}>{nm}</text>
                    {WA_TIERS.map(t=>{const lo=Math.max(b.floor,t.lo), hi=Math.min(b.ceiling,t.hi); if(hi<=lo) return null;
                      return <rect key={t.short} x={xBar(lo)} y={y-3} width={Math.max(1,xBar(hi)-xBar(lo))} height={6} fill={t.color} opacity={0.82} rx={1}/>;})}
                    <circle cx={xBar(b.median)} cy={y} r={3} fill="#0a0e17" stroke="#e5e7eb" strokeWidth={1.2}/>
                    <text x={Math.min(xBar(b.ceiling)+5, W-60)} y={y+3} fontSize={8} fill="#9ca3af">{b.ceiling}</text>
                    <circle cx={W-48} cy={y} r={2.5} fill={cf.color}/>
                    <text x={W-4} y={y+3} fontSize={7.5} fill="#6b7280" textAnchor="end">n={b.n}</text>
                  </g>
                );
              })}
            </svg>
            <div className="flex items-center gap-4 px-4 py-2 text-[10px] text-gray-500 flex-wrap" style={{borderTop:"1px solid #1f2937"}}>
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{background:"#8b5cf6"}}/>Playmaker</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{background:"#f59e0b"}}/>Wing</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{background:"#3b82f6"}}/>Big</span>
              <span className="ml-auto">Band = floor→ceiling across tier zones · ○ = median · right dot = data confidence (green = high n) · hover for example players</span>
            </div>
          </div>
        );
      })()}

      {/* Examples for the current player's archetype — concrete range */}
      {playerArch && ARCHETYPE_EXAMPLES[playerArch] && (
        <div className="rounded-xl p-4" style={{background:"#0d1117",border:"1px solid #f9731633"}}>
          <div className="text-xs uppercase tracking-wide text-orange-400 mb-1">
            What this player's type became — {playerArch}
          </div>
          <p className="text-[11px] text-gray-500 mb-2.5">Past prospects who shared this
            player's pre-draft archetype, grouped by the NBA tier they actually reached. A
            concrete sense of the realistic range (hover any bar above for other types):</p>
          {exampleBlock(playerArch)}
        </div>
      )}

      {/* Pre-draft → NBA outcome transition */}
      {(() => {
        const t = ARCHETYPE_TRANSITION[transPre];
        if (!t) return null;
        const PAL = ["#3b82f6","#22c55e","#a78bfa","#f59e0b","#06b6d4","#ec4899"];
        let ci = 0;
        const segs = t.outcomes.map(([role, pp]) => {
          const dns = role === "Did Not Stick";
          return { role, p: pp, col: dns ? "#6b7280" : PAL[ci++ % PAL.length] };
        });
        const shown = segs.reduce((s, x) => s + x.p, 0);
        const other = Math.max(0, 1 - shown);
        const tal = ARCHETYPE_TALENT[transPre];
        return (
          <div className="rounded-2xl p-5" style={{background:"linear-gradient(135deg,#0d1117,#111827)",border:"1px solid #1f2937"}}>
            <h3 className="text-base font-bold text-gray-100 mb-1">Pre-Draft Type → NBA Outcome</h3>
            <p className="text-xs text-gray-400 mb-3">What players we tag with a given pre-draft
              archetype actually became in the NBA (drafted classes ≤2020). “Did Not Stick” = never
              established a rotation role — the honest bust floor.</p>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-xs text-gray-500">Pre-draft type:</span>
              <select value={transPre} onChange={e=>setTransPre(e.target.value)}
                className="text-sm rounded-lg px-2 py-1" style={{background:"#0d1117",color:"#e5e7eb",border:"1px solid #374151"}}>
                {Object.keys(ARCHETYPE_TRANSITION).map(k=> <option key={k} value={k}>{k}</option>)}
              </select>
              <span className="text-[11px] text-gray-500">n={t.n} drafted · {Math.round(t.stick*100)}% reached Role-Player value+</span>
            </div>
            {/* Pure view: stacked outcome bar */}
            <div className="flex h-6 rounded-lg overflow-hidden mb-2" style={{background:"#1f2937"}}>
              {segs.map((s,i)=>(
                <div key={i} style={{width:`${s.p*100}%`, background:s.col}} title={`${s.role} ${Math.round(s.p*100)}%`}/>
              ))}
              {other > 0.005 && <div style={{width:`${other*100}%`, background:"#374151"}} title={`Other ${Math.round(other*100)}%`}/>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-1">
              {segs.map((s,i)=>(
                <span key={i} className="text-[11px] flex items-center gap-1.5" style={{color: s.role==="Did Not Stick"?"#9ca3af":"#cbd5e1"}}>
                  <span className="inline-block w-2 h-2 rounded-sm" style={{background:s.col}}/>
                  {s.role} <span className="text-gray-500">{Math.round(s.p*100)}%</span>
                </span>
              ))}
              {other > 0.005 && <span className="text-[11px] text-gray-500 flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-sm" style={{background:"#374151"}}/>Other {Math.round(other*100)}%</span>}
            </div>

            {/* Talent gradient: add the projection tier */}
            {tal && (
              <div className="mt-4 pt-4 border-t border-gray-800">
                <div className="text-xs text-gray-300 mb-2 font-semibold">Add the projection: same type, by projected-value tier</div>
                <p className="text-[11px] text-gray-500 mb-3">The same pre-draft type lands very
                  differently depending on talent — this is why an elite-projected guard is a far safer bet than a marginal one.</p>
                {[["high","High projection"],["mid","Mid projection"],["low","Low projection"]].map(([k,lbl])=>{
                  const v = tal[k]; if (!v) return null;
                  const [stick, allstar] = v;
                  return (
                    <div key={k} className="flex items-center gap-2 mb-2 text-xs">
                      <span className="w-28 shrink-0 text-gray-400">{lbl}</span>
                      <div className="flex-1 h-3 rounded-full overflow-hidden" style={{background:"#1f2937"}}>
                        <div className="h-full" style={{width:`${stick}%`, background:"#22c55e"}}/>
                      </div>
                      <span className="w-32 shrink-0 text-right text-[11px]" style={{color:"#9ca3af"}}>
                        {stick}% stick · <span style={{color:"#fbbf24"}}>{allstar}% All-Star</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      <p className="text-[11px] text-gray-600 leading-relaxed">
        Empirical, not normative — rare ≠ better. Bands come from ~1,210 NBA players grouped by
        their pre-draft archetype (draft classes ~2008–2024). Low-n archetypes (e.g. 3-and-D Wing,
        n=19) have noisier bands — treat their edges with caution. Example players are pre-draft
        archetype matches — some evolved into a different NBA role (e.g. Jokic was a pre-draft
        “Scoring Wing”). This is a research aid for draft strategy by player type, not a
        player-specific projection.
      </p>
    

      {/* Tobias 2026-06-03 v8: Self-Creation Research Framework section */}
      {/* Self-Creation Framework — position-specific quadrants */}
      <div className="rounded-xl p-4 text-sm text-gray-300 leading-relaxed"
           style={{background:"#0d1117",border:"1px solid #1f2937", marginTop: "1.25rem"}}>
        <div className="text-base font-semibold text-gray-100 mb-2">Self-Creation Framework</div>
        <p className="text-sm text-gray-300 leading-relaxed mb-3">
          The Shot Creation Spectrum on every player profile shows how a prospect generates his offense
          by zone — at the rim (including dunks, BartTorvik convention), in mid-range, and from three.
          This framework summarizes how those zone distributions translate to NBA outcomes,
          based on n=556 NCAA prospects from the 2010-2022 draft cohorts who reached the NBA.
        </p>
        <p className="text-sm text-gray-300 leading-relaxed mb-4">
          Each position uses different cluster axes because what predicts NBA value differs
          by archetype. Wings are split by rim creation × pullup-3 volume; bigs by rim creation × mid-range touch;
          playmakers by rim creation × pullup-3 volume. Median splits are taken within position to ensure
          each cluster has comparable sample sizes.
        </p>

        {/* WING QUADRANT */}
        <div className="mb-4">
          <div className="text-sm font-semibold text-gray-100 mb-2">Wing: ATR × Pullup-3 (n=371)</div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="p-2 rounded" style={{background:"#451a1a",border:"1px solid #7f1d1d"}}>
              <div className="text-xs font-bold" style={{color:"#fca5a5"}}>Volume-Trap (Both High)</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Starter+ 15.1% · Bust 64%</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Jaden Ivey, Tony Wroten, Austin Rivers</div>
            </div>
            <div className="p-2 rounded" style={{background:"#451a03",border:"1px solid #7c2d12"}}>
              <div className="text-xs font-bold" style={{color:"#fdba74"}}>Pullup-3 Volume (Low ATR, High TP)</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Starter+ 15.8% · Bust 59%</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Carsen Edwards, Dwayne Bacon</div>
            </div>
            <div className="p-2 rounded" style={{background:"#14532d",border:"1px solid #166534"}}>
              <div className="text-xs font-bold" style={{color:"#86efac"}}>Rim-Workhorse (High ATR, Low TP)</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Starter+ 34.8% · Bust 38%</div>
              <div className="text-[11px] text-gray-500 mt-0.5">SGA, Kawhi, Brunson, Tatum (college)</div>
            </div>
            <div className="p-2 rounded" style={{background:"#1f2937",border:"1px solid #374151"}}>
              <div className="text-xs font-bold" style={{color:"#9ca3af"}}>Role-Floor (Both Low)</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Starter+ 18.7% · Bust 60%</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Trey Murphy III, Duncan Robinson</div>
            </div>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Reading: Wings who concentrate their self-creation at the rim — without large pullup-3 volume —
            have nearly double the Starter+ rate of any other cluster. NCAA pullup-3 volume is historically
            a bust marker: development of NBA pullup range happens after the draft. High-volume two-zone wings
            ("Volume-Trap") show the lowest Starter+ rate of any wing cluster.
          </p>
        </div>

        {/* BIG CLUSTER */}
        <div className="mb-4">
          <div className="text-sm font-semibold text-gray-100 mb-2">Big: ATR × Mid-Range (n=92)</div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="p-2 rounded" style={{background:"#14532d",border:"1px solid #166534"}}>
              <div className="text-xs font-bold" style={{color:"#86efac"}}>Two-Way Star-Big (ATR + Mid)</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Starter+ 42.6% · Star+ 14.6%</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Anthony Davis, Karl-Anthony Towns</div>
            </div>
            <div className="p-2 rounded" style={{background:"#1e3a5f",border:"1px solid #1e40af"}}>
              <div className="text-xs font-bold" style={{color:"#93c5fd"}}>Rim-Power Big (ATR only)</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Starter+ 38.0%</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Jarrett Allen, Domantas Sabonis</div>
            </div>
            <div className="p-2 rounded" style={{background:"#451a03",border:"1px solid #7c2d12"}}>
              <div className="text-xs font-bold" style={{color:"#fdba74"}}>Mid-Range Big (Mid only)</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Starter+ 36.4%</div>
              <div className="text-[11px] text-gray-500 mt-0.5">DeMarcus Cousins, Sabonis</div>
            </div>
            <div className="p-2 rounded" style={{background:"#1f2937",border:"1px solid #374151"}}>
              <div className="text-xs font-bold" style={{color:"#9ca3af"}}>Catch-Big Role-Floor</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Starter+ 16.7% (but 41.2% in Below-Composite tier)</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Steven Adams, Zach Collins, Joel Embiid</div>
            </div>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Reading: Rim creation (+25.9pp) is the strongest single position-zone signal in the entire framework.
            Above-median rim self-makes more than doubles Starter+ rate for bigs.
            Important false-negative: the Catch-Big Role-Floor cluster includes Joel Embiid — bigs with low NCAA self-creation
            but elite efficiency and defense can outperform the framework. Read this signal alongside finishing
            efficiency, defensive metrics, and anthro.
          </p>
        </div>

        {/* PLAYMAKER CLUSTER */}
        <div className="mb-4">
          <div className="text-sm font-semibold text-gray-100 mb-2">Playmaker: ATR × Pullup-3 (n=92)</div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="p-2 rounded" style={{background:"#14532d",border:"1px solid #166534"}}>
              <div className="text-xs font-bold" style={{color:"#86efac"}}>Star-PG (Both High)</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Starter+ 47% · Star+ 17%</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Damian Lillard, Trae Young, Jalen Brunson</div>
            </div>
            <div className="p-2 rounded" style={{background:"#14532d",border:"1px solid #166534"}}>
              <div className="text-xs font-bold" style={{color:"#86efac"}}>Connector PG (Both Low)</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Starter+ 45% · Role 27%</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Tyrese Haliburton, Matthew Dellavedova</div>
            </div>
            <div className="p-2 rounded" style={{background:"#451a03",border:"1px solid #7c2d12"}}>
              <div className="text-xs font-bold" style={{color:"#fdba74"}}>Pullup PG (Low ATR, High TP)</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Starter+ 27.3%</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Lonzo Ball, Davion Mitchell</div>
            </div>
            <div className="p-2 rounded" style={{background:"#1f2937",border:"1px solid #374151"}}>
              <div className="text-xs font-bold" style={{color:"#9ca3af"}}>Iso-Heavy PG (High ATR, Low TP)</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Starter+ 32%</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Kemba Walker, Kyrie Irving</div>
            </div>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Reading: Playmakers diverge — Star-PG and Connector-PG both reach Starter+ above 45%, but for opposite reasons.
            Star-PGs are scoring threats with both rim and pullup volume; Connector-PGs win on vision and team play
            without dominating any shot zone. Pullup-only PGs are the riskiest cluster (Lonzo Ball pattern).
          </p>
        </div>

        {/* METHODOLOGY FOOTNOTE */}
        <div className="pt-3 mt-3" style={{borderTop:"1px solid #1f2937"}}>
          <div className="text-xs font-semibold text-gray-300 mb-1">Methodology notes</div>
          <ul className="text-[11px] text-gray-500 leading-relaxed list-disc pl-4 space-y-1">
            <li>Source: BartTorvik aggregated PBP player-stat arrays per season (2008-2026), zone breakdown: rim, mid, three, dunk.</li>
            <li>ATR convention: rim and dunks are merged into one At-The-Rim zone (BartTorvik standard).</li>
            <li>Sample filter: minimum 100 total FGA per player-season to exclude small-sample noise.</li>
            <li>NBA outcome: peak Wins Added (peak_wa, a three-season rolling peak from xRAPM-based modeling).</li>
            <li>Tier bins: Star+ = top 10% peak_wa, Starter+ = top 25%, Role = 25-50%, Bust/Bench = below median.</li>
            <li>Cluster thresholds: position-specific zone-volume medians, not global medians.</li>
            <li>Limitations: self-creation captures shot generation but not finishing efficiency or defense; it under-predicts
                NBA outcomes for off-ball-catch scorers (e.g. Embiid as a Below-SC big who became a Star+ NBA player).</li>
          </ul>
        </div>
      </div>

      {/* Tobias 2026-06-03 v9: Mind Framework Research section */}
      <div className="rounded-xl p-4 text-sm text-gray-300 leading-relaxed"
           style={{background:"#0d1117",border:"1px solid #1f2937", marginTop:"1.25rem"}}>
        <div className="text-base font-semibold text-gray-100 mb-2">Mind Framework</div>
        <p className="text-sm text-gray-300 leading-relaxed mb-3">
          The Mind tab measures behavioural patterns under pressure derived from PBP event sequences:
          clutch shooting deltas, late-clock efficiency, response to adverse streaks (Aggressor / Overdriver /
          Hothead / Passive z-scores), half-to-half stamina drift, and bounceback eFG after negative runs.
          All metrics come from BartTorvik aggregated PBP arrays, 2017-18 through 2025-26.
        </p>
        <p className="text-sm text-gray-300 leading-relaxed mb-3">
          Historical validation against NBA peak Wins Added (n=236, draft classes 2018-2022, minimum 200
          NCAA actions): univariate Pearson correlations are weak (|r| &lt; 0.10 overall). Mind metrics on
          their own do NOT predict NBA stardom. Several future NBA stars score below-median on the
          composite. Use these as behavioural reference, not as a projection.
        </p>

        <div className="mb-4">
          <div className="text-sm font-semibold text-gray-100 mb-2">Position-specific signals where Mind has some signal</div>
          <div className="grid grid-cols-1 gap-2 mb-2">
            <div className="p-2 rounded" style={{background:"#14532d",border:"1px solid #166534"}}>
              <div className="text-xs font-bold" style={{color:"#86efac"}}>Playmaker — Below-composite cluster</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Star+ rate 44.4% (n=9) vs 0% in Above-cluster</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Trae Young, Jalen Brunson, Tyrese Haliburton, Ja Morant all sit here</div>
            </div>
            <div className="p-2 rounded" style={{background:"#1e3a5f",border:"1px solid #1e40af"}}>
              <div className="text-xs font-bold" style={{color:"#93c5fd"}}>Big — Below-composite cluster</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Star+ rate 18.2% (n=11) vs 0% in Above-cluster</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Stamina-low + non-hothead bigs translate better (Mobley pattern)</div>
            </div>
            <div className="p-2 rounded" style={{background:"#451a03",border:"1px solid #7c2d12"}}>
              <div className="text-xs font-bold" style={{color:"#fdba74"}}>Wing — Above-composite cluster</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Star+ rate 13.9% (n=36) vs 7-8% in Below/Low</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Mild positive signal for wings; weakest position signal overall</div>
            </div>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Reading: For Playmakers and Bigs, scoring <em>below</em> the median on the mind composite is
            paradoxically a stronger NBA outcome predictor than scoring above. The composite likely captures
            &quot;college-stage effort&quot; that correlates inversely with effortless dominance — top NBA
            talents face less adverse pressure in NCAA, so their mind indices read more passively. Wings show
            a small positive signal in the above-median bucket but the difference is modest.
          </p>
        </div>

        <div className="mb-4">
          <div className="text-sm font-semibold text-gray-100 mb-2">Where Mind succeeds: bust filtering</div>
          <p className="text-xs text-gray-400 leading-relaxed mb-2">
            The strongest Mind use case is identifying clear NCAA bust patterns. Bottom-quartile composite
            players (low aggressor, high passive, high stamina effort) cluster heavily on the NBA bust side:
          </p>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Nathan Knight, DaQuan Jeffries, Jericho Sims, Jaylen Hoard, Sam Merrill, Terry Taylor,
            Carsen Edwards, Justin Jackson, Omari Spellman — most have negative NBA peak Wins Added.
          </p>
        </div>

        <div className="pt-3 mt-3" style={{borderTop:"1px solid #1f2937"}}>
          <div className="text-xs font-semibold text-gray-300 mb-1">Methodology notes</div>
          <ul className="text-[11px] text-gray-500 leading-relaxed list-disc pl-4 space-y-1">
            <li>Source: BartTorvik PBP-derived event sequences, 2017-18 through 2025-26 (9 seasons).</li>
            <li>Sample: 236 NCAA→NBA players (draft classes 2018-2022, minimum 200 NCAA actions).</li>
            <li>NBA outcome: peak Wins Added (peak_wa, three-season rolling peak from xRAPM-based modeling).</li>
            <li>Composite formula: z(aggressor_idx) − z(passive_idx) − 0.5·z(stamina_idx), stratified by position.</li>
            <li>Star+ definition: peak_wa &gt;= 11.6 (top 10% of historical cohort).</li>
            <li>Honest limit: composite has only one historical Star+ &quot;hit&quot; (Devin Harris 2018) and many Star+ misses.</li>
            <li>Best use: bust filtering, behavioural fingerprint, position-comparative reference — not stardom prediction.</li>
          </ul>
        </div>
      </div>

      {/* Tobias 2026-06-03 v10: Combined Insights Research section */}
      <div className="rounded-xl p-4 text-sm text-gray-300 leading-relaxed"
           style={{background:"#0d1117",border:"1px solid #1f2937", marginTop:"1.25rem"}}>
        <div className="text-base font-semibold text-gray-100 mb-2">Combined Insights — Usage Reaction &amp; Cross-Signal Bust Markers</div>
        <p className="text-sm text-gray-300 leading-relaxed mb-3">
          This section consolidates the strongest cross-signal patterns found in the 2026-06-03 validation pass.
          Two threads: (1) Usage Reaction metrics — how a player's shot volume shifts in clutch and how their assist-rate
          relates to their usage rate; (2) combined bust markers — what happens when Self-Creation, Mind, and Stamina
          flags align on the same player.
        </p>

        {/* USAGE REACTION */}
        <div className="mb-4">
          <div className="text-sm font-semibold text-gray-100 mb-2">Usage Reaction signals</div>
          <p className="text-xs text-gray-400 leading-relaxed mb-3">
            Two derived signals that turn out stronger than most individual Mind metrics:
          </p>
          <div className="grid grid-cols-1 gap-2 mb-3">
            <div className="p-2 rounded" style={{background:"#1e3a5f",border:"1px solid #1e40af"}}>
              <div className="text-xs font-bold" style={{color:"#93c5fd"}}>Clutch Usage Shift = clutch_fga / normal_fga</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Wing Pearson r = +0.126, Big r = +0.170 vs NBA peak Wins Added (n=236)</div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                Wing top-quartile clutch shift: 16.3% Star+ rate vs 4.7% bottom-quartile (+11.6pp).
                Big top-quartile: 10.0% Star+ vs 0.0% bottom-quartile.
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                Reading: players whose volume rises disproportionately in clutch moments win more NBA value.
                The behavioural signature of taking the moment when it counts.
              </div>
            </div>
            <div className="p-2 rounded" style={{background:"#14532d",border:"1px solid #166534"}}>
              <div className="text-xs font-bold" style={{color:"#86efac"}}>AST_p / USG ratio (Passer-Scorer Profile)</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Wing Pearson r = +0.262 vs peak Wins Added — strongest single signal in the Mind+Profile family</div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                Wings whose assist percentage is high relative to their usage rate consistently outperform
                pure volume-scorers in NBA outcomes.
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                Combined reading: the SGA/Brunson archetype — passer in flow, scorer in clutch.
                Wings who only score and never pass are bust-prone even with elite volume.
              </div>
            </div>
          </div>
        </div>

        {/* COMBINED BUST MARKERS */}
        <div className="mb-4">
          <div className="text-sm font-semibold text-gray-100 mb-2">Combined bust markers — honest results</div>
          <p className="text-xs text-gray-400 leading-relaxed mb-2">
            Three independent flags applied to historical drafts 2018-2022 (n=231 NCAA→NBA with full SC + Mind data):
          </p>
          <ul className="text-[11px] text-gray-500 leading-relaxed list-disc pl-4 mb-2 space-y-1">
            <li><span className="text-gray-300">SC bust flag</span>: Self-Creation composite in bottom quartile (Volume-Trap / Pullup-3-Only / Mid-only-Big clusters).</li>
            <li><span className="text-gray-300">Mind bust flag</span>: Mind composite in bottom quartile (low aggressor + high passive + high stamina drift).</li>
            <li><span className="text-gray-300">Stamina flag</span>: stamina_idx &gt; 1.10 (more adverse events in 2nd half).</li>
          </ul>
          <div className="text-xs text-gray-300 mb-2">Historical bust-rate by flag count:</div>
          <div className="grid grid-cols-1 gap-1 mb-2 text-[11px]">
            <div className="text-gray-400"><span style={{color:"#cbd5e1"}}>0 flags</span> &middot; n=116 &middot; bust rate <strong>43.1%</strong> (base rate)</div>
            <div className="text-gray-400"><span style={{color:"#cbd5e1"}}>1 flag</span> &middot; n=71 &middot; bust rate <strong>54.9%</strong></div>
            <div className="text-gray-400"><span style={{color:"#cbd5e1"}}>2 flags</span> &middot; n=38 &middot; bust rate <strong>57.9%</strong> (+15pp over base)</div>
            <div className="text-gray-400"><span style={{color:"#cbd5e1"}}>3 flags</span> &middot; n=6 &middot; bust rate 50.0% (sample too small)</div>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Reading: naive flag-stacking is honest but not magical. Two flags raise bust probability by ~15 percentage
            points above the 43% base rate. The components are correlated, so additive scoring overestimates the marginal
            contribution of each additional flag. Use as one input, not as a binary verdict.
          </p>
        </div>

        {/* POSITION-TIER SYNTHESIS */}
        <div className="mb-4">
          <div className="text-sm font-semibold text-gray-100 mb-2">Position-tier synthesis</div>
          <table className="w-full text-xs" style={{borderCollapse:"collapse"}}>
            <thead>
              <tr style={{borderBottom:"1px solid #1f2937"}}>
                <th className="text-left py-1 px-2 text-gray-300">Position</th>
                <th className="text-left py-1 px-2 text-gray-300">Star marker</th>
                <th className="text-left py-1 px-2 text-gray-300">Bust marker</th>
              </tr>
            </thead>
            <tbody className="text-gray-400">
              <tr style={{borderBottom:"1px solid #1f2937"}}>
                <td className="py-1 px-2 text-gray-200">Wing</td>
                <td className="py-1 px-2">High AST/USG + positive clutch volume shift + ATR-Workhorse SC cluster</td>
                <td className="py-1 px-2">Pullup-3 volume + low AST/USG + Mind bottom-quartile</td>
              </tr>
              <tr style={{borderBottom:"1px solid #1f2937"}}>
                <td className="py-1 px-2 text-gray-200">Big</td>
                <td className="py-1 px-2">Positive clutch volume shift + Mid-range touch + low stamina drift (effortless)</td>
                <td className="py-1 px-2">Mid-only without ATR + Mind bottom-quartile</td>
              </tr>
              <tr>
                <td className="py-1 px-2 text-gray-200">Playmaker</td>
                <td className="py-1 px-2">Below-median Mind composite + Aggressor + ATR+TP SC cluster</td>
                <td className="py-1 px-2">College mid-range volume + TP-only without ATR</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* METHOD AND LIMITS */}
        <div className="pt-3 mt-3" style={{borderTop:"1px solid #1f2937"}}>
          <div className="text-xs font-semibold text-gray-300 mb-1">Method and limits</div>
          <ul className="text-[11px] text-gray-500 leading-relaxed list-disc pl-4 space-y-1">
            <li>Cohort: 231-236 NCAA→NBA players, drafts 2018-2022, joined across SC + Mind + Profile data.</li>
            <li>NBA outcome: peak Wins Added (peak_wa).</li>
            <li>Star+ = top 10% peak_wa; Bust = peak_wa &lt; 0 (negative impact NBA stint).</li>
            <li>Sample threshold: minimum 200 NCAA actions for Mind, 100 FGA for SC.</li>
            <li>Limitations: linear combinations only — non-linear interactions not modeled. Wing AST/USG signal might shrink with multivariate control.</li>
            <li>Honest framing: these are reference patterns for analysts, not deterministic projections.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: METHODOLOGY
// ═══════════════════════════════════════════════════════════
function MethodologyTab() {
  const [methodView, setMethodView] = useState("quick"); // "quick" | "deep"

  const sections = [
    {cat:"Added Wins Projection Model",items:["monteCarlo","posClassification"],desc:"The core engine: a two-stage (hurdle) value model. Stage 1 estimates P(NBA) on the FULL prospect pool (~15k NCAA + international players, NBA reached or not) — a calibrated logistic model, ROC-AUC 0.98 on a 2017–2019 holdout. Stage 2 predicts the expected value if he reaches the league — a regularized, fully-explainable ElasticNet trained on 752 NBA careers. The headline = P(NBA) × E[Added Wins | NBA]. Target variable: Added Wins — the best 3-consecutive-season window in the first 8 NBA years, a team-anchored blend of player-isolated on-court impact (xRAPM, 70%) and box production (30%), scaled so a roster's player-wins sum to the team's actual wins-above-replacement (additivity). Trained with a temporal split (≤2016 train, 2017–2019 holdout, no future leakage). Validated: value-model Spearman ρ = 0.41 out-of-sample (vs craftednba.com benchmark 0.373). Output: a single interpretable number plus a full tier-probability distribution. Honest caveat: the number is an EXPECTED value and is deliberately modest — a college profile rarely signals stardom (e.g. SGA looked ordinary at Kentucky), so star upside is shown via the tier distribution, not inflated into the point estimate. A separate high-floor model (P(NBA or EuroLeague-tier), trained on international career outcomes too) gives the downside. Projections for undrafted/fringe players are extrapolations beyond the training distribution."},
    {cat:"Risk Profile Tab — Draft Range & Risk (NEW)",items:[],desc:"Reframes the projection as a front-office decision: where a player will be drafted vs. where he belongs, plus risk in both directions. (1) MARKET RANGE — the realistic pick range, PROJECTED from an existing consensus mock ranking (a single consensus board, one rank per player). We do not generate a new consensus; we take that rank and map it onto where similarly-ranked players were actually drafted in 2008–2018. The band width therefore reflects how a consensus rank historically translates into a real pick (teams reach, prospects slide) — NOT disagreement between different mock boards. Two players with the same consensus rank get the same band. Out-of-sample on 2019–2025 the actual pick falls inside the predicted p20–p80 band 63% of the time (target ~60%), with Spearman(consensus, pick)=+0.85. (2) MERIT SLOT — where a player belongs on talent in an average draft. Our projected value (Added Wins) is recalibrated onto the realized-Wins-Added scale, then mapped through an isotonic curve E[peak Wins Added | pick] built from mature drafts. Our value predicts realized NBA outcome (peak Wins Added) markedly better than the actual draft order did: Spearman +0.54 vs +0.29. The gap between Merit and Market is the steal/bust signal (e.g. Tyrese Haliburton: market #10, merit #1). (3) TWO RISK AXES, computed from a kernel-weighted empirical distribution of comparable past prospects (similar projected value × archetype affinity): BUST RISK = share of comps who delivered below the value their slot demanded — well-calibrated (predicted 75–100% → 86% actual bust rate; James Wiseman scored 96%); STAR UPSIDE = share who reached All-Star level, blended 70/30 with the archetype's empirical All-Star rate so high-ceiling archetypes get proper credit. (4) ARCHETYPE VALUE — positional value is measured, not assumed: we compute each NBA archetype's realized peak Wins Added distribution from ~1,210 NBA players. Scoring Playmaker (ceiling ~29 WA) and Stretch Rim Protector (~28) carry the highest ceilings; pure rim-runners and role-archetypes cap around starter level. This is why a player's best-case archetype shapes his upside. CAVEATS: market range needs a consensus-board presence (most deep prospects have none); the box-score value model can under-rate raw, young upside; reason-code factors are surfaced from the projection engine and are noisier for international prospects (FIBA signals translate imperfectly)."},
    {cat:"Risk Profile Tab — Projected NBA Role (pre→post, NEW)",items:[],desc:"Answers 'what does this player's TYPE actually become in the NBA, and what is that worth?' (1) NBA-OUTCOME ROLES: every NBA player (1,780, ≥500 peak-window minutes) is classified into the SAME archetype taxonomy as our prospects, but from his realized NBA peak — using the identical role-score formulas and assignment logic as the prospect pipeline, only ranked against NBA peers instead of college peers. So pre-draft type and NBA type share one comparable label set. Each NBA role's value is measured empirically: Scoring Playmaker (lead guard) is most valuable (median ~25 peak Wins Added, 50% All-Star); 'empty' roles (Non-Specialized / Slashing / Defensive Wing) rarely stick (8–14% reach Role-Player value). (2) TRANSITION: across matured drafted classes (≤2020), P(NBA outcome | pre-draft archetype), INCLUDING an honest 'Did Not Stick' (no established ≥500-min role). The same type's outcome depends heavily on talent — an elite-projected Scoring Playmaker sticks 75% / All-Star 38%, a marginal one 6% / 0% ('a scoring guard has to be elite to play'). (3) PER-PROSPECT PROJECTION: outcome distribution = kernel-weighted comparable past prospects (same pre-draft archetype × similar projected value). Output: most-likely NBA role, full outcome distribution with each role's typical value, P(establishes a role) and P(reaches Role-Player value) as the FLOOR, expected Wins Added. Floor calibration is sound (predicted 0–15%→5% actual, 50–100%→86%; James Wiseman projects 14% stick, Wembanyama 100%). CAVEATS: NBA stats lack height → NBA position is box-derived (occasional guard/wing/big misfires); college-tuned role thresholds on NBA percentiles cause rare star misfires (Harden→Defensive Guard via his turnover profile); extreme-talent prospects (Boozer) have few comps (flagged); draft-position confound (early picks get more opportunity)."},
    {cat:"Tier Probabilities — Beta-Binomial from Comp Cohort",items:[],desc:"Replaces the parametric Normal(PPWA, σ) tier mass with a non-parametric posterior built directly from each prospect's kernel-weighted comp cohort (the same cohort used for exp_wa). FOR EACH PROSPECT: count how many of his comp neighbours peaked at each tier (Superstar / All-Star / Starter / Role Player / Replacement / Negative), weighted by Gaussian kernel proximity in projected_war. Smooth those counts toward a fixed league prior with k=8 pseudo-comps: posterior_tier = (k × P_league + count) / (k + Σcounts). The league prior mirrors realistic per-class scarcity (~0.5 Superstar, 3 All-Star, 12 Starter per draft class). WHY: NBA outcomes are right-skewed with heavy tails — a symmetric Normal centred on PPWA misallocates mass. Reading the cohort directly is more honest (no Normal assumption, no hand-tuned σ scaling, no clipping) AND more individual — every prospect's tier distribution reflects HIS specific archetype neighbours, not a generic Gaussian. HEADLINE TIER vs COHORT MODAL — DELIBERATE TENSION: the headline tier is derived from PPWA directly via calibrated cutoffs; the cohort modal can disagree. When Anthony Davis is listed Superstar (PPWA=25) but only 24% of his pre-draft comps actually reached that tier (cohort modal = Role Player at 26%), the gap is REAL signal — it surfaces the historical bust risk the headline number conceals. When Cameron Boozer is listed All-Star (PPWA=15) but 22% of his cohort were Replacement, the cohort flag matches the 'helio-big peaked lower than expected' historical pattern. CAVEATS: small cohorts (eff-N < 10) shrink strongly toward the league prior; the prior itself is calibrated on 2008–2019 NBA outcomes so very recent archetype shifts may not yet show; cohort modal != prediction — it is HISTORY, not destiny."},
    {cat:"Archetype Value Bands (Research — this tab)",items:[],desc:"A draft-strategy research sub-section shown above (Method tab). For each of 16 NBA archetypes we compute the realized peak Wins Added distribution of past players of that type (~1,210 NBA players, draft classes ~2008–2024): floor (25th percentile = downside), median (typical), and ceiling (90th percentile = upside). Displayed as horizontal value bands so you can read draft strategy by player type: highest ceiling = swing-for-upside pick (Scoring Playmaker / Stretch Rim Protector, ceiling ~28–29 WA); highest floor = safest pick (Stretch Rim Protector); highest median = best balanced bet. Each band carries its SAMPLE SIZE (n) as a data-confidence signal — a type observed 374 times (Scoring Wing) is far better understood than one seen 19 times (3-and-D Wing), whose edges are noisier. Rarity is shown for confidence, NOT as a value claim (rare ≠ better). Hover any band (or see the highlighted card for the current player's type) for EXAMPLE NBA PLAYERS grouped by the tier they reached — a concrete sense of the range (note: these are pre-draft archetypes; some players, like Jokic from a pre-draft 'Scoring Wing', evolved into a different NBA role). The same archetype-value numbers also appear in the Roles & Archetypes tab (each archetype's NBA ceiling tier + % reaching Starter+/All-Star+). PRE-DRAFT → NBA TRANSITION: a second view shows, per pre-draft archetype, what those players actually became in the NBA (drafted classes ≤2020) — including an honest 'Did Not Stick' (never established a rotation role). E.g. a pre-draft Scoring Wing most often does not stick or becomes a role-filler; a Stretch Rim Protector usually becomes a Stretch Big / Rim Protector. A talent overlay then splits the same type by projected-value tier: an elite-projected Scoring Playmaker sticks 75% / All-Star 38%, a marginal one 6% / 0% — quantifying 'a scoring guard has to be elite to be worth it'. (Drafted-player population, so it carries a draft-position confound; thin pre-draft types omitted.)"},
    {cat:"International Adjustments",items:[],desc:"International players receive three adjustments: (1) League Strength via empirical bridge-player ratios (2,655 players who played both intl and NBA). Euroleague=1.40, ACB=1.39, BBL=1.18 (NCAA Power=1.0 anchor). (2) Liga-BPM-Scaler: Raw BPM proxy (PER+eDiff) is multiplied by a league-specific scaler (Euroleague ×2.1, ACB ×1.9, NBL ×1.65, etc.) to translate to NCAA-equivalent BPM before feature engineering. (3) Conf-adj post-hoc with translatable-USG-aware caps for strong leagues."},
    {cat:"The 5 Pillars (DNA Scores)",items:["feel","shootScore","defScore","funcAth","selfCreation","overall"],desc:"Position-adjusted percentile scores (0–100) capturing the fundamental dimensions of prospect evaluation. Each pillar uses era-adjusted percentiles computed against ~34k college + ~9k international players since 2008. Box Creation (Ben Taylor method) measures total offensive creation: Scoring Creation (USG×TS) + Assist Creation (AST%×teammate possessions). Works identically for NCAA and international players."},
    {cat:"Shooting Projection (Diss-M1/M4, Berger 2022)",items:["projNba3p","projNba3pa","projNba3par","touchPrior"],desc:"Two-stage model from the underlying dissertation (Ch. 7). Stage 1: empirical Bayes shrinkage of college 3P% against the NCAA league-wide distribution (α₀, β₀ fitted via method-of-moments from 16,771 NCAA players ≥20 3PA — league median μ₀=34.8%, effective κ=69). Small samples (Boozer 0%/2 attempts, Saraf 0%/2) get pulled toward the league median. Stage 2: beta regression M1 for NBA 3P% translation = FT% + 2PJ% (PBP, NCAA only) + pre-draft 3P% estimate. Coefficients freshly fitted on the resolved holdout (n=675 NCAA RMSE 0.0380, n=392 intl RMSE 0.0367). Intl gets M1-light without 2PJ% — NO imputation for missing PBP. All values data-driven, no hand-tuning."},
    {cat:"Possession Impact (CFFR)",items:["fourFactors"],desc:"Context-Free Four Factor Rating measuring possession efficiency per Dean Oliver's framework. Usage-role adjusted: Primary (USG≥28%), Secondary (≥22%), Finisher (≥15%), Low-Usage (<15%). Each factor (eFG% 40%, TO% 25%, ORB% 20%, FTr 15%) is percentiled WITHIN the player's usage bucket, so a primary scorer with 52% eFG rates correctly against peers, not low-usage finishers."},
    {cat:"Role Inference Matrix",items:[],desc:"14 NBA roles scored as z-scores relative to position peers. Offensive: Scorer, Playmaker, Spacer, Driver, Crasher. Defensive: On-Ball, Switch Potential, Rim Protect, Rebounder. Hybrid: Connector, Helio-Scorer, Event Creator, Zone Pressure, Micro-Spacer. Each role combines 2-4 statistical inputs weighted by NBA translation research. Z≥+2.0 = Elite, ≥+1.0 = Impact, <-1.0 = Liability."},
    {cat:"Archetype Classification",items:[],desc:"18 NBA archetypes assigned by position + dominant role scores. Playmaker archetypes: Scoring Playmaker, Floor General, Spacing Guard, Defensive Guard, Non-Specialized Playmaker. Wing: Initiator Wing, Scoring Wing, 3-and-D, Defensive Wing, Point Forward, Slashing Wing, Non-Specialized Wing. Big: Stretch Big, Stretch Rim Protector, Rim Protector, Short Roll Playmaker, Passing Hub, Glass Cleaner, Scoring Big, Non-Specialized Big. Primary archetype from pipeline, secondary/tertiary from role-score matching within position."},
    {cat:"Tier Feasibility (vs NBA)",items:[],desc:"How does this prospect stack up against the actual pre-draft college numbers of players who reached each NBA tier? Built from the mature draft cohort 2008-2018 (n=353 NBA players with realized peak Wins Added). We grouped them by their realized NBA outcome — Replacement, Role Player, Starter, All-Star — using peak-WA percentile cuts (10/30/60/85). For each (tier × position) we then took the MEDIAN of every pre-draft college stat (BPM, USG%, TS%, AST%, TO%, STL%, BLK%, ORB%, DRB%, AdjOE) and used that as the in-range center. Frontend automatically derives p25 = median × 0.75 and p75 = median × 1.30 around it: above median is green (In-Range), below median is orange (Below Median), below p25 is red (Critical Gap) — or yellow (Compensated) if a position-core metric is elite enough to offset (Wings core = TS% + 3P%; Playmakers core = AST% + TO%; Bigs core = BLK% + ORB%). Thresholds are MONOTONIZED along the tier axis (a higher tier's threshold never sits below a lower tier's; TO% inverse), at the cost of small distortion — pre-draft college stats only weakly separate Starter from All-Star, because the real talent spike happens AFTER the draft via role + minutes + team context. So a player can clear all Starter thresholds and still NOT clear All-Star simply because the Starter and All-Star pre-draft stats overlap. Read this view as a diagnostic — how many tier markers does he hit — not as a forecast."},
    {cat:"Mind Tab — Self-Sufficiency Profile",items:[],desc:"Four sequential questions answered with a final verdict: (1) HOW OFTEN does he create his own shot? — share of made FGs that were unassisted, with position-peer percentile. (2) HOW EFFICIENT when self-creating? — Self-Created eFG% vs. Assisted eFG%, with a Difficulty Premium indicator (positive = better on hard shots). (3) HOW DOES PRESSURE affect efficiency? — three pressure contexts from PBP data: Close Late-Game (win prob 20–80% in 2nd half), Late Shot Clock (≥22 secs into possession), and Clutch Free Throws (last 5 min Half 2 with score-diff ≤5). (4) WHERE does he succeed? — per-zone eFG%/self%/asst% breakdown (Rim/Mid/3pt/Dunk). Verdict combines all four into one of seven profile labels: Self-Sufficient Star, Self-Sufficient Scorer, High Volume / Low Efficiency, Off-Ball Clutch Performer, Off-Ball Beneficiary, Pressure-Sensitive Creator, or Balanced Creator."},
    {cat:"Mind Tab — Mental Resilience (NEW)",items:[],desc:"Quantifies behavioral tendencies after adverse-event streaks from raw play-by-play data. We define an adverse-event streak as ≥3 negative events (missed FG, turnover, foul, missed FT trip) in a player's last 4 actions; we then track how he behaves in his next 4 actions. Five tendency indices, each shown as point-estimate + 95% confidence interval + within-position z-score: (a) Hothead = post-streak foul-rate / baseline; (b) Overdriver = TO-rate change; (c) Engagement (Passive) = action volume change; (d) Shot-Seeking (Aggressor) = FGA-rate change; (e) Bounceback eFG = made/FGA change. Plus a Match-Phase-Drift block: stamina_idx + overdriver_drift + hothead_drift compare 1st-half streaks vs 2nd-half streaks (mental fatigue signal). Bayesian-Shrinkage applied: posterior = (n × raw + 30 × 1.0) / (n + 30) — small samples shrink toward the population mean. CRITICAL CAVEAT: these are quantitative tendencies observed in PBP data, not deterministic claims. ~88-95% of the league has CIs that include 1.0 (= no detectable effect). Trust extreme z-scores (|z|>1.5) and CIs that exclude 1.0. Always verify with film."},
    {cat:"Scouting Tab — Game-by-Game Skill Curve",items:[],desc:"Per-game scatter plot of every game the player has on file (multi-season aggregated when available): x-axis = Usage% per game (share of team possessions consumed), y-axis = Individual Offensive Rating per game (= (PTS + 0.5×AST) / Possessions × 100). A LOWESS curve with tricubic weights (Bart-Torvik-style smoothing) is fitted across the full usage range — the shaded ±1 SD band shows the local spread of per-game ORtg at each load. Dot color encodes opponent strength when available (T/M/L tertiles from BartTorvik AdjOE−AdjD per team×season), else a chronological gradient blue→orange. Hover any dot for date, opponent, season, full stat-line. Used to read where the player stops scaling: a flat or rising curve at high USG = he holds up under load (no shrinking from defenses), a downward-bending curve = a soft ceiling on how much he can carry. USG-proxy is approximate (% of team possessions, not the standard NBA-USG with minutes adjustment)."},
    {cat:"Development Tab — In-Season Trajectory (NEW)",items:[],desc:"Multi-stat overlay plot for ANY game-log player: 6 indicators on rolling K-game means (K = max(3, min(7, N/5))) over the season. Stats: Usage% (role expansion), eFG% (efficiency growth), Assists (developing playmaking), 3PT Attempts (expanding shooting range), Stocks = STL+BLK (defensive growth), and Personal Fouls (discipline — falling = good, inverted color). OLS slopes per stat shown as season-scale trends. The single-stat 'Rolling Trend' below uses an alternate game-log source for multi-season players when available."},
    {cat:"Development Tab — Season-by-Season Breakdown",items:[],desc:"Per-season table of all seasons with meaningful playing time (≥8% USG). Columns: Year, USG%, AdjOrtg (BartTorvik opponent-adjusted offensive rating), vs. Peer (delta from cross-sectional peer curve), TS%, AST%, TO%, BPM. Δ markers show year-over-year change. Multi-season improvement is one of the strongest NBA success signals."},
    {cat:"Roles & Archetypes Tab",items:[],desc:"Two-stage role inference. Stage 1 — Role Inference Matrix: 14 NBA roles scored as z-scores relative to position peers. Offensive: Scorer, Playmaker, Spacer, Driver, Crasher. Defensive: On-Ball, Switch Potential, Rim Protect, Rebounder. Hybrid: Connector, Helio-Scorer, Event Creator, Zone Pressure, Micro-Spacer. Each role combines 2-4 statistical inputs weighted by NBA translation research. Z≥+2.0 = Elite, ≥+1.0 = Impact, <-1.0 = Liability. Stage 2 — NBA Archetype Fit: 19 NBA archetypes per position, sorted left→right by empirical rarity (most common to rarest, computed from the actual frequency in 46k player-seasons). The pipeline assigns a primary, secondary, and tertiary archetype based on dominant role scores. Rarity = how strict are the position-specific role thresholds — rare archetypes are objectively harder to find on draft day."},
    {cat:"Body Tab — Anthropometrics + Wingspan/Height Scatter",items:[],desc:"Height (with shoes, +1.25\"-NBA-standard), Weight, Wingspan, and Wingspan Delta (wingspan − height). For Combine-tested players (1.835 NBA players in our database), measurements are sourced directly. For others, we use stats-enriched imputation: a multivariate Ridge regression trained on 1.266 NBA players for Wingspan (R²=0.735, MAE 1.56\") and 528 for Weight (R²=0.614, MAE 11.7 lbs), using player height + position group + box-score stats (BLK%, STL%, ORB%, DRB%, BPM components). Imputed values are flagged with badges. The scatter plot shows 1.835 NBA Combine participants as gray dots colored by position; the selected prospect is overlaid in orange. Use it to find physical comps within a realistic body-type band."},
    {cat:"Shooting Tab — Diss-M1/M4 (Berger 2022) NBA shooter projection",items:[],desc:"Three-stage model from Berger (2022) Chapter 7, modified for role neutrality. STAGE 1 — Pre-draft 3P% estimate via empirical Bayes shrinkage: p̂ᵢ = (α₀ + 3PMᵢ) / (α₀ + β₀ + 3PAᵢ), with α₀ and β₀ fitted from the NCAA league-wide distribution via method-of-moments (16,771 NCAA players ≥20 3PA → α₀=23.89, β₀=44.67, μ₀=34.8%, κ=69). Small 3PA samples are pulled toward the league median (Boozer 0%/2 attempts → 38.2%). STAGE 2 — M1 for NBA 3P%: logit(NBA 3P%) = β₀ + β₁·FT% + β₂·2PJ% + β₃·3P-Estimate. NCAA n=675 RMSE=0.0380 (beats the dissertation value 0.0559); intl n=383 RMSE=0.0367 (M1-light without 2PJ%, NO imputation for missing PBP). STAGE 3 — M4 for NBA 3PAr (3PA/FGA): logit(NBA 3PAr) = β₀ + β₁·NCAA-3PAr + β₂·2PJ% + β₃·FT% + β₄·3P-Estimate. NCAA n=662 RMSE=0.130, intl n=383 RMSE=0.126. IMPORTANT: the dissertation's original M4 projected 3PAp40 (role-dependent — driven by possessions and minutes). We switched the target to 3PAr (3PA/FGA), a pure shooter signature that's independent of role and playing time. Together 3P% (efficiency) and 3PAr (tendency) describe the shooter completely without any role assumption. ALL values data-driven, no hand-tuning."},
    {cat:"Possession Impact (CFFR)",items:["fourFactors"],desc:"Context-Free Four Factor Rating measuring possession efficiency per Dean Oliver's Four Factors framework. Usage-role adjusted: Primary (USG≥28%), Secondary (≥22%), Finisher (≥15%), Low-Usage (<15%). Each factor (eFG% 40%, TO% 25%, ORB% 20%, FTr 15%) is percentiled WITHIN the player's usage bucket — so a primary scorer with 52% eFG rates against fellow primaries, not against low-usage finishers. Composite: Net Possession Value (0–100). Verdict tiers: Elite Floor Raiser (≥70), Winning Piece (55–70), Role Dependent (45–55), High Maintenance (<45)."},
    {cat:"Comps Tab",items:[],desc:"Two distinct nearest-neighbor comparison engines. Statistical Comps: era-adjusted percentile vectors over 8 dimensions (BPM, USG%, TS%, AST%, STL%, BLK%, 3P%, FT%). Pre-draft seasons only — comparing what these players looked like before the NBA. Similarity rescaled 50–95 within shown pool to differentiate. 'Reached Tier' shows the comp's verified NBA outcome (or v2 model projection for current prospects). Anthropometric Comps: Euclidean distance in inch-space over height/weight/wingspan. Optional sliders allow exploration of how comp matches change with adjusted body measurements (e.g. 'how would this prospect's comps look at +10 lbs?')."},
    {cat:"Position Reclassification",items:[],desc:"Stats-driven position groups (Playmaker / Wing / Big) used throughout the site. Rules (Tobias 2026-05-09 v3): Big = Height ≥84\" unconditional, OR Height ≥82\" with non-wing usage profile (USG<25 AND AST%<15), OR Height ≥80\" with elite shot-blocking (BLK%≥5 AND non-wing usage). Playmaker = AST%≥25 AND Height ≤6'5\", OR AST%≥30 AND Height ≤6'7\". Wing = everything else. Designed to keep tall wings (Bailey-style 6'10\" forwards) classified as Wings rather than misclassified to Big purely by height."},
    {cat:"International Adjustments",items:[],desc:"International players receive three adjustments: (1) League Strength via empirical bridge-player ratios from 2,655 players who played both intl and NBA. Euroleague=1.40, ACB=1.39, BBL=1.18 (NCAA Power=1.0 anchor). (2) League-BPM-Scaler: raw BPM proxy is multiplied by a league-specific scaler (Euroleague ×2.1, ACB ×1.9, NBL ×1.65, etc.) to translate to NCAA-equivalent BPM before feature engineering. (3) Conference-adjusted post-hoc with translatable-USG-aware caps for strong leagues. For Athleticism, an FT-Rate + ORB%-based formula is used in place of dunk rate (which is unavailable for most international players)."},
    {cat:"Tier Feasibility (vs NBA)",items:[],desc:"How does this prospect stack up against the actual pre-draft college numbers of players who reached each NBA tier? Built from the mature draft cohort 2008-2018 (n=353 NBA players with realized peak Wins Added). We grouped them by their realized NBA outcome - Replacement, Role Player, Starter, All-Star - using peak-WA percentile cuts (10/30/60/85). For each (tier x position) we then took the MEDIAN of every pre-draft college stat (BPM, USG%, TS%, AST%, TO%, STL%, BLK%, ORB%, DRB%, AdjOE) and used that as the in-range center. Frontend automatically derives p25 = median x 0.75 and p75 = median x 1.30 around it: above median is green (In-Range), below median is orange (Below Median), below p25 is red (Critical Gap) - or yellow (Compensated) if a position-core metric is elite enough to offset (Wings core = TS% + 3P%; Playmakers core = AST% + TO%; Bigs core = BLK% + ORB%). Thresholds are MONOTONIZED along the tier axis (a higher tier's threshold never sits below a lower tier's; TO% inverse), at the cost of small distortion - pre-draft college stats only weakly separate Starter from All-Star, because the real talent spike happens AFTER the draft via role + minutes + team context. So a player can clear all Starter thresholds and still NOT clear All-Star simply because the Starter and All-Star pre-draft stats overlap. Read this view as a diagnostic - how many tier markers does he hit - not as a forecast."},
    {cat:"Data Sources & Coverage",items:[],desc:"NCAA Box Stats: BartTorvik (34k+ player-seasons 2008–2026, per-game + advanced + shooting zones — barttorvik.com). NCAA Play-by-Play: ESPN Play-by-Play (event-level data 2017-18 through 2025-26, ~700k player-game-events tracked). International Box Stats: RealGM (9k+ player-seasons across 12 European leagues — realgm.com). NBA Outcomes: NBA Stats API Advanced stats (27 seasons, used for peak Wins-Added computation). Anthropometrics: NBA Draft Combine measurements (NBA.com) + Databallr wingspan dataset. National Team / FIBA: FIBA event statistics for international youth and senior tournaments. All data is processed through our own pipeline — no external services are queried at runtime."},
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
            <div style={{color:"#ef4444", fontSize:12, fontWeight:700, fontFamily:"'Oswald',sans-serif"}}>HistGradientBoosting</div>
            <div style={{color:"#6b7280", fontSize:10, marginTop:3}}>Position-stratified<br/>8–12 features per group<br/>→ wa_pred (continuous)</div>
          </div>
          <div style={boxStyle("#8b5cf6")}>
            <div style={{color:"#8b5cf6", fontSize:12, fontWeight:700, fontFamily:"'Oswald',sans-serif"}}>Elite Detector</div>
            <div style={{color:"#6b7280", fontSize:10, marginTop:3}}>Calibrated classifier<br/>P(All-Star+) probability<br/>→ pElite (0–1)</div>
          </div>
        </div>
        <div style={{textAlign:"center",color:"#6b7280",fontSize:10,marginBottom:2}}>
          Rank = α × ev_recal + (1−α) × exp_wa + humble bonus   |   α = 0.60 (NCAA) · 0.50 (Intl)   ·   Probability width = realized SD of the comp cohort
        </div>
        {arrow()}

        {/* Row 4: Outputs */}
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8}}>
          <div style={boxStyle("#f97316")}>
            <div style={{color:"#f97316", fontSize:12, fontWeight:700, fontFamily:"'Oswald',sans-serif"}}>NBA Projection</div>
            <div style={{color:"#6b7280", fontSize:10, marginTop:3}}>Added Wins score<br/>5 tier probabilities<br/>Boosters + Limiters</div>
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
      {/* ── View Toggle ── */}
      <div style={{display:"flex",gap:8,marginBottom:4}}>
        {[["quick","Quick View"],["deep","Deep Dive"]].map(([k,l])=>(
          <button key={k} onClick={()=>setMethodView(k)} style={{
            fontSize:12,padding:"6px 16px",borderRadius:8,border:"none",cursor:"pointer",
            background:methodView===k?"#f97316":"#1f2937",
            color:methodView===k?"#000":"#9ca3af",fontWeight:600}}>
            {l}
          </button>
        ))}
      </div>

      {/* ── QUICK VIEW ── */}
      {methodView === "quick" && (
        <>
        <Sec icon="🎯" title="What This Is" sub="ProspectTheory in 60 seconds.">
          <div style={{fontSize:13,color:"#d1d5db",lineHeight:"1.8"}}>
            <p style={{marginBottom:12}}>ProspectTheory is an NBA-Draft analytics tool that answers one question for every prospect: <strong style={{color:"#f97316"}}>What kind of NBA player will this become?</strong></p>
            <p style={{marginBottom:12}}>We blend three layers of information:</p>
            <ul style={{marginBottom:12,paddingLeft:20,listStyle:"disc"}}>
              <li style={{marginBottom:6}}><strong style={{color:"#fbbf24"}}>Production stats</strong> — what we measure in box scores and advanced metrics: BPM, Usage, eFG%, AST%, BLK%, etc.</li>
              <li style={{marginBottom:6}}><strong style={{color:"#fbbf24"}}>Body measurements</strong> — height, weight, wingspan, ape index. These translate to NBA-level athleticism.</li>
              <li style={{marginBottom:6}}><strong style={{color:"#fbbf24"}}>Behavior under pressure</strong> — derived from raw play-by-play data: how does this player respond when things go wrong? Does he force shots? Foul more? Withdraw? This is the part most public tools don't quantify.</li>
            </ul>
            <p style={{marginBottom:12}}>A trained projection model turns these into one interpretable number — <strong style={{color:"#e5e7eb"}}>Projected Peak Wins Added (PPWA)</strong>, our estimate of a prospect's peak NBA value. The headline is a <strong style={{color:"#fbbf24"}}>pool-specific blend of two independent estimators</strong> — α=0.60 for NCAA prospects, α=0.50 for international prospects, where α is the weight on regression. (1) <em>Regression (ev_recal)</em>: a two-stage statistical projection — P(reaching the NBA) × expected value if he does — recalibrated to the real Wins-Added scale. This is the present-day signal extracted from the prospect's actual box production. (2) <em>Comp-engine (exp_wa)</em>: the mean peak-WA of the historical prospects he most resembles before the draft (a player is never his own comp, and the comp set is widened until it holds enough real peers). This is informed historical experience from his archetype peers. <strong style={{color:"#fbbf24"}}>Why different α per pool:</strong> NCAA prospects feed the RICH regression (~130 features: adjoe, strength-of-schedule, shot-location, recruiting), which captures present-day uniqueness sharply — α=0.60 corrects the historical lead-guard bias in wins-added (Boozer / Embiid / Jokic peaked higher than their archetype average). International prospects feed the BACKBONE regression (~15 common-core box features) because intl leagues lack tracking data — that regressor is structurally weaker (Spearman 0.31 vs NCAA 0.43 on holdout), so the comp engine has to carry more of the signal and we keep the intl blend symmetric at α=0.50. This corrects the systematic intl under-projection (bias +1.54 vs NCAA +0.79) and lifts Doncic / Wembanyama back to where their comp cohorts say they belong. Empirical Spearman cost vs the global 50/50 optimum is ρ −0.005, well within domain noise. On top we add a small data-fitted humble bonus tied to pre-draft consensus rank (isotonic-regressed from the residual aw − blend), and we surface tier probabilities (Superstar / All-Star / Starter / Role Player / Replacement / Negative) whose width comes from the realized spread of each prospect's comp cohort — so a top prospect reads as, say, a 50% chance at stardom <em>with real bust risk</em>, never a false 99% lock.</p>
          </div>
        </Sec>

        <Sec icon="🧬" title="The Five Pillars" sub="What we measure for every prospect.">
          <div style={{fontSize:13,color:"#d1d5db",lineHeight:"1.8"}}>
            <p style={{marginBottom:10}}>Every player gets five core scores (0–100, position-adjusted):</p>
            <ul style={{paddingLeft:20,listStyle:"disc"}}>
              <li style={{marginBottom:6}}><strong style={{color:"#fbbf24"}}>Feel</strong> — basketball IQ proxy. AST/TO ratio + decision quality + ball security.</li>
              <li style={{marginBottom:6}}><strong style={{color:"#22c55e"}}>Shooting</strong> — projected NBA 3-point ability. FT% serves as the touch baseline (best single predictor); 3PA volume + 3P% and midrange touch refine it through a Bayesian model.</li>
              <li style={{marginBottom:6}}><strong style={{color:"#3b82f6"}}>Defense</strong> — STL%, BLK%, DBPM. Position-weighted: bigs need rim protection, guards need ball pressure.</li>
              <li style={{marginBottom:6}}><strong style={{color:"#f97316"}}>Athleticism</strong> — functional, not measured. NCAA: dunk rate + FT-rate + offensive rebound rate + steals/blocks. Internationals: dunk-free formula since dunk data is unavailable, with FT-rate weighted heavier.</li>
              <li style={{marginBottom:6}}><strong style={{color:"#06b6d4"}}>Self-Creation</strong> — can this player create his own shot? Box Creation Index (Ben Taylor method): efficient volume scoring + assist creation.</li>
            </ul>
          </div>
        </Sec>

        <Sec icon="🧠" title="Mind Tab — What Makes This Different" sub="Behavior under pressure, quantified from raw PBP data.">
          <div style={{fontSize:13,color:"#d1d5db",lineHeight:"1.8"}}>
            <p style={{marginBottom:12}}>The Mind Tab is the part that takes the most data work — and it's the part that's hardest to find anywhere else. We process raw event-level play-by-play (every made/missed shot, every turnover, every foul, every free throw) for 9 NCAA seasons (2017-18 through 2025-26 — ~700k player-game-events).</p>
            <p style={{marginBottom:12}}>Three things come out of it:</p>
            <ol style={{marginBottom:12,paddingLeft:20,listStyle:"decimal"}}>
              <li style={{marginBottom:6}}><strong style={{color:"#f97316"}}>Self-Sufficiency Profile</strong> — a 4-step decision tree: How often does he create alone? How efficient is he when he does? How does pressure affect this (clutch, late shot-clock, clutch FT)? Where does he succeed (zone breakdown)? A final verdict combines all four signals.</li>
              <li style={{marginBottom:6}}><strong style={{color:"#a78bfa"}}>Usage Reaction</strong> — when usage rises, does he become more of a scorer or more of a passer? Computed from AST%/USG% slope across seasons.</li>
              <li style={{marginBottom:6}}><strong style={{color:"#22c55e"}}>Mental Resilience</strong> — quantifies how a player behaves AFTER bad sequences. We define a "streak" as 3+ adverse events (missed FG, turnover, foul, missed FT) in a player's last 4 actions, then track his next 4 actions. Five behavioral indices result: Hothead (more fouls?), Overdriver (more turnovers?), Engagement (does he withdraw?), Shot-Seeking (more shots?), Bounceback eFG (does shooting recover?). Plus a Match-Phase-Drift block comparing 1st-half vs 2nd-half streak responses.</li>
            </ol>
            <p style={{marginBottom:12,padding:"10px 12px",background:"#1a1f2e",borderRadius:8,border:"1px solid #1e3a5f"}}>
              <strong style={{color:"#fbbf24"}}>Important caveat:</strong> Mental Resilience values are <strong>quantitative tendencies, not deterministic claims</strong>. About 88-95% of the league has confidence intervals that include "no detectable effect". Trust extreme z-scores (|z|&gt;1.5) and CIs that exclude 1.0. Always verify with film. We surface this as a starting point for tape review, not as a verdict.
            </p>
          </div>
        </Sec>

        <Sec icon="🛠" title="What's Honest About This" sub="Limitations the Plain-Language version doesn't hide.">
          <div style={{fontSize:13,color:"#d1d5db",lineHeight:"1.8"}}>
            <ul style={{paddingLeft:20,listStyle:"disc"}}>
              <li style={{marginBottom:6}}><strong style={{color:"#22c55e"}}>Strength — honest probabilities, no false certainty.</strong> The tier odds come from how the prospect's real comps actually turned out (busts and stars), so a top prospect reads ~50% at stardom <em>with</em> bust risk — not a fabricated 99% lock. A player is never his own comp (no self-fulfilling prediction), and the comp set is widened until it holds enough real peers, so even sparse elite profiles get a genuine distribution rather than one lone neighbor.</li>
              <li style={{marginBottom:6}}><strong style={{color:"#f59e0b"}}>Weakness — the ranking can't fully see a one-of-one.</strong> The board rank is the statistical projection, which shrinks unprecedented profiles toward the average — a truly unique prospect (a 7'4" creator) with no historical match is under-rated, and an older small guard (Curry-type) projects modestly. This is a documented blind spot, the mirror image of a 2nd-round Jokić: when neither the stats nor a real comp foresees a career, the model says so honestly rather than inventing certainty.</li>
              <li style={{marginBottom:6}}>Value models trained on drafted NBA careers; undrafted players are extrapolations. Year-grouped holdout: blended PPWA Spearman ρ ≈ 0.50 — directionally right about half the rank-order of NBA outcomes. Far from perfect, clearly better than chance.</li>
              <li style={{marginBottom:6}}>For prospects in pre-2017 NCAA seasons, we cannot compute Mind-Tab metrics (PBP data lacks player attribution before 2017).</li>
              <li style={{marginBottom:6}}>For internationals, Mental Resilience is unavailable (we don't have FIBA-level event PBP), and Body-Tab signal is reduced (no Combine measurements). International production is league-weighted onto the NCAA scale via bridge players, and shooting/efficiency rates are unit-normalized so an international 61% TS reads as elite, not as zero.</li>
              <li style={{marginBottom:6}}>Game-by-Game Skill-Curve uses an approximate Usage-proxy (% of team possessions consumed) rather than the standard NBA-USG (which requires per-game minutes data we don't have).</li>
              <li style={{marginBottom:6}}>All projections are pre-team-context. Same prospect on different rosters can have wildly different NBA outcomes — a Stretch Big is gold for a Jokic-system, less useful for a slow-paced offense.</li>
            </ul>
          </div>
        </Sec>
        </>
      )}

      {/* ── DEEP DIVE ── */}
      {methodView === "deep" && <>
      {/* ── Pipeline Diagram ── */}
      <Sec icon="🔬" title="Model Pipeline" sub="How data flows from raw sources through feature engineering to final projections.">
        <PipelineDiagram/>
      </Sec>

      <Sec icon="📖" title="Methodology & Model Documentation" sub="Complete documentation of all computed metrics, formulas, and their statistical foundations.">
        <div className="text-sm mb-3" style={{color:"#9ca3af"}}>
          ProspectTheory's headline metric is <strong style={{color:"#e5e7eb"}}>Projected Peak Wins Added (PPWA)</strong> — an estimate of a prospect's best 3-consecutive-season Wins-Added peak (team-anchored impact + production, first 8 NBA years). The headline is a <strong style={{color:"#fbbf24"}}>pool-specific blend of two independent estimators</strong>: <code style={{color:"#fbbf24"}}>α × ev_recal + (1−α) × exp_wa</code> with <strong>α=0.60 (NCAA), α=0.50 (Intl)</strong>. Tier probabilities (Superstar / All-Star / …) are NOT parametric Normal mass around PPWA — they come <strong style={{color:"#fbbf24"}}>directly from each prospect's own comp cohort</strong>, Beta-Binomial-smoothed against the league rate (k=8 pseudo-comps). That means every player has a unique tier distribution shaped by HIS specific archetype neighbours, not a generic bell curve. We deliberately allow tension between headline tier (where PPWA places him) and cohort modal (what his comp cohort actually became): when Anthony Davis is listed Superstar but only 24% of his Pre-Draft comps reached that tier, that's a real signal — not a bug. <strong style={{color:"#fbbf24"}}>(1) Statistical projection (ev_recal):</strong> P(NBA), trained on the full ~15k-prospect pool, times E[Added Wins | NBA], a regularized ElasticNet on NBA careers, smoothly rescaled to the realized Wins-Added scale — the present-day signal from the prospect's actual box production. <strong style={{color:"#fbbf24"}}>(2) Comp-engine realized average (exp_wa):</strong> for each prospect we find his pre-draft archetype peers (leave-one-out — a player is never his own comp — with an adaptive bandwidth that guarantees ≥10 effective comps), and take the kernel-weighted mean of those peers' <em>realized</em> peak-WA — informed experience from history. <strong style={{color:"#fbbf24"}}>Why pool-specific:</strong> the two pools are scored by structurally different sub-models. NCAA prospects feed the RICH regression (~130 features: adjoe, SOS, shot-location, recruiting) — strong enough to justify weighting it slightly more (α=0.60 corrects the lead-guard bias and lifts Boozer / Embiid / Jokic above their archetype-cohort average). International prospects feed the BACKBONE regression (~15 common-core box features) because intl leagues have no tracking data — that regressor is structurally weaker (Spearman 0.31 vs NCAA 0.43 on holdout), so the comp engine has to carry more of the signal. α-grid-search per pool shows NCAA optimum at α=0.50–0.60, intl optimum at α=0.50–0.55 — different α per pool matches the data. Effect: NCAA generational outliers (Curry, Haliburton) keep the comp lift; intl generational outliers (Doncic, Wembanyama) get the comp lift their structurally weak backbone regression cannot give them. <strong style={{color:"#fbbf24"}}>Tier probabilities</strong> use the realized spread of the comp cohort as σ, centred on the headline — honest odds (no 99% locks), not a tight parametric band. Holdout: blend ρ ≈ 0.49 NCAA, ρ ≈ 0.34 Intl; P(NBA) ROC-AUC 0.95.
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          {[
            ["ρ = 0.46","Spearman (holdout 2017–19)"],
            ["1,784","Training prospects (2010–16)"],
            ["8–12","Features per position group"],
            ["~700k","PBP events for Mind-Tab"],
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
      {/* ── Archetype Pipeline ── */}
      <Sec icon="🔭" title="NCAA Archetype → NBA Projection Pipeline"
        sub="Two-stage role inference: (1) classify current college role from stats, (2) project most likely NBA function given tier ceiling. Distinct from Badges — Badges describe individual skills, Archetypes describe holistic roles.">
        <div className="space-y-4 text-sm" style={{color:"#cbd5e1"}}>
          <div className="p-4 rounded-lg" style={{background:"#0d1117",border:"1px solid #1f2937"}}>
            <div className="font-bold mb-2" style={{color:"#f97316"}}>Stage 1 — NCAA Role Classification</div>
            <p className="mb-3" style={{color:"#94a3b8"}}>Derived from the same stat profile used for badges (USG, AST%, DBPM, BLK%, 3P%, self-creation index, position). Priority-ordered rules assign one of 12 archetypes. Order matters: more restrictive archetypes (Ball Dominant Scorer, Playmaker) are checked first to avoid false positives.</p>
            <div className="grid gap-2" style={{gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))"}}>
              {Object.entries(NCAA_ARCH_DESC).map(([arch,desc])=>(
                <div key={arch} className="px-3 py-2 rounded" style={{background:"#111827",border:"1px solid #1f2937"}}>
                  <div className="font-bold text-xs mb-0.5" style={{color:"#9ca3af"}}>{arch}</div>
                  <div className="text-xs" style={{color:"#6b7280"}}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="p-4 rounded-lg" style={{background:"#0d1117",border:"1px solid #1f2937"}}>
            <div className="font-bold mb-2" style={{color:"#f97316"}}>Stage 2 — NBA Projection</div>
            <p style={{color:"#94a3b8"}}>Each NCAA archetype maps to a 6-level NBA projection table indexed by Predicted Tier (Negative → Superstar). The projection answers: <em>"If this player achieves his predicted tier ceiling, what role will he fill on an NBA roster?"</em> Tier is the vertical axis (how good), Archetype is the horizontal axis (what kind of good). Together they form a 12×6 matrix of 72 distinct NBA role projections.</p>
          </div>
          <div className="p-4 rounded-lg" style={{background:"#0d1117",border:"1px solid #1f2937"}}>
            <div className="font-bold mb-2" style={{color:"#f97316"}}>Ceiling / Floor Scores (0–10)</div>
            <p className="mb-2" style={{color:"#94a3b8"}}>Derived from the tier probability distribution — not from raw stats. This ensures they reflect model uncertainty, not just statistical magnitude.</p>
            <div className="px-3 py-2 rounded font-mono text-xs mb-2" style={{background:"#111827",color:"#7dd3fc"}}>
              Ceiling = P(SS)×15 + P(AS)×8 + P(Starter)×4 + P(RP)×1.5  [capped at 10]
            </div>
            <div className="px-3 py-2 rounded font-mono text-xs" style={{background:"#111827",color:"#7dd3fc"}}>
              Floor = (1 − P(Replacement) − P(Negative)) × 10  [capped at 10]
            </div>
            <div className="mt-3 grid gap-2" style={{gridTemplateColumns:"repeat(4,1fr)"}}>
              {[["Boom/Bust","starP≥25 ∩ bustP≥15","Star upside + real bust risk — high variance profile","#f59e0b"],
                ["High Upside","starP≥25 ∩ bustP<12","Star potential with acceptable downside","#22c55e"],
                ["Safe Floor","bustP<8 ∩ starP<20","Reliable contributor — minimal bust risk","#06b6d4"],
                ["Bankable","floor≥7","Dependable rotation player or better","#3b82f6"]
              ].map(([tag,rule,desc,color])=>(
                <div key={tag} className="p-2 rounded" style={{background:"#111827",border:`1px solid ${color}44`}}>
                  <div className="font-bold text-xs mb-0.5" style={{color}}>{tag}</div>
                  <div className="text-xs font-mono mb-1" style={{color:"#4b5563"}}>{rule}</div>
                  <div className="text-xs" style={{color:"#6b7280"}}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Sec>

      {/* ── GM Risk Profile ── */}
      <Sec icon="🎯" title="GM Risk Profile"
        sub="Three draft philosophies that reorder the Big Board Range View. Same players, different priorities — reflecting real front-office decision-making contexts.">
        <div className="space-y-3 text-sm" style={{color:"#cbd5e1"}}>
          <p style={{color:"#94a3b8"}}>Two prospects with identical Added Wins of 6.0 can have completely different risk profiles: one might be 70% Starter / 30% Role Player (safe, bankable), while another is 30% All-Star / 40% Replacement (high variance). The optimal draft choice depends on where your team is in its competitive window.</p>
          <div className="grid gap-3" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
            {[["🎰 Ceiling First","#f59e0b","#78350f",
              "Sort: 65% Ceiling Score + 35% Added Wins",
              "Rebuilding teams, tanking franchises, or GMs willing to accept bust risk for a potential star. Boom/Bust picks rise. A 5% Superstar probability is an asset, not a liability. This GM is picking lottery tickets.",
            ],["⚖️ Balanced","#6b7280","#1f2937",
              "Sort: Added Wins (expected value)",
              "Standard draft order. Best proxy for long-run roster value. Neither ceiling nor floor is systematically privileged. Default view.",
            ],["🛡️ Floor First","#06b6d4","#0c4a6e",
              "Sort: 65% Floor Score + 35% Added Wins",
              "Win-now teams, GMs protecting their jobs, or franchises with no room for a bust. High-variance picks drop. A player who reliably delivers 4-6 Added Wins is more valuable than a boom/bust candidate with the same expected value.",
            ]].map(([label,color,bg,formula,desc])=>(
              <div key={label} className="p-3 rounded-lg" style={{background:"#0d1117",border:`1px solid ${color}44`}}>
                <div className="font-bold mb-1" style={{color}}>{label}</div>
                <div className="text-xs font-mono mb-2 px-2 py-1 rounded" style={{background:"#111827",color:"#7dd3fc"}}>{formula}</div>
                <div className="text-xs" style={{color:"#94a3b8"}}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </Sec>

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
      </>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────
// computeRangePpwa: p10/p50/p90 ppWA from tier distribution
// Uses CDF interpolation within tier bounds
// ─────────────────────────────────────────────────────────
function computeRangePpwa(tiers) {
  if (!tiers) return { floor: -2, med: 5, ceil: 15 };
  const ORDER = [
    { name:"Negative",    lo:-10, hi:-2  },
    { name:"Replacement", lo:-2,  hi:1   },
    { name:"Role Player", lo:1,   hi:4   },
    { name:"Starter",     lo:4,   hi:10  },
    { name:"All-Star",    lo:10,  hi:25  },
    { name:"Superstar",   lo:25,  hi:50  },
  ];
  const total = ORDER.reduce((s, t) => s + (tiers[t.name] ?? 0), 0);
  if (total < 0.1) return { floor: -2, med: 5, ceil: 15 };
  let cum = 0;
  const cdf = ORDER.map(t => {
    const p = (tiers[t.name] ?? 0) / total;
    const seg = { ...t, p, cs: cum, ce: cum + p };
    cum += p;
    return seg;
  });
  const ppwaAt = q => {
    for (const s of cdf) {
      if (q <= s.ce + 0.001) {
        if (s.p < 0.001) return (s.lo + s.hi) / 2;
        const frac = Math.max(0, Math.min(1, (q - s.cs) / s.p));
        return s.lo + frac * (s.hi - s.lo);
      }
    }
    return 50;
  };
  return {
    floor: Math.max(-10, ppwaAt(0.10)),
    med:   ppwaAt(0.50),
    ceil:  Math.min(50, ppwaAt(0.90)),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// computeGMUtility: Expected utility of a player under three GM archetypes.
//
// Core idea: each GM archetype has a different *marginal utility* for ppWA.
// Instead of simply ranking by E[ppWA], we rank by E[U(ppWA)] where U is the
// utility function that captures the GM's risk preferences.
//
// Tier midpoints = representative ppWA value for each outcome category.
// The expected utility is: Σ P(tier_i) × U(midpoint_i)
//
// Ceiling GM (convex U):
//   Each additional ppWA at the top is WORTH MORE than the last.
//   Going from 25→35 ppWA (Role→Star) is disproportionately valuable.
//   Bust risk is nearly irrelevant — I'll accept 15% NE to get 20% SS.
//   → U(x) = x^1.4 × 0.6  for x ≥ 0   (accelerating returns above zero)
//             x × 0.3       for x < 0   (mild penalty, almost ignored)
//
// Floor GM (concave U with steep downside):
//   Each additional ppWA at the top is worth LESS than the last.
//   A wasted pick (Negative/Replacement) is existentially bad.
//   Going from -6→0 is worth far more than going from 17→35.
//   → U(x) = log(x+1) × 6  for x ≥ 0  (diminishing returns, compressed upside)
//             -(|x|)^2 × 5  for x < 0  (catastrophic, quadratic punishment)
//
// Balanced (linear = true expected value):
//   E[ppWA] computed via tier-probability-weighted midpoints.
//   Equivalent to asking: "What is this player worth in expectation?"
// ─────────────────────────────────────────────────────────────────────────
const _GM_MIDPOINTS = {
  "Negative":     -6,    // centre of [-10, -2]
  "Replacement":  -0.5,  // centre of [ -2,  1]
  "Role Player":   2.5,  // centre of [  1,  4]
  "Starter":       7,    // centre of [  4, 10]
  "All-Star":     17.5,  // centre of [ 10, 25]
  "Superstar":    35,    // centre of [ 25, 50]
};

function computeGMUtility(tiers, mode) {
  if (!tiers) return 0;
  const total = Object.values(tiers).reduce((s, v) => s + v, 0);
  if (total < 0.1) return 0;

  const U = {
    // Convex: Superstar ceiling disproportionately rewarded; bust barely punished.
    // x^1.4 accelerates above linear: 7→9.2 · 17.5→33 · 35→87 (SS is 2.6× AS)
    ceiling: x => x >= 0
      ? Math.pow(x, 1.4) * 0.6          // accelerating returns above zero
      : x * 0.3,                         // mild bust penalty — ceiling GMs accept risk

    // Concave + catastrophic downside via bust cliff:
    //   Positive side: sqrt(x)*5 → very compressed (AS≈21, SS≈30 — barely different)
    //   Negative side: -(|x|+0.5)² * 5 → the +0.5 offset means Replacement (-0.5 ppWA)
    //     gets -(1.0)²×5 = -5.0 (not near-zero!), Negative (-6 ppWA) gets -211.
    //     A player with 8% bust risk gets penalised enough to fall below a safer player
    //     with marginally lower expected value — which is exactly the floor GM's preference.
    floor: x => x >= 0
      ? Math.sqrt(x) * 5                              // 2.5→7.9 · 7→13.2 · 17.5→20.9 · 35→29.6
      : -Math.pow(Math.abs(x) + 0.5, 2) * 5,         // -0.5→-5.0 · -6→-211.25 (bust cliff)

    // Linear: true expected ppWA (no risk distortion)
    neutral: x => x,
  };

  const fn = U[mode] || U.neutral;
  return Object.entries(_GM_MIDPOINTS).reduce((sum, [tier, mid]) => {
    return sum + (tiers[tier] ?? 0) / total * fn(mid);
  }, 0);
}

// RANGE VIEW — probabilistic outcome chart for Big Board
// ═══════════════════════════════════════════════════════════
// Tier order for stacked distribution bars (worst → best, left → right)
const TIER_STACK = [
  { name:"Negative",     color:"#ef4444", lo:-10, hi:-2  },
  { name:"Replacement",  color:"#8b5cf6", lo:-2,  hi:1   },
  { name:"Role Player",  color:"#06b6d4", lo:1,   hi:4   },
  { name:"Starter",      color:"#3b82f6", lo:4,   hi:10  },
  { name:"All-Star",     color:"#f97316", lo:10,  hi:25  },
  { name:"Superstar",    color:"#fbbf24", lo:25,  hi:50  },
];

function RangeView({ players, gmRisk }) {
  // ── Show top 60 (2 full draft rounds) ──
  const visible = players.slice(0, 60);
  const N = visible.length;

  // ── Layout: horizontal bars, players as rows (top→bottom) ──
  // Names readable on the left; ppWA scale on the x-axis.
  const RANK_W   = 24;    // rank number column
  const NAME_W   = 152;   // player name column
  const LEFT_CHT = RANK_W + NAME_W;  // 176 — where chart area starts
  const CHART_W  = 400;   // chart width for ppWA -10→50 (60 units)
  const RIGHT_PAD = 16;
  const W = LEFT_CHT + CHART_W + RIGHT_PAD;  // 592

  const PAD_TOP  = 46;    // top: title + x-axis ticks + tier labels
  const ROW_H    = 14;    // pixel height per player row
  const PAD_BOT  = 38;    // bottom: legend + caption
  const H = PAD_TOP + N * ROW_H + PAD_BOT;

  // ppWA → x pixel
  const PPWA_MIN = -10, PPWA_R = 60;
  const xBar = ppwa => LEFT_CHT + (Math.max(-10, Math.min(50, ppwa)) - PPWA_MIN) / PPWA_R * CHART_W;
  // Row i → center y pixel
  const yC = i => PAD_TOP + i * ROW_H + ROW_H / 2;

  const xTicks   = [-10, 0, 10, 20, 30, 40, 50];
  const tierBnds = [-2, 1, 4, 10, 25];

  const sortModeLabel = gmRisk === "ceiling"
    ? "Ceiling Sort — convex utility: Superstar probability rewarded disproportionately"
    : gmRisk === "floor"
    ? "Floor Sort — concave utility: bust risk penalized catastrophically (quadratic)"
    : "Balanced Sort — linear expected value E[Added Wins] via tier probabilities";

  const posColors = { Playmaker: "#3b82f6", Wing: "#f97316", Big: "#8b5cf6" };

  return (
    <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "82vh", background: "#0a0e17", borderRadius: 12, border: "1px solid #1f2937" }}>
      <svg width={W} height={H} style={{ display: "block", fontFamily: "'Inter',sans-serif" }}>

        {/* ── Sort mode label (top) ── */}
        <text x={LEFT_CHT + CHART_W / 2} y={11} fontSize={7} fill="#f97316" textAnchor="middle" opacity={0.8}>
          {sortModeLabel}
        </text>

        {/* ── Tier zone backgrounds (vertical bands) ── */}
        {TIER_STACK.map(t => (
          <rect key={`bg-${t.name}`}
            x={xBar(t.lo)} y={PAD_TOP}
            width={Math.max(1, xBar(t.hi) - xBar(t.lo))} height={N * ROW_H}
            fill={t.color} opacity={0.055}
          />
        ))}

        {/* ── Tier boundary vertical grid lines ── */}
        {tierBnds.map(v => (
          <line key={`bnd-${v}`}
            x1={xBar(v)} y1={PAD_TOP - 4} x2={xBar(v)} y2={PAD_TOP + N * ROW_H}
            stroke="#374151" strokeWidth={0.8} strokeDasharray="3,3"
          />
        ))}

        {/* ── X-axis ticks + labels ── */}
        {xTicks.map(v => (
          <g key={`xt-${v}`}>
            <line x1={xBar(v)} y1={PAD_TOP - 4} x2={xBar(v)} y2={PAD_TOP} stroke="#4b5563" strokeWidth={0.8}/>
            <text x={xBar(v)} y={PAD_TOP - 6} fontSize={7.5} fill="#4b5563" textAnchor="middle">{v}</text>
          </g>
        ))}

        {/* ── Tier labels above chart ── */}
        {TIER_STACK.map(t => {
          const mid = (xBar(t.lo) + xBar(t.hi)) / 2;
          const lbl = t.name === "Role Player" ? "Role" : t.name === "Replacement" ? "Repl"
            : t.name === "All-Star" ? "AS" : t.name === "Superstar" ? "SS" : t.name;
          return (
            <text key={`tlbl-${t.name}`} x={mid} y={PAD_TOP - 18} fontSize={6.5} fill={t.color} textAnchor="middle" opacity={0.7}>
              {lbl}
            </text>
          );
        })}

        {/* ── "Added Wins" axis label ── */}
        <text x={LEFT_CHT + CHART_W / 2} y={PAD_TOP - 30} fontSize={7} fill="#6b7280" textAnchor="middle">Added Wins →</text>

        {/* ── Chart border ── */}
        <rect x={LEFT_CHT} y={PAD_TOP} width={CHART_W} height={N * ROW_H} fill="none" stroke="#1f2937" strokeWidth={0.5}/>

        {/* ── Player rows ─────────────────────────────────────────────────────
            Each row: rank + name (left) | horizontal bar p10→p90 + dot at war
            Overlapping bars across rows = projection ranges that are
            statistically indistinguishable — prospects you can rank either way.
        ── */}
        {visible.map((p, i) => {
          const { floor: rf, med: rm, ceil: rc } = computeRangePpwa(p.tiers);
          const war    = p.war ?? rm;
          const xFloor = xBar(rf);
          const xCeil  = xBar(rc);
          const xWar   = xBar(war);
          const rowY   = yC(i);
          const barH   = 5;

          const trs = p.tiers || {};
          const domTier = TIER_STACK.reduce(
            (best, t) => ((trs[t.name] ?? 0) > (trs[best.name] ?? 0) ? t : best),
            TIER_STACK[0]
          );
          const barColor = domTier.color;
          const posColor = posColors[p.pos] || "#6b7280";

          // Dim the half that is de-emphasised for the active GM mode
          const upOp = gmRisk === "floor"    ? 0.22 : 0.85;
          const dnOp = gmRisk === "ceiling"  ? 0.22 : 0.85;

          const nameParts  = p.name.split(" ");
          const firstInit  = (nameParts[0] || "?")[0];
          const lastName   = nameParts.slice(1).join(" ").slice(0, 14) || p.name.slice(0, 14);
          const displayName = `${firstInit}. ${lastName}`;

          // War label: placed just right of ceiling cap, clamped to SVG width
          const warLabelX = Math.min(xCeil + 5, W - 10);

          return (
            <g key={p.name}>
              {/* Subtle alternating row fill */}
              {i % 2 === 0 && (
                <rect x={0} y={PAD_TOP + i * ROW_H} width={W} height={ROW_H} fill="#ffffff" opacity={0.012}/>
              )}

              {/* Position color indicator — left edge: blue=Playmaker, orange=Wing, purple=Big */}
              <rect x={0} y={PAD_TOP + i * ROW_H + 2} width={3} height={ROW_H - 4} fill={posColor} opacity={0.8} rx={1}/>

              {/* Rank number */}
              <text x={RANK_W - 3} y={rowY + 3.5} fontSize={7.5} fill="#4b5563" textAnchor="end">{i + 1}</text>

              {/* Player name */}
              <text x={RANK_W + 4} y={rowY + 3.5} fontSize={8} fill={i < 5 ? "#f3f4f6" : "#9ca3af"}
                textAnchor="start" fontWeight={i < 5 ? "600" : "400"}>
                {displayName}
              </text>

              {/* Tier-Probability-Stack: Bar wird in Tier-Segmente geteilt, Breite per Wahrscheinlichkeit.
                  Das macht die Modell-Differenzierung visuell sichtbar — zwei Spieler mit gleichem ppWA
                  koennen ganz unterschiedliche Tier-Verteilungen haben (z.B. Hi-Variance Star vs Safe Starter). */}
              {(() => {
                const trs = p.tiers || {};
                const total = (trs.Negative||0)+(trs.Replacement||0)+(trs["Role Player"]||0)+
                              (trs.Starter||0)+(trs["All-Star"]||0)+(trs.Superstar||0);
                if (total < 0.5) {
                  // Keine echten Tier-Probs: fallback auf alten einheitlichen Bar
                  return (
                    <>
                      <rect x={xFloor} y={rowY - barH/2} width={Math.max(1, xWar-xFloor)} height={barH}
                        fill={barColor} opacity={dnOp} rx={2}/>
                      <rect x={xWar} y={rowY - barH/2} width={Math.max(1, xCeil-xWar)} height={barH}
                        fill={barColor} opacity={upOp} rx={2}/>
                    </>
                  );
                }
                // Aufteilung der Bar in Segmente proportional zu Tier-Probs.
                const segWidth = Math.max(1, xCeil - xFloor);
                let xCursor = xFloor;
                return TIER_STACK.map((t, ti) => {
                  const prob = (trs[t.name] || 0) / total;
                  if (prob < 0.005) return null;
                  const w = segWidth * prob;
                  const segX = xCursor;
                  xCursor += w;
                  // Opacity je nachdem ob das Segment links oder rechts vom war-Median liegt
                  const segMid = segX + w/2;
                  const opacity = segMid < xWar ? dnOp : upOp;
                  return (
                    <rect key={`seg-${ti}`} x={segX} y={rowY - barH/2} width={w} height={barH}
                      fill={t.color} opacity={opacity} rx={ti===0 || ti===TIER_STACK.length-1 ? 2 : 0}/>
                  );
                });
              })()}

              {/* End caps */}
              <line x1={xFloor} y1={rowY - barH / 2 - 1} x2={xFloor} y2={rowY + barH / 2 + 1}
                stroke={barColor} strokeWidth={1.5} opacity={dnOp}/>
              <line x1={xCeil}  y1={rowY - barH / 2 - 1} x2={xCeil}  y2={rowY + barH / 2 + 1}
                stroke={barColor} strokeWidth={1.5} opacity={upOp}/>

              {/* ppWA dot at median */}
              <circle cx={xWar} cy={rowY} r={3.5} fill={barColor} stroke="#0a0e17" strokeWidth={1.2}/>

              {/* War value label */}
              <text x={warLabelX} y={rowY + 3.5} fontSize={6.5} fill="#6b7280" textAnchor="start">
                {war.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* ── Bottom tier color legend ── */}
        {TIER_STACK.map((t, i) => {
          const lx = LEFT_CHT + i * (CHART_W / TIER_STACK.length);
          const lw = CHART_W / TIER_STACK.length - 2;
          return (
            <g key={`leg-${t.name}`}>
              <rect x={lx} y={PAD_TOP + N * ROW_H + 6} width={lw} height={4} rx={1} fill={t.color} opacity={0.5}/>
              <text x={lx + lw / 2} y={PAD_TOP + N * ROW_H + 18} fontSize={6} fill={t.color} textAnchor="middle" opacity={0.7}>
                {t.name === "Role Player" ? "Role" : t.name}
              </text>
            </g>
          );
        })}

        {/* ── Position legend (left edge indicators) ── */}
        {[["Playmaker","#3b82f6"],["Wing","#f97316"],["Big","#8b5cf6"]].map(([pos,col],i)=>(
          <g key={pos}>
            <rect x={4 + i * 56} y={H - 20} width={4} height={8} rx={1} fill={col} opacity={0.8}/>
            <text x={12 + i * 56} y={H - 13} fontSize={6} fill={col} opacity={0.75}>{pos}</text>
          </g>
        ))}

        {/* ── Caption ── */}
        <text x={LEFT_CHT + CHART_W / 2} y={H - 5} fontSize={6} fill="#374151" textAnchor="middle">
          bar = p10–p90 projection range · dot = median Added Wins · overlapping bars = statistically interchangeable prospects · left stripe = position
        </text>
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TIER BOARD (Ben-PF-Style: Tiers vertikal, Archetype-Spalten horizontal)
// ═══════════════════════════════════════════════════════════
// Inspiration: Ben PF's Tier-Board (twitter.com/bjpf_)
// 6 Tiers vertikal x 7 Archetype-Spalten horizontal.
// NBA-Front-Office-Use: 100-Spieler-Pool fuer 60 Picks + ~40 UDFA/Summer League.
// Plus Intl-Teams: Talent-Einordnung auch fuer Spieler die nicht NBA werden.

// Tiers entsprechen unseren Modell-Tiers (TC-Farben aus oben).
// Konsistent mit Backend WAR_TIERS (Superstar≥47, All-Star≥33, Starter≥17,
// Roleplayer≥8.3, Replacement≥0, Out<0).
const TIER_BOARD_TIERS = [
  { key: "Superstar",   name: "Superstar",    color: "#fbbf24" },
  { key: "All-Star",    name: "All-Star",     color: "#f97316" },
  { key: "Starter",     name: "Starter",      color: "#3b82f6" },
  { key: "Role Player", name: "Roleplayer",   color: "#06b6d4" },
  { key: "Replacement", name: "Replacement",  color: "#8b5cf6" },
  { key: "Out",         name: "Out / Bust",   color: "#6b7280" },
];

// War-Schwelle als Fallback wenn predTier fehlt (matched 10c WAR_TIERS).
function _tierFromWar(w) {
  if (w == null) return "Out";
  if (w >= 47) return "Superstar";
  if (w >= 33) return "All-Star";
  if (w >= 17) return "Starter";
  if (w >=  8) return "Role Player";
  if (w >=  0) return "Replacement";
  return "Out";
}

// Archetype-Cluster mit Position-Group-Mapping. Wird im Tier Board als
// 2-Header-Layer dargestellt (top: PLAYMAKER / WING / BIG, sub: archetype).
const ARCHETYPE_CLUSTERS = [
  { group: "Playmaker", color: "#3b82f6", archetypes: [
    "Floor General", "Scoring Playmaker", "Non-Specialized Playmaker",
    "Short Roll Playmaker", "Passing Hub", "Spacing Guard", "Defensive Guard",
  ]},
  { group: "Wing", color: "#f97316", archetypes: [
    "Initiator Wing", "Point Forward", "Scoring Wing", "Slashing Wing",
    "Non-Specialized Wing", "3-and-D Wing", "Defensive Wing",
  ]},
  { group: "Big", color: "#8b5cf6", archetypes: [
    "Stretch Big", "Stretch Rim Protector", "Scoring Big",
    "Non-Specialized Big", "Rim Protector", "Glass Cleaner",
  ]},
];
const ARCHETYPE_ORDER = ARCHETYPE_CLUSTERS.flatMap(c => c.archetypes);
const ARCHETYPE_TO_GROUP = Object.fromEntries(
  ARCHETYPE_CLUSTERS.flatMap(c => c.archetypes.map(a => [a, c.group]))
);

function TierBoardView({ players, onSelect }) {
  // Top 100 nach war (= NBA-roster-relevanter Pool)
  const visible = players.slice(0, 100);

  // Dynamische Spalten: nur die Archetypes die in Top-100 dieser Class
  // tatsächlich auftauchen. Sortiert nach ARCHETYPE_ORDER (Playmaker→Wing→Big-Cluster).
  const presentArchetypes = new Set();
  visible.forEach(p => { if (p.archetype) presentArchetypes.add(p.archetype); });
  const cols = ARCHETYPE_ORDER.filter(a => presentArchetypes.has(a));
  // Falls Archetypes vorhanden sind die nicht in ARCHETYPE_ORDER stehen (zukünftige):
  presentArchetypes.forEach(a => { if (!cols.includes(a)) cols.push(a); });

  // Bucket: tier × archetype
  const buckets = {};
  TIER_BOARD_TIERS.forEach(t => {
    buckets[t.key] = {};
    cols.forEach(c => { buckets[t.key][c] = []; });
  });

  visible.forEach((p, i) => {
    const rank = i + 1;
    const tierKey = p.predTier || _tierFromWar(p.war);
    if (!buckets[tierKey]) return;
    const arche = p.archetype || cols[0];
    if (!buckets[tierKey][arche]) buckets[tierKey][arche] = [];
    buckets[tierKey][arche].push({ ...p, _rank: rank });
  });

  return (
    <div style={{ overflowX: "auto", background: "#0a0e17", borderRadius: 12, border: "1px solid #1f2937" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: "'Inter',sans-serif" }}>
        <thead>
          {/* Top-Header: Position-Group (PLAYMAKER / WING / BIG) ueber den Archetype-Spalten */}
          <tr style={{ background: "#0a0e17", borderBottom: "1px solid #1f2937" }}>
            {ARCHETYPE_CLUSTERS.map(cluster => {
              const cluster_cols = cluster.archetypes.filter(a => cols.includes(a));
              if (cluster_cols.length === 0) return null;
              return (
                <th key={cluster.group} colSpan={cluster_cols.length}
                    style={{ padding: "8px 8px", color: cluster.color, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
                             textAlign: "center", borderRight: `2px solid ${cluster.color}33`, textTransform: "uppercase" }}>
                  {cluster.group}
                </th>
              );
            })}
            <th style={{ padding: "8px 12px" }}></th>
          </tr>
          {/* Sub-Header: konkrete Archetype-Namen */}
          <tr style={{ background: "#0a0e17", borderBottom: "2px solid #1f2937" }}>
            {cols.map(c => {
              const groupColor = ARCHETYPE_CLUSTERS.find(cl => cl.archetypes.includes(c))?.color || "#9ca3af";
              return (
                <th key={c} style={{ padding: "8px 8px", color: "#9ca3af", fontSize: 10, fontWeight: 500, textAlign: "left",
                                      borderRight: "1px solid #1f2937", borderTop: `1px dashed ${groupColor}33`,
                                      minWidth: 130, whiteSpace: "nowrap" }}>
                  {c}
                </th>
              );
            })}
            <th style={{ padding: "8px 12px", color: "#9ca3af", fontSize: 10, fontWeight: 600, textAlign: "left", whiteSpace: "nowrap" }}>
              Tier
            </th>
          </tr>
        </thead>
        <tbody>
          {TIER_BOARD_TIERS.map(tier => {
            const tierPlayers = cols.flatMap(c => buckets[tier.key][c] || []);
            if (tierPlayers.length === 0) return null;
            return (
              <tr key={tier.key} style={{ borderTop: `4px solid ${tier.color}` }}>
                {cols.map(c => {
                  const cell = buckets[tier.key][c] || [];
                  return (
                    <td key={c} style={{ padding: "8px 6px", verticalAlign: "top", borderRight: "1px solid #1f293744" }}>
                      {cell.map(p => (
                        <div key={p.player_id || p.name} onClick={() => onSelect(p.name)}
                             className="cursor-pointer hover:bg-white hover:bg-opacity-5"
                             style={{ padding: "2px 6px", borderRadius: 4, marginBottom: 2 }}
                             title={`#${p._rank} · Added Wins ${p.war?.toFixed?.(1) ?? "—"} · ${p.archetype || ""}`}>
                          <span style={{ color: tier.color, fontSize: 12, fontWeight: 500 }}>{p.name}</span>
                          <span style={{ color: "#6b7280", fontSize: 9, marginLeft: 4 }}>#{p._rank}</span>
                        </div>
                      ))}
                    </td>
                  );
                })}
                <td style={{ padding: "8px 12px", verticalAlign: "top", color: tier.color, fontSize: 13, fontWeight: 700,
                              fontFamily: "'Oswald',sans-serif", whiteSpace: "nowrap" }}>
                  {tier.name}
                  <div style={{ fontSize: 9, fontWeight: 400, color: "#6b7280", marginTop: 2 }}>
                    {tierPlayers.length} {tierPlayers.length === 1 ? "player" : "players"}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ padding: "10px 16px", color: "#6b7280", fontSize: 10, borderTop: "1px solid #1f2937" }}>
        Top 100 (NBA roster pool: 60 picks + ~40 UDFA/Summer League) · Tiers = model classification ·
        Columns = primary NBA archetype · Click = open profile
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// BIG BOARD (No class overview — single view)
// ═══════════════════════════════════════════════════════════
function BigBoardView({onSelect, boardData, setBoardData, loading, setLoading, availableYears, yearFilter, setYearFilter}) {
  const [sortBy,setSortBy]=useState("war");
  const [posFilter,setPosFilter]=useState("All");
  const [boardView,setBoardView]=useState("table"); // "table" | "range" | "tier"
  const [gmRisk,setGmRisk]=useState("neutral");    // "ceiling" | "neutral" | "floor"

  const fetchBoard = (year) => {
    setLoading(true);
    // Tobias 2026-05-09: n=500 ensures classRank computation has full per-year cohort
    const url = year && year!=="All"
      ? `${API_BASE}/board?n=500&year=${year}`
      : `${API_BASE}/board?n=500`;
    fetch(url)
      .then(r=>r.json())
      .then(d=>{
        const players = d.players||[];
        setBoardData(players);
        PLAYERS={};PLAYER_LIST=[];
        installPlayers(players);
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
    // ── GM Risk Profile: Expected Utility sort (Option C) ────────────────
    // Rank players by E[U(ppWA)] where U is the GM-archetype utility function.
    // See computeGMUtility for the three utility functions.
    //
    // Key property: ceiling/floor are applied even in table view (column sort
    // still works by falling through to sortFn when neither GM mode is active).
    // In range view with neutral mode → balanced expected-value sort.
    const utilityMode = gmRisk !== "neutral" ? gmRisk
      : boardView === "range" ? "neutral"    // balanced = linear E[ppWA] in range
      : null;                                 // table view → honour column sort

    const withRanges = list.map(p => ({
      ...p,
      _r: computeRangePpwa(p.tiers),
      _u: utilityMode !== null ? computeGMUtility(p.tiers, utilityMode) : 0,
    }));

    if (utilityMode !== null) {
      withRanges.sort((a, b) => b._u - a._u);
    } else {
      withRanges.sort(sortFn[sortBy] || sortFn.war);
    }
    // Top 100 = NBA-roster-relevanter Pool (60 Picks + ~40 UDFA/Summer League).
    // Tobias 2026-04-30: Front Offices brauchen Sicht auf Spieler die als
    // Undrafted-Free-Agent ins Camp kommen koennen, plus intl-Teams die fuer
    // ihre Roster-Entscheidungen Talent ueber den NBA-Cut hinaus einschaetzen.
    return withRanges.slice(0, 100);
  }, [allPlayers, sortBy, posFilter, gmRisk, boardView]);

  const posColors = {Playmaker:"#3b82f6", Wing:"#f97316", Big:"#8b5cf6"};

  // Sort label for header
  const sortLabels = {war:"Added Wins", age:"Age (youngest)", bpm:"BPM", super:"Star %", allstar:"All-Star %", starter:"Starter %", role:"Role %", tier:"Tier"};

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
            Probabilistic ranking · {filtered.length} prospects · Sort: {sortLabels[sortBy] || "Added Wins"}
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
          {[["war","Added Wins"],["age","Age"],["bpm","BPM"]].map(([k,l])=>(
            <button key={k} onClick={()=>setSortBy(k)} className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{background:sortBy===k?"#f97316":"#1f2937",color:sortBy===k?"#000":"#9ca3af"}}>
              {l}
            </button>
          ))}
        </div>
        {/* View toggle */}
        <div className="flex gap-1 ml-auto">
          {[["table","☰ Table"],["range","◈ Range"],["tier","▥ Tier Board"]].map(([v,l])=>(
            <button key={v} onClick={()=>setBoardView(v)} className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{background:boardView===v?"#6d28d9":"#1f2937",color:boardView===v?"#e9d5ff":"#9ca3af"}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* GM Risk Profile — only shown in Range view */}
      {boardView === "range" && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{color:"#4b5563"}}>GM Risk Profile</span>
          {[
            ["ceiling","🎰 Ceiling First","Rebuilding · Sort by upside potential","#f59e0b","#78350f"],
            ["neutral", "⚖️ Balanced",    "Default · Sort by (p10+p90)/2",        "#6b7280","#1f2937"],
            ["floor",  "🛡️ Floor First",  "Win-Now · Sort by floor reliability",  "#06b6d4","#0c4a6e"],
          ].map(([v,l,desc,activeColor,activeBg])=>(
            <button key={v} onClick={()=>setGmRisk(v)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold flex flex-col items-start"
              title={desc}
              style={{background:gmRisk===v?activeBg:"#111827",color:gmRisk===v?activeColor:"#6b7280",
                border:`1px solid ${gmRisk===v?activeColor:"#1f2937"}`}}>
              {l}
              <span style={{fontSize:9,opacity:0.7,fontWeight:400,marginTop:1}}>{desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* Range View */}
      {boardView === "range" && (
        <div>
          <RangeView players={filtered} gmRisk={gmRisk} />
        </div>
      )}

      {/* Tier Board View — Ben-Style Tier-Splits + Archetype-Spalten */}
      {boardView === "tier" && (
        <div>
          <TierBoardView players={filtered} onSelect={onSelect} />
        </div>
      )}

      {/* Board table */}
      {boardView === "table" && (
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
                <SortTh sortKey="war">Added Wins</SortTh>
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
                        {p.injuryFallbackSeason && (
                          <span title={`Injury-shortened season ${Math.round(p.injuryFallbackSeason)} — projection based on prior full season`}
                                className="text-xs cursor-help" style={{color:"#fb923c"}}>🩹</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {(p.badges||[]).slice(0,4).map((b,j)=><span key={j} className="text-xs px-1.5 py-0 rounded" style={{background:"#22c55e22",color:"#22c55e",fontSize:9}}>{b}</span>)}
                        {(p.yellowBadges||[]).slice(0,2).map((b,j)=><span key={`y${j}`} className="text-xs px-1.5 py-0 rounded" style={{background:"#eab30822",color:"#eab308",fontSize:9}}>{b}</span>)}
                        {(p.redFlags||[]).slice(0,2).map((f,j)=><span key={`r${j}`} className="text-xs px-1.5 py-0 rounded" style={{background:"#ef444422",color:"#ef4444",fontSize:9}}>{f}</span>)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5"><span className="px-2 py-0.5 rounded text-xs font-semibold" style={{background:(posColors[p.pos]||"#6b7280")+"22",color:posColors[p.pos]||"#6b7280"}}>{p.pos}</span></td>
                    <td className="px-3 py-2.5 text-xs" style={{color:"#9ca3af"}}>{p.team||p.conf}</td>
                    <td className="px-3 py-2.5 text-xs" style={{color: p.age != null && p.age < 20 ? "#86efac" : "#9ca3af"}}>{p.age != null ? ageOnDraftDay(p.age).toFixed(1) : "—"}</td>
                    <td className="px-3 py-2.5 font-bold" style={{color: (() => {
                      // Tobias 2026-05-09: ppWA-Farbe synced mit recalibrateTier-Label.
                      // Vorher: War-Schwellen (≥47 Superstar, ≥33 AllStar...) — passten nicht
                      // zum kumulativen Tier-Label (Boozer war=25 → blau, aber Tier=All-Star/orange).
                      if (p.war == null) return "#374151";
                      return TC[p.predTier] || "#6b7280";
                    })(), fontFamily:"'Oswald',sans-serif"}}>{p.war != null ? (p.war >= 10 ? fmt(p.war, 0) : fmt(p.war, 1)) : "—"}</td>
                    <td className="px-3 py-2.5 text-xs font-semibold" style={{color: p.bpm != null ? (p.bpm > 8 ? "#22c55e" : p.bpm > 4 ? "#86efac" : "#9ca3af") : "#374151"}}>{p.bpm != null ? fmt(p.bpm, 1) : "—"}</td>
                    {/* NBA Tier */}
                    <td className="px-3 py-2.5 text-xs font-bold" style={{color:TC[p.predTier]||"#6b7280"}}>{p.predTier||"—"}</td>
                    {/* International Tier — ML-Prediction aus 10e_intl_tier_classifier.
                        Conditional: nur anzeigen wenn die kumulierte NBA-Wahrscheinlichkeit
                        (Superstar+All-Star+Starter+Role) < 25%. Bei hoher NBA-Wahrsch. ist
                        die was-if-non-NBA-Aussage inkonsistent und verwirrt User.
                        Tobias-Vorgabe (2026-04-29): Credibility durch Plausibilitaet. */}
                    {(() => {
                      const pNbaTot = (Number(p.tiers?.Superstar)||0) + (Number(p.tiers?.["All-Star"])||0)
                                    + (Number(p.tiers?.Starter)||0)  + (Number(p.tiers?.["Role Player"])||0);
                      const tier = p.intlTier;
                      // Hide wenn NBA-Wahrsch. >= 25% ODER kein intl_tier vorhanden
                      // ODER Spieler hat bereits NBA-Karriere (made_nba)
                      if (!tier || pNbaTot >= 25 || p.madeNba) {
                        return <td className="px-3 py-2.5 text-xs" style={{color:"#374151"}}>—</td>;
                      }
                      const INTL_COLORS = {
                        "EuroLeague Impact": "#fbbf24",
                        "EuroLeague":        "#f97316",
                        "Top European Liga": "#60a5fa",
                        "Pro Basketball":    "#a78bfa",
                        "Fringe Pro":        "#6b7280",
                      };
                      const SHORT = {
                        "EuroLeague Impact": "EL Impact",
                        "EuroLeague":        "EuroLeague",
                        "Top European Liga": "Top Euro",
                        "Pro Basketball":    "Pro Ball",
                        "Fringe Pro":        "Fringe",
                      };
                      const color = INTL_COLORS[tier] || "#6b7280";
                      return (
                        <td className="px-3 py-2.5 text-xs font-semibold" style={{color}} title={tier}>
                          🌍 {SHORT[tier] || tier}
                        </td>
                      );
                    })()}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}
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
  {id:"mind",label:"Mind",icon:"🧠"},
  {id:"scouting",label:"Scouting",icon:"⭐"},
  {id:"roles",label:"Roles & Archetypes",icon:"🧬"},
  {id:"comps",label:"Comps",icon:"⇄"},
  {id:"devtrajectory",label:"Development",icon:"📈"},
  {id:"projection",label:"Projection",icon:"◆"},
  {id:"riskprofile",label:"Risk Profile",icon:"🎯"},
];


// playerSourceMeta — single source of truth for player source metadata.
// All code that needs to know "is this player NCAA or International?" or
// what threshold cohort to display must call this helper instead of
// inlining `p.source !== "ncaa"`. Forward-compatible: extend the returned
// object as new source-dependent logic emerges.
//
// Contract:
//   In : player profile object (may be undefined)
//   Out: { isIntl: bool, isNcaa: bool, source: "ncaa"|"intl"|<other>,
//          thresholdCohort: string for verdict-block UI }
function playerSourceMeta(p) {
  const src = (p && p.source) ? p.source : "ncaa";
  const isIntl = src !== "ncaa";
  return {
    isIntl,
    isNcaa: !isIntl,
    source: src,
    thresholdCohort: isIntl
      ? "Intl Bridge Cohort (n≈400, Euroleague/ACB/BBL/FIBA youth)"
      : "NCAA Pre-Draft 2008–2018 (n≈506 NBA players)",
  };
}

export default function App() {
  const [sel,setSel]=useState(null);
  const [tab,setTab]=useState("overview");
  const [boardView,setBoardView]=useState("bigboard");  // Startseite: bigboard | research | methods
  const [search,setSearch]=useState("");
  const [showS,setShowS]=useState(false);
  // Default comparison tier: "Starter" is the most informative baseline for first-round prospects
  // (Replacement is trivially passed by every lottery pick, All-Star is aspirational).
  const [compTier,setCompTier]=useState("Starter");

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
            installPlayers(players);
            setLoading(false);
            // Initial URL parse: if landing on /player/<slug>, auto-select.
            if (typeof window !== "undefined") {
              const m = window.location.pathname.match(/^\/player\/([^/]+)\/?$/);
              if (m) {
                const wanted = decodeURIComponent(m[1]);
                // 1. Lokaler Lookup im current Board (Top-N aktuelle Saison)
                const found = Object.entries(PLAYERS).find(
                  ([_, pl]) => pl.slug === wanted || String(pl.player_id) === wanted
                );
                console.log("[direct-url] wanted slug:", wanted,
                            "PLAYERS size:", Object.keys(PLAYERS).length,
                            "found in board:", !!found);
                if (found) {
                  console.log("[direct-url] using board entry:", found[0]);
                  selectPlayer(found[0]);
                } else {
                  // 2. Fallback: Spieler nicht im aktuellen Board (z.B. ältere
                  // Draft-Klasse). API-Call holt Profile, dann Spieler ins PLAYERS-
                  // Lookup adden + selektieren.
                  const apiUrl = `${API_BASE}/player/${encodeURIComponent(wanted)}`;
                  console.log("[direct-url] fetching direct:", apiUrl);

                  // Two-stage resolver:
                  // 1) Direct slug-lookup (works for canonical slugs aus Sitemap)
                  // 2) Falls 404: Name-Search-Fallback (friendly slug like 'luka-doncic'
                  //    → search → real slug 'luka-doncic-rmb-18-4148')
                  const resolveProfile = async () => {
                    let r = await fetch(apiUrl);
                    if (r.ok) {
                      console.log("[direct-url] direct hit");
                      return r.json();
                    }
                    console.log("[direct-url] direct 404, trying name-search fallback");
                    // Slug → Name: "luka-doncic" → "luka doncic"
                    const nameQuery = wanted.replace(/-/g, ' ');
                    const sr = await fetch(
                      `${API_BASE}/players/search?q=${encodeURIComponent(nameQuery)}&limit=1`
                    );
                    if (!sr.ok) return null;
                    const searchData = await sr.json();
                    const hit = searchData?.results?.[0];
                    if (!hit) {
                      console.warn("[direct-url] name-search returned 0 results");
                      return null;
                    }
                    console.log("[direct-url] search hit:", hit.name);

                    // Backend's find_player() matcht in Reihenfolge: player_id → slug → name.
                    // Search-Endpoint liefert KEIN slug-Field, ABER: name + (optional) player_id
                    // reichen aus — backend macht name-lookup als 3. Fallback.
                    const ident = hit.player_id || hit.name;
                    const pr = await fetch(`${API_BASE}/player/${encodeURIComponent(ident)}`);
                    if (!pr.ok) {
                      console.warn("[direct-url] player fetch by name/id failed:", pr.status);
                      return null;
                    }
                    const data = await pr.json();
                    // URL auf canonical slug aktualisieren falls Backend einen returned
                    const canonical = data?.profile?.slug;
                    if (canonical && typeof window !== "undefined") {
                      window.history.replaceState({slug: canonical}, '', `/player/${canonical}`);
                    }
                    return data;
                  };

                  resolveProfile()
                    .then(data => {
                      console.log("[direct-url] payload keys:", data ? Object.keys(data) : null);
                      const prof = data?.profile;
                      if (!prof) {
                        console.warn("[direct-url] no profile resolved — slug + name-search both failed");
                        return;
                      }
                      const mapped = mapProfile(prof);
                      const name = prof.name || mapped?.name || wanted;
                      console.log("[direct-url] resolved name:", name, "slug:", prof.slug);
                      PLAYERS[name] = {
                        ...(mapped || {}),
                        slug: prof.slug || wanted,
                        player_id: prof.player_id,
                        name,
                      };
                      setProfileCache(prev => ({...prev, [name]: PLAYERS[name]}));
                      selectPlayer(name);
                    })
                    .catch(e => console.warn("[direct-url] resolveProfile failed:", e));
                }
              }
            }
          });
      })
      .catch(e=>{console.error("Board fetch failed:",e);setLoading(false);});
  },[]);

  // Browser-Back/Forward + sel→URL sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => {
      const m = window.location.pathname.match(/^\/player\/([^/]+)\/?$/);
      if (m) {
        const wanted = decodeURIComponent(m[1]);
        const found = Object.entries(PLAYERS).find(
          ([_, pl]) => pl.slug === wanted || String(pl.player_id) === wanted
        );
        if (found && found[0] !== sel) selectPlayer(found[0]);
      } else if (sel) {
        setSel(null);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [sel]);

  // When returning to board view (sel cleared), restore root URL.
  // WICHTIG: ersten Mount überspringen — sonst überschreibt dieser Effect die
  // /player/<slug>-URL beim Page-Load (sel ist initial null, pathname aber bereits
  // /player/...). Der initial-URL-Parse-Effect setzt sel via selectPlayer und
  // pushed dabei selbst die URL — wir wollen hier nicht dazwischenfunken.
  const sawFirstSelChange = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!sawFirstSelChange.current) {
      sawFirstSelChange.current = true;
      return;
    }
    if (sel === null && window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
  }, [sel]);

  // SEO meta tags — sync title/description/OG/Twitter to current player or board.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const setMeta = (selector, attrName, attrVal, content) => {
      let el = document.head.querySelector(selector);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attrName, attrVal);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    const setLink = (rel, href) => {
      let el = document.head.querySelector(`link[rel="${rel}"]`);
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', rel);
        document.head.appendChild(el);
      }
      el.setAttribute('href', href);
    };

    const baseUrl = "https://prospecttheory.io";
    let title = "ProspectTheory — NBA Draft Intelligence";
    let desc  = "Probabilistic NBA draft prospect evaluation using college statistics, combine measurements, and machine learning tier predictions.";
    let url   = `${baseUrl}/`;
    let ogType = "website";

    if (sel) {
      const p = profileCache[sel] || PLAYERS[sel] || {};
      const slug = p.slug || (typeof sel === "string" ? sel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '');
      const name = p.name || sel;
      const yr   = p.yr || p.cls || '';
      const team = p.team || p.conf || '';
      const tier = p.tier || '';
      const ppwa = (p.ppwa != null && isFinite(p.ppwa)) ? Math.round(p.ppwa * 10) / 10 : null;

      title = yr ? `${name} · Class of ${yr} — ProspectTheory` : `${name} — ProspectTheory`;

      const dparts = [name];
      if (team) dparts.push(team);
      if (yr)   dparts.push(`Class ${yr}`);
      if (tier) dparts.push(`Projected ${tier}`);
      if (ppwa != null) dparts.push(`${ppwa} Added Wins`);
      dparts.push("Stats, projection & NBA comps.");
      desc = dparts.join(' · ').slice(0, 160);

      if (slug) url = `${baseUrl}/player/${slug}`;
      ogType = "profile";
    }

    document.title = title;
    setMeta('meta[name="description"]', 'name', 'description', desc);
    setMeta('meta[property="og:title"]', 'property', 'og:title', title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', desc);
    setMeta('meta[property="og:url"]', 'property', 'og:url', url);
    setMeta('meta[property="og:type"]', 'property', 'og:type', ogType);
    setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', 'ProspectTheory');
    setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', desc);
    setLink('canonical', url);
  }, [sel, profileCache]);

  const selectPlayer = async (name) => {
    setSel(name); setSearch(""); setShowS(false); setTab("overview");
    // Push slug-based URL so each player has a shareable, SEO-friendly address.
    const _bp = PLAYERS[name];
    const _slug = _bp?.slug || _bp?.player_id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (_slug && typeof window !== "undefined" && window.location.pathname !== `/player/${_slug}`) {
      window.history.pushState({slug: _slug}, '', `/player/${_slug}`);
    }
    if (profileCache[name]) return;

    // Prefer slug/player_id in the API path — the display name may be a
    // disambiguated key like "Cameron Boozer · Duke '26" and the backend
    // won't resolve it. Fall back to the raw display name for legacy rows
    // (search results not yet enriched by the board).
    const boardProfile = PLAYERS[name];
    const apiIdent = encodeURIComponent(
      boardProfile?.slug || boardProfile?.player_id || boardProfile?.name || name
    );

    // If board already loaded rich profile data (ppwa present), show Overview
    // immediately and load full profile + comps in background — no blocking spinner.
    const alreadyRich = boardProfile && (boardProfile.ppwa != null || boardProfile.pctl != null);
    if (alreadyRich) {
      setProfileCache(prev => ({...prev, [name]: boardProfile}));
      // Fetch full profile + comps in background (non-blocking)
      // This ensures Shooting/Scouting/Projection tabs always get complete data
      Promise.all([
        fetch(`${API_BASE}/player/${apiIdent}`).then(r=>r.ok?r.json():null).catch(()=>null),
        fetch(`${API_BASE}/comps/stats/${apiIdent}`).then(r=>r.ok?r.json():null).catch(()=>null),
        fetch(`${API_BASE}/comps/anthro/${apiIdent}`).then(r=>r.ok?r.json():null).catch(()=>null),
      ]).then(([profRes, statsRes, anthroRes]) => {
        // Use full profile if available, fall back to board profile
        const updated = profRes?.profile ? mapProfile(profRes.profile) : {...boardProfile};
        if (statsRes?.comps) {
          // Tobias 2026-05-06 v2: Re-Skalierung INNERHALB der gezeigten Top-N Comps.
          // Backend liefert globale 0-100 similarity (Z-Distance-Skala). Für unique
          // Spieler (Cooper Flagg, Darryn Peterson) liegen die Top-10 alle bei ~38%
          // → optisch ununterscheidbar.
          // Lösung: skaliere die gezeigte Liste auf 50-95% relativ — Top-Comp = 95%,
          // Worst-Comp der Liste = 50%. Das ist ehrlich, weil:
          //  (a) Sortierung bleibt korrekt (höchster Match oben)
          //  (b) Differenzierung sichtbar (Spannweite 45 Pp innerhalb Top-10)
          //  (c) absolute Skala bleibt im Tooltip einsehbar
          const rawSims = (statsRes.comps || []).map(c => Number(c.similarity ?? 0)).filter(v => v > 0);
          const maxRaw = rawSims.length ? Math.max(...rawSims) : 1;
          const minRaw = rawSims.length ? Math.min(...rawSims) : 0;
          const range = maxRaw - minRaw || 1;
          updated.statComps = (statsRes.comps || []).map(c => {
            const rawSim = c.similarity != null ? Math.round(Number(c.similarity)) : null;
            // Relative score innerhalb der angezeigten Liste: 50-95
            const sim = rawSim != null ? Math.round(50 + (rawSim - minRaw) / range * 45) : null;
          return {
            name:c.name, pos:c.position||c.pos, sim, rawSim,
            tier: tierFromPeakPie(c.peak_pie) || c.tier || "",
            nba:!!c.made_nba, bpm:c.bpm, usg:c.usg, ts:c.ts,
            astP:c.ast_p, toP:c.to_p, orbP:c.orb_p, drbP:c.drb_p,
            stlP:c.stl_p, blkP:c.blk_p, ftr:c.ftr,
            rimPct:c.rim_pct, tp:c.tp_pct, ft:c.ft_pct, dunkR:c.dunk_r,
            ht:c.height||c.ht,
            badges:c.badges?c.badges.split("|").filter(Boolean):[],
          };
        });
        } // end statComps mapping
        if (anthroRes) {
          updated.hasCombine = anthroRes.has_combine ?? (anthroRes.comps?.length > 0);
          updated.anthroComps = (anthroRes.comps||[]).map(c=>({
            name:c.name, dist:c.distance, sim:Math.round(c.similarity||0),
            ht:c.height||c.ht, wt:c.weight||c.wt, ws:c.wingspan||c.ws,
            nba:!!c.made_nba, tier: tierFromPeakPie(c.peak_pie) || c.tier || "",
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
        fetch(`${API_BASE}/player/${apiIdent}`).then(r=>r.ok?r.json():null),
        fetch(`${API_BASE}/comps/stats/${apiIdent}`).then(r=>r.ok?r.json():null).catch(()=>null),
        fetch(`${API_BASE}/comps/anthro/${apiIdent}`).then(r=>r.ok?r.json():null).catch(()=>null),
      ]);
      if (profRes?.profile) {
        const mapped = mapProfile(profRes.profile);
        // Carry canonical identity onto the cached entry so downstream
        // fetches stay slug-routed.
        mapped.player_id = profRes.player_id || profRes.profile.player_id || mapped.player_id;
        mapped.slug = profRes.slug || profRes.profile.slug || mapped.slug;
        mapped.name = profRes.name || profRes.profile.name || mapped.name;
        if (statsRes?.comps) {
          // Tobias 2026-05-06 v2: Re-Skalierung 50-95 innerhalb der gezeigten Top-N Comps.
          const rawSims2 = (statsRes.comps || []).map(c => Number(c.similarity ?? 0)).filter(v => v > 0);
          const maxRaw2 = rawSims2.length ? Math.max(...rawSims2) : 1;
          const minRaw2 = rawSims2.length ? Math.min(...rawSims2) : 0;
          const range2 = maxRaw2 - minRaw2 || 1;
          mapped.statComps = (statsRes.comps || []).map(c => {
            const rawSim = c.similarity != null ? Math.round(Number(c.similarity)) : null;
            const sim = rawSim != null ? Math.round(50 + (rawSim - minRaw2) / range2 * 45) : null;
            return {
              name:c.name, pos:c.position||c.pos, sim, rawSim,
              tier: tierFromPeakPie(c.peak_pie) || c.tier || "",
            nba:!!c.made_nba, bpm:c.bpm, usg:c.usg, ts:c.ts,
              astP:c.ast_p, toP:c.to_p, orbP:c.orb_p, drbP:c.drb_p,
              stlP:c.stl_p, blkP:c.blk_p, ftr:c.ftr,
              rimPct:c.rim_pct, tp:c.tp_pct, ft:c.ft_pct, dunkR:c.dunk_r,
              ht:c.height||c.ht,
              badges:c.badges?c.badges.split("|").filter(Boolean):[],
            };
          });
        }
        if (anthroRes) {
          mapped.hasCombine = anthroRes.has_combine ?? (anthroRes.comps?.length > 0);
          mapped.anthroComps = (anthroRes.comps||[]).map(c=>({
            name:c.name, dist:c.distance, sim:Math.round(c.similarity||0),
            ht:c.height||c.ht, wt:c.weight||c.wt, ws:c.wingspan||c.ws,
            nba:!!c.made_nba, tier: tierFromPeakPie(c.peak_pie) || c.tier || "",
          }));
        }
        PLAYERS[name] = mapped;
        setProfileCache(prev => ({...prev, [name]: mapped}));
      }
    } catch(e) {
      console.error("Profile fetch failed:", e);
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(()=>{
    if(!search||search.length<2){setSearchResults([]);return;}
    // Local match works across both raw and disambiguated keys ("Cameron
    // Boozer · Duke '26" contains "Cameron Boozer" so both show up).
    const ql = search.toLowerCase();
    const local = PLAYER_LIST.filter(n=>n.toLowerCase().includes(ql)).slice(0,15);
    if(local.length>0) setSearchResults(local);
    const t=setTimeout(()=>{
      fetch(`${API_BASE}/players/search?q=${encodeURIComponent(search)}&limit=15`)
        .then(r=>r.json())
        .then(d=>{
          const results = d.results||[];
          // Build unique display keys for API results — if a name already
          // exists under a disambiguated key locally, reuse that key.
          const apiKeys = results.map(r => {
            const raw = r.name || "";
            // If the local list already has this exact name, reuse it.
            if (PLAYER_LIST.includes(raw)) return raw;
            // If the same raw name appears under a disambiguated key,
            // keep a lightweight entry under the raw name (backend will
            // resolve by slug anyway).
            return raw;
          });
          const merged = [...local];
          apiKeys.forEach(k => { if (k && !merged.includes(k)) merged.push(k); });
          setSearchResults(merged.slice(0,20));
          // Seed PLAYERS with lightweight rows so the dropdown can show
          // pos/team hints. Carry slug/player_id so selectPlayer() can
          // hit the backend by slug.
          results.forEach(r => {
            const k = r.name;
            if (!k) return;
            if (!PLAYERS[k]) {
              PLAYER_LIST.push(k);
              PLAYERS[k] = {
                name: r.name,
                slug: r.slug,
                player_id: r.player_id,
                pos: r.position || "",
                team: r.team || "",
              };
            } else {
              // Patch identity fields if missing (older cached entries)
              if (!PLAYERS[k].slug && r.slug) PLAYERS[k].slug = r.slug;
              if (!PLAYERS[k].player_id && r.player_id) PLAYERS[k].player_id = r.player_id;
            }
          });
        })
        .catch(()=>{});
    },300);
    return ()=>clearTimeout(t);
  },[search]);

  const p = sel ? (profileCache[sel] || PLAYERS[sel] || null) : null;
  // pReady: show profile as soon as we have ANY meaningful data
  // Board data has war/bpm/usg; full profile adds pctl/ppwa/feel etc.
  const pReady = p && (
    p.ppwa != null || p.war != null || p.bpm != null ||
    (p.pctl != null && (p.pts != null || p.usg != null || p.feel != null))
  );

  return (
    <div className="min-h-screen" style={{background:"#080b12",fontFamily:"'Barlow',sans-serif",color:"#e5e7eb"}}>
      <header className="sticky top-0 z-50 px-4 md:px-8 py-3" style={{background:"rgba(8,11,18,0.92)",backdropFilter:"blur(12px)",borderBottom:"1px solid #1f293744"}}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={()=>{setSel(null);setTab("overview");}}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm" style={{background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#000",flexShrink:0}}>PT</div>
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
              {searchResults.map(n=>{
                const pe = PLAYERS[n] || {};
                const displayName = pe.name || n;
                // Secondary line: team · year (or · position if year absent).
                // Shows up both as natural metadata AND as a disambiguator
                // when two players share a name.
                const yr = pe.yr;
                const secondaryParts = [pe.team, yr ? `'${String(yr).slice(-2)}` : null, pe.pos].filter(Boolean);
                const secondary = secondaryParts.join(" · ");
                return (
                  <button key={n} className="w-full text-left px-4 py-2.5 text-sm hover:bg-white hover:bg-opacity-5" onMouseDown={()=>selectPlayer(n)} style={{color:"#e5e7eb",borderBottom:"1px solid #1f2937"}}>
                    <span className="font-semibold">{displayName}</span>
                    {secondary && <span className="ml-2 text-xs" style={{color:"#6b7280"}}>{secondary}</span>}
                  </button>
                );
              })}
            </div>}
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6">
        {!sel ? (
          <>
            {/* Meta-level navigation: Big Board (default) · Research · Methods */}
            <div className="flex gap-2 mb-6 flex-wrap">
              {[["bigboard","Big Board","▦"],["research","Research","🔬"],["methods","Methods","📖"]].map(([id,label,icon])=>(
                <button key={id} onClick={()=>setBoardView(id)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  style={{background: boardView===id?"#f97316":"transparent",
                          color: boardView===id?"#000":"#9ca3af",
                          border:`1px solid ${boardView===id?"#f97316":"#374151"}`}}>
                  <span className="mr-1.5">{icon}</span>{label}
                </button>
              ))}
            </div>
            {boardView==="bigboard" ? (
              loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin mb-4" style={{borderColor:"#f97316",borderTopColor:"transparent"}}/>
                  <p className="text-sm" style={{color:"#6b7280"}}>Loading prospects...</p>
                </div>
              ) : (
                <BigBoardView onSelect={selectPlayer} boardData={boardData} setBoardData={setBoardData} loading={loading} setLoading={setLoading} availableYears={availableYears} yearFilter={yearFilter} setYearFilter={setYearFilter}/>
              )
            ) : boardView==="research" ? (
              <ResearchTab p={null}/>
            ) : (
              <MethodologyTab/>
            )}
          </>
        ) : profileLoading && !pReady ? (
          <div className="max-w-4xl mx-auto py-8">
            <div className="animate-pulse space-y-4">
              <div className="h-6 w-48 rounded" style={{background:"#1f2937"}}/>
              <div className="h-32 rounded-xl" style={{background:"#111827"}}/>
              <div className="grid grid-cols-4 gap-3">
                {[1,2,3,4].map(i=><div key={i} className="h-20 rounded-lg" style={{background:"#1f2937"}}/>)}
              </div>
              <div className="h-48 rounded-xl" style={{background:"#111827"}}/>
            </div>
            <p className="text-sm mt-4 text-center" style={{color:"#6b7280"}}>Loading {sel}...</p>
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
              <span>←</span> Back to Big  Board
            </button>
            {tab!=="methodology" && <>
              <div className="mb-5 rounded-2xl p-5 relative overflow-hidden" style={{background:"linear-gradient(135deg,#111827 0%,#0f172a 50%,#1e1b4b 100%)",border:"1px solid #1f2937"}}>
                <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-5" style={{background:"radial-gradient(circle,#f97316,transparent)",transform:"translate(30%,-30%)"}}/>
                <div className="flex flex-col md:flex-row md:items-center gap-3 relative z-10">
                  <div className="flex-1">
                    <div className="text-xs uppercase tracking-widest mb-1 flex items-center gap-2" style={{color:"#6b7280"}}>
                      <span>{p.draftYear || p.yr} Draft Class{p.source!=="ncaa"?` · ${p.source?.toUpperCase()}`:""}</span>
                      {p.classRank && (
                        <Tip content={<div><div className="font-bold mb-1" style={{color:"#f97316"}}>Model Draft Class Rank</div><div style={{color:"#cbd5e1"}}>Ranked #{p.classRank} in the {p.draftYear||p.yr} class by projected Added Wins (expected peak value). Based on the ProspectTheory value model — not a scout consensus ranking.</div></div>}>
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
                        // Cap to top-3 archetypes in header to avoid visual clutter (pipeline may emit up to 7 matches for versatile players)
                        const allArch = (p.archetypesAll || p.archetype || "").split("|").filter(Boolean).slice(0, 3);
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
                      <span>{p.team}</span><span>·</span><span>{p.ht}</span><span>·</span><span>Age {p.age!=null?ageOnDraftDay(p.age).toFixed(1):"—"}</span>
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
            {p.injuryFallbackSeason && (
              <div className="mb-4 p-3 rounded-lg text-sm flex items-start gap-2" style={{background:"#7c2d12",border:"1px solid #9a3412",color:"#fdba74"}}>
                <span style={{fontSize:"1.2em"}}>🩹</span>
                <div>
                  <strong>Injury-Adjusted Projection</strong> — Player's {Math.round(p.injuryFallbackSeason)}-season was injury-shortened.
                  Prediction is based on the {Math.round(p.season_year || p.year || 0)}-season (full sample) instead. Display info reflects current team/year.
                </div>
              </div>
            )}
            {p.countingStatsImputed && (
              <div className="mb-4 p-3 rounded-lg text-sm flex items-start gap-2" style={{background:"#1e3a5f",border:"1px solid #2563eb",color:"#93c5fd"}}>
                <span style={{fontSize:"1.2em"}}>ℹ️</span>
                <div>
                  <strong>Estimated Counting Stats</strong> — BartTorvik 2008-2010 has no per-game stats. PPG/RPG/APG are approximated from per-100 possessions × MPG. The model uses the full per-100 data — displayed values are estimates.
                </div>
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
            {tab==="mind"&&<MindTab p={p}/>}
            {tab==="scouting"&&<ScoutingTab p={p} mode="scouting"/>}
            {tab==="roles"&&<ScoutingTab p={p} mode="roles"/>}
            {tab==="comps"&&<CompsTab p={p}/>}
            {tab==="devtrajectory"&&<DevTrajectoryTab p={p}/>}
            {tab==="projection"&&<ProjectionTab p={p}/>}
            {tab==="riskprofile"&&<RiskProfileTab p={p}/>}
          </>
        )}
      </main>
      <footer className="mt-12 py-6 text-center text-xs" style={{color:"#374151",borderTop:"1px solid #111827"}}>
        <span style={{color:"#6b7280"}}>ProspectTheory</span> · NBA Draft Intelligence · Data: BartTorvik, RealGM, NBA API, Draft Combine, Databallr
      </footer>
    </div>
  );
}
