# Regression bank — round 2

Measured 2026-09-05.
Sweeps: roster 20 seeds x 30 years all bots; shape 30 seeds x 50 years conservative.

```
static.typecheck                1         [1, 1]            pass        PASS     
  static.invariants               0         [0, 0]            pass        PASS     
  static.parallelIdentity         1         [1, 1]            pass        PASS     
  static.bandsInSync              1         [1, 1]            pass        PASS     

  struct.deathRoutes              4         [4, 4]            pass        PASS     
  struct.overprintDeaths          28        [15, 95]          pass        PASS       DRIFT -43% from 49
  struct.debtSpiralDeaths         60        [15, 90]          pass        PASS     
  struct.channelCollapseDeaths    21        [8, 70]           pass        PASS     
  struct.attentionCollapseDeaths  20        [8, 60]           pass        PASS     
  struct.speculatorMoves          5.356     [1.2, 500]        pass        PASS     
  struct.collectorNotPinned       20        [5, 1000000000]   pass        PASS     
  struct.printRunVaries           17        [4, 100]          pass        PASS       DRIFT +42% from 12

  diff.botsAlwaysSurvive          7         [3, 11]           pass        PASS     
  diff.botsNeverSurvive           5         [2, 8]            pass        PASS     
  diff.conservativeSurvives       0.900     [0.95, 1]         known-fail  KNOWN    
  diff.hypeGamblerSurvival        0.800     [0.4, 0.85]       pass        PASS     
  diff.hypeGamblerTopEarner       1         [1, 3]            pass        PASS     
  diff.allInSurvival              0.800     [0.1, 0.6]        known-fail  KNOWN    
  diff.flooderDiesEarly           0.865     [0.4, 2.5]        pass        PASS     
  diff.attentionBurnerDies        1         [0.85, 1]         pass        PASS     
  diff.idleDies                   12.019    [2.5, 9]          known-fail  KNOWN    
  diff.deathsLandMidRun           12.712    [3, 25]           pass        PASS     
  diff.sellThrough                0.898     [0.75, 0.95]      pass        PASS     
  diff.flopRate                   0.032     [0.01, 0.25]      pass        PASS     

  shape.median                    3.760     [0.2, 0.5]        known-fail  KNOWN    
  shape.under1                    0.043     [0.64, 0.92]      known-fail  KNOWN      DRIFT -40% from 0.071
  shape.under25c                  0         [0.25, 0.8]       known-fail  KNOWN    
  shape.top1                      0.143     [0.21, 0.62]      known-fail  KNOWN    
  shape.top10                     0.456     [0.66, 0.95]      known-fail  KNOWN    
  shape.gini                      0.552     [0.72, 0.98]      known-fail  KNOWN    
  shape.chaseOverMedian           19.690    [130, 3100]       known-fail  KNOWN    
  shape.tailAlpha                 2.469     [1.6, 2.7]        pass        PASS     
  shape.ageCurveDirection         -0.057    [0.02, 0.45]      known-fail  KNOWN    
  shape.ageCurveLate              0         [0.55, 0.92]      known-fail  KNOWN      DRIFT -100% from 0.014
  shape.surpriseGrail             1         [0.1, 0.6]        known-fail  KNOWN    
  shape.yearsTo100                4.212     [2, 9]            pass        PASS     

  sub.signalLow                   0.498     [0.3, 0.72]       pass        PASS     
  sub.signalHigh                  0.821     [0.65, 0.97]      pass        PASS     
  sub.signalRises                 0.323     [0.08, 0.55]      pass        PASS     
  sub.gem10Premium                7.802     [2, 5.5]          known-fail  KNOWN    
  sub.gradedPrintingShare         0.121     [0.02, 0.09]      known-fail  KNOWN    
  sub.gemRate                     0.097     [0.3, 0.6]        known-fail  KNOWN    
  sub.scalperCycles               13        [3, 35]           pass        PASS     
  sub.scalperShare                0.026     [0.1, 0.5]        known-fail  KNOWN      DRIFT -30% from 0.038
  sub.houseArtShare               0.092     [0.02, 0.2]       pass        PASS     
  sub.channelHogLosesReach        7         [0.5, 6]          known-fail  KNOWN
```
