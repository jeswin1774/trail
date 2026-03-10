
/* ═══════════════════════════════════════════════════════
   JB VENTURE — COMPLETE FIXED JS
   Firebase initialized from HTML module script
═══════════════════════════════════════════════════════ */

/* ─── ADMIN CREDENTIALS ─── */
const ADMIN_USER = 'admin';
let adminPassCurrent = 'jbventure2025';
let adminLoggedIn = false;

/* ─── STATE ─── */
let currentUser = null;
let localProjects = [
  {id:'p1',title:'Modern Villa, Thoothukudi',category:'Residential',desc:'4BHK duplex with rooftop garden',img:'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600&q=70',status:'Active'},
  {id:'p2',title:'Office Complex',category:'Commercial',desc:'2,400 sq ft premium workspace',img:'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=600&q=70',status:'Active'},
  {id:'p3',title:'Heritage Bungalow Restoration',category:'Architecture',desc:'Colonial-era restoration project',img:'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=600&q=70',status:'Completed'},
  {id:'p4',title:'Factory Complex',category:'Industrial',desc:'12,000 sq ft manufacturing unit',img:'https://images.unsplash.com/photo-1572120360610-d971b9d7767c?w=600&q=70',status:'Active'},
  {id:'p5',title:'Luxury Penthouse',category:'Interior',desc:'Full interior design & execution',img:'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&q=70',status:'Active'},
];
let localUsers = [];
let localMessages = [];
let uploadedFilesData = []; // holds compressed data URLs for multiple images
let currentAddProjectId = null;

function openAddImages(projectId){
  currentAddProjectId = projectId;
  const inp = document.getElementById('projAddFile');
  if(!inp) return;
  inp.value = '';
  inp.click();
}

async function handleAddImages(input){
  const files = Array.from(input.files || []);
  if(!files.length) return;
  
  console.log(`📸 Processing ${files.length} image(s) for project ${currentAddProjectId}`);
  
  const totalMB = files.reduce((s,f) => s + f.size, 0) / (1024*1024);
  if(totalMB > 100){ 
    toast('❌ Total exceeds 100 MB. Select smaller files.','warn'); 
    input.value = ''; 
    return; 
  }
  
  if(files.length > 10){
    toast('❌ Maximum 10 images per project. You selected ' + files.length, 'warn');
    input.value = '';
    return;
  }

  // reuse compressor used for new uploads
  const readAndCompress = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1200;
        let w = img.width, h = img.height;
        if(w > MAX){ h = Math.round(h * MAX / w); w = MAX; }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', 0.8);
        resolve({ name: file.name, data: compressed });
      };
      img.onerror = () => reject(new Error('Image load error'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsDataURL(file);
  });

  try{
    console.log(`⏳ Compressing ${files.length} images...`);
    toast('⏳ Compressing images...', 'ok');
    const results = await Promise.all(files.map(f => readAndCompress(f)));
    const newData = results.map(r => r.data);
    console.log(`✓ Compressed ${newData.length} images successfully`);

    const fb = getFirebase();
    if(fb && currentAddProjectId){
      try{
        console.log(`📤 Uploading ${newData.length} images to Firebase Storage...`);
        toast(`📤 Uploading ${newData.length} image(s)...`, 'ok');
        const uploadedUrls = await uploadDataUrlsToStorage(currentAddProjectId, newData);
        console.log(`✓ Upload complete: ${uploadedUrls.length} URLs received`);
        
        // Get existing images
        const docRef = fb.doc(fb.db,'projects', currentAddProjectId);
        const snap = await fb.getDoc(docRef);
        const existing = (snap && snap.exists && snap.exists()) ? (snap.data().imageUrls || (snap.data().img ? [snap.data().img] : [])) : [];
        console.log(`📌 Found ${existing.length} existing images, adding ${uploadedUrls.length} new`);
        
        // Merge images
        const merged = existing.concat(uploadedUrls);
        await fb.setDoc(docRef, { imageUrls: merged, img: merged[0] || '' }, { merge: true });
        console.log(`✓ Saved ${merged.length} total images to Firestore`);
        toast(`✅ ${uploadedUrls.length} image(s) uploaded successfully!`, 'ok');
      } catch(e){
        console.error('❌ Image upload error:', e.message);
        toast('❌ Upload failed: ' + e.message, 'error');
        return;
      }
    } else {
      // Fallback: update localProjects
      console.log('⚠️ Firebase not available - saving locally');
      const proj = localProjects.find(p => p.id === currentAddProjectId);
      if(proj){
        proj.imageUrls = Array.isArray(proj.imageUrls) ? proj.imageUrls.concat(newData) : (proj.img ? [proj.img].concat(newData) : newData.slice());
        if(!proj.img && proj.imageUrls && proj.imageUrls.length) proj.img = proj.imageUrls[0];
        console.log(`✓ Added ${newData.length} images locally`);
        toast(`✅ ${newData.length} image(s) added locally`, 'ok');
      }
    }

    // Refresh UI
    console.log('🔄 Refreshing project views...');
    loadProjectsTable();
    loadProjectsToSite();
    setTimeout(() => {
      loadProjectsFromFirebase().catch(e => console.warn('Reload failed:', e));
    }, 600);
    
  } catch(err){
    console.error('❌ Image processing error:', err.message);
    toast('❌ Processing error: ' + err.message, 'error');
  } finally {
    input.value = '';
    currentAddProjectId = null;
  }
}

/* Upload array of data-URL images to Firebase Storage under projects/{projectId}/ and return download URLs */
async function uploadDataUrlsToStorage(projectId, dataUrls){
  const fb = getFirebase();
  if(!fb) throw new Error('Firebase not initialised');
  
  console.log(`📷 Uploading ${dataUrls.length} images to Firebase Storage (projectId: ${projectId})`);
  const urls = [];
  
  for(let i = 0; i < dataUrls.length; i++){
    const data = dataUrls[i];
    const fname = `img-${Date.now()}-${i}.jpg`;
    const ref = fb.storageRef(fb.storage, `projects/${projectId}/${fname}`);
    
    try{
      console.log(`  [${i+1}/${dataUrls.length}] Uploading ${fname}...`);
      await fb.uploadString(ref, data, 'data_url');
      const dUrl = await fb.getDownloadURL(ref);
      urls.push(dUrl);
      console.log(`  ✓ [${i+1}/${dataUrls.length}] Upload complete`);
    } catch(e){
      console.error(`  ❌ Failed to upload image ${i}: ${e.message}`);
      throw new Error(`Image ${i+1} upload failed: ${e.message}`);
    }
  }
  
  console.log(`✓ All ${urls.length} images uploaded successfully`);
  return urls;
}

