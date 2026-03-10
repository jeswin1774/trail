/* ═══════════════════════════════════════════
   PROJECT MANAGEMENT - FIXED VERSION
═══════════════════════════════════════════ */

// Global projects array
let localProjects = [
  {id:'p1',title:'Modern Villa, Thoothukudi',category:'Residential',desc:'4BHK duplex with rooftop garden',img:'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600&q=70',status:'Active',imageUrls:[]},
  {id:'p2',title:'Office Complex',category:'Commercial',desc:'2,400 sq ft premium workspace',img:'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=600&q=70',status:'Active',imageUrls:[]},
  {id:'p3',title:'Heritage Bungalow Restoration',category:'Architecture',desc:'Colonial-era restoration project',img:'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=600&q=70',status:'Completed',imageUrls:[]},
  {id:'p4',title:'Factory Complex',category:'Industrial',desc:'12,000 sq ft manufacturing unit',img:'https://images.unsplash.com/photo-1572120360610-d971b9d7767c?w=600&q=70',status:'Active',imageUrls:[]},
  {id:'p5',title:'Luxury Penthouse',category:'Interior',desc:'Full interior design & execution',img:'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&q=70',status:'Active',imageUrls:[]},
];

/* ============================================
   FIXED DELETE PROJECT FUNCTION
   ============================================ */

async function deleteProject(id) {
  console.log('🗑️ DELETE PROJECT CALLED for ID:', id);
  
  // Find the project first to show proper confirmation
  const projectToDelete = localProjects.find(p => p.id === id);
  const projectName = projectToDelete ? projectToDelete.title : 'this project';
  
  // Strong confirmation with project name
  if (!confirm(`⚠️ DELETE PROJECT: "${projectName}"\n\nThis will permanently delete:\n• The project and all its data\n• All uploaded images\n\nThis action CANNOT be undone!\n\nClick OK to permanently delete.`)) {
    console.log('❌ Delete cancelled by user');
    return;
  }
  
  console.log('✓ User confirmed deletion for:', projectName);
  
  const fb = getFirebase();
  
  // Show loading state
  toast('🗑️ Deleting project...', 'ok');
  
  try {
    // STEP 1: Delete from Firebase Storage (all images)
    if (fb) {
      try {
        console.log('📁 Attempting to delete storage folder for:', id);
        const folderRef = fb.storageRef(fb.storage, `projects/${id}`);
        const fileList = await fb.listAll(folderRef);
        
        if (fileList.items.length > 0) {
          console.log(`Found ${fileList.items.length} images to delete from storage`);
          
          // Delete each image one by one
          for (const item of fileList.items) {
            try {
              await fb.deleteObject(item);
              console.log(`  ✓ Deleted: ${item.name}`);
            } catch (err) {
              console.warn(`  ⚠️ Could not delete ${item.name}:`, err.message);
              // Continue even if individual image fails
            }
          }
          console.log('✓ Storage folder cleanup complete');
        } else {
          console.log('No images found in storage folder');
        }
      } catch (storageErr) {
        // Folder might not exist - that's fine
        console.log('Storage folder may not exist:', storageErr.message);
      }
      
      // STEP 2: Delete from Firestore
      try {
        console.log('📄 Attempting to delete Firestore document:', id);
        await fb.deleteDoc(fb.doc(fb.db, 'projects', id));
        console.log('✓ Firestore document deleted successfully');
      } catch (firestoreErr) {
        console.error('❌ Firestore delete error:', firestoreErr.message);
        toast('❌ Failed to delete from database: ' + firestoreErr.message, 'error');
        return; // Stop if Firestore delete fails
      }
    } else {
      console.log('⚠️ Firebase not available - deleting locally only');
    }
    
    // STEP 3: Remove from local state (ALWAYS do this)
    const beforeCount = localProjects.length;
    localProjects = localProjects.filter(p => p.id !== id);
    const afterCount = localProjects.length;
    
    console.log(`📊 Local projects: ${beforeCount} → ${afterCount}`);
    
    // STEP 4: Verify deletion was successful
    const stillExists = localProjects.find(p => p.id === id);
    if (stillExists) {
      console.error('❌ ERROR: Project still exists in local state after deletion!');
      toast('❌ Deletion failed - project still exists', 'error');
      return;
    }
    
    // STEP 5: Refresh UI immediately
    console.log('🔄 Refreshing UI...');
    loadProjectsToSite();      // Update main page
    loadProjectsTable();       // Update admin table
    loadDashboardStats();      // Update dashboard counts
    
    // STEP 6: Also update gallery if open
    if (document.getElementById('projectGalleryModal')?.classList.contains('on')) {
      renderProjectGallery();
    }
    
    console.log('✅ DELETE COMPLETE - Project removed from all views');
    toast('🗑️ Project deleted successfully!', 'ok');
    
    // STEP 7: Force a fresh reload from Firebase to ensure sync
    if (fb) {
      setTimeout(async () => {
        console.log('🔄 Performing verification reload from Firebase...');
        await loadProjectsFromFirebase();
        
        // Double-check the deleted project didn't come back
        const resurrected = localProjects.find(p => p.id === id);
        if (resurrected) {
          console.error('❌ CRITICAL: Deleted project reappeared!');
          // Force remove it again
          localProjects = localProjects.filter(p => p.id !== id);
          loadProjectsToSite();
          loadProjectsTable();
          toast('⚠️ Fixed sync issue - project removed permanently', 'warn');
        } else {
          console.log('✅ Verification passed - project is permanently gone');
        }
      }, 1500);
    }
    
  } catch (error) {
    console.error('❌ Unexpected error during deletion:', error);
    toast('❌ Delete failed: ' + error.message, 'error');
  }
}

