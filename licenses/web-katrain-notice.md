# Web KaTrain code attribution

Subset of https://github.com/Sir-Teo/web-katrain, commit
`5875837466879933d62c789da0b3125f984a3754` (MIT, see LICENSE).

Includes the KataGo v8 model parser, TensorFlow.js model graph, v7 input features,
and their board/rule helpers. The parser has a local extension to read KataGo's
ASCII text weight arrays as well as binary arrays, allowing the exact model
already used by this project to run in the browser. Local rectangular-board
extensions modify fastBoard, featuresV7Fast, positionInputsV7, superkoHistory,
utils/superko and modelV8: independent width/height, area-based feature bounds,
rectangular repetition keys and sqrt(width*height) global pooling factors.
The browser lab is separate from the upstream app and search engine.

KataGo model weights originate from https://github.com/lightvector/KataGo and
are MIT licensed (see ../katago-LICENSE.txt). The public package includes the
verified model, runtime and full licenses. Model loading is opt-in for games.