/* Delete all images stored under projects/{projectId} in Firebase Storage */
async function deleteAllImages(projectId){
  if(!confirm('🗑️ Delete ALL images for this project? This cannot be undone.')) return;
  const fb = getFirebase();
  if(!fb){ toast('⚠️ Firebase not configured','warn'); return; }
  
  try{
    console.log(`🗑️ Deleting all images for project: ${projectId}`);
    toast('🗑️ Deleting all images...', 'ok');
    
    const listRef = fb.storageRef(fb.storage, `projects/${projectId}`);
    const res = await fb.listAll(listRef);
    console.log(`Found ${res.items.length} images to delete`);
    
    const deletes = res.items.map(itemRef => {
      console.log(`  Deleting: ${itemRef.name}`);
      return fb.deleteObject(itemRef);
    });
    await Promise.all(deletes);
    console.log(`✓ Deleted all ${res.items.length} images from storage`);
    
    // Clear imageUrls from Firestore
    const docRef = fb.doc(fb.db,'projects',projectId);
    await fb.setDoc(docRef, { imageUrls: [], img: '' }, { merge: true });
    console.log(`✓ Cleared imageUrls from Firestore`);
    toast('✅ All images deleted successfully!', 'ok');
    
    setTimeout(() => {
      loadProjectsFromFirebase().catch(e => console.warn('Reload failed:', e));
    }, 600);
    loadProjectsTable();
    loadProjectsToSite();
  } catch(e){ 
    console.error('❌ Delete all images error:', e.message); 
    toast('❌ Failed to delete images: ' + e.message, 'error'); 
  }
}

/* Delete only the logo/main image (keep other images in imageUrls) */
async function deleteLogo(projectId){
  if(!confirm('🖼️ Delete only the logo? Other images will be preserved.')) return;
  const fb = getFirebase();
  if(!fb){ toast('⚠️ Firebase not configured','warn'); return; }
  
  try{
    console.log(`🗑️ Deleting logo for project: ${projectId}`);
    toast('🗑️ Deleting logo...', 'ok');
    
    const docRef = fb.doc(fb.db,'projects',projectId);
    await fb.setDoc(docRef, { img: '' }, { merge: true });
    console.log(`✓ Logo deleted from Firestore`);
    toast('✅ Logo deleted. Other images preserved!', 'ok');
    
    setTimeout(() => {
      loadProjectsFromFirebase().catch(e => console.warn('Reload failed:', e));
    }, 600);
    loadProjectsTable();
    loadProjectsToSite();
  } catch(e){ 
    console.error('❌ Logo delete error:', e.message);
    toast('❌ Failed to delete logo: ' + e.message, 'error'); 
  }
}

/* ─── FIREBASE helper ─── */
function getFirebase(){ return window._fb || null; }

/* ─── TOAST ─── */
function toast(msg, type='ok'){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg;
  t.style.borderColor = type==='warn'?'var(--yellow)':type==='error'?'var(--red)':'rgba(46,213,115,0.5)';
  t.style.color = type==='warn'?'var(--yellow)':type==='error'?'#e74c3c':'var(--white)';
  t.classList.add('on');
  setTimeout(() => t.classList.remove('on'), 3500);
}

/* ─── UTILS ─── */
function mNavToggle(){
  document.getElementById('mNav').classList.toggle('on');
}
function togFloat(){
  document.getElementById('floatItems').classList.toggle('on');
  document.getElementById('fTog').classList.toggle('on');
}

/* ─── SCROLL ANIMATIONS ─── */
function runAnim(){
  document.querySelectorAll('.fi,.fl,.fr').forEach(el => {
    if(el.getBoundingClientRect().top < window.innerHeight - 60) el.classList.add('vis');
  });
}

let ctrRan = false;
function triggerCounters(){
  if(ctrRan) return;
  const el = document.querySelector('.hstat-num[data-t]');
  if(el && el.getBoundingClientRect().top < window.innerHeight){
    ctrRan = true;
    document.querySelectorAll('.hstat-num[data-t]').forEach(el => {
      const t = +el.dataset.t; let c = 0; const step = Math.max(1, t/50);
      const ti = setInterval(() => {
        c = Math.min(c + step, t);
        el.textContent = Math.round(c) + '+';
        if(c >= t) clearInterval(ti);
      }, 25);
    });
  }
}
window.addEventListener('scroll', () => {
  const s = window.scrollY;
  const total = document.body.scrollHeight - window.innerHeight;
  const bar = document.getElementById('scrollBar');
  if(bar) bar.style.width = (total > 0 ? (s/total)*100 : 0) + '%';
  const nav = document.getElementById('nav');
  if(nav) nav.classList.toggle('scrolled', s > 60);
  const btt = document.getElementById('btt');
  if(btt) btt.classList.toggle('show', s > 400);
  runAnim();
  triggerCounters();
});

/* ─── PAGE LOAD ─── */
window.addEventListener('load', () => {
  runAnim();
  loadProjectsToSite();
  // Trigger counter check in case stats are already visible
  setTimeout(triggerCounters, 800);

  // Attach overlay click-to-close (safe — element definitely exists by load time)
  const overlay = document.getElementById('authOverlay');
  if(overlay) overlay.addEventListener('click', e => { if(e.target === e.currentTarget) closeLogin(); });

  // Firebase auth listener
  const fb = getFirebase();
  if(fb){
    fb.onAuthStateChanged(fb.auth, user => {
      if(user){
        currentUser = user;
        updateNavUser(user);
        saveUserToFirestore(user);
        // If sign-in page still showing, skip it
        const sp = document.getElementById('signInPage');
        if(sp && !sp.classList.contains('hidden')){
          sp.classList.add('exit');
          setTimeout(()=> sp.classList.add('hidden'), 520);
        }
      } else {
        currentUser = null;
        updateNavUser(null);
      }
    });
    loadProjectsFromFirebase();
  }
});

/* ─── NAV USER DISPLAY ─── */
function updateNavUser(user){
  const area = document.getElementById('navUserArea');
  if(!area) return;
  if(user){
    const avatar = user.photoURL
      ? `<img src="${user.photoURL}" style="width:30px;height:30px;border-radius:50%;object-fit:cover" onerror="this.style.display='none'">`
      : `<span style="font-size:13px;font-weight:700">${(user.displayName||'U').charAt(0).toUpperCase()}</span>`;
    area.innerHTML = `
      <div class="user-pill" onclick="showUserMenu()">
        <div class="user-av">${avatar}</div>
        <div class="user-name">${user.displayName || user.email || 'User'}</div>
        <i class="fas fa-chevron-down" style="font-size:10px;color:var(--muted);margin-left:4px"></i>
      </div>`;
  } else {
    area.innerHTML = `<button class="btn-login" onclick="openLogin()"><i class="fas fa-user"></i> Sign In</button>`;
  }
}