/* ============================================
   FIXED LOAD PROJECTS FROM FIREBASE
   ============================================ */

async function loadProjectsFromFirebase() {
  const fb = getFirebase();
  console.log('📥 Loading projects from Firebase...');
  
  if (!fb) {
    console.warn('⚠️ Firebase not available - using local projects only');
    loadProjectsToSite();
    return;
  }
  
  try {
    const querySnapshot = await fb.getDocs(fb.collection(fb.db, 'projects'));
    
    if (querySnapshot.empty) {
      console.log('No projects found in Firebase, keeping existing local projects');
      // Don't overwrite local projects if Firebase is empty
      loadProjectsToSite();
      return;
    }
    
    // Build new projects array from Firebase
    const firebaseProjects = [];
    querySnapshot.forEach(doc => {
      const data = doc.data();
      firebaseProjects.push({
        id: doc.id,
        title: data.title || 'Untitled',
        category: data.category || 'Residential',
        desc: data.desc || '',
        img: data.img || (data.imageUrls?.[0] || ''),
        imageUrls: data.imageUrls || [],
        status: data.status || 'Active',
        createdAt: data.createdAt
      });
    });
    
    console.log(`✅ Loaded ${firebaseProjects.length} projects from Firebase`);
    
    // Replace local projects with Firebase data
    localProjects = firebaseProjects;
    
    // Update UI
    loadProjectsToSite();
    loadProjectsTable();
    loadDashboardStats();
    
  } catch (error) {
    console.error('❌ Error loading from Firebase:', error);
    toast('⚠️ Error loading projects: ' + error.message, 'warn');
    // Keep using local projects
    loadProjectsToSite();
  }
}

/* ============================================
   FIXED ADD PROJECT FUNCTION
   ============================================ */

