# Regression bank — round 7

Measured 2026-09-06.
Sweeps: roster 20 seeds x 30 years all bots; shape 30 seeds x 50 years conservative.

```
static.typecheck                1         [1, 1]            pass        PASS     
  static.invariants               0         [0, 0]            pass        PASS     
  static.parallelIdentity         1         [1, 1]            pass        PASS     
  static.bandsInSync              1         [1, 1]            pass        PASS     

  struct.deathRoutes              4         [4, 4]            pass        PASS     
  struct.overprintDeaths          36        [15, 95]          pass        PASS     
  struct.debtSpiralDeaths         65        [15, 90]          pass        PASS     
  struct.channelCollapseDeaths    32        [8, 70]           pass        PASS     
  struct.attentionCollapseDeaths  20        [8, 60]           pass        PASS     
  struct.speculatorMoves          2.919     [1.2, 500]        pass        PASS     
  struct.heatNotPinned            0         [0, 0.1]          pass        PASS     
  struct.ripRationBinds           0.630     [0.2, 0.95]       pass        PASS     
  struct.collectorNotPinned       20        [5, 1000000000]   pass        PASS     
  struct.printRunVaries           19        [4, 100]          pass        PASS     

  diff.botsAlwaysSurvive          6         [3, 11]           pass        PASS     
  diff.botsNeverSurvive           5         [2, 8]            pass        PASS     
  diff.conservativeSurvives       0.900     [0.95, 1]         known-fail  KNOWN    
  diff.hypeGamblerSurvival        0.850     [0.4, 0.85]       pass        PASS     
  diff.hypeGamblerTopEarner       1         [1, 3]            pass        PASS     
  diff.allInSurvival              0.400     [0.1, 0.6]        pass        PASS     
  diff.flooderDiesEarly           0.750     [0.4, 2.5]        pass        PASS     
  diff.attentionBurnerDies        1         [0.85, 1]         pass        PASS     
  diff.idleDies                   12.019    [2.5, 9]          known-fail  KNOWN    
  diff.deathsLandMidRun           11.096    [3, 25]           pass        PASS     
  diff.sellThrough                0.944     [0.75, 0.95]      pass        PASS     
  diff.flopRate                   0.015     [0.01, 0.25]      pass        PASS     

  shape.median                    0.220     [0.2, 0.5]        pass        PASS     
  shape.under1                    0.818     [0.64, 0.92]      pass        PASS     
  shape.under25c                  0.539     [0.25, 0.8]       pass        PASS     
  shape.top1                      0.345     [0.21, 0.62]      pass        PASS     
  shape.top10                     0.769     [0.66, 0.95]      pass        PASS     
  shape.gini                      0.829     [0.72, 0.98]      pass        PASS     
  shape.chaseOverMedian           326.8     [130, 3100]       pass        PASS     
  shape.tailAlpha                 1.965     [1.6, 2.7]        pass        PASS     
  shape.ageCurveDirection         0.071     [0.02, 0.45]      pass        PASS     
  shape.ageCurveLate              0.850     [0.55, 0.92]      pass        PASS     
  shape.surpriseGrail             1         [0.1, 0.6]        known-fail  KNOWN    
  shape.yearsTo100                2.442     [2, 9]            pass        PASS     

  sub.signalLow                   0.447     [0.3, 0.72]       pass        PASS     
  sub.signalHigh                  0.826     [0.65, 0.97]      pass        PASS     
  sub.signalRises                 0.379     [0.08, 0.55]      pass        PASS     
  sub.gem10Premium                4.010     [2, 5.5]          pass        PASS     
  sub.gradedPrintingShare         0.059     [0.02, 0.09]      pass        PASS     
  sub.gemRate                     0.518     [0.3, 0.6]        pass        PASS     
  sub.gemRateByQuality            1.701     [1.3, 2]          pass        PASS     
  sub.gemRateVintage              0.398     [0.15, 0.45]      pass        PASS     
  sub.scalperCycles               5         [3, 35]           pass        PASS     
  sub.scalperShare                0.103     [0.1, 0.5]        pass        PASS     
  sub.houseArtShare               0.088     [0.02, 0.2]       pass        PASS     
  sub.channelHogLosesReach        7         [0.5, 6]          known-fail  KNOWN
```