function showUserMenu(){
  const fb = getFirebase();
  if(!currentUser) return;
  if(confirm('Signed in as: ' + (currentUser.displayName || currentUser.email) + '\n\nClick OK to sign out.')){
    if(fb) fb.signOut(fb.auth).then(() => {
      currentUser = null;
      updateNavUser(null);
      toast('Signed out successfully');
    });
  }
}

/* ─── FIRESTORE SAVE ─── */
async function saveUserToFirestore(user, extra={}){
  const fb = getFirebase();
  if(!fb || !user) return;
  try{
    await fb.setDoc(fb.doc(fb.db,'users',user.uid), {
      name: user.displayName || '',
      email: user.email || '',
      photoURL: user.photoURL || '',
      provider: user.providerData?.[0]?.providerId || 'google',
      joinedAt: fb.serverTimestamp(),
      ...extra
    }, {merge:true});
  } catch(e){ console.warn('Firestore save failed:', e.message); }
}

/* ═══════════════════════════════════════════
   SIGN-IN PAGE (full-page, shown first)
═══════════════════════════════════════════ */

function enterWebsite(){
  const page = document.getElementById('signInPage');
  if(!page) return;
  page.classList.add('exit');
  setTimeout(() => page.classList.add('hidden'), 520);
}

function showSigninError(msg){
  const el = document.getElementById('signinError');
  if(!el) return;
  el.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 6000);
}

function showSigninSuccess(name, email){
  const forms = document.getElementById('signinForms');
  const errEl = document.getElementById('signinError');
  const s = document.getElementById('signinSuccess');
  if(forms) forms.style.display = 'none';
  if(errEl) errEl.style.display = 'none';
  if(!s) return;
  s.style.display = 'block';
  const countryEl = document.getElementById('signinCountry');
  const phoneEl = document.getElementById('signinPhone');
  const phone = (countryEl ? countryEl.value : '') + (phoneEl ? phoneEl.value.replace(/\D/g,'') : '');
  const nameEl = document.getElementById('signinSuccessName');
  const emailEl = document.getElementById('signinSuccessEmail');
  if(nameEl) nameEl.textContent = '✓ Welcome, ' + name + '!';
  if(emailEl) emailEl.innerHTML =
    (email ? '<div style="color:var(--muted);font-size:13px">' + email + '</div>' : '') +
    (phone.length > 4 ? '<div style="color:#2ed573;font-size:12px;margin-top:4px"><i class="fas fa-phone" style="margin-right:4px"></i>' + phone + '</div>' : '');
  setTimeout(() => enterWebsite(), 2500);
}

function updatePhoneBtn(){
  const phoneEl = document.getElementById('signinPhone');
  if(!phoneEl) return;
  const val = phoneEl.value.replace(/\D/g,'');
  const tick = document.getElementById('signinPhoneTick');
  const badge = document.getElementById('step2Badge');
  
  if(val.length >= 8){
    // Valid phone number
    if(tick) {
      tick.style.display = 'block';
      tick.title = 'Phone number is valid';
    }
    phoneEl.style.borderColor = 'rgba(46,213,115,.6)';
    phoneEl.title = '✓ Phone number is valid - proceed to Google sign-in';
    if(badge){ 
      badge.style.background='var(--red)'; 
      badge.style.color='white'; 
      badge.style.border='none';
      badge.innerHTML = '2';
    }
  } else {
    // Invalid phone number
    if(tick) {
      tick.style.display = 'none';
    }
    phoneEl.style.borderColor = '';
    phoneEl.title = 'Enter at least 8 digits';
    if(badge){ 
      badge.style.background='var(--ash3)'; 
      badge.style.color='rgba(255,255,255,.5)'; 
      badge.style.border='1px solid rgba(192,57,43,0.3)';
      badge.innerHTML = '2';
    }
  }
}

