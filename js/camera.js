/* =====================================================================
   OJT-ERAMS — camera.js : LIVE camera capture (there is deliberately NO file picker).
     const r = await Camera.capture({ title, face: true, liveness: true });
        → { photo: dataURL, face: { descriptor:[128 numbers], liveness:boolean } | null }   or null if cancelled
     const e = await Camera.capture({ title, enroll: true, shots: 3 });
        → { photo, descriptors:[[128],[128],[128]] }
   The photo is drawn from the camera stream onto a canvas and stamped with the
   date/time, so a gallery photo can't be submitted. (A determined person can still
   use a virtual camera — the server-side checks in BACKEND_GUIDE.md reduce that risk.)
   ===================================================================== */
const Camera = (() => {
  const W = 360, H = 270;

  function snap(video) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const vw = video.videoWidth || W, vh = video.videoHeight || H, s = Math.max(W / vw, H / vh), sw = W / s, sh = H / s;
    x.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, W, H);
    x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, H - 22, W, 22);
    x.fillStyle = '#fff'; x.font = '12px Arial';
    x.fillText('OJT-ERAMS • ' + new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'medium' }), 6, H - 7);
    return c.toDataURL('image/jpeg', 0.6);
  }

  function describeError(e) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'This page cannot use the camera. Open it with Chrome/Edge/Brave on https:// or on http://127.0.0.1 (Live Server).';
    const n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'Camera permission was blocked. Click the camera/lock icon in the address bar, allow the camera, then try again.';
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No camera was found on this device.';
    if (n === 'NotReadableError') return 'The camera is being used by another app. Close it and try again.';
    return 'Could not start the camera.';
  }

  function capture(opts = {}) {
    const enroll = !!opts.enroll, shots = enroll ? (opts.shots || 3) : 1;
    let wantFace = enroll || !!opts.face;
    const needBlink = wantFace && !enroll && opts.liveness !== false;
    const prompts = opts.prompts || ['Look straight at the camera', 'Turn your head slightly to the LEFT', 'Turn your head slightly to the RIGHT'];

    return new Promise(resolve => {
      let stream = null, stopped = false, timer = null, done = false, busy = false;
      let blinkOK = false, fallback = false, firstFaceAt = 0, faceNow = false, firstPhoto = null;
      const detector = needBlink ? Face.blinkDetector() : null;
      const descriptors = [];

      const bd = Modal.open({
        title: esc(opts.title || 'Take a photo'), locked: true,
        onClose: () => { cleanup(); if (!done) resolve(null); },
        body: `<div class="cam-wrap"><video id="camVideo" autoplay playsinline muted></video>${wantFace ? '<div class="cam-oval"></div>' : ''}<div class="cam-msg" id="camMsg">Starting the camera…</div></div>
               ${enroll ? `<div class="cam-shots" id="camDots">${Array.from({ length: shots }, () => '<span class="cam-dot"></span>').join('')}</div>` : ''}
               <p class="small muted center" style="margin-top:10px">${esc(opts.hint || (wantFace ? 'Your face is compared with your enrolled Face ID. Photos are taken live — uploads are not allowed.' : 'Photos are taken live — uploads are not allowed.'))}</p>`,
        footer: `<button class="btn btn-outline" id="camCancel" type="button">Cancel</button><button class="btn btn-navy" id="camShoot" type="button" disabled>📸 ${esc(opts.confirmText || (enroll ? 'Capture shot' : 'Capture'))}</button>`
      });
      const $ = id => bd.querySelector('#' + id);
      const video = $('camVideo'), msg = $('camMsg'), shoot = $('camShoot');
      const say = (t, cls = '') => { msg.className = 'cam-msg ' + cls; msg.textContent = t; };
      function cleanup() {
        stopped = true; clearTimeout(timer);
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      }
      function finish(result) { done = true; cleanup(); Modal.close(); resolve(result); }
      $('camCancel').onclick = () => Modal.close();

      function ready() { return video.readyState >= 2 && video.videoWidth > 0; }

      async function loop() {
        if (stopped) return;
        try {
          if (ready() && wantFace && !busy) {
            const det = await Face.detect(video);
            faceNow = !!det;
            if (!det) { say(enroll ? 'No face found — center your face in the oval.' : 'No face found — center your face in the oval.', 'warn'); }
            else {
              if (!firstFaceAt) firstFaceAt = Date.now();
              if (needBlink && !blinkOK) {
                if (detector.push(det.ear)) blinkOK = true;
                else if (Date.now() - firstFaceAt > 12000) { fallback = true; say('Blink check did not register. You may capture anyway, but a person will review this record.', 'warn'); }
                else say('Now BLINK once to prove you are live 👁️');
              }
              if (blinkOK) say('Blink verified ✓ — press Capture', 'ok');
              else if (!needBlink) say(enroll ? prompts[Math.min(descriptors.length, prompts.length - 1)] : 'Face found ✓ — press Capture', 'ok');
            }
            shoot.disabled = !(faceNow && (!needBlink || blinkOK || fallback));
          }
        } catch (e) { /* skip this frame */ }
        timer = setTimeout(loop, 170);
      }

      async function start() {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        } catch (e) { say(describeError(e), 'err'); return; }
        if (stopped) { cleanup(); return; }
        video.srcObject = stream;
        try { await video.play(); } catch (e) { /* autoplay attribute handles it */ }

        if (wantFace) {
          say('Loading the face check…');
          try { await Face.load(); }
          catch (e) {
            if (enroll) { say('The face-recognition files could not be loaded, so Face ID cannot be set up right now.', 'err'); return; }
            wantFace = false; say('Face check is unavailable — your photo is still recorded and a person will review it.', 'warn'); shoot.disabled = false; return;
          }
          loop();
        } else { say('Camera ready — press Capture', 'ok'); shoot.disabled = false; }
      }

      shoot.onclick = async () => {
        if (busy || !ready()) return;
        busy = true; shoot.disabled = true;
        try {
          if (wantFace) {
            const r = await Face.detect(video, { descriptor: true });
            if (!r) { say('No face found — try again.', 'warn'); busy = false; return; }
            descriptors.push(r.descriptor);
          }
          const photo = snap(video);
          if (enroll) {
            if (!firstPhoto) firstPhoto = photo;
            const dots = bd.querySelectorAll('.cam-dot');
            if (dots[descriptors.length - 1]) dots[descriptors.length - 1].classList.add('done');
            if (descriptors.length >= shots) return finish({ photo: firstPhoto, descriptors });
            say(prompts[Math.min(descriptors.length, prompts.length - 1)], 'ok');
            await new Promise(r => setTimeout(r, 600));
          } else {
            return finish({ photo, face: wantFace ? { descriptor: descriptors[0], liveness: blinkOK } : null });
          }
        } catch (e) { say('Could not capture the photo. Please try again.', 'err'); }
        busy = false;
      };

      start();
    });
  }

  return { capture };
})();
