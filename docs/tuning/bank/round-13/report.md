# Regression bank — round 13

Measured 2026-09-08.
Sweeps: roster 20 seeds x 30 years all bots; shape 30 seeds x 50 years conservative.

```
static.typecheck                1         [1, 1]            pass        PASS     
  static.invariants               0         [0, 0]            pass        PASS     
  static.parallelIdentity         1         [1, 1]            pass        PASS     
  static.saveRoundTrip            1         [1, 1]            pass        PASS     
  static.bandsInSync              1         [1, 1]            pass        PASS     
  static.uiCoverage               0         [0, 0]            pass        PASS     

  struct.deathRoutes              4         [4, 4]            pass        PASS     
  struct.overprintDeaths          0.104     [0.0375, 0.2375]  pass        PASS     
  struct.debtSpiralDeaths         0.120     [0.0375, 0.225]   pass        PASS     
  struct.channelCollapseDeaths    0.050     [0.02, 0.175]     pass        PASS     
  struct.attentionCollapseDeaths  0.036     [0.02, 0.15]      pass        PASS     
  struct.speculatorMoves          2.946     [1.2, 500]        pass        PASS     
  struct.heatNotPinned            0         [0, 0.1]          pass        PASS     
  struct.ripRationBinds           0.709     [0.2, 0.95]       pass        PASS     
  struct.collectorNotPinned       20        [5, 1000000000]   pass        PASS     
  struct.printRunVaries           27        [4, 100]          pass        PASS     

  diff.botsAlwaysSurvive          10        [3, 11]           pass        PASS     
  diff.botsNeverSurvive           5         [2, 8]            pass        PASS     
  diff.conservativeSurvives       0.950     [0.95, 1]         pass        PASS     
  diff.licensorEarns              1.487     [1.3, 2.5]        pass        PASS     
  diff.licensorSurvival           0.900     [0.75, 0.95]      pass        PASS     
  diff.hypeGamblerSurvival        0.650     [0.4, 0.85]       pass        PASS     
  diff.hypeGamblerTopEarner       2         [1, 3]            pass        PASS     
  diff.allInSurvival              0.300     [0.1, 0.6]        pass        PASS     
  diff.flooderDiesEarly           0.750     [0.4, 2.5]        pass        PASS     
  diff.attentionBurnerDies        1         [0.85, 1]         pass        PASS     
  diff.idleDies                   8.827     [2.5, 9]          pass        PASS     
  diff.deathsLandMidRun           8.308     [3, 25]           pass        PASS     
  diff.sellThrough                0.949     [0.75, 0.95]      pass        PASS     
  diff.flopRate                   0.005     [0.01, 0.25]      known-fail  KNOWN    

  shape.median                    0.220     [0.2, 0.5]        pass        PASS     
  shape.under1                    0.811     [0.64, 0.92]      pass        PASS     
  shape.under25c                  0.539     [0.25, 0.8]       pass        PASS     
  shape.top1                      0.344     [0.21, 0.62]      pass        PASS     
  shape.top10                     0.770     [0.66, 0.95]      pass        PASS     
  shape.gini                      0.829     [0.72, 0.98]      pass        PASS     
  shape.chaseOverMedian           344.6     [130, 3100]       pass        PASS     
  shape.tailAlpha                 1.985     [1.6, 2.7]        pass        PASS     
  shape.ageCurveDirection         0.064     [0.02, 0.45]      pass        PASS     
  shape.ageCurveLate              0.850     [0.55, 0.92]      pass        PASS     
  shape.yearsTo100                2.692     [2, 9]            pass        PASS     

  sub.signalLow                   0.503     [0.3, 0.72]       pass        PASS     
  sub.signalHigh                  0.674     [0.55, 0.9]       pass        PASS     
  sub.signalRises                 0.172     [0.08, 0.55]      pass        PASS     
  sub.gem10Premium                4.087     [2, 5.5]          pass        PASS     
  sub.gradedPrintingShare         0.055     [0.02, 0.09]      pass        PASS     
  sub.gemRate                     0.513     [0.3, 0.6]        pass        PASS     
  sub.gemRateByQuality            1.717     [1.3, 2]          pass        PASS     
  sub.gemRateVintage              0.396     [0.15, 0.45]      pass        PASS     
  sub.scalperCycles               6         [3, 35]           pass        PASS     
  sub.scalperShare                0.076     [0.1, 0.5]        known-fail  KNOWN    
  sub.printingLiquidity           0.389     [0.02, 0.6]       pass        PASS     
  sub.buylistSpread               0         [0.15, 0.7]       known-fail  KNOWN    
  sub.marketingShare              0.007     [0.003, 0.02]     pass        PASS     
  sub.houseArtShare               0.086     [0.02, 0.2]       pass        PASS     
  sub.channelHogLosesReach        6         [0.5, 6]          pass        PASS
```