/* ── Continue with Google (sign-in page) — collects phone + Google together ── */
async function signinWithGoogle(){
  const phoneEl = document.getElementById('signinPhone');
  const countryEl = document.getElementById('signinCountry');
  const phone = phoneEl ? phoneEl.value.replace(/\D/g,'') : '';

  // Validate phone first
  if(phone.length < 8){
    if(phoneEl){ phoneEl.focus(); phoneEl.style.borderColor = 'rgba(192,57,43,.8)'; }
    showSigninError('⚠️ Please enter your phone number first (Step 1). Need at least 8 digits.');
    return;
  }

  // Allow file://, localhost, and http:// for development and production
  const isLocalFile = window.location.protocol === 'file:';
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const isSecure = window.location.protocol === 'https:' || window.location.protocol === 'http:';

  // For file:// protocol or localhost, show demo mode option
  if(isLocalFile){
    const useDemoMode = confirm('🧪 You\'re testing locally (file://).\n\nClick OK to continue in DEMO MODE (no Firebase)\nClick Cancel to configure Firebase for this domain.\n\nDemo Credentials: admin / jbventure2025');
    if(!useDemoMode){
      showSigninError('🔧 To use Firebase:\n1) Host on a web server (http/https)\n2) Configure your domain in Firebase Console → Auth → Authorized Domains');
      return;
    }
    // Demo mode: allow sign-in without Firebase
    showSigninSuccess('Demo User', phone);
    return;
  }

  const fb = getFirebase();
  if(!fb){
    // Demo mode — no Firebase configured, just proceed
    showSigninSuccess('Guest User', phone);
    return;
  }

  const btn = document.getElementById('signinGoogleBtn');
  const txt = document.getElementById('signinGoogleText');
  const spin = document.getElementById('signinGoogleSpinner');
  if(btn) btn.disabled = true;
  if(txt) txt.textContent = 'Signing in…';
  if(spin) spin.style.display = 'inline';

  try{
    const provider = new fb.GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    const result = await fb.signInWithPopup(fb.auth, provider);
    const user = result.user;
    const country = countryEl ? countryEl.value : '+91';

    await saveUserToFirestore(user, {
      phone: country + phone,
      country,
      signInMethod: 'google+phone'
    });

    showSigninSuccess(user.displayName || 'User', user.email || '');
    toast('Welcome, ' + (user.displayName || 'User') + '! 🏗️');
  } catch(e){
    if(btn) btn.disabled = false;
    if(txt) txt.textContent = 'Continue with Google';
    if(spin) spin.style.display = 'none';
    const code = e.code || '';
    if(code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
    if(code.includes('api-key-not-valid')) showSigninError('⚠️ Firebase API key invalid. Check your config.');
    else if(code === 'auth/popup-blocked') showSigninError('🚫 Popup blocked — please allow popups in your browser settings.');
    else if(code === 'auth/unauthorized-domain') showSigninError('🚫 Unauthorized domain. Add this domain in Firebase → Auth → Authorized Domains.');
    else showSigninError('Sign in failed: ' + (e.message || code));
  }
}

/* ═══════════════════════════════════════════
   SECONDARY AUTH MODAL (navbar Sign In button)
═══════════════════════════════════════════ */

function openLogin(){
  // Reset the modal
  const success = document.getElementById('loginSuccess');
  const btn = document.getElementById('googleSignInBtn');
  const phoneRow = document.getElementById('loginPhone');
  const tick = document.getElementById('phoneTick');
  const hint = document.getElementById('phoneHint');
  const err = document.getElementById('authModalError');
  if(success) success.style.display = 'none';
  if(btn){ btn.style.display = 'flex'; btn.disabled = false; }
  const gt = document.getElementById('googleBtnText'); if(gt) gt.textContent = 'Continue with Google';
  const gs = document.getElementById('googleBtnSpinner'); if(gs) gs.style.display = 'none';
  if(phoneRow){ phoneRow.value = ''; phoneRow.style.borderColor = 'var(--border)'; }
  if(tick) tick.style.display = 'none';
  if(hint) hint.innerHTML = 'Enter your phone number to continue';
  if(err) err.style.display = 'none';
  const overlay = document.getElementById('authOverlay');
  if(overlay) overlay.classList.add('on');
}

function closeLogin(){
  const overlay = document.getElementById('authOverlay');
  if(overlay) overlay.classList.remove('on');
}

/* Phone tick validation for the modal */
function validatePhone(input){
  const val = input.value.replace(/\D/g,'');
  const tick = document.getElementById('phoneTick');
  const hint = document.getElementById('phoneHint');
  if(val.length >= 8){
    input.style.borderColor = '#2ed573';
    if(tick) tick.style.display = 'block';
    if(hint) hint.innerHTML = '<span style="color:#2ed573">✓ Phone number looks good!</span>';
  } else {
    input.style.borderColor = 'var(--border)';
    if(tick) tick.style.display = 'none';
    if(hint) hint.innerHTML = '<span style="color:var(--muted)">Enter your phone number to continue</span>';
  }
}

function showAuthError(msg){
  const el = document.getElementById('authModalError');
  if(el){ el.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + msg; el.style.display = 'block'; }
  setTimeout(() => { if(el) el.style.display = 'none'; }, 6000);
}

/* Google sign-in from the navbar modal */
async function signInGoogle(){
  const phoneInput = document.getElementById('loginPhone');
  const countrySelect = document.getElementById('loginCountry');
  const phone = phoneInput ? phoneInput.value.replace(/\D/g,'') : '';
  const country = countrySelect ? countrySelect.value : '+91';

  if(phone.length < 8){
    if(phoneInput){ phoneInput.style.borderColor = 'var(--red)'; phoneInput.focus(); }
    const hint = document.getElementById('phoneHint');
    if(hint) hint.innerHTML = '<span style="color:var(--red)">⚠ Please enter your phone number first</span>';
    return;
  }

  // Allow file://, localhost, and http:// for development
  const isLocalFile = window.location.protocol === 'file:';
  
  // For file:// protocol, show demo mode option
  if(isLocalFile){
    const useDemoMode = confirm('You\'re testing locally (file://).\n\nClick OK to continue in DEMO MODE (no Firebase)\nClick Cancel to configure Firebase for this domain.');
    if(!useDemoMode){
      showAuthError('⚠️ To use Firebase: 1) Host on a web server (http/https)\n2) Configure your domain in Firebase Console → Auth → Authorized Domains');
      return;
    }
    // Demo mode: allow sign-in without Firebase
    const ls = document.getElementById('loginSuccess');
    const sn = document.getElementById('successName');
    const se = document.getElementById('successEmail');
    if(ls) ls.style.display = 'block';
    if(sn) sn.textContent = '✓ Welcome, Demo User!';
    if(se) se.textContent = country + phone;
    if(phoneInput && phoneInput.parentElement && phoneInput.parentElement.parentElement)
      phoneInput.parentElement.parentElement.style.display = 'none';
    const hint = document.getElementById('phoneHint'); if(hint) hint.innerHTML = '';
    toast('Welcome to Demo Mode! 🎉');
    setTimeout(() => closeLogin(), 2000);
    return;
  }

  const fb = getFirebase();
  if(!fb){ 
    // Demo mode — no Firebase configured
    showAuthError('Firebase not initialised. Continuing in demo mode...');
    const ls = document.getElementById('loginSuccess');
    if(ls) ls.style.display = 'block';
    setTimeout(() => closeLogin(), 2000);
    return;
  }

  const btn = document.getElementById('googleSignInBtn');
  const btnText = document.getElementById('googleBtnText');
  const spinner = document.getElementById('googleBtnSpinner');
  if(btn) btn.disabled = true;
  if(btnText) btnText.textContent = 'Signing in…';
  if(spinner) spinner.style.display = 'inline';

  try{
    const provider = new fb.GoogleAuthProvider();
    provider.addScope('email'); provider.addScope('profile');
    const result = await fb.signInWithPopup(fb.auth, provider);
    const user = result.user;

    await saveUserToFirestore(user, { phone: country + phone, country });

    // Show success inside modal
    const ls = document.getElementById('loginSuccess');
    const sn = document.getElementById('successName');
    const se = document.getElementById('successEmail');
    if(ls) ls.style.display = 'block';
    if(sn) sn.textContent = '✓ Welcome, ' + (user.displayName || 'User') + '!';
    if(se) se.textContent = user.email || '';
    if(btn) btn.style.display = 'none';
    if(phoneInput && phoneInput.parentElement && phoneInput.parentElement.parentElement)
      phoneInput.parentElement.parentElement.style.display = 'none';
    const hint = document.getElementById('phoneHint'); if(hint) hint.innerHTML = '';

    toast('Welcome, ' + (user.displayName || 'User') + '! 🎉');
    setTimeout(() => closeLogin(), 2000);

  } catch(e){
    if(btn){ btn.disabled = false; btn.style.display = 'flex'; }
    if(btnText) btnText.textContent = 'Continue with Google';
    if(spinner) spinner.style.display = 'none';
    const code = e.code || '';
    if(code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
    if(code.includes('api-key-not-valid')) showAuthError('⚠️ Firebase API key invalid');
    else if(code === 'auth/popup-blocked') showAuthError('🚫 Popup blocked! Allow popups for this site.');
    else if(code === 'auth/unauthorized-domain') showAuthError('🚫 Add this domain in Firebase → Auth → Authorized Domains');
    else showAuthError('Sign in failed: ' + (e.message || code));
  }
}

/* ═══════════════════════════════════════════
   ADMIN PORTAL
═══════════════════════════════════════════ */

function showAdminPortal(e){
  if(e && e.preventDefault) e.preventDefault();
  
  console.log('Admin Portal button clicked');
  
  const portal = document.getElementById('adminPortal');
  if(!portal){ 
    console.error('❌ Admin portal element not found');
    alert('⚠️ Admin portal not found. Please refresh the page.');
    return; 
  }
  
  console.log('Admin portal element found, showing portal');
  portal.classList.add('on');
  
  // Show toast if available
  const toastEl = document.getElementById('toast');
  if(toastEl) {
    toast('✅ Admin Portal opened', 'ok');
  }
  
  if(!adminLoggedIn){
    const ls = document.getElementById('adminLoginScreen');
    const db = document.getElementById('adminDashboard');
    const au = document.getElementById('adminUser');
    const ap = document.getElementById('adminPass');
    const err = document.getElementById('adminError');
    if(ls) ls.style.display = 'flex';
    if(db) db.style.display = 'none';
    if(au) au.value = '';
    if(ap) ap.value = '';
    if(err) err.style.display = 'none';
    if(au) au.focus();
    console.log('✓ Admin login screen shown');
  } else {
    // Already logged in — show dashboard directly
    const ls = document.getElementById('adminLoginScreen');
    const db = document.getElementById('adminDashboard');
    if(ls) ls.style.display = 'none';
    if(db){ db.style.display=''; db.classList.add('shown'); }
    console.log('✓ Admin dashboard shown');
  }
}

function hideAdminPortal(){
  const portal = document.getElementById('adminPortal');
  if(portal) {
    portal.classList.remove('on');
    console.log('✓ Admin Portal closed');
    const toastEl = document.getElementById('toast');
    if(toastEl) {
      toast('✅ Admin Portal closed', 'ok');
    }
  }
}

function adminLogin(){
  const u = document.getElementById('adminUser');
  const p = document.getElementById('adminPass');
  const err = document.getElementById('adminError');
  
  console.log('Admin login attempt');
  
  if(!u || !p) {
    console.error('Form elements not found');
    alert('⚠️ Form elements not found');
    return;
  }
  
  if(!u.value.trim()){
    if(err) err.style.display = 'block';
    u.focus();
    console.log('⚠️ Username empty');
    return;
  }
  
  if(!p.value){
    if(err) err.style.display = 'block';
    p.focus();
    console.log('⚠️ Password empty');
    return;
  }
  
  if(u.value.trim() === ADMIN_USER && p.value === adminPassCurrent){
    console.log('✓ Admin login successful');
    if(err) err.style.display = 'none';
    adminLoggedIn = true;
    const ls = document.getElementById('adminLoginScreen');
    const db = document.getElementById('adminDashboard');
    if(ls) ls.style.display = 'none';
    if(db){ db.style.display=''; db.classList.add('shown'); }
    loadDashboardStats();
    loadProjectsTable();
    loadUsers();
    loadMessages();
    
    const toastEl = document.getElementById('toast');
    if(toastEl) {
      toast('✅ Login successful!', 'ok');
    }
    
    // Restore last active panel from localStorage
    setTimeout(() => {
      const lastPanel = localStorage.getItem('adminCurrentPanel') || 'dashboard';
      const navItems = document.querySelectorAll('.admin-nav-item');
      let found = false;
      navItems.forEach((item, idx) => {
        if(!found){
          if((lastPanel === 'dashboard' && idx === 0) ||
             (lastPanel === 'projects' && idx === 1) ||
             (lastPanel === 'users' && idx === 2) ||
             (lastPanel === 'messages' && idx === 3) ||
             (lastPanel === 'settings' && idx === 4)){
            showPanel(lastPanel, item);
            found = true;
          }
        }
      });
    }, 100);
  } else {
    console.log('❌ Invalid credentials');
    if(err) {
      err.innerHTML = '❌ Invalid username or password. Try: admin / jbventure2025';
      err.style.display = 'block';
    }
    p.value = '';
    p.focus();
  }
}

function adminLogout(){
  adminLoggedIn = false;
  const ls = document.getElementById('adminLoginScreen');
  const db = document.getElementById('adminDashboard');
  const au = document.getElementById('adminUser');
  const ap = document.getElementById('adminPass');
  if(db){ db.style.display='none'; db.classList.remove('shown'); }
  if(ls) ls.style.display = 'flex';
  if(au) au.value = '';
  if(ap) ap.value = '';
  // Note: Keep localStorage.adminCurrentPanel so user returns to same panel on re-login
}

function showPanel(name, el){
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));
  const panel = document.getElementById('panel-' + name);
  if(panel) panel.classList.add('active');
  if(el) el.classList.add('active');
  // Save current panel to localStorage
  localStorage.setItem('adminCurrentPanel', name);
  if(name === 'projects') loadProjectsTable();
  if(name === 'users') loadUsers();
  if(name === 'messages') loadMessages();
  if(name === 'dashboard') loadDashboardStats();
}

