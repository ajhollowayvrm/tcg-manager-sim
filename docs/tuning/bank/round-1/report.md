# Regression bank — round 1

Measured 2026-09-05.
Sweeps: roster 20 seeds x 30 years all bots; shape 30 seeds x 50 years conservative.

```
static.typecheck                1         [1, 1]            pass        PASS     
  static.invariants               0         [0, 0]            pass        PASS     
  static.parallelIdentity         1         [1, 1]            pass        PASS     
  static.bandsInSync              1         [1, 1]            pass        PASS     

  struct.deathRoutes              4         [4, 4]            pass        PASS     
  struct.overprintDeaths          49        [15, 95]          pass        PASS     
  struct.debtSpiralDeaths         62        [15, 90]          pass        PASS     
  struct.channelCollapseDeaths    27        [8, 70]           pass        PASS     
  struct.attentionCollapseDeaths  20        [8, 60]           pass        PASS     
  struct.speculatorMoves          5.944     [1.2, 500]        pass        PASS     
  struct.collectorNotPinned       18        [5, 1000000000]   pass        PASS     
  struct.printRunVaries           12        [4, 100]          pass        PASS     

  diff.botsAlwaysSurvive          7         [3, 11]           pass        PASS     
  diff.botsNeverSurvive           6         [2, 8]            pass        PASS     
  diff.conservativeSurvives       1         [0.95, 1]         pass        PASS     
  diff.hypeGamblerSurvival        0.650     [0.4, 0.85]       pass        PASS     
  diff.hypeGamblerTopEarner       1         [1, 3]            pass        PASS     
  diff.allInSurvival              0.350     [0.1, 0.6]        pass        PASS     
  diff.flooderDiesEarly           0.865     [0.4, 2.5]        pass        PASS     
  diff.attentionBurnerDies        1         [0.85, 1]         pass        PASS     
  diff.idleDies                   12.019    [2.5, 9]          known-fail  KNOWN    
  diff.deathsLandMidRun           15.269    [3, 25]           pass        PASS     
  diff.sellThrough                0.884     [0.75, 0.95]      pass        PASS     
  diff.flopRate                   0.029     [0.01, 0.25]      pass        PASS     

  shape.median                    3.230     [0.2, 0.5]        known-fail  KNOWN    
  shape.under1                    0.071     [0.64, 0.92]      known-fail  KNOWN    
  shape.under25c                  0         [0.25, 0.8]       known-fail  KNOWN    
  shape.top1                      0.139     [0.21, 0.62]      known-fail  KNOWN    
  shape.top10                     0.447     [0.66, 0.95]      known-fail  KNOWN    
  shape.gini                      0.547     [0.72, 0.98]      known-fail  KNOWN    
  shape.chaseOverMedian           17.870    [130, 3100]       known-fail  KNOWN    
  shape.tailAlpha                 2.498     [1.6, 2.7]        pass        PASS     
  shape.ageCurveDirection         -0.071    [0.02, 0.45]      known-fail  KNOWN    
  shape.ageCurveLate              0.014     [0.55, 0.92]      known-fail  KNOWN    
  shape.surpriseGrail             0.400     [0.1, 0.6]        pass        PASS     
  shape.yearsTo100                6.154     [2, 9]            pass        PASS     

  sub.signalLow                   0.505     [0.3, 0.72]       pass        PASS     
  sub.signalHigh                  0.827     [0.65, 0.97]      pass        PASS     
  sub.signalRises                 0.322     [0.08, 0.55]      pass        PASS     
  sub.gem10Premium                4.662     [2, 5.5]          pass        PASS     
  sub.gradedPrintingShare         0.047     [0.02, 0.09]      pass        PASS     
  sub.gemRate                     0.097     [0.3, 0.6]        known-fail  KNOWN    
  sub.scalperCycles               16        [3, 35]           pass        PASS     
  sub.scalperShare                0.039     [0.1, 0.5]        known-fail  KNOWN    
  sub.houseArtShare               0.089     [0.02, 0.2]       pass        PASS     
  sub.channelHogLosesReach        4         [0.5, 6]          pass        PASS
```
