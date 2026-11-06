/* =====================================================================
   OJT-ERAMS — face.js : in-browser face detection + blink (liveness) check.
   Uses the bundled vendor/face-api (no internet needed). It produces a
   128-number "descriptor" of the face; the BACKEND compares descriptors
   (see BACKEND_GUIDE.md → Face verification). The browser result alone must
   never be trusted — the server decides MATCH / LOW.
   ===================================================================== */
const Face = (() => {
  let loading = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load the face library.'));
      document.head.appendChild(s);
    });
  }

  // Loads the library + 3 small neural networks (~6.7 MB) the first time, then caches.
  function load() {
    if (loading) return loading;
    const cfg = window.OJT_CONFIG.FACE;
    loading = (async () => {
      if (!window.faceapi) await loadScript(window.OJT_ROOT + cfg.LIB_PATH);
      const url = window.OJT_ROOT + cfg.MODEL_PATH;
      try { await faceapi.tf.ready(); } catch (e) { /* the default backend is fine */ }
      await faceapi.nets.tinyFaceDetector.loadFromUri(url);
      await faceapi.nets.faceLandmark68TinyNet.loadFromUri(url);
      await faceapi.nets.faceRecognitionNet.loadFromUri(url);
      return true;
    })();
    loading.catch(() => { loading = null; });
    return loading;
  }

  // Finds ONE face in a <video>. With {descriptor:true} also computes the 128-number face descriptor.
  async function detect(video, { descriptor = false } = {}) {
    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
    let task = faceapi.detectSingleFace(video, opts).withFaceLandmarks(true);
    if (descriptor) task = task.withFaceDescriptor();
    const r = await task;
    if (!r) return null;
    const out = { box: r.detection.box, score: r.detection.score, ear: eyeAspect(r.landmarks) };
    if (descriptor) out.descriptor = Array.from(r.descriptor);
    return out;
  }

  /* Eye Aspect Ratio: small when the eye is closed. */
  function earOf(p) {
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const w = d(p[0], p[3]);
    return w ? (d(p[1], p[5]) + d(p[2], p[4])) / (2 * w) : 0;
  }
  function eyeAspect(lm) { return (earOf(lm.getLeftEye()) + earOf(lm.getRightEye())) / 2; }

  /* Feed it one EAR value per frame; returns true once a full blink (open → closed → open) was seen. */
  function blinkDetector() {
    let base = 0, closed = false, blinks = 0, n = 0;
    return {
      push(ear) {
        n++;
        base = Math.max(ear, base * 0.985);
        if (n < 4) return false;
        if (!closed && ear < base * 0.78) closed = true;
        else if (closed && ear > base * 0.88) { closed = false; blinks++; }
        return blinks > 0;
      },
      get blinks() { return blinks; }
    };
  }

  return { load, detect, blinkDetector, _earOf: earOf };
})();