function changePassword(){
  const curr = document.getElementById('currPass');
  const nw = document.getElementById('newPass');
  if(!curr || !nw) return;
  if(curr.value !== adminPassCurrent){ toast('Current password incorrect','warn'); return; }
  if(!nw.value || nw.value.length < 6){ toast('New password must be at least 6 characters','warn'); return; }
  adminPassCurrent = nw.value;
  curr.value = ''; nw.value = '';
  const hint = document.querySelector('#panel-settings .admin-card-body p');
  if(hint) hint.innerHTML = 'Default credentials: <strong style="color:var(--yellow)">admin</strong> / <strong style="color:var(--yellow)">[updated — use your new password]</strong>';
  toast('Password updated! ✅');
}

/* ═══════════════════════════════════════════
   PROJECTS
═══════════════════════════════════════════ */

async function loadProjectsFromFirebase(){
  const fb = getFirebase();
  if(!fb){ console.warn('Firebase not available'); return; }
  try{
    const snap = await fb.getDocs(fb.collection(fb.db,'projects'));
    if(!snap.empty){
      localProjects = snap.docs.map(d => {
        const data = d.data();
        // normalize: if imageUrls exists and img missing, use first image as img for thumbnail/backdrop
        if(!data.img && Array.isArray(data.imageUrls) && data.imageUrls.length){
          data.img = data.imageUrls[0];
        }
        return {id: d.id, ...data};
      });
      console.log('Loaded', localProjects.length, 'projects from Firebase');
      localProjects.forEach((p,i) => console.log(`Project ${i}:`, p.title, '| has image:', !!(p.img && p.img.trim())));
      loadProjectsToSite();
    } else {
      console.log('No projects found in Firebase');
    }
  } catch(e){ console.warn('Firebase projects load error:', e.message); }
}

