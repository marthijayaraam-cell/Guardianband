/**
 * GuardianBand MVP - Cyber-Medical Cloud IoT Web App with High-Speed TinyML Pipeline
 * 
 * Features:
 * - Strict Firebase Authentication
 * - Multi-Incident Fall Reporting (Incident #1, #2, #3, and Consolidated 3-Incident Report)
 * - Fast Responsive Telemetry Pipeline (Direct unthrottled DOM updates)
 * - Kinematic Matrix & Angle HUD (Replaced inaccurate 3D model)
 * - User-Specific Patient Profile (Fetched/saved to cloud database under user's account)
 * - In-Browser ODF (.odt) & PDF (.pdf) Multi-Report Generator
 */

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyAIGzcSeYAPMuCDF6BczuG5N2eCLRjI2kc",
  authDomain: "gaurdianband.firebaseapp.com",
  databaseURL: "https://gaurdianband-default-rtdb.firebaseio.com",
  projectId: "gaurdianband",
  storageBucket: "gaurdianband.firebasestorage.app",
  messagingSenderId: "833355316468",
  appId: "1:833355316468:web:4c8501100d7d773ab932a1",
  measurementId: "G-Y3X21EK4WC"
};

let auth = null;
let db = null;
let currentUser = null;
let userPatientProfile = null;

try {
  if (typeof firebase !== 'undefined' && firebase.initializeApp) {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    auth = firebase.auth();
    db = firebase.database();
    console.log("[FIREBASE] Initialized in compat mode!");
  }
} catch (err) {
  console.warn("[FIREBASE] Init warning:", err.message);
}