async function addProject() {
  const titleEl = document.getElementById('projTitle');
  const categoryEl = document.getElementById('projCategory');
  const descEl = document.getElementById('projDesc');
  const imgUrlEl = document.getElementById('projImgUrl');
  
  const title = titleEl?.value?.trim() || '';
  const category = categoryEl?.value || 'Residential';
  const desc = descEl?.value?.trim() || '';
  const imgData = (uploadedFilesData && uploadedFilesData.length) ? uploadedFilesData[0] : (imgUrlEl?.value?.trim() || '');
  
  if (!title) {
    toast('Please enter a project title', 'warn');
    titleEl?.focus();
    return;
  }
  
  const fb = getFirebase();
  
  // Create project object
  const newProject = {
    title,
    category,
    desc,
    img: '',
    imageUrls: [],
    status: 'Active',
    createdAt: new Date().toISOString()
  };
  
  // Show loading
  toast('📤 Adding project...', 'ok');
  
  try {
    let projectId;
    
    if (fb) {
      // Save to Firebase first
      const docRef = await fb.addDoc(fb.collection(fb.db, 'projects'), newProject);
      projectId = docRef.id;
      console.log('✅ Project created in Firebase with ID:', projectId);
      
      // Upload images if any
      if (uploadedFilesData && uploadedFilesData.length > 0) {
        try {
          toast('📸 Uploading images...', 'ok');
          const urls = await uploadDataUrlsToStorage(projectId, uploadedFilesData);
          
          if (urls && urls.length > 0) {
            // Update project with image URLs
            await fb.setDoc(fb.doc(fb.db, 'projects', projectId), {
              imageUrls: urls,
              img: urls[0]
            }, { merge: true });
            
            newProject.imageUrls = urls;
            newProject.img = urls[0];
            console.log(`✅ Uploaded ${urls.length} images`);
          }
        } catch (uploadErr) {
          console.error('❌ Image upload failed:', uploadErr);
          toast('⚠️ Project saved but images failed to upload', 'warn');
        }
      }
      
      // Add to local state with Firebase ID
      localProjects.unshift({
        id: projectId,
        ...newProject
      });
      
      toast('✅ Project added successfully!', 'ok');
      
    } else {
      // Firebase not available - save locally only
      projectId = 'local-' + Date.now();
      localProjects.unshift({
        id: projectId,
        ...newProject,
        imageUrls: uploadedFilesData || [],
        img: (uploadedFilesData?.[0]) || ''
      });
      toast('⚠️ Project saved locally (Firebase not configured)', 'warn');
    }
    
    // Clear form
    clearProjectForm();
    
    // Update UI
    loadProjectsToSite();
    loadProjectsTable();
    loadDashboardStats();
    
  } catch (error) {
    console.error('❌ Error adding project:', error);
    toast('❌ Failed to add project: ' + error.message, 'error');
  }
}

/* ============================================
   FIXED DELETE ALL IMAGES FUNCTION
   ============================================ */

async function deleteAllImages(projectId) {
  console.log('🗑️ DELETE ALL IMAGES for project:', projectId);
  
  const project = localProjects.find(p => p.id === projectId);
  if (!project) {
    toast('❌ Project not found', 'error');
    return;
  }
  
  const imageCount = project.imageUrls?.length || (project.img ? 1 : 0);
  
  if (!confirm(`🗑️ Delete ALL ${imageCount} images for "${project.title}"?\n\nThis cannot be undone.`)) {
    return;
  }
  
  const fb = getFirebase();
  
  try {
    if (fb) {
      // Delete from Storage
      try {
        const folderRef = fb.storageRef(fb.storage, `projects/${projectId}`);
        const fileList = await fb.listAll(folderRef);
        
        for (const item of fileList.items) {
          await fb.deleteObject(item);
          console.log(`  ✓ Deleted: ${item.name}`);
        }
      } catch (storageErr) {
        console.log('Storage cleanup:', storageErr.message);
      }
      
      // Update Firestore
      await fb.setDoc(fb.doc(fb.db, 'projects', projectId), {
        imageUrls: [],
        img: ''
      }, { merge: true });
    }
    
    // Update local state
    project.imageUrls = [];
    project.img = '';
    
    // Refresh UI
    loadProjectsTable();
    loadProjectsToSite();
    
    toast(`✅ All images deleted for "${project.title}"`, 'ok');
    
  } catch (error) {
    console.error('❌ Error deleting images:', error);
    toast('❌ Failed to delete images: ' + error.message, 'error');
  }
}

/* ============================================
   FIXED DELETE LOGO FUNCTION
   ============================================ */

async function deleteLogo(projectId) {
  console.log('🖼️ DELETE LOGO for project:', projectId);
  
  const project = localProjects.find(p => p.id === projectId);
  if (!project) {
    toast('❌ Project not found', 'error');
    return;
  }
  
  if (!project.img) {
    toast('⚠️ No logo to delete', 'warn');
    return;
  }
  
  if (!confirm(`Delete logo for "${project.title}"?\nOther images will be preserved.`)) {
    return;
  }
  
  const fb = getFirebase();
  
  try {
    if (fb) {
      // Update Firestore
      await fb.setDoc(fb.doc(fb.db, 'projects', projectId), {
        img: ''
      }, { merge: true });
    }
    
    // Update local state
    project.img = '';
    
    // Refresh UI
    loadProjectsTable();
    loadProjectsToSite();
    
    toast(`✅ Logo deleted for "${project.title}"`, 'ok');
    
  } catch (error) {
    console.error('❌ Error deleting logo:', error);
    toast('❌ Failed to delete logo: ' + error.message, 'error');
  }
}

/* ============================================
   FIXED LOAD PROJECTS TABLE
   ============================================ */