function loadProjectsToSite(){
  const grid = document.getElementById('projectsGrid');
  if(!grid) return;
  if(!localProjects.length){
    grid.innerHTML = '<p style="color:var(--muted);padding:40px;text-align:center;grid-column:1/-1">No projects yet.</p>';
    return;
  }
  // Build HTML without embedding image URLs in the template string (fixes base64 breaking)
  grid.innerHTML = localProjects.map((p, i) => `
    <div class="proj-card ${i===0?'big':''} fi d${Math.min(i,5)}" data-proj-idx="${i}">
      <div class="proj-bg" data-img-idx="${i}"></div>
      <div class="proj-gallery" data-gallery-idx="${i}"></div>
      <div class="proj-overlay">
        <div class="proj-cat">${p.category||''}</div>
        <h3>${p.title||''}</h3>
        <p>${p.desc||''}</p>
      </div>
    </div>`).join('');

  // Apply background images via JS after DOM is built (safe for base64 & long URLs)
  localProjects.forEach((p, i) => {
    const bgEl = grid.querySelector(`.proj-bg[data-img-idx="${i}"]`);
    if(!bgEl) return;
    // Default dark gradient
    bgEl.style.background = 'linear-gradient(135deg,#1a0a0a,#2a1010)';
    const imgSrc = (p.img && p.img.trim()) ? p.img : (Array.isArray(p.imageUrls) && p.imageUrls.length ? p.imageUrls[0] : null);
    if(imgSrc){
      bgEl.style.backgroundImage = 'url(' + imgSrc + ')';
      bgEl.style.backgroundSize = 'cover';
      bgEl.style.backgroundPosition = 'center';
    }
    // fill gallery thumbnails if multiple images
    const galleryEl = grid.querySelector(`.proj-gallery[data-gallery-idx="${i}"]`);
    if(galleryEl){
      const urls = Array.isArray(p.imageUrls) && p.imageUrls.length ? p.imageUrls : (p.img ? [p.img] : []);
      if(urls.length){
        galleryEl.innerHTML = urls.map(u=>`<img src="${u}" alt="${(p.title||'')}">`).join('');
        // attach click handler to open full image
        galleryEl.querySelectorAll('img').forEach(img => img.addEventListener('click', (e)=>{ window.open(e.target.src,'_blank'); }));
      } else {
        galleryEl.innerHTML = '';
      }
    }
  });

  runAnim();
}

function loadDashboardStats(){
  const dp = document.getElementById('dashProjects');
  const du = document.getElementById('dashUsers');
  const dm = document.getElementById('dashMessages');
  if(dp) dp.textContent = localProjects.length;
  if(du) du.textContent = localUsers.length;
  if(dm) dm.textContent = localMessages.length;
  const ra = document.getElementById('recentActivity');
  if(!ra) return;
  const items = [
    ...localProjects.slice(0,3).map(p=>`<div style="padding:8px 0;border-bottom:1px solid var(--border)">🏗️ <strong style="color:var(--white)">${p.title}</strong> <span class="badge badge-green" style="margin-left:8px">${p.status||'Active'}</span></div>`),
    ...localUsers.slice(0,3).map(u=>`<div style="padding:8px 0;border-bottom:1px solid var(--border)">👤 <strong style="color:var(--white)">${u.name||u.email||'User'}</strong> <span style="font-size:12px;color:var(--muted);margin-left:6px">${u.email||''}</span></div>`)
  ];
  ra.innerHTML = items.length ? items.join('') : '<div style="color:var(--muted);padding:12px 0">No recent activity yet.</div>';
}

function loadProjectsTable(){
  const tbody = document.getElementById('projectsTableBody');
  if(!tbody) return;
  if(!localProjects.length){
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--muted)">No projects yet. Add your first project above.</td></tr>';
    return;
  }
  tbody.innerHTML = localProjects.map(p => {
    const imageUrls = Array.isArray(p.imageUrls) && p.imageUrls.length ? p.imageUrls : (p.img ? [p.img] : []);
    const imagesPreview = imageUrls.slice(0,3).map(url => `<img src="${url}" style="width:40px;height:30px;object-fit:cover;border-radius:3px;border:1px solid var(--border)" onerror="this.style.display='none'">`).join('');
    const more = imageUrls.length > 3 ? `<span style="font-size:10px;color:var(--muted);margin-left:6px">+${imageUrls.length-3}</span>` : '';
    return `
    <tr>
      <td data-label="Image"><div class="admin-img-preview">${imagesPreview} ${more}</div></td>
      <td data-label="Title" style="font-weight:600;color:var(--white)">${p.title||''}</td>
      <td data-label="Category"><span class="badge badge-yellow">${p.category||''}</span></td>
      <td data-label="Description" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)">${p.desc||''}</td>
      <td data-label="Status"><span class="badge ${p.status==='Completed'?'badge-yellow':'badge-green'}">${p.status||'Active'}</span></td>
      <td data-label="Action">
        <button class="btn-ash btn-admin" style="padding:6px 10px;font-size:11px;margin-bottom:6px" onclick="openAddImages('${p.id}')"><i class="fas fa-image"></i> Add Images</button>
        <button class="btn-ash btn-admin" style="padding:6px 10px;font-size:11px;margin-bottom:6px" onclick="deleteLogo('${p.id}')" title="Delete only the logo"><i class="fas fa-icons"></i> Delete Logo</button>
        <button class="btn-ash btn-admin" style="padding:6px 10px;font-size:11px;margin-bottom:6px" onclick="deleteAllImages('${p.id}')" title="Delete all images"><i class="fas fa-trash-alt"></i> Delete All Images</button>
        <button class="btn-admin btn-ash" onclick="deleteProject('${p.id}')" style="padding:6px 10px;font-size:11px" title="Delete"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`}).join('');
}