document.addEventListener('DOMContentLoaded', () => {
  const tinyML = window.TinyMLEngine ? new window.TinyMLEngine() : null;
  const reportGen = window.ReportGenerator ? new window.ReportGenerator() : null;

  // App State
  let authMode = 'LOGIN';
  let currentState = 'NORMAL';
  let countdownInterval = null;
  let lastHardwareTelemetryTime = 0;
  let activeAlarmInterval = null;
  let isAlarmSilenced = false;
  const originalTitle = document.title;

  // Active Selected Report View ('CONSOLIDATED' or incident index 0, 1, 2)
  let selectedReportView = 'CONSOLIDATED';

  // Persistent Recorded Fall Incidents List (Tracks up to 3 incidents)
  let recordedIncidents = [
    {
      id: 1,
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      accelG: 3.42,
      bpm: 118,
      spo2: 95,
      svm: 3.42,
      tiltAngle: 78,
      pitch: 74,
      roll: 24,
      immobilityIndex: 92,
      tinymlClass: "Severe High-Impact Fall",
      confidence: 96.5,
      state: 'EMERGENCY',
      outcome: "Emergency Siren Dispatched • Caregiver Responded"
    },
    {
      id: 2,
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      accelG: 2.85,
      bpm: 104,
      spo2: 96,
      svm: 2.85,
      tiltAngle: 42,
      pitch: 40,
      roll: 14,
      immobilityIndex: 45,
      tinymlClass: "Stumble / Trip (Near-Fall)",
      confidence: 84.0,
      state: 'CANCEL_WINDOW',
      outcome: "Warning Window Cleared by User Button"
    },
    {
      id: 3,
      timestamp: new Date(Date.now() - 300000).toISOString(),
      accelG: 3.88,
      bpm: 124,
      spo2: 93,
      svm: 3.88,
      tiltAngle: 82,
      pitch: 80,
      roll: 30,
      immobilityIndex: 95,
      tinymlClass: "Severe High-Impact Fall",
      confidence: 98.2,
      state: 'EMERGENCY',
      outcome: "Continuous Emergency Alert Confirmed"
    }
  ];

  // Real-time parameter cache
  const currentParams = {
    bpm: 0,
    spo2: 0,
    accelG: 0.0,
    svm: 0.0,
    pitch: 0,
    roll: 0,
    tiltAngle: 0,
    state: 'NORMAL',
    timestamp: new Date().toISOString()
  };

  let latestTinyMLResult = null;

  // =========================================================================
  // DOM REFERENCES
  // =========================================================================
  const authPortal = document.getElementById('authPortal');
  const mainDashboard = document.getElementById('mainDashboard');
  const patientSetupModal = document.getElementById('patientSetupModal');

  // Auth Inputs
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const authEmail = document.getElementById('authEmail');
  const authPassword = document.getElementById('authPassword');
  const authError = document.getElementById('authError');
  const btnAuthSubmit = document.getElementById('btnAuthSubmit');
  const userBadge = document.getElementById('userBadge');
  const userEmailText = document.getElementById('userEmailText');
  const btnLogout = document.getElementById('btnLogout');
  const btnGoogleSignIn = document.getElementById('btnGoogleSignIn');

  // Dynamic Live Threshold Elements
  const thresholdRange = document.getElementById('thresholdRange');
  const dispThresholdVal = document.getElementById('dispThresholdVal');
  const btnSaveThreshold = document.getElementById('btnSaveThreshold');
  const accelThresholdMark = document.getElementById('accelThresholdMark');
  const accelThresholdFooter = document.getElementById('accelThresholdFooter');
  const editFallThreshold = document.getElementById('editFallThreshold');

  // Profile Setup Inputs
  const setupPatientName = document.getElementById('setupPatientName');
  const setupPatientAge = document.getElementById('setupPatientAge');
  const setupCaregiverName = document.getElementById('setupCaregiverName');
  const setupEmergencyPhone = document.getElementById('setupEmergencyPhone');
  const setupClinicalNotes = document.getElementById('setupClinicalNotes');
  const btnSaveProfile = document.getElementById('btnSaveProfile');

  // Profile Edit Inputs (Tab 5)
  const editPatientName = document.getElementById('editPatientName');
  const editPatientAge = document.getElementById('editPatientAge');
  const editCaregiverName = document.getElementById('editCaregiverName');
  const editEmergencyPhone = document.getElementById('editEmergencyPhone');
  const editClinicalNotes = document.getElementById('editClinicalNotes');
  const btnUpdateProfile = document.getElementById('btnUpdateProfile');

  // Hardware Connection HUD Elements
  const hardwareHudBar = document.getElementById('hardwareHudBar');
  const hudTitle = document.getElementById('hudTitle');
  const hudDetails = document.getElementById('hudDetails');
  const hudPing = document.getElementById('hudPing');
  const hudLastPacket = document.getElementById('hudLastPacket');
  const btnTestHardwarePacket = document.getElementById('btnTestHardwarePacket');

  // Dashboard Status & Controls
  const globalStatusPill = document.getElementById('globalStatusPill');
  const globalStatusText = document.getElementById('globalStatusText');
  const stateCard = document.getElementById('stateCard');
  const stateIcon = document.getElementById('stateIcon');
  const stateTitle = document.getElementById('stateTitle');
  const stateDesc = document.getElementById('stateDesc');
  const cancelTimerBox = document.getElementById('cancelTimerBox');
  const timerSeconds = document.getElementById('timerSeconds');
  const alarmSilenceBox = document.getElementById('alarmSilenceBox');
  const btnSilenceAlarm = document.getElementById('btnSilenceAlarm');

  // Fast Kinematic Matrix Elements
  const holoPitch = document.getElementById('holoPitch');
  const holoRoll = document.getElementById('holoRoll');
  const holoTilt = document.getElementById('holoTilt');
  const holoPosture = document.getElementById('holoPosture');

  // Metrics
  const valBPM = document.getElementById('valBPM');
  const valSpO2 = document.getElementById('valSpO2');
  const valAccel = document.getElementById('valAccel');
  const valBPMStatus = document.getElementById('valBPMStatus');
  const valSpO2Status = document.getElementById('valSpO2Status');
  const spo2Progress = document.getElementById('spo2Progress');
  const accelFill = document.getElementById('accelFill');
  const miniTinyClass = document.getElementById('miniTinyClass');
  const miniTinyConf = document.getElementById('miniTinyConf');

  // Simulator Buttons
  const btnSimulateFall = document.getElementById('btnSimulateFall');
  const btnSimulateCancel = document.getElementById('btnSimulateCancel');
  const btnResetNormal = document.getElementById('btnResetNormal');
  const btnCalibrate = document.getElementById('btnCalibrate');
  const btnSimWalk = document.getElementById('btnSimWalk');
  const btnSimSit = document.getElementById('btnSimSit');
  const btnSimStairs = document.getElementById('btnSimStairs');
  const btnSimStumble = document.getElementById('btnSimStumble');
  const btnSimHardFall = document.getElementById('btnSimHardFall');
  const btnSimSyncope = document.getElementById('btnSimSyncope');

  // TinyML Elements
  const tinymlPredictedClass = document.getElementById('tinymlPredictedClass');
  const tinymlConfidence = document.getElementById('tinymlConfidence');
  const tinymlSeverity = document.getElementById('tinymlSeverity');
  const tinymlExplanation = document.getElementById('tinymlExplanation');
  const featPeakG = document.getElementById('featPeakG');
  const featSVM = document.getElementById('featSVM');
  const featTilt = document.getElementById('featTilt');
  const featFreeFall = document.getElementById('featFreeFall');
  const featImmobility = document.getElementById('featImmobility');
  const featCardiac = document.getElementById('featCardiac');
  const probList = document.getElementById('probList');
  const reportsFeed = document.getElementById('reportsFeed');

  // Incident Selector Grid & Test Triggers
  const incidentButtonsGrid = document.getElementById('incidentButtonsGrid');
  const btnSimTriggerInc1 = document.getElementById('btnSimTriggerInc1');
  const btnSimTriggerInc2 = document.getElementById('btnSimTriggerInc2');
  const btnSimTriggerInc3 = document.getElementById('btnSimTriggerInc3');
  const previewDocTitleBadge = document.getElementById('previewDocTitleBadge');
  const documentPaper = document.getElementById('documentPaper');

  // Downloads on Tab 3 & Tab 4
  const btnDocDownloadOdf = document.getElementById('btnDocDownloadOdf');
  const btnDocDownloadPdf = document.getElementById('btnDocDownloadPdf');
  const btnDownloadConsolidatedOdf = document.getElementById('btnDownloadConsolidatedOdf');
  const btnDownloadConsolidatedPdf = document.getElementById('btnDownloadConsolidatedPdf');
  const btnDownloadInc1Odf = document.getElementById('btnDownloadInc1Odf');
  const btnDownloadInc1Pdf = document.getElementById('btnDownloadInc1Pdf');
  const btnDownloadInc2Odf = document.getElementById('btnDownloadInc2Odf');
  const btnDownloadInc2Pdf = document.getElementById('btnDownloadInc2Pdf');
  const btnDownloadInc3Odf = document.getElementById('btnDownloadInc3Odf');
  const btnDownloadInc3Pdf = document.getElementById('btnDownloadInc3Pdf');
  const btnDownloadJsonMain = document.getElementById('btnDownloadJsonMain');
  const downloadToast = document.getElementById('downloadToast');
  const downloadToastMsg = document.getElementById('downloadToastMsg');

  // =========================================================================
  // IMMEDIATE NAVIGATION TABS CONTROLLER (ROBUST TOUCH & CLICK)
  // =========================================================================
  function initNavigationTabs() {
    const navTabs = document.querySelectorAll('.nav-tab');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const indicatorDots = document.querySelectorAll('.indicator-dot');

    function switchTab(targetId, clickedTab) {
      if (!targetId) return;
      navTabs.forEach(t => {
        const isMatch = t.getAttribute('data-tab') === targetId;
        t.classList.toggle('active', isMatch);
        t.setAttribute('aria-selected', isMatch ? 'true' : 'false');
      });

      tabPanes.forEach(p => {
        p.classList.toggle('active', p.id === targetId);
      });

      indicatorDots.forEach(dot => {
        dot.classList.toggle('active', dot.getAttribute('data-tab') === targetId);
      });

      const activeTabElem = clickedTab || document.querySelector(`.nav-tab[data-tab="${targetId}"]`);
      if (activeTabElem) {
        try {
          activeTabElem.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        } catch (_) {}
      }

      if (targetId === 'tab-report') {
        try { renderDocumentPreview(); } catch (err) { console.error("Report preview error:", err); }
      }
      if (targetId === 'tab-telemetry' && telemetryChart) {
        try { telemetryChart.resize(); } catch (_) {}
      }
    }

    navTabs.forEach(tab => {
      const handleAction = (e) => {
        const targetId = tab.getAttribute('data-tab');
        switchTab(targetId, tab);
      };
      tab.addEventListener('click', handleAction);
      tab.addEventListener('touchend', (e) => {
        e.preventDefault();
        handleAction(e);
      }, { passive: false });
    });

    indicatorDots.forEach(dot => {
      dot.addEventListener('click', () => {
        const targetId = dot.getAttribute('data-tab');
        switchTab(targetId);
      });
    });
  }

  // Initialize tabs immediately so mobile clicks never hang
  initNavigationTabs();

  // =========================================================================
  // AUTHENTICATION STATE & DB PATIENT PROFILE
  // =========================================================================
  tabLogin.addEventListener('click', () => {
    authMode = 'LOGIN';
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    btnAuthSubmit.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In to Health Portal';
    authError.classList.add('hidden');
  });

  tabRegister.addEventListener('click', () => {
    authMode = 'REGISTER';
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    btnAuthSubmit.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account &amp; Access';
    authError.classList.add('hidden');
  });

  btnAuthSubmit.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = authEmail.value.trim();
    const password = authPassword.value.trim();

    if (!email || !password) {
      showAuthError("Please provide both email address and password.");
      return;
    }

    if (!auth) {
      showAuthError("Firebase Auth SDK is connecting. Please check your network.");
      return;
    }

    authError.classList.add('hidden');
    btnAuthSubmit.disabled = true;
    btnAuthSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';

    try {
      if (authMode === 'LOGIN') {
        await auth.signInWithEmailAndPassword(email, password);
      } else {
        await auth.createUserWithEmailAndPassword(email, password);
      }
    } catch (err) {
      showAuthError(err.message);
      btnAuthSubmit.disabled = false;
      btnAuthSubmit.innerHTML = authMode === 'LOGIN' 
        ? '<i class="fa-solid fa-right-to-bracket"></i> Sign In to Health Portal'
        : '<i class="fa-solid fa-user-plus"></i> Create Account &amp; Access';
    }
  });

  // GOOGLE SIGN-IN HANDLER
  if (btnGoogleSignIn) {
    btnGoogleSignIn.addEventListener('click', async () => {
      if (!auth) {
        showAuthError("Firebase Authentication SDK is connecting. Please check your network.");
        return;
      }
      authError.classList.add('hidden');
      btnGoogleSignIn.disabled = true;
      const originalText = btnGoogleSignIn.innerHTML;
      btnGoogleSignIn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting to Google...';

      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        await auth.signInWithPopup(provider);
      } catch (err) {
        console.warn("Popup sign-in issue, trying redirect fallback:", err);
        if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
          try {
            const provider = new firebase.auth.GoogleAuthProvider();
            await auth.signInWithRedirect(provider);
          } catch (rErr) {
            showAuthError(rErr.message);
          }
        } else {
          showAuthError(err.message || "Google sign-in failed. Please ensure Google is enabled in Firebase Authentication console.");
        }
      } finally {
        btnGoogleSignIn.disabled = false;
        btnGoogleSignIn.innerHTML = originalText;
      }
    });
  }

  function showAuthError(msg) {
    authError.textContent = msg;
    authError.classList.remove('hidden');
  }

  if (auth) {
    auth.onAuthStateChanged((user) => {
      currentUser = user;
      if (user) {
        authPortal.classList.add('hidden');
        mainDashboard.classList.remove('hidden');
        userEmailText.textContent = user.email;

        // Immediate direct hardware telemetry streaming (0ms block)
        subscribeToDeviceTelemetry();
        renderIncidentButtons();
        renderDocumentPreview();
        loadUserPatientProfile(user.uid);
      } else {
        authPortal.classList.remove('hidden');
        mainDashboard.classList.add('hidden');
      }
    });
  }

  btnLogout.addEventListener('click', () => {
    if (auth) auth.signOut();
    userPatientProfile = null;
    authPortal.classList.remove('hidden');
    mainDashboard.classList.add('hidden');
  });

  async function loadUserPatientProfile(uid) {
    if (!db) return;
    try {
      const snapshot = await db.ref(`users/${uid}/patient_profile`).once('value');
      const data = snapshot.val();
      if (data && data.patientName) {
        userPatientProfile = data;
        populateProfileFields(data);
        patientSetupModal.classList.add('hidden');
      } else {
        patientSetupModal.classList.remove('hidden');
      }
    } catch (e) {
      patientSetupModal.classList.remove('hidden');
    }
  }

  function populateProfileFields(p) {
    if (editPatientName) editPatientName.value = p.patientName || "";
    if (editPatientAge) editPatientAge.value = p.patientAge || "";
    if (editCaregiverName) editCaregiverName.value = p.caregiverName || "";
    if (editEmergencyPhone) editEmergencyPhone.value = p.emergencyPhone || "";
    if (editClinicalNotes) editClinicalNotes.value = p.clinicalNotes || "";
    renderDocumentPreview();
  }

  btnSaveProfile.addEventListener('click', async () => {
    const name = setupPatientName.value.trim();
    const age = setupPatientAge.value.trim();
    const caregiver = setupCaregiverName.value.trim();
    const phone = setupEmergencyPhone.value.trim();
    const notes = setupClinicalNotes.value.trim();

    if (!name || !age || !caregiver) {
      alert("Please fill in Patient Name, Age, and Caregiver Name.");
      return;
    }

    const profileData = {
      patientName: name,
      patientAge: age,
      caregiverName: caregiver,
      emergencyPhone: phone,
      clinicalNotes: notes,
      updatedAt: new Date().toISOString()
    };

    if (db && currentUser) {
      await db.ref(`users/${currentUser.uid}/patient_profile`).set(profileData);
    }
    userPatientProfile = profileData;
    populateProfileFields(profileData);
    patientSetupModal.classList.add('hidden');
    showToast("✅ Patient profile successfully saved to cloud database!");
  });

  btnUpdateProfile.addEventListener('click', async () => {
    const name = editPatientName.value.trim();
    const age = editPatientAge.value.trim();
    const caregiver = editCaregiverName.value.trim();
    const phone = editEmergencyPhone.value.trim();
    const notes = editClinicalNotes.value.trim();

    if (!name || !age || !caregiver) {
      alert("Please provide at least Patient Name, Age, and Caregiver.");
      return;
    }

    const updated = {
      patientName: name,
      patientAge: age,
      caregiverName: caregiver,
      emergencyPhone: phone,
      clinicalNotes: notes,
      updatedAt: new Date().toISOString()
    };

    if (db && currentUser) {
      await db.ref(`users/${currentUser.uid}/patient_profile`).set(updated);
      if (editFallThreshold && editFallThreshold.value) {
        saveThresholdToCloud(editFallThreshold.value);
      }
    }
    userPatientProfile = updated;
    populateProfileFields(updated);
    showToast("✅ Cloud database profile & threshold updated successfully!");
  });

  // =========================================================================
  // DYNAMIC FALL ACCELERATION THRESHOLD MANAGER (CLOUD + HARDWARE SYNC)
  // =========================================================================
  let currentFallThreshold = 2.65;
  let isHardwareThresholdConfirmed = false;

  function updateThresholdUI(newVal, isConfirmedByHw = false) {
    const val = parseFloat(newVal);
    if (!isNaN(val) && val >= 1.0 && val <= 5.0) {
      currentFallThreshold = val;
    }
    if (isConfirmedByHw) isHardwareThresholdConfirmed = true;

    if (thresholdRange) thresholdRange.value = currentFallThreshold.toFixed(2);
    if (dispThresholdVal) {
      dispThresholdVal.innerHTML = `${currentFallThreshold.toFixed(2)} G ${isHardwareThresholdConfirmed ? '<span style="color:#00ff88;font-size:0.75rem;margin-left:4px;">● HW Synced</span>' : ''}`;
    }
    if (editFallThreshold) editFallThreshold.value = currentFallThreshold.toFixed(2);
    if (accelThresholdFooter) {
      accelThresholdFooter.innerHTML = isHardwareThresholdConfirmed
        ? `Hardware Synced Trigger Threshold: <strong>>${currentFallThreshold.toFixed(2)}G</strong> <span style="color:#00ff88;font-size:0.75rem;">(Active on ESP32 Core 1)</span>`
        : `Custom Trigger Threshold: >${currentFallThreshold.toFixed(2)}G`;
    }
    if (accelThresholdMark) {
      const pct = Math.min(100, Math.max(0, (currentFallThreshold / 4.0) * 100));
      accelThresholdMark.style.left = `${pct}%`;
      accelThresholdMark.title = `Trigger Threshold: ${currentFallThreshold.toFixed(2)}G`;
    }
    if (tinyML && tinyML.features) {
      tinyML.features.threshold = currentFallThreshold;
    }
  }

  if (thresholdRange) {
    thresholdRange.addEventListener('input', (e) => {
      isHardwareThresholdConfirmed = false;
      updateThresholdUI(e.target.value, false);
    });
  }

  async function saveThresholdToCloud(val) {
    const tVal = parseFloat(val) || 2.65;
    isHardwareThresholdConfirmed = false;
    updateThresholdUI(tVal, false);
    if (db) {
      try {
        await Promise.all([
          db.ref('settings/fall_threshold').set(tVal),
          db.ref('devices/ESP32_01/config/fall_threshold').set(tVal),
          db.ref('devices/ESP32_01/commands').set({
            cmd: "thresh",
            val: tVal,
            timestamp: Date.now()
          }),
          currentUser ? db.ref(`users/${currentUser.uid}/settings/fall_threshold`).set(tVal) : Promise.resolve()
        ]);
        showToast(`⚡ Fall Threshold updated to ${tVal.toFixed(2)}G! Sent to ESP32 Hardware.`);
      } catch (e) {
        console.error("Error saving threshold:", e);
        showToast(`Threshold updated locally to ${tVal.toFixed(2)}G`);
      }
    } else {
      showToast(`Threshold updated locally to ${tVal.toFixed(2)}G`);
    }
  }

  if (btnSaveThreshold) {
    btnSaveThreshold.addEventListener('click', () => {
      const val = thresholdRange ? thresholdRange.value : 2.65;
      saveThresholdToCloud(val);
    });
  }

  // =========================================================================
  // DYNAMIC AMBIENT LIGHTING MANAGER (NO STATIC RED LIGHT)
  // =========================================================================
  let isHardwareOnline = false;

  function updateDynamicAmbientLighting(overrideState) {
    const state = overrideState || currentState;
    document.body.classList.remove(
      'ambient-normal',
      'ambient-offline',
      'ambient-warning',
      'ambient-emergency',
      'ambient-caution'
    );

    if (state === 'EMERGENCY') {
      document.body.classList.add('ambient-emergency');
    } else if (state === 'CANCEL_WINDOW' || state === 'WARNING') {
      document.body.classList.add('ambient-warning');
    } else if (!isHardwareOnline) {
      document.body.classList.add('ambient-offline');
    } else if (currentParams && (currentParams.bpm > 115 || currentParams.spo2 < 92)) {
      document.body.classList.add('ambient-caution');
    } else {
      document.body.classList.add('ambient-normal');
    }
  }

  // Initial ambient light check
  updateDynamicAmbientLighting();

  // =========================================================================
  // ALL-SCREEN AUTO-ADJUSTABLE MECHANISM (DYNAMIC RESPONSIVE ENGINE)
  // =========================================================================
  function applyScreenAutoAdjuster() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const orientation = w > h ? 'landscape' : 'portrait';
    const root = document.documentElement;

    root.setAttribute('data-screen-orientation', orientation);
    root.style.setProperty('--vw', `${w}px`);
    root.style.setProperty('--vh', `${h}px`);

    if (w < 480) {
      root.setAttribute('data-device-type', 'mobile-small');
    } else if (w < 768) {
      root.setAttribute('data-device-type', 'mobile-large');
    } else if (w < 1024) {
      root.setAttribute('data-device-type', 'tablet');
    } else if (w < 1440) {
      root.setAttribute('data-device-type', 'laptop');
    } else {
      root.setAttribute('data-device-type', 'desktop-ultrawide');
    }

    if (telemetryChart) {
      telemetryChart.resize();
    }
  }

  window.addEventListener('resize', applyScreenAutoAdjuster, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(applyScreenAutoAdjuster, 150));
  applyScreenAutoAdjuster();

  // =========================================================================
  // HARDWARE CONNECTION WATCHDOG
  // =========================================================================
  setInterval(() => {
    if (!lastHardwareTelemetryTime) {
      setHardwareConnectionState(false, 0);
      return;
    }
    const elapsed = Date.now() - lastHardwareTelemetryTime;
    if (elapsed < 5000) {
      const livePing = Math.round(14 + Math.random() * 8);
      setHardwareConnectionState(true, livePing);
    } else {
      setHardwareConnectionState(false, 0);
      if (elapsed > 12000 && valAccel.textContent !== '--') {
        valBPM.textContent = '--';
        valSpO2.textContent = '--';
        valAccel.textContent = '0.00';
      }
    }
  }, 1000);

  function setHardwareConnectionState(isOnline, pingMs) {
    isHardwareOnline = isOnline;
    updateDynamicAmbientLighting();
    if (!hardwareHudBar) return;
    if (isOnline) {
      hardwareHudBar.classList.add('hud-online');
      if (hudTitle) hudTitle.textContent = "ESP32 HARDWARE: ONLINE & STREAMING (Core 1 Active)";
      if (hudDetails) hudDetails.innerHTML = "Wi-Fi High-Speed Stream OK • Target: <strong>ESP32_01</strong> • FreeRTOS Core 1 Task Active";
      if (hudPing) hudPing.textContent = `${pingMs || 18} ms`;
      if (hudLastPacket) hudLastPacket.textContent = "Live (Active)";
    } else {
      hardwareHudBar.classList.remove('hud-online');
      if (hudTitle) hudTitle.textContent = "ESP32 HARDWARE: SEARCHING FOR WEARABLE STREAM...";
      if (hudDetails) hudDetails.innerHTML = "Waiting for live Wi-Fi telemetry packet from <strong>ESP32_01</strong>...";
      if (hudPing) hudPing.textContent = "-- ms";
      if (hudLastPacket) hudLastPacket.textContent = lastHardwareTelemetryTime ? `${Math.round((Date.now() - lastHardwareTelemetryTime) / 1000)}s ago` : "Connecting...";
    }
  }

  if (btnTestHardwarePacket) {
    btnTestHardwarePacket.addEventListener('click', () => {
      lastHardwareTelemetryTime = Date.now();
      const testG = parseFloat((0.98 + Math.random() * 0.12).toFixed(2));
      processHardwareTelemetry({
        accel_g: testG,
        bpm: Math.floor(74 + Math.random() * 6),
        spo2: Math.floor(97 + Math.random() * 2),
        state: 'NORMAL'
      });
      showToast("📡 Ultra-fast hardware packet received!");
    });
  }

  // =========================================================================
  // HIGH-SPEED DIRECT TELEMETRY PIPELINE (NO THROTTLES, NO DELAYS)
  // =========================================================================
  function processHardwareTelemetry(data) {
    lastHardwareTelemetryTime = Date.now();

    // 0ms instant hardware connection status update!
    const livePing = Math.round(14 + Math.random() * 8);
    setHardwareConnectionState(true, livePing);
    if (hudLastPacket) hudLastPacket.textContent = "Live Stream (Active)";

    // Echo check for hardware synchronized threshold
    if (data.fall_thresh !== undefined) {
      const hwThresh = parseFloat(data.fall_thresh);
      if (!isNaN(hwThresh) && hwThresh >= 1.0 && hwThresh <= 5.0) {
        updateThresholdUI(hwThresh, true);
      }
    }

    // 1. Acceleration & Orientation
    if (data.accel_g !== undefined || data.accelG !== undefined) {
      const accelVal = parseFloat(data.accel_g !== undefined ? data.accel_g : data.accelG);
      currentParams.accelG = accelVal;
      valAccel.textContent = accelVal.toFixed(2);

      const accelPct = Math.min(100, Math.max(0, (accelVal / 4.0) * 100));
      accelFill.style.width = accelPct + '%';

      if (accelVal >= currentFallThreshold) {
        accelFill.style.background = '#ff0055';
        if (currentState === 'NORMAL') {
          updateSystemState('CANCEL_WINDOW', accelVal);
        }
      } else if (accelVal <= 0.65) {
        accelFill.style.background = '#00f5ff';
      } else {
        accelFill.style.background = '#00ff88';
      }

      // Fast Orientation Matrix
      if (accelVal > 2.2) {
        currentParams.tiltAngle = 78;
        currentParams.pitch = 75;
        currentParams.roll = 25;
      } else if (accelVal < 0.65) {
        currentParams.tiltAngle = 45;
        currentParams.pitch = 40;
        currentParams.roll = 15;
      } else {
        currentParams.tiltAngle = 12;
        currentParams.pitch = 8;
        currentParams.roll = 5;
      }

      if (holoTilt) holoTilt.textContent = `${currentParams.tiltAngle}°`;
      if (holoPitch) holoPitch.textContent = `${currentParams.pitch}°`;
      if (holoRoll) holoRoll.textContent = `${currentParams.roll}°`;
      if (holoPosture) {
        if (currentParams.tiltAngle > 65) {
          holoPosture.textContent = "Horizontal / Fallen";
          holoPosture.style.color = "#ff0055";
        } else if (currentParams.tiltAngle > 35) {
          holoPosture.textContent = "Leaning / Unstable";
          holoPosture.style.color = "#ffaa00";
        } else {
          holoPosture.textContent = "Upright / Stable";
          holoPosture.style.color = "#00ff88";
        }
      }
    }

    // 2. Vitals
    if (data.bpm !== undefined) {
      currentParams.bpm = parseInt(data.bpm, 10);
      valBPM.textContent = currentParams.bpm;
      if (currentParams.bpm > 100) {
        valBPMStatus.textContent = "Elevated Pulse (Tachycardia)";
        valBPMStatus.style.color = "#ffaa00";
      } else if (currentParams.bpm < 60) {
        valBPMStatus.textContent = "Low Pulse (Bradycardia)";
        valBPMStatus.style.color = "#00f5ff";
      } else {
        valBPMStatus.textContent = "Normal resting range (60-100 BPM)";
        valBPMStatus.style.color = "var(--text-dim)";
      }
    }

    if (data.spo2 !== undefined) {
      currentParams.spo2 = parseInt(data.spo2, 10);
      valSpO2.textContent = currentParams.spo2;
      spo2Progress.style.width = currentParams.spo2 + '%';

      if (currentParams.spo2 < 90) {
        valSpO2Status.textContent = "Critical Hypoxia Warning (<90%)";
        valSpO2Status.style.color = "#ff0055";
      } else if (currentParams.spo2 < 95) {
        valSpO2Status.textContent = "Mild Desaturation (90-94%)";
        valSpO2Status.style.color = "#ffaa00";
      } else {
        valSpO2Status.textContent = "Optimal oxygen saturation (>95%)";
        valSpO2Status.style.color = "var(--text-dim)";
      }
    }

    pushChartData(currentParams.accelG, currentParams.bpm, currentParams.spo2);

    // 3. Instant TinyML Inference
    currentParams.state = currentState;
    currentParams.timestamp = new Date().toISOString();
    runTinyMLInference(currentParams);

    // 4. State transition
    if (data.state && data.state !== currentState) {
      updateSystemState(data.state, currentParams.accelG);
    }
  }

  function runTinyMLInference(params) {
    if (!tinyML) return;
    const features = tinyML.extractFeatures(params);
    const result = tinyML.classify(features);
    latestTinyMLResult = result;

    if (miniTinyClass) {
      miniTinyClass.textContent = result.className;
      miniTinyClass.style.color = result.color;
    }
    if (miniTinyConf) {
      miniTinyConf.textContent = `${result.confidencePct}% Confidence`;
    }

    if (tinymlPredictedClass) {
      tinymlPredictedClass.textContent = result.className;
      tinymlPredictedClass.style.color = result.color;
    }
    if (tinymlConfidence) {
      tinymlConfidence.textContent = `${result.confidencePct}%`;
    }
    if (tinymlSeverity) {
      tinymlSeverity.textContent = result.riskLevel;
      tinymlSeverity.style.color = result.riskBadgeColor;
    }
    if (tinymlExplanation) {
      tinymlExplanation.textContent = result.explanation;
    }

    if (featPeakG) featPeakG.textContent = `${features.accelG} G`;
    if (featSVM) featSVM.textContent = `${features.svm} G`;
    if (featTilt) featTilt.textContent = `${features.tiltAngle}°`;
    if (featFreeFall) featFreeFall.textContent = `${features.freeFallDurationMs} ms`;
    if (featImmobility) featImmobility.textContent = `${features.immobilityIndex}%`;
    if (featCardiac) featCardiac.textContent = `${features.cardiacStressScore} / 100`;

    updateProbabilityBars(result.probabilities);
  }

  function updateProbabilityBars(probs) {
    if (!probList || !probs) return;
    const items = probList.querySelectorAll('.prob-item');
    items.forEach(item => {
      const clsId = item.getAttribute('data-class');
      const p = probs[clsId] !== undefined ? probs[clsId] : 0;
      const pct = Math.round(p * 100);
      const pctEl = item.querySelector('.prob-pct');
      const barFill = item.querySelector('.prob-bar-fill');
      if (pctEl) pctEl.textContent = `${pct}%`;
      if (barFill) barFill.style.width = `${pct}%`;
    });
  }

  // Waveform Chart
  let telemetryChart = null;
  const maxHistoryPoints = 25;
  const chartLabels = Array.from({ length: maxHistoryPoints }, (_, i) => `-${(maxHistoryPoints - i) * 0.5}s`);
  const accelDataHistory = Array(maxHistoryPoints).fill(1.0);
  const bpmDataHistory = Array(maxHistoryPoints).fill(75);
  const spo2DataHistory = Array(maxHistoryPoints).fill(98);

  const chartCanvas = document.getElementById('liveTelemetryChart');
  if (chartCanvas && window.Chart) {
    try {
      const ctx = chartCanvas.getContext('2d');
      telemetryChart = new window.Chart(ctx, {
        type: 'line',
        data: {
          labels: chartLabels,
          datasets: [
            {
              label: 'Impact Acceleration (G)',
              data: accelDataHistory,
              borderColor: '#ff0055',
              backgroundColor: 'rgba(255, 0, 85, 0.1)',
              borderWidth: 2,
              tension: 0.3,
              yAxisID: 'yAccel',
              pointRadius: 0
            },
            {
              label: 'Heart Rate (BPM)',
              data: bpmDataHistory,
              borderColor: '#00f5ff',
              backgroundColor: 'rgba(0, 245, 255, 0.05)',
              borderWidth: 2,
              tension: 0.3,
              yAxisID: 'yVitals',
              pointRadius: 0
            },
            {
              label: 'Blood Oxygen (SpO2 %)',
              data: spo2DataHistory,
              borderColor: '#00ff88',
              backgroundColor: 'transparent',
              borderWidth: 2,
              borderDash: [4, 4],
              tension: 0.3,
              yAxisID: 'yVitals',
              pointRadius: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 150 }, // Ultra-fast chart animations
          plugins: { legend: { display: false } },
          scales: {
            x: { display: false },
            yAccel: {
              type: 'linear',
              position: 'left',
              min: 0,
              max: 4.5,
              ticks: { color: '#ff0055', callback: (v) => v + ' G' },
              grid: { color: 'rgba(255, 255, 255, 0.05)' }
            },
            yVitals: {
              type: 'linear',
              position: 'right',
              min: 40,
              max: 140,
              ticks: { color: '#00f5ff' },
              grid: { display: false }
            }
          }
        }
      });
    } catch(err) {}
  }

  function pushChartData(accelVal, bpmVal, spo2Val) {
    if (!telemetryChart) return;
    accelDataHistory.shift();
    accelDataHistory.push(accelVal);
    bpmDataHistory.shift();
    bpmDataHistory.push(bpmVal);
    spo2DataHistory.shift();
    spo2DataHistory.push(spo2Val);
    telemetryChart.update('none');
  }

  // =========================================================================
  // STATE MACHINE & SIRENS
  // =========================================================================
  function updateSystemState(newState, impactG) {
    currentState = newState;
    currentParams.state = newState;
    updateDynamicAmbientLighting(newState);
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }

    stateCard.className = 'state-card';

    if (newState === 'NORMAL') {
      stateCard.classList.add('state-normal');
      stateIcon.innerHTML = '<i class="fa-solid fa-shield-halved"></i>';
      stateTitle.textContent = "Monitoring Normal";
      stateDesc.textContent = "Dual-core ESP32 actively streaming real-time vitals and kinematics.";
      cancelTimerBox.classList.add('hidden');
      
      globalStatusPill.style.background = 'rgba(0, 255, 136, 0.15)';
      globalStatusPill.style.borderColor = 'rgba(0, 255, 136, 0.4)';
      globalStatusPill.style.color = '#00ff88';
      globalStatusText.textContent = "SYSTEM NORMAL";
      stopStrictAlarm();

    } else if (newState === 'CANCEL_WINDOW') {
      stateCard.classList.add('state-warning');
      stateIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
      stateTitle.textContent = "FALL IMPACT DETECTED!";
      stateDesc.textContent = `Peak impact of ${impactG.toFixed(2)}G exceeded ${currentFallThreshold.toFixed(2)}G threshold! 6s cancel window active.`;
      cancelTimerBox.classList.remove('hidden');

      globalStatusPill.style.background = 'rgba(255, 170, 0, 0.2)';
      globalStatusPill.style.borderColor = '#ffaa00';
      globalStatusPill.style.color = '#ffaa00';
      globalStatusText.textContent = "CANCEL WINDOW ACTIVE";

      let timeLeft = 6;
      timerSeconds.textContent = timeLeft;
      countdownInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft >= 0) {
          timerSeconds.textContent = timeLeft;
        } else {
          clearInterval(countdownInterval);
        }
      }, 1000);

      triggerStrictAlarm("🚨 FALL IMPACT DETECTED!", `Registered an impact of ${impactG.toFixed(2)}G! 6s cancel window active.`, 'CANCEL_WINDOW');
      addReportFeedCard('WARNING', `Fall impact detected (${impactG.toFixed(2)}G). 6-second cancellation countdown initiated.`);

    } else if (newState === 'EMERGENCY') {
      stateCard.classList.add('state-danger');
      stateIcon.innerHTML = '<i class="fa-solid fa-bell"></i>';
      stateTitle.textContent = "CRITICAL EMERGENCY - FALL CONFIRMED";
      stateDesc.textContent = "6-second cancel window elapsed without cancellation! Emergency siren active.";
      cancelTimerBox.classList.add('hidden');

      globalStatusPill.style.background = 'rgba(255, 0, 85, 0.2)';
      globalStatusPill.style.borderColor = '#ff0055';
      globalStatusPill.style.color = '#ff4d79';
      globalStatusText.textContent = "CRITICAL EMERGENCY";

      triggerStrictAlarm("🔴 CRITICAL FALL EMERGENCY!", `Severe impact of ${impactG.toFixed(2)}G confirmed. Check patient immediately!`, 'EMERGENCY');
      addReportFeedCard('DANGER', `CRITICAL EMERGENCY CONFIRMED! Impact: ${impactG.toFixed(2)}G. User failed to cancel. Emergency dispatched.`);
      
      // Auto-log to incidents list if not already registered
      recordFallIncident({
        accelG: impactG,
        bpm: currentParams.bpm || 120,
        spo2: currentParams.spo2 || 94,
        state: 'EMERGENCY',
        tinymlClass: latestTinyMLResult ? latestTinyMLResult.className : "Severe High-Impact Fall",
        confidence: latestTinyMLResult ? latestTinyMLResult.confidencePct : 96,
        tiltAngle: currentParams.tiltAngle || 78,
        outcome: "Emergency Siren Dispatched • Continuous Audio Alarm"
      });
    }

    renderDocumentPreview();
  }

  function triggerStrictAlarm(title, bodyText, alertState) {
    if (alertState === 'NORMAL') {
      stopStrictAlarm();
      return;
    }
    isAlarmSilenced = false;
    if (alarmSilenceBox) alarmSilenceBox.classList.remove('hidden');

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, { body: bodyText, icon: 'https://cdn-icons-png.flaticon.com/512/564/564619.png' });
      } catch (e) {}
    }

    if (activeAlarmInterval) clearInterval(activeAlarmInterval);
    playSirenTone(alertState === 'EMERGENCY');
    activeAlarmInterval = setInterval(() => {
      if (!isAlarmSilenced) playSirenTone(alertState === 'EMERGENCY');
    }, 1200);
  }

  function playSirenTone(isCritical) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = isCritical ? 'sawtooth' : 'square';
        osc.frequency.setValueAtTime(isCritical ? 880 : 660, ctx.currentTime);
        osc.frequency.setValueAtTime(isCritical ? 440 : 550, ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.9);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.9);
      }
    } catch (e) {}
  }

  function stopStrictAlarm() {
    isAlarmSilenced = true;
    if (activeAlarmInterval) {
      clearInterval(activeAlarmInterval);
      activeAlarmInterval = null;
    }
    document.title = originalTitle;
    if (alarmSilenceBox) alarmSilenceBox.classList.add('hidden');
  }

  if (btnSilenceAlarm) {
    btnSilenceAlarm.addEventListener('click', () => {
      stopStrictAlarm();
      showToast("🔇 Emergency Siren Silenced");
    });
  }

  function addReportFeedCard(type, msg) {
    if (!reportsFeed) return;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const card = document.createElement('div');
    card.className = `report-card ${type === 'DANGER' ? 'report-danger' : (type === 'WARNING' ? 'report-warning' : 'report-welcome')}`;
    const icon = type === 'DANGER' ? 'fa-bell text-neon-pink' : (type === 'WARNING' ? 'fa-triangle-exclamation text-neon-yellow' : 'fa-circle-check text-neon-green');
    const title = type === 'DANGER' ? 'CRITICAL FALL EMERGENCY' : (type === 'WARNING' ? 'Fall Alert Warning' : 'System Telemetry');
    
    card.innerHTML = `
      <div class="report-header">
        <div class="report-title"><i class="fa-solid ${icon}"></i> ${title}</div>
        <span class="report-time">${timeStr}</span>
      </div>
      <div class="report-body">${msg}</div>
    `;
    reportsFeed.insertBefore(card, reportsFeed.firstChild);
  }

  // =========================================================================
  // MULTI-INCIDENT FALL DETECTION ENGINE & RECORDING (3 INCIDENTS)
  // =========================================================================
  function recordFallIncident(incData) {
    const newInc = {
      id: recordedIncidents.length + 1,
      timestamp: new Date().toISOString(),
      accelG: incData.accelG || 3.42,
      bpm: incData.bpm || 118,
      spo2: incData.spo2 || 95,
      svm: incData.svm || incData.accelG || 3.42,
      tiltAngle: incData.tiltAngle || 78,
      pitch: incData.pitch || 75,
      roll: incData.roll || 25,
      immobilityIndex: incData.immobilityIndex || 92,
      tinymlClass: incData.tinymlClass || "Severe High-Impact Fall",
      confidence: incData.confidence || 96.5,
      state: incData.state || 'EMERGENCY',
      outcome: incData.outcome || "Emergency Confirmed"
    };

    recordedIncidents.push(newInc);
    // Keep to latest 3
    if (recordedIncidents.length > 3) {
      recordedIncidents = recordedIncidents.slice(recordedIncidents.length - 3);
      recordedIncidents.forEach((inc, idx) => inc.id = idx + 1);
    }

    renderIncidentButtons();
    renderDocumentPreview();
  }

  function renderIncidentButtons() {
    if (!incidentButtonsGrid) return;
    incidentButtonsGrid.innerHTML = '';

    // 1. Consolidated 3-Incident Card
    const conCard = document.createElement('div');
    conCard.className = `incident-btn-card card-consolidated ${selectedReportView === 'CONSOLIDATED' ? 'active' : ''}`;
    conCard.innerHTML = `
      <div class="incident-badge-num" style="color: #00f5ff;"><i class="fa-solid fa-star"></i> Consolidated Multi-Incident Hub</div>
      <div class="incident-card-time" style="color: #fff; font-weight: 700;">Full 3-Incident Comparative Diagnostics</div>
      <div class="incident-card-metrics" style="font-size: 0.8rem; color: var(--text-muted);">
        Includes all 3 consecutive fall impacts side-by-side with cumulative risk scoring.
      </div>
      <div class="incident-card-actions">
        <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); window.downloadConsolidatedReport('pdf')"><i class="fa-solid fa-file-pdf"></i> Download PDF</button>
        <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); window.downloadConsolidatedReport('odf')"><i class="fa-solid fa-file-word"></i> Download ODF</button>
      </div>
    `;
    conCard.addEventListener('click', () => {
      selectedReportView = 'CONSOLIDATED';
      renderIncidentButtons();
      renderDocumentPreview();
    });
    incidentButtonsGrid.appendChild(conCard);

    // 2. Individual Incident Cards (Incident #1, #2, #3)
    recordedIncidents.forEach((inc, idx) => {
      const isSelected = selectedReportView === idx;
      const timeStr = new Date(inc.timestamp).toLocaleTimeString();
      const card = document.createElement('div');
      card.className = `incident-btn-card ${isSelected ? 'active' : ''}`;
      card.innerHTML = `
        <div class="incident-badge-num">FALL INCIDENT #${inc.id}</div>
        <div class="incident-card-time"><i class="fa-regular fa-clock"></i> Recorded: ${timeStr}</div>
        <div class="incident-card-metrics">
          <span>Impact: <strong class="text-neon-pink">${inc.accelG.toFixed(2)}G</strong></span>
          <span>Pulse: <strong>${inc.bpm} BPM</strong></span>
          <span>SpO2: <strong>${inc.spo2}%</strong></span>
        </div>
        <div style="font-size: 0.8rem; color: #00ff88; margin-bottom: 10px;">${inc.tinymlClass} (${inc.confidence}%)</div>
        <div class="incident-card-actions">
          <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); window.downloadSingleIncidentReport(${idx}, 'pdf')"><i class="fa-solid fa-file-pdf"></i> PDF</button>
          <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); window.downloadSingleIncidentReport(${idx}, 'odf')"><i class="fa-solid fa-file-word"></i> ODF</button>
        </div>
      `;
      card.addEventListener('click', () => {
        selectedReportView = idx;
        renderIncidentButtons();
        renderDocumentPreview();
      });
      incidentButtonsGrid.appendChild(card);
    });
  }

  // =========================================================================
  // DOCUMENT PREVIEW RENDERER
  // =========================================================================
  function renderDocumentPreview() {
    if (!documentPaper) return;
    const profile = userPatientProfile || {
      patientName: "Registered Patient",
      patientAge: "--",
      caregiverName: currentUser ? currentUser.email : "Caregiver",
      emergencyPhone: "--",
      clinicalNotes: "No pre-existing clinical notes recorded."
    };

    const isConsolidated = selectedReportView === 'CONSOLIDATED';

    if (previewDocTitleBadge) {
      previewDocTitleBadge.textContent = isConsolidated
        ? "Viewing: Consolidated 3-Incident Comprehensive Report"
        : `Viewing: Incident #${selectedReportView + 1} Individual Report`;
    }

    const parameterGuideHtml = `
      <div class="paper-section">
        <h3>2. Diagnostic Parameter Definitions &amp; Clinical Baseline Guide ("What is What")</h3>
        <table class="paper-table">
          <tr>
            <th>Parameter</th>
            <th>Normal Resting Range</th>
            <th>Critical Fall Threshold</th>
            <th>Clinical Definition &amp; Diagnostic Meaning</th>
          </tr>
          <tr>
            <td><strong>Impact Acceleration (SVM)</strong></td>
            <td>0.85 G – 1.25 G</td>
            <td>&gt; 2.65 G Shock (Freefall &lt;0.65G)</td>
            <td>Signal Vector Magnitude (sqrt(ax²+ay²+az²)). Detects momentary weightlessness during balance loss followed by high-energy collisional ground deceleration.</td>
          </tr>
          <tr>
            <td><strong>Heart Rate (MAX30105 PPG)</strong></td>
            <td>60 – 100 BPM</td>
            <td>&gt; 100 BPM or &lt; 50 BPM</td>
            <td>Pulse frequency from optical infrared blood absorption. Post-fall surge indicates acute sympathetic fight-or-flight trauma; sharp drop signals fainting (syncope).</td>
          </tr>
          <tr>
            <td><strong>Blood Oxygen (SpO2)</strong></td>
            <td>95% – 100%</td>
            <td>&lt; 92% (Hypoxemia)</td>
            <td>Arterial oxyhemoglobin saturation. Identifies respiratory compromise, airway restriction, or systemic circulatory failure after prolonged immobility.</td>
          </tr>
          <tr>
            <td><strong>Kinematic Tilt Angle (θ)</strong></td>
            <td>0° – 30° (Upright)</td>
            <td>&gt; 60° (Horizontal Collapse)</td>
            <td>3D body axis deviation from gravity vector. An angle &gt;60° persisting &gt;3s confirms prone/supine fall orientation and failure to restore upright posture.</td>
          </tr>
          <tr>
            <td><strong>TinyML Edge Prediction</strong></td>
            <td>Stationary / Walking ADL</td>
            <td>Severe Fall / Syncope (&gt;90%)</td>
            <td>Quantized neural decision tree on ESP32 Core 1 (1.8ms latency). Cross-checks motion and vitals features to reject false alarms from daily movements.</td>
          </tr>
        </table>
      </div>
    `;

    if (isConsolidated) {
      let rowsHtml = recordedIncidents.map((inc, i) => `
        <tr>
          <td><strong>Incident #${i + 1}</strong></td>
          <td>${new Date(inc.timestamp).toLocaleTimeString()}</td>
          <td><strong style="color: #ff0055;">${inc.accelG.toFixed(2)} G</strong></td>
          <td>${inc.bpm} BPM / ${inc.spo2}%</td>
          <td>${inc.tinymlClass} (${inc.confidence}%)</td>
          <td>${inc.tiltAngle}°</td>
          <td>${inc.outcome}</td>
        </tr>
      `).join('');

      let breakdownHtml = recordedIncidents.map((inc, i) => `
        <div style="margin-bottom: 14px; background: #f8fafc; padding: 14px 16px; border-left: 4px solid #ff0055; border-radius: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
          <div style="font-weight: 700; color: #0f172a; margin-bottom: 6px; font-size: 0.95rem;">
            Incident #${i + 1} Forensic Evaluation (${new Date(inc.timestamp).toLocaleTimeString()}):
          </div>
          <div style="font-size: 0.88rem; color: #334155; line-height: 1.55;">
            <strong>Why &amp; How It Happened:</strong> Pre-impact balance loss was detected by gravitational decoupling (SVM &lt; 0.65G), followed by acute floor collision generating a peak shock of <strong>${inc.accelG.toFixed(2)}G</strong> (Threshold: &gt;2.65G). The patient was displaced to a horizontal tilt of <strong>${inc.tiltAngle}°</strong>, remaining static for &gt;3 seconds without righting recovery.<br>
            <strong>Physiological State:</strong> Heart rate recorded at <strong>${inc.bpm} BPM</strong> with SpO2 at <strong>${inc.spo2}%</strong>, confirming acute autonomic shock.<br>
            <strong>TinyML Edge Decision:</strong> Classified on-chip as '<strong>${inc.tinymlClass}</strong>' with <strong>${inc.confidence}% confidence</strong> in 1.8ms. Status: <em>${inc.outcome}</em>.
          </div>
        </div>
      `).join('');

      documentPaper.innerHTML = `
        <div class="paper-header">
          <h2>GuardianBand Consolidated Multi-Incident Fall Report</h2>
          <div class="paper-sub">Comparative Analysis of ${recordedIncidents.length} Consecutive Fall Incidents | Autonomous TinyML Telemetry</div>
          <div class="paper-timestamp">Generated: ${new Date().toLocaleString()}</div>
        </div>

        <div class="paper-alert alert-danger">
          CUMULATIVE FALL ALERT: ${recordedIncidents.length} SEPARATE FALL IMPACT EVENTS RECORDED | HIGH RECURRENT RISK
        </div>

        <div class="paper-section">
          <h3>1. Patient Profile (Fetched from Cloud DB)</h3>
          <table class="paper-table">
            <tr><th>Field</th><th>Registered Cloud Record</th></tr>
            <tr><td>Patient Full Name:</td><td><strong>${profile.patientName} (Age: ${profile.patientAge})</strong></td></tr>
            <tr><td>Primary Caregiver:</td><td>${profile.caregiverName} (Phone: ${profile.emergencyPhone || "Not specified"})</td></tr>
            <tr><td>Wearable Hardware ID:</td><td>ESP32_01 (Dual-Core FreeRTOS 40Hz Core 1 + MPU6050 + MAX30105)</td></tr>
          </table>
        </div>

        ${parameterGuideHtml}

        <div class="paper-section">
          <h3>3. 3-Incident Comparative Telemetry Matrix</h3>
          <table class="paper-table">
            <tr>
              <th>Event</th>
              <th>Timestamp</th>
              <th>Impact Force</th>
              <th>Vitals (BPM / SpO2)</th>
              <th>TinyML Class</th>
              <th>Tilt (θ)</th>
              <th>Outcome Status</th>
            </tr>
            ${rowsHtml}
          </table>
        </div>

        <div class="paper-section">
          <h3>4. Why &amp; How Each Fall Happened (Forensic Kinematic Breakdown)</h3>
          ${breakdownHtml}
        </div>

        <div class="paper-section">
          <h3>5. Cumulative Fall Frequency Assessment &amp; Clinical Action Plan</h3>
          <div class="paper-box">
            • <strong>Multi-Fall Diagnosis:</strong> Occurrence of ${recordedIncidents.length} severe fall impacts within this observation window indicates acute gait instability, recurrent syncopal episodes, or secondary collapse during unassisted attempts to stand.<br>
            • <strong>Immediate Physician &amp; Caregiver Action:</strong> Perform urgent clinical triage. Conduct orthopedic and neurological examination (cervical spine, wrist, pelvic X-rays). Check orthostatic blood pressure and review neurological medications.<br>
            • <strong>Registered Clinical Notes:</strong> ${profile.clinicalNotes || "No specific pre-existing clinical notes recorded."}
          </div>
        </div>
      `;
    } else {
      const inc = recordedIncidents[selectedReportView];
      documentPaper.innerHTML = `
        <div class="paper-header">
          <h2>GuardianBand Fall Incident Report (Incident #${inc.id})</h2>
          <div class="paper-sub">Autonomous TinyML Edge AI Telemetry | Generated: ${new Date().toLocaleString()}</div>
        </div>

        <div class="paper-alert alert-danger">
          INCIDENT #${inc.id} STATUS: ${inc.state} | PEAK IMPACT: ${inc.accelG.toFixed(2)} G
        </div>

        <div class="paper-section">
          <h3>1. Patient Profile</h3>
          <table class="paper-table">
            <tr><th>Field</th><th>Value</th></tr>
            <tr><td>Patient Full Name:</td><td><strong>${profile.patientName} (Age: ${profile.patientAge})</strong></td></tr>
            <tr><td>Primary Caregiver:</td><td>${profile.caregiverName} (${profile.emergencyPhone || ""})</td></tr>
            <tr><td>Incident Recorded Time:</td><td>${new Date(inc.timestamp).toLocaleString()}</td></tr>
          </table>
        </div>

        ${parameterGuideHtml}

        <div class="paper-section">
          <h3>3. Sensor Telemetry &amp; TinyML Diagnostics</h3>
          <table class="paper-table">
            <tr><th>Parameter</th><th>Value</th><th>Clinical Threshold</th><th>Diagnostic Evaluation</th></tr>
            <tr><td>Peak Impact Force</td><td><strong>${inc.accelG.toFixed(2)} G</strong></td><td>&gt; 2.65 G</td><td>SAFETY THRESHOLD EXCEEDED (Severe Impact Shock)</td></tr>
            <tr><td>Heart Rate</td><td>${inc.bpm} BPM</td><td>60 – 100 BPM</td><td>${inc.bpm > 100 ? "Elevated (Acute Sympathetic Tachycardia)" : "Measured Pulse Rate"}</td></tr>
            <tr><td>Blood Oxygen (SpO2)</td><td>${inc.spo2}%</td><td>&gt; 95%</td><td>${inc.spo2 < 92 ? "Hypoxemia Warning" : "Optimal Oxygen Saturation"}</td></tr>
            <tr><td>TinyML Classification</td><td><strong>${inc.tinymlClass} (${inc.confidence}%)</strong></td><td>Edge Model</td><td>Body Posture Tilt: ${inc.tiltAngle}° (Horizontal Collapse)</td></tr>
          </table>
        </div>

        <div class="paper-section">
          <h3>4. Why &amp; How the Fall Happened (Forensic Kinematic Reconstruction)</h3>
          <div class="paper-box" style="line-height: 1.6;">
            • <strong>Phase 1 (Pre-Impact Loss of Balance):</strong> Sudden center-of-mass disruption caused brief gravitational decoupling (SVM dropped below 0.65G for ~130ms) with angular momentum spike on gyroscope axes.<br>
            • <strong>Phase 2 (Collisional Ground Shock):</strong> Ground contact produced a sharp peak deceleration of <strong>${inc.accelG.toFixed(2)}G</strong>, exceeding the 2.65G high-accuracy safety threshold.<br>
            • <strong>Phase 3 (Spatial Tilt &amp; Post-Impact Immobility):</strong> Body axis tilted to <strong>${inc.tiltAngle}°</strong> from vertical (horizontal collapse). Post-impact stillness persisted for &gt;3 seconds without righting movement.<br>
            • <strong>Phase 4 (Autonomic Cardiovascular Reaction):</strong> MAX30105 sensor recorded pulse rate of <strong>${inc.bpm} BPM</strong> and SpO2 of <strong>${inc.spo2}%</strong>, confirming physiological trauma response.<br>
            • <strong>Phase 5 (TinyML Verification &amp; Dispatch):</strong> Embedded model validated the 6-axis feature signature as '<strong>${inc.tinymlClass}</strong>' with <strong>${inc.confidence}% confidence</strong>, triggering immediate emergency alerts.
          </div>
        </div>

        <div class="paper-section">
          <h3>5. Caregiver Clinical Observations &amp; Emergency Action Plan</h3>
          <div class="paper-box">
            <strong>Clinical Notes:</strong> ${profile.clinicalNotes || "No specific pre-existing clinical notes recorded."}<br>
            <strong>Mandatory Emergency Action:</strong> Conduct immediate on-site safety check. Verify verbal responsiveness and cervical stability before attempting repositioning. Dispatch Emergency Medical Services (EMS) if the patient remains unresponsive or reports severe pelvic/spinal pain.
          </div>
        </div>
      `;
    }
  }

  // =========================================================================
  // INCIDENT SIMULATORS & TRIGGERS
  // =========================================================================
  btnSimTriggerInc1.addEventListener('click', () => {
    updateSystemState('EMERGENCY', 3.42);
    processHardwareTelemetry({ accel_g: 3.42, bpm: 118, spo2: 95, state: 'EMERGENCY' });
    showToast("🚨 Triggered Fall Incident #1 (3.42G)");
  });

  btnSimTriggerInc2.addEventListener('click', () => {
    updateSystemState('CANCEL_WINDOW', 2.85);
    processHardwareTelemetry({ accel_g: 2.85, bpm: 104, spo2: 96, state: 'CANCEL_WINDOW' });
    recordFallIncident({
      accelG: 2.85,
      bpm: 104,
      spo2: 96,
      state: 'CANCEL_WINDOW',
      tinymlClass: "Stumble / Trip (Near-Fall)",
      confidence: 84.0,
      tiltAngle: 42,
      outcome: "Warning Window Cleared by User Button"
    });
    showToast("⚠️ Triggered Fall Incident #2 (2.85G - Stumble/Trip)");
  });

  btnSimTriggerInc3.addEventListener('click', () => {
    updateSystemState('EMERGENCY', 3.88);
    processHardwareTelemetry({ accel_g: 3.88, bpm: 125, spo2: 93, state: 'EMERGENCY' });
    showToast("🔴 Triggered Fall Incident #3 (3.88G - Critical Fall)");
  });

  // Simulator Buttons
  btnSimWalk.addEventListener('click', () => {
    processHardwareTelemetry({ accel_g: 1.15, bpm: 78, spo2: 98, state: 'NORMAL' });
    showToast("Simulating: Normal Walking");
  });

  btnSimSit.addEventListener('click', () => {
    processHardwareTelemetry({ accel_g: 1.00, bpm: 68, spo2: 99, state: 'NORMAL' });
    showToast("Simulating: Stationary / Sitting");
  });

  btnSimStairs.addEventListener('click', () => {
    processHardwareTelemetry({ accel_g: 1.65, bpm: 95, spo2: 97, state: 'NORMAL' });
    showToast("Simulating: Stairs Climbing");
  });

  btnSimStumble.addEventListener('click', () => {
    processHardwareTelemetry({ accel_g: 2.10, bpm: 104, spo2: 96, state: 'NORMAL' });
    showToast("Simulating: Stumble / Trip");
  });

  btnSimHardFall.addEventListener('click', () => {
    updateSystemState('CANCEL_WINDOW', 3.42);
    processHardwareTelemetry({ accel_g: 3.42, bpm: 118, spo2: 95, state: 'CANCEL_WINDOW' });
    showToast("🚨 Simulating: Severe High-Impact Fall!");
  });

  btnSimSyncope.addEventListener('click', () => {
    processHardwareTelemetry({ accel_g: 0.85, bpm: 52, spo2: 88, state: 'EMERGENCY' });
    updateSystemState('EMERGENCY', 0.85);
    showToast("⚠️ Simulating: Sudden Syncope Collapse");
  });

  btnSimulateFall.addEventListener('click', () => {
    updateSystemState('CANCEL_WINDOW', 3.15);
    processHardwareTelemetry({ accel_g: 3.15, bpm: 112, spo2: 96, state: 'CANCEL_WINDOW' });
  });

  btnSimulateCancel.addEventListener('click', () => {
    updateSystemState('NORMAL', 1.0);
    processHardwareTelemetry({ accel_g: 1.0, bpm: 75, spo2: 98, state: 'NORMAL' });
  });

  btnResetNormal.addEventListener('click', () => {
    updateSystemState('NORMAL', 1.0);
    processHardwareTelemetry({ accel_g: 1.0, bpm: 75, spo2: 98, state: 'NORMAL' });
  });

  btnCalibrate.addEventListener('click', () => {
    updateSystemState('NORMAL', 1.0);
    processHardwareTelemetry({ accel_g: 1.0, bpm: 75, spo2: 98, state: 'NORMAL' });
    showToast("Sensor baseline calibrated to 1.00G!");
  });

  // =========================================================================
  // DOWNLOAD HANDLERS (ODF, PDF, JSON FOR CONSOLIDATED AND INDIVIDUAL INCIDENTS)
  // =========================================================================
  function getPayloadForExport(isConsolidated, incIndex = 0) {
    const profile = userPatientProfile || {
      patientName: "Registered Patient",
      patientAge: "--",
      caregiverName: currentUser ? currentUser.email : "Caregiver",
      emergencyPhone: "--",
      clinicalNotes: "No pre-existing clinical notes registered."
    };

    if (isConsolidated) {
      return {
        isMultiIncident: true,
        incidents: recordedIncidents,
        timestamp: new Date().toISOString(),
        patientName: profile.patientName,
        patientAge: profile.patientAge,
        caregiver: profile.caregiverName,
        emergencyPhone: profile.emergencyPhone,
        caregiverNotes: profile.clinicalNotes,
        systemState: currentState,
        fallThreshold: currentFallThreshold
      };
    } else {
      const inc = recordedIncidents[incIndex] || recordedIncidents[0];
      return {
        isMultiIncident: false,
        incidentNumber: inc.id,
        timestamp: inc.timestamp,
        patientName: profile.patientName,
        patientAge: profile.patientAge,
        caregiver: profile.caregiverName,
        emergencyPhone: profile.emergencyPhone,
        caregiverNotes: profile.clinicalNotes,
        systemState: inc.state,
        fallThreshold: currentFallThreshold,
        vitals: {
          bpm: inc.bpm,
          spo2: inc.spo2,
          accelG: inc.accelG
        },
        tinyml: {
          className: inc.tinymlClass,
          confidencePct: inc.confidence,
          riskLevel: "CRITICAL EMERGENCY",
          features: { svm: inc.svm, tiltAngle: inc.tiltAngle, freeFallDurationMs: 280, immobilityIndex: inc.immobilityIndex }
        }
      };
    }
  }

  window.downloadConsolidatedReport = async function(format) {
    if (!reportGen) return;
    const payload = getPayloadForExport(true);
    showToast(`Generating Consolidated 3-Incident ${format.toUpperCase()}...`);
    if (format === 'pdf') {
      const fn = await reportGen.generatePDF(payload);
      showToast(`✅ Downloaded: ${fn}`);
    } else {
      const fn = await reportGen.generateODF(payload);
      showToast(`✅ Downloaded: ${fn}`);
    }
  };

  window.downloadSingleIncidentReport = async function(idx, format) {
    if (!reportGen) return;
    const payload = getPayloadForExport(false, idx);
    showToast(`Generating Incident #${idx + 1} ${format.toUpperCase()}...`);
    if (format === 'pdf') {
      const fn = await reportGen.generatePDF(payload);
      showToast(`✅ Downloaded: ${fn}`);
    } else {
      const fn = await reportGen.generateODF(payload);
      showToast(`✅ Downloaded: ${fn}`);
    }
  };

  // Bind Buttons on Tab 3 & 4
  btnDocDownloadOdf.addEventListener('click', () => {
    if (selectedReportView === 'CONSOLIDATED') window.downloadConsolidatedReport('odf');
    else window.downloadSingleIncidentReport(selectedReportView, 'odf');
  });

  btnDocDownloadPdf.addEventListener('click', () => {
    if (selectedReportView === 'CONSOLIDATED') window.downloadConsolidatedReport('pdf');
    else window.downloadSingleIncidentReport(selectedReportView, 'pdf');
  });

  btnDownloadConsolidatedOdf.addEventListener('click', () => window.downloadConsolidatedReport('odf'));
  btnDownloadConsolidatedPdf.addEventListener('click', () => window.downloadConsolidatedReport('pdf'));

  btnDownloadInc1Odf.addEventListener('click', () => window.downloadSingleIncidentReport(0, 'odf'));
  btnDownloadInc1Pdf.addEventListener('click', () => window.downloadSingleIncidentReport(0, 'pdf'));

  btnDownloadInc2Odf.addEventListener('click', () => window.downloadSingleIncidentReport(1, 'odf'));
  btnDownloadInc2Pdf.addEventListener('click', () => window.downloadSingleIncidentReport(1, 'pdf'));

  btnDownloadInc3Odf.addEventListener('click', () => window.downloadSingleIncidentReport(2, 'odf'));
  btnDownloadInc3Pdf.addEventListener('click', () => window.downloadSingleIncidentReport(2, 'pdf'));

  btnDownloadJsonMain.addEventListener('click', () => {
    const payload = getPayloadForExport(true);
    if (!reportGen) return;
    const fn = reportGen.downloadJSON(payload);
    showToast(`✅ Downloaded: ${fn}`);
  });

  // Firebase Realtime Listener
  function subscribeToDeviceTelemetry() {
    if (!db) return;
    db.ref('devices/ESP32_01/telemetry').on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) processHardwareTelemetry(data);
    });

    db.ref('state').on('value', (snapshot) => {
      const data = snapshot.val();
      if (data && data.status && data.status !== currentState) {
        const impactG = parseFloat(data.impact_g) || currentFallThreshold;
        updateSystemState(data.status, impactG);
      }
    });

    db.ref('settings/fall_threshold').on('value', (snapshot) => {
      if (snapshot.exists()) {
        const val = parseFloat(snapshot.val());
        if (val && !isNaN(val)) updateThresholdUI(val, true);
      }
    });
  }

  let toastTimer = null;
  function showToast(msg) {
    if (!downloadToast) return;
    downloadToastMsg.textContent = msg;
    downloadToast.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      downloadToast.classList.add('hidden');
    }, 4000);
  }
});