function loadProjectsTable() {
  const tbody = document.getElementById('projectsTableBody');
  if (!tbody) {
    console.error('❌ projectsTableBody not found');
    return;
  }
  
  console.log(`📊 Loading projects table: ${localProjects.length} projects`);
  
  if (!localProjects.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--muted)">No projects yet. Add your first project above.</td></tr>';
    return;
  }
  
  tbody.innerHTML = localProjects.map(p => {
    const imageUrls = Array.isArray(p.imageUrls) && p.imageUrls.length ? p.imageUrls : (p.img ? [p.img] : []);
    const imagesPreview = imageUrls.slice(0, 3).map(url => 
      `<img src="${url}" style="width:40px;height:30px;object-fit:cover;border-radius:3px;border:1px solid var(--border)" onerror="this.style.display='none'">`
    ).join('');
    const more = imageUrls.length > 3 ? `<span style="font-size:10px;color:var(--muted);margin-left:6px">+${imageUrls.length-3}</span>` : '';
    
    return `
    <tr data-project-id="${p.id}">
      <td data-label="Image">
        <div class="admin-img-preview">${imagesPreview} ${more}</div>
      </td>
      <td data-label="Title" style="font-weight:600;color:var(--white)">${p.title || ''}</td>
      <td data-label="Category"><span class="badge badge-yellow">${p.category || ''}</span></td>
      <td data-label="Description" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)">${p.desc || ''}</td>
      <td data-label="Status"><span class="badge ${p.status === 'Completed' ? 'badge-yellow' : 'badge-green'}">${p.status || 'Active'}</span></td>
      <td data-label="Action">
        <div style="display:flex;flex-direction:column;gap:6px;">
          <button class="btn-ash btn-admin" style="padding:6px 10px;font-size:11px;cursor:pointer" onclick="openAddImages('${p.id}')" title="Add more images">
            <i class="fas fa-image"></i> Add Images
          </button>
          <button class="btn-ash btn-admin" style="padding:6px 10px;font-size:11px;cursor:pointer" onclick="deleteLogo('${p.id}')" title="Delete only the logo">
            <i class="fas fa-icons"></i> Delete Logo
          </button>
          <button class="btn-ash btn-admin" style="padding:6px 10px;font-size:11px;cursor:pointer" onclick="deleteAllImages('${p.id}')" title="Delete all images">
            <i class="fas fa-trash-alt"></i> Delete All Images
          </button>
          <button class="btn-admin btn-red" style="padding:6px 10px;font-size:11px;cursor:pointer" onclick="deleteProject('${p.id}')" title="Delete entire project">
            <i class="fas fa-trash"></i> DELETE PROJECT
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
  
  console.log('✅ Projects table updated');
}

/* ============================================
   PAGE LOAD - FIXED
   ============================================ */

window.addEventListener('load', () => {
  console.log('🎯 Page loaded - initializing...');
  
  // Check for admin session
  const wasAdminLoggedIn = localStorage.getItem('adminLoggedIn') === 'true';
  const adminLoginTime = localStorage.getItem('adminLoginTime');
  
  // Session expires after 8 hours
  if (wasAdminLoggedIn && adminLoginTime) {
    const now = new Date().getTime();
    const eightHours = 8 * 60 * 60 * 1000;
    
    if (now - parseInt(adminLoginTime) < eightHours) {
      console.log('🔓 Restoring admin session');
      adminLoggedIn = true;
      
      const signinPage = document.getElementById('signInPage');
      if (signinPage) {
        signinPage.classList.add('hidden');
        signinPage.classList.add('exit');
      }
    } else {
      console.log('⌛ Admin session expired');
      localStorage.removeItem('adminLoggedIn');
      localStorage.removeItem('adminLoginTime');
    }
  }
  
  // Load projects
  loadProjectsFromFirebase().then(() => {
    console.log('✅ Initial project load complete');
  }).catch(err => {
    console.error('❌ Initial project load failed:', err);
    loadProjectsToSite(); // Fallback to local
  });
  
  // Initialize UI
  runAnim();
  setTimeout(triggerCounters, 800);
  
  // Setup Firebase auth listener
  setTimeout(() => {
    const fb = getFirebase();
    if (fb) {
      fb.onAuthStateChanged(fb.auth, user => {
        currentUser = user;
        updateNavUser(user);
        if (user) saveUserToFirestore(user);
      });
    }
  }, 500);
  
  console.log('✅ Page initialization complete');
});
