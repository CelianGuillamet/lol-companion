// Même script que electron/cardreader.ts (VISION_JXA), pour tester à la main :
// osascript -l JavaScript scripts/vision-ocr.js image.png

ObjC.import('Foundation');
ObjC.import('Vision');
function run(argv) {
  const url = $.NSURL.fileURLWithPath(argv[0]);
  const handler = $.VNImageRequestHandler.alloc.initWithURLOptions(url, $({}));
  const req = $.VNRecognizeTextRequest.alloc.init;
  req.recognitionLevel = 0; // précis
  req.usesLanguageCorrection = false; // noms propres : pas de « correction »
  const err = Ref();
  if (!handler.performRequestsError($([req]), err)) return JSON.stringify({ error: 'Vision a échoué' });
  const res = req.results;
  const out = [];
  for (let i = 0; i < res.count; i++) {
    const o = res.objectAtIndex(i);
    const c = o.topCandidates(1);
    if (!c.count) continue;
    const top = c.objectAtIndex(0);
    const b = o.boundingBox;
    out.push({ text: ObjC.unwrap(top.string), conf: top.confidence, x: b.origin.x, y: 1 - b.origin.y - b.size.height, w: b.size.width, h: b.size.height });
  }
  return JSON.stringify({ lines: out });
}