async function addProject(){
  const titleEl = document.getElementById('projTitle');
  const categoryEl = document.getElementById('projCategory');
  const descEl = document.getElementById('projDesc');
  const imgUrlEl = document.getElementById('projImgUrl');
  const title = titleEl ? titleEl.value.trim() : '';
  const category = categoryEl ? categoryEl.value : 'Residential';
  const desc = descEl ? descEl.value.trim() : '';
  const imgData = (uploadedFilesData && uploadedFilesData.length) ? uploadedFilesData[0] : (imgUrlEl ? imgUrlEl.value.trim() : '');
  if(!title){ toast('Please enter a project title','warn'); return; }
  const fb = getFirebase();
  const proj = { id:'p'+Date.now(), title, category, desc, img:'', imageUrls: [], status:'Active', createdAt:new Date().toISOString() };

  if(!fb){
    console.warn('Firebase not initialized - saving locally only');
    toast('⚠️ Firebase not configured - saving locally only', 'warn');
  }

  if(fb){
    try{
      toast('Saving to Firebase...', 'ok');
      // create doc first to get a stable id
      const ref = await fb.addDoc(fb.collection(fb.db,'projects'), proj);
      proj.id = ref.id;

      // if there are compressed data URLs, upload them to storage
      if(uploadedFilesData && uploadedFilesData.length){
        try{
          toast('Uploading images...', 'ok');
          const urls = await uploadDataUrlsToStorage(proj.id, uploadedFilesData);
          if(urls && urls.length){
            await fb.setDoc(fb.doc(fb.db,'projects',proj.id), { imageUrls: urls, img: urls[0] }, { merge: true });
            proj.imageUrls = urls; proj.img = urls[0];
          }
        } catch(e){ console.error('Upload during addProject failed', e); }
      }

      toast('Project saved to Firebase! ✅');
    } catch(e){
      console.warn('Firebase addProject error:', e.message);
      toast('⚠️ Firebase error: ' + e.message + ' - saved locally','warn');
      // fallback to local
      proj.id = 'local-' + Date.now();
      if(uploadedFilesData && uploadedFilesData.length){ proj.imageUrls = uploadedFilesData.slice(); proj.img = uploadedFilesData[0]; }
    }
  } else {
    // local-only (Firebase not configured)
    if(uploadedFilesData && uploadedFilesData.length){ proj.imageUrls = uploadedFilesData.slice(); proj.img = uploadedFilesData[0]; }
    toast('Project added locally (no Firebase) ⚠️');
  }

  localProjects.unshift(proj);
  loadProjectsToSite();
  loadProjectsTable();
  loadDashboardStats();
  clearProjectForm();
  
  // Reload from Firebase to ensure persistence
  if(fb){
    setTimeout(() => {
      loadProjectsFromFirebase().catch(e => console.warn('Reload after add failed:', e));
    }, 800);
  }
}

async function deleteProject(id){
  if(!confirm('🗑️ Delete this project permanently? This cannot be undone.')) return;
  
  const fb = getFirebase();
  let deleteSuccess = false;
  
  // Find the project to delete images
  const projToDelete = localProjects.find(p => p.id === id);
  if(projToDelete){
    console.log('Deleting project:', projToDelete.title);
  }
  
  // First, delete all images from storage
  if(fb && projToDelete){
    try{
      console.log('🗑️ Deleting images from storage for project:', id);
      const folderRef = fb.storageRef(fb.storage, `projects/${id}`);
      const fileList = await fb.listAll(folderRef);
      for(let file of fileList.items){
        await fb.deleteObject(file);
        console.log('✓ Deleted image:', file.name);
      }
      console.log('✓ All images deleted');
    } catch(e){
      console.warn('Could not delete images:', e.message);
    }
  }
  
  // Then delete document from Firestore
  if(fb){
    try{ 
      console.log('🗑️ Deleting project from Firestore:', id);
      await fb.deleteDoc(fb.doc(fb.db, 'projects', id));
      deleteSuccess = true;
      console.log('✓ Project deleted from Firebase');
      toast('🗑️ Project deleted permanently! ✅', 'ok');
    } catch(e){ 
      console.error('❌ Firebase delete error:', e.message);
      alert('❌ Failed to delete from Firebase:\n' + e.message);
      return;
    }
  } else {
    console.warn('⚠️ Firebase not available - deleting locally only');
    deleteSuccess = true;
  }
  
  // Remove from local state immediately
  const beforeCount = localProjects.length;
  localProjects = localProjects.filter(p => p.id !== id);
  const afterCount = localProjects.length;
  console.log(`✓ Removed from local state: ${beforeCount} → ${afterCount} projects`);
  
  // Refresh UI immediately
  loadProjectsToSite();
  loadProjectsTable();
  loadDashboardStats();
  
  // Reload from Firebase to confirm deletion and prevent resurrection
  if(deleteSuccess && fb){
    console.log('🔄 Reloading from Firebase to verify deletion...');
    setTimeout(async () => {
      try{
        await loadProjectsFromFirebase();
        console.log('✓ Verified: Current project count =', localProjects.length);
      } catch(e) { 
        console.error('❌ Failed to reload after delete:', e.message);
      }
    }, 1000);
  }
}

function clearProjectForm(){
  ['projTitle','projDesc','projImgUrl'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  const preview = document.getElementById('uploadPreview');
  if(preview){ preview.innerHTML = ''; preview.style.display = 'none'; }
  uploadedFilesData = [];
  const fileInput = document.getElementById('projFile'); if(fileInput) fileInput.value = '';
}

async function handleFileUpload(input){
  const files = Array.from(input.files || []);
  if(!files.length) return;

  const totalMB = files.reduce((s,f) => s + f.size, 0) / (1024*1024);
  if(totalMB > 100){ toast('Total file size exceeds 100 MB. Please select smaller files.','warn'); input.value = ''; uploadedFilesData = []; return; }

  const readAndCompress = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1200;
        let w = img.width, h = img.height;
        if(w > MAX){ h = Math.round(h * MAX / w); w = MAX; }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        // use JPEG compression for size savings
        const compressed = canvas.toDataURL('image/jpeg', 0.8);
        resolve({ name: file.name, data: compressed });
      };
      img.onerror = () => reject(new Error('Image load error'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsDataURL(file);
  });

  try{
    const results = await Promise.all(files.map(f => readAndCompress(f)));
    uploadedFilesData = results.map(r => r.data);

    // render previews
    const preview = document.getElementById('uploadPreview');
    preview.innerHTML = '';
    results.forEach(r => {
      const img = document.createElement('img');
      img.src = r.data;
      img.title = r.name;
      img.style.width = '80px'; img.style.height = '60px'; img.style.objectFit = 'cover'; img.style.borderRadius = '4px'; img.style.border = '1px solid var(--border)';
      preview.appendChild(img);
    });
    preview.style.display = 'flex';
    toast('Images ready! (' + results.length + ')');
  } catch(err){
    console.error(err);
    toast('Failed to process images. Try smaller files.','warn');
    uploadedFilesData = [];
    input.value = '';
  }
}

async function loadProjects(){
  await loadProjectsFromFirebase();
  toast('Projects refreshed');
}

/* ═══════════════════════════════════════════
   USERS & MESSAGES
═══════════════════════════════════════════ */

