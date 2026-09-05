# Regression bank — round 3

Measured 2026-09-05.
Sweeps: roster 20 seeds x 30 years all bots; shape 30 seeds x 50 years conservative.

```
static.typecheck                1         [1, 1]            pass        PASS     
  static.invariants               0         [0, 0]            pass        PASS     
  static.parallelIdentity         1         [1, 1]            pass        PASS     
  static.bandsInSync              1         [1, 1]            pass        PASS     

  struct.deathRoutes              4         [4, 4]            pass        PASS     
  struct.overprintDeaths          79        [15, 95]          pass        PASS     
  struct.debtSpiralDeaths         79        [15, 90]          pass        PASS     
  struct.channelCollapseDeaths    12        [8, 70]           pass        PASS     
  struct.attentionCollapseDeaths  20        [8, 60]           pass        PASS     
  struct.speculatorMoves          2.132     [1.2, 500]        pass        PASS     
  struct.collectorNotPinned       20        [5, 1000000000]   pass        PASS     
  struct.printRunVaries           19        [4, 100]          pass        PASS     

  diff.botsAlwaysSurvive          1         [3, 11]           known-fail  KNOWN    
  diff.botsNeverSurvive           5         [2, 8]            pass        PASS     
  diff.conservativeSurvives       0.700     [0.95, 1]         known-fail  KNOWN    
  diff.hypeGamblerSurvival        0.700     [0.4, 0.85]       pass        PASS     
  diff.hypeGamblerTopEarner       1         [1, 3]            pass        PASS     
  diff.allInSurvival              0.050     [0.1, 0.6]        known-fail  KNOWN    
  diff.flooderDiesEarly           0.750     [0.4, 2.5]        pass        PASS     
  diff.attentionBurnerDies        1         [0.85, 1]         pass        PASS     
  diff.idleDies                   12.019    [2.5, 9]          known-fail  KNOWN    
  diff.deathsLandMidRun           8.173     [3, 25]           pass        PASS     
  diff.sellThrough                0.882     [0.75, 0.95]      pass        PASS     
  diff.flopRate                   0.015     [0.01, 0.25]      pass        PASS     

  shape.median                    8.470     [0.2, 0.5]        known-fail  KNOWN    
  shape.under1                    0.004     [0.64, 0.92]      known-fail  KNOWN    
  shape.under25c                  0         [0.25, 0.8]       known-fail  KNOWN    
  shape.top1                      0.156     [0.21, 0.62]      known-fail  KNOWN    
  shape.top10                     0.493     [0.66, 0.95]      known-fail  KNOWN    
  shape.gini                      0.579     [0.72, 0.98]      known-fail  KNOWN    
  shape.chaseOverMedian           38.470    [130, 3100]       known-fail  KNOWN    
  shape.tailAlpha                 2.388     [1.6, 2.7]        pass        PASS     
  shape.ageCurveDirection         -0.004    [0.02, 0.45]      known-fail  KNOWN    
  shape.ageCurveLate              0         [0.55, 0.92]      known-fail  KNOWN    
  shape.surpriseGrail             1         [0.1, 0.6]        known-fail  KNOWN    
  shape.yearsTo100                1.442     [2, 9]            known-fail  KNOWN    

  sub.signalLow                   0.520     [0.3, 0.72]       pass        PASS     
  sub.signalHigh                  0.853     [0.65, 0.97]      pass        PASS     
  sub.signalRises                 0.333     [0.08, 0.55]      pass        PASS     
  sub.gem10Premium                8.530     [2, 5.5]          known-fail  KNOWN    
  sub.gradedPrintingShare         0.232     [0.02, 0.09]      known-fail  KNOWN    
  sub.gemRate                     0.105     [0.3, 0.6]        known-fail  KNOWN    
  sub.scalperCycles               0         [3, 35]           known-fail  KNOWN    
  sub.scalperShare                0.242     [0.1, 0.5]        pass        PASS     
  sub.houseArtShare               0.097     [0.02, 0.2]       pass        PASS     
  sub.channelHogLosesReach        6         [0.5, 6]          pass        PASS
```