async function loadUsers(){
  const fb = getFirebase();
  const tbody = document.getElementById('usersTableBody');
  if(!tbody) return;
  if(!fb){ tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--muted)">Firebase not configured</td></tr>'; return; }
  try{
    const snap = await fb.getDocs(fb.collection(fb.db,'users'));
    localUsers = snap.docs.map(d => ({id:d.id,...d.data()}));
    const dashEl = document.getElementById('dashUsers');
    if(dashEl) dashEl.textContent = localUsers.length;
    tbody.innerHTML = localUsers.length ? localUsers.map(u=>`
      <tr>
        <td data-label="Name" style="font-weight:600;color:var(--white)">${u.name||'—'}</td>
        <td data-label="Email" style="color:rgba(255,255,255,.6)">${u.email||'—'}</td>
        <td data-label="Phone">${u.phone||'<span style="color:var(--muted)">Not provided</span>'}</td>
        <td data-label="Country">${u.country||'—'}</td>
        <td data-label="Provider"><span class="badge badge-yellow">Google</span></td>
        <td data-label="Joined" style="color:var(--muted);font-size:12px">${u.joinedAt?.toDate?.()?.toLocaleDateString('en-IN')||'—'}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--muted)">No users signed in yet.</td></tr>';
  } catch(e){ tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:32px;color:#e74c3c">Error: '+e.message+'</td></tr>'; }
}

async function loadMessages(){
  const fb = getFirebase();
  const body = document.getElementById('messagesBody');
  if(!body) return;
  if(!fb){ body.innerHTML='<p style="padding:20px;color:var(--muted)">Firebase not configured</p>'; return; }
  try{
    const snap = await fb.getDocs(fb.collection(fb.db,'messages'));
    localMessages = snap.docs.map(d => ({id:d.id,...d.data()}));
    const dashEl = document.getElementById('dashMessages');
    if(dashEl) dashEl.textContent = localMessages.length;
    body.innerHTML = localMessages.length ? localMessages.map(m=>`
      <div style="padding:20px;border-bottom:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px">
          <strong style="color:var(--white);font-size:15px">${m.name||'Unknown'}</strong>
          <span style="font-size:11px;color:var(--yellow);background:rgba(241,196,15,0.1);padding:3px 10px;border-radius:20px;border:1px solid rgba(241,196,15,0.2)">${m.service||'General'}</span>
        </div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:8px">
          <i class="fas fa-envelope" style="color:var(--red);margin-right:6px"></i>${m.email||''}
          ${m.phone?`<span style="margin-left:14px"><i class="fas fa-phone" style="color:var(--red);margin-right:6px"></i>${m.phone}</span>`:''}
        </div>
        <div style="font-size:14px;color:rgba(255,255,255,.7);line-height:1.6">${m.message||''}</div>
      </div>`).join('')
    : '<p style="text-align:center;padding:40px;color:var(--muted)">No messages yet.</p>';
  } catch(e){ body.innerHTML='<p style="padding:20px;color:#e74c3c">Error: '+e.message+'</p>'; }
}

/* ═══════════════════════════════════════════
   CONTACT FORM
═══════════════════════════════════════════ */

async function submitContact(btn){
  // Walk up from button to find the contact section
  const section = document.getElementById('contact');
  if(!section){ toast('Form not found','error'); return; }
  const nameEl = section.querySelector('input[type=text]');
  const phoneEl = section.querySelector('input[type=tel]');
  const emailEl = section.querySelector('input[type=email]');
  const serviceEl = section.querySelector('select');
  const msgEl = section.querySelector('textarea');
  const name = nameEl ? nameEl.value.trim() : '';
  const phone = phoneEl ? phoneEl.value.trim() : '';
  const email = emailEl ? emailEl.value.trim() : '';
  const service = serviceEl ? serviceEl.value : '';
  const message = msgEl ? msgEl.value.trim() : '';
  if(!name || !phone || !email){ toast('Please fill all required fields','warn'); return; }
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ toast('Please enter a valid email address','warn'); return; }
  if(service === 'Select service...'){ toast('Please select a service','warn'); return; }

  // Disable button during send
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…';

  const fb = getFirebase();
  if(fb){
    try{
      await fb.addDoc(fb.collection(fb.db,'messages'), {name,phone,email,service,message,createdAt:fb.serverTimestamp()});
    } catch(e){ console.warn('Message save failed:', e.message); }
  }
  localMessages.push({name,phone,email,service,message});
  toast('Message sent! We will contact you soon. 🏗️');
  [nameEl,phoneEl,emailEl,msgEl].forEach(el => { if(el) el.value = ''; });
  if(serviceEl) serviceEl.selectedIndex = 0;
  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-paper-plane"></i>Send Message';
}

/* ═══════════════════════════════════════════
   NEWSLETTER
═══════════════════════════════════════════ */

function nlSub(btn){
  const input = btn.previousElementSibling;
  if(!input || !input.value.trim()){ toast('Please enter your email address','warn'); return; }
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.value.trim())){ toast('Please enter a valid email address','warn'); return; }
  const fb = getFirebase();
  if(fb){
    fb.addDoc(fb.collection(fb.db,'newsletter'), { email: input.value.trim(), subscribedAt: fb.serverTimestamp() })
      .catch(e => console.warn('Newsletter save:', e.message));
  }
  toast('Thank you for subscribing! 🏗️');
  input.value = '';
}

  /* Project Gallery modal controls */
  function openProjectGallery(){
    const modal = document.getElementById('projectGalleryModal');
    if(!modal) return;
    renderProjectGallery();
    modal.classList.add('on');
    document.body.style.overflow = 'hidden';
  }

  function closeProjectGallery(){
    const modal = document.getElementById('projectGalleryModal');
    if(!modal) return;
    modal.classList.remove('on');
    document.body.style.overflow = '';
  }

  function renderProjectGallery(){
    const grid = document.getElementById('projectGalleryGrid');
    if(!grid) return;
    if(!localProjects || !localProjects.length){ grid.innerHTML = '<p style="color:var(--muted);padding:20px;text-align:center">No projects yet.</p>'; return; }
    grid.innerHTML = localProjects.map(p => {
      const urls = Array.isArray(p.imageUrls) && p.imageUrls.length ? p.imageUrls : (p.img ? [p.img] : []);
      const imgSrc = urls[0] || '';
      return `
        <div class="gallery-card" data-proj-id="${p.id}">
          <div class="gallery-img">${imgSrc?`<img src="${imgSrc}" alt="${(p.title||'')}">`:'<div style="padding:18px;color:var(--muted)">No image</div>'}</div>
          <div class="gallery-meta"><h4>${p.title||''}</h4><div class="gallery-cat">${p.category||''}</div></div>
        </div>`;
    }).join('');

    // attach click handlers to open project first image in new tab
    grid.querySelectorAll('.gallery-card').forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-proj-id');
        const proj = localProjects.find(x => x.id === id);
        const urls = proj ? (Array.isArray(proj.imageUrls) && proj.imageUrls.length ? proj.imageUrls : (proj.img? [proj.img] : [])) : [];
        if(urls && urls.length) window.open(urls[0], '_blank');
        else alert('No images for this project');
      });
    });
  }